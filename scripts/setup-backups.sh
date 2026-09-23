#!/usr/bin/env bash
#
# MAJAL — تفعيل النسخ الاحتياطي التلقائي لقاعدة البيانات على Google Cloud.
#
# شغّله في Cloud Shell بعد scripts/provision-gcp.sh:
#
#     export PROJECT_ID=your-project-id
#     bash scripts/setup-backups.sh
#
# يبني طبقتين مستقلتين:
#   ١) نسخ Cloud SQL التلقائية: يومية، تُحفظ 14 نسخة، مع الاستعادة لأي لحظة
#      (Point-in-Time Recovery) خلال آخر 7 أيام، وحماية النسخة من الحذف.
#   ٢) تصدير يومي منطقي (SQL مضغوط) إلى دلو Cloud Storage منفصل بإصدارات:
#      يبقى 30 يوماً حتى لو حُذفت نسخة Cloud SQL نفسها.
#
# آمن للإعادة: يكتشف الموجود ويحدّثه ولا يحذف شيئاً.
# طرق الاستعادة: docs/operations.md

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-europe-west1}"
SQL_INSTANCE="${SQL_INSTANCE:-majal-db}"
DB_NAME="${DB_NAME:-majal}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PROJECT_ID}-majal-backups}"
BACKUP_TIME_UTC="${BACKUP_TIME_UTC:-23:00}"        # 02:00 بتوقيت الكويت
EXPORT_SCHEDULE="${EXPORT_SCHEDULE:-30 3 * * *}"   # 03:30 بتوقيت الكويت
RETAINED_BACKUPS="${RETAINED_BACKUPS:-14}"
PITR_DAYS="${PITR_DAYS:-7}"
EXPORT_RETENTION_DAYS="${EXPORT_RETENTION_DAYS:-30}"
RUNNER_SA_NAME="${RUNNER_SA_NAME:-majal-backup-runner}"
JOB_NAME="${JOB_NAME:-majal-daily-sql-export}"
ROLE_ID="${ROLE_ID:-majalSqlExporter}"

command -v gcloud >/dev/null 2>&1 || { echo "يحتاج Google Cloud CLI. أسهل طريق: Cloud Shell." >&2; exit 1; }
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "اضبط PROJECT_ID أولاً:  export PROJECT_ID=your-project-id" >&2
  exit 1
fi
gcloud config set project "$PROJECT_ID" >/dev/null
step() { echo; echo "── $* ────────────────────────────────"; }
exists() { "$@" >/dev/null 2>&1; }

gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1 || {
  echo "لا توجد نسخة Cloud SQL باسم $SQL_INSTANCE. شغّل scripts/provision-gcp.sh أولاً." >&2
  exit 1
}

step "١/٥  تفعيل الخدمات"
gcloud services enable sqladmin.googleapis.com cloudscheduler.googleapis.com storage.googleapis.com iam.googleapis.com --quiet
echo "✓"

step "٢/٥  نسخ Cloud SQL التلقائية + الاستعادة لأي لحظة"
# هذه الإعدادات لا تُعيد تشغيل نسخة Postgres.
gcloud sql instances patch "$SQL_INSTANCE" \
  --backup-start-time="$BACKUP_TIME_UTC" \
  --retained-backups-count="$RETAINED_BACKUPS" \
  --enable-point-in-time-recovery \
  --retained-transaction-log-days="$PITR_DAYS" \
  --deletion-protection \
  --quiet
echo "✓ يومياً $BACKUP_TIME_UTC UTC · $RETAINED_BACKUPS نسخة · PITR $PITR_DAYS أيام · حماية من الحذف"

step "٣/٥  دلو التصدير اليومي ($BACKUP_BUCKET)"
if exists gcloud storage buckets describe "gs://$BACKUP_BUCKET"; then
  echo "✓ موجود"
else
  gcloud storage buckets create "gs://$BACKUP_BUCKET" \
    --location="$REGION" --uniform-bucket-level-access --public-access-prevention --quiet
  echo "✓ أُنشئ (وصول عام ممنوع)"
fi
# كل تصدير يكتب نفس الاسم؛ الإصدارات تحفظ السابقة، والقاعدة تحذف ما تجاوز المدة.
gcloud storage buckets update "gs://$BACKUP_BUCKET" --versioning --quiet >/dev/null
LIFECYCLE="$(mktemp)"
trap 'rm -f "$LIFECYCLE"' EXIT
cat > "$LIFECYCLE" <<JSON
{"rule":[{"action":{"type":"Delete"},"condition":{"daysSinceNoncurrentTime":$EXPORT_RETENTION_DAYS}}]}
JSON
gcloud storage buckets update "gs://$BACKUP_BUCKET" --lifecycle-file="$LIFECYCLE" --quiet >/dev/null
echo "✓ إصدارات مفعّلة · تُحذف النسخ الأقدم من $EXPORT_RETENTION_DAYS يوماً"

# حساب خدمة نسخة Cloud SQL هو من يكتب ملف التصدير.
SQL_SA="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(serviceAccountEmailAddress)')"
gcloud storage buckets add-iam-policy-binding "gs://$BACKUP_BUCKET" \
  --member="serviceAccount:$SQL_SA" --role=roles/storage.objectAdmin --quiet >/dev/null
echo "✓ $SQL_SA يكتب في الدلو"

step "٤/٥  حساب تشغيل التصدير بأقل صلاحية"
RUNNER_SA="$RUNNER_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
exists gcloud iam service-accounts describe "$RUNNER_SA" \
  || gcloud iam service-accounts create "$RUNNER_SA_NAME" --display-name="MAJAL daily SQL export" --quiet
# دور مخصّص بصلاحيتين فقط، بدل دور Cloud SQL Admin الواسع.
if exists gcloud iam roles describe "$ROLE_ID" --project="$PROJECT_ID"; then
  gcloud iam roles update "$ROLE_ID" --project="$PROJECT_ID" \
    --permissions=cloudsql.instances.export,cloudsql.instances.get --quiet >/dev/null
else
  gcloud iam roles create "$ROLE_ID" --project="$PROJECT_ID" --title="MAJAL SQL exporter" \
    --permissions=cloudsql.instances.export,cloudsql.instances.get --stage=GA --quiet >/dev/null
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNNER_SA" --role="projects/$PROJECT_ID/roles/$ROLE_ID" \
  --condition=None --quiet >/dev/null
echo "✓ $RUNNER_SA"

step "٥/٥  جدولة التصدير اليومي (Cloud Scheduler)"
EXPORT_URI="https://sqladmin.googleapis.com/v1/projects/$PROJECT_ID/instances/$SQL_INSTANCE/export"
BODY="{\"exportContext\":{\"fileType\":\"SQL\",\"uri\":\"gs://$BACKUP_BUCKET/daily/$DB_NAME.sql.gz\",\"databases\":[\"$DB_NAME\"]}}"
JOB_ARGS=(--location="$REGION" --schedule="$EXPORT_SCHEDULE" --time-zone="Asia/Kuwait"
  --uri="$EXPORT_URI" --http-method=POST --message-body="$BODY"
  --oauth-service-account-email="$RUNNER_SA"
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
  --attempt-deadline=10m --quiet)
# create يأخذ --headers و update يأخذ --update-headers.
if exists gcloud scheduler jobs describe "$JOB_NAME" --location="$REGION"; then
  gcloud scheduler jobs update http "$JOB_NAME" "${JOB_ARGS[@]}" --update-headers="Content-Type=application/json" >/dev/null
  echo "↻ حُدّثت $JOB_NAME"
else
  gcloud scheduler jobs create http "$JOB_NAME" "${JOB_ARGS[@]}" --headers="Content-Type=application/json" >/dev/null
  echo "+ أُنشئت $JOB_NAME"
fi

cat <<SUMMARY

════════════════════════════════════════════════════════════════
  تم. النسخ الاحتياطي يعمل تلقائياً:
    · Cloud SQL: يومياً + استعادة لأي لحظة خلال $PITR_DAYS أيام
    · تصدير SQL يومي إلى gs://$BACKUP_BUCKET/daily/ (${EXPORT_RETENTION_DAYS} يوماً)

  جرّب التصدير الآن بدل انتظار موعده:
    gcloud scheduler jobs run $JOB_NAME --location=$REGION
    gcloud sql operations list --instance=$SQL_INSTANCE --limit=3

  الاستعادة وتمرينها الشهري: docs/operations.md
════════════════════════════════════════════════════════════════
SUMMARY
