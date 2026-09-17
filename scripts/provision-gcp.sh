#!/usr/bin/env bash
#
# MAJAL — تجهيز موارد Google Cloud.
#
# شغّله في **Cloud Shell** داخل لوحة Google Cloud (أيقونة >_ أعلى اليمين).
# هناك تكون مسجَّل الدخول أصلاً، فلا يحتاج منك مفاتيح ولا تثبيت gcloud.
#
#   1) افتح Cloud Shell
#   2) ارفع هذا الملف (أيقونة ⋮ → Upload) أو الصق محتواه في ملف جديد
#   3) bash provision-gcp.sh
#
# ما ينشئه:
#   · نسخة Cloud SQL (Postgres) وقاعدة بيانات ومستخدماً  → DATABASE_URL
#   · دلو Cloud Storage خاصاً لخزنة الوصفات              → GCS_SECURE_BUCKET
#   · مفتاح KMS للتشفير                                  → GCP_KMS_KEY_NAME
#   · أسرار MAJAL في Secret Manager
#   · صلاحيات IAM لحساب خدمة Cloud Run
#
# آمن للإعادة: كل خطوة تتحقق من وجود المورد قبل إنشائه، فلا تُكرّر ولا تُتلف.
# لا يحذف شيئاً أبداً.

set -euo pipefail

# ── اضبط هذه الأربعة ثم شغّل ────────────────────────────────────────────────
PROJECT_ID="${PROJECT_ID:-}"                 # معرّف مشروعك في Google Cloud
REGION="${REGION:-europe-west1}"             # نفس منطقة Cloud Run
SQL_INSTANCE="${SQL_INSTANCE:-majal-db}"
SQL_TIER="${SQL_TIER:-db-g1-small}"      # الأرخص. للإنتاج الجاد: db-custom-2-7680
SERVICE_NAME="${SERVICE_NAME:-majal}"
# ────────────────────────────────────────────────────────────────────────────

DB_NAME="${DB_NAME:-majal}"
DB_USER="${DB_USER:-majal_app}"
KEYRING="${KEYRING:-majal}"
KEY_NAME="${KEY_NAME:-recipe-vault}"

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "اضبط PROJECT_ID أولاً:  export PROJECT_ID=your-project-id" >&2
  exit 1
fi

# بعد استقرار PROJECT_ID لا قبله: كان اسم الدلو يُبنى منه وهو ما زال فارغاً،
# فيخرج "-majal-vault" ويرفضه Cloud Storage كاسم غير صالح.
BUCKET="${BUCKET:-${PROJECT_ID}-majal-vault}"

gcloud config set project "$PROJECT_ID" >/dev/null
echo "المشروع: $PROJECT_ID · المنطقة: $REGION"
echo

step() { echo; echo "── $* ────────────────────────────────"; }
# ينجح إن كان المورد موجوداً مسبقاً، فالسكربت يُعاد تشغيله بلا ضرر.
exists() { eval "$1" >/dev/null 2>&1; }

step "١/٦  تفعيل الخدمات المطلوبة"
# cloudbuild و artifactregistry يحتاجهما `gcloud run deploy --source`: بدونهما
# يفشل النشر بـ PERMISSION_DENIED بعد أن يكون التجهيز قد نجح، وهو خطأ مربك.
gcloud services enable \
  sqladmin.googleapis.com \
  cloudkms.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet
echo "✓ مفعّلة"

step "٢/٦  قاعدة البيانات (Cloud SQL Postgres)"
if exists "gcloud sql instances describe '$SQL_INSTANCE'"; then
  echo "✓ النسخة $SQL_INSTANCE موجودة — تُركت كما هي"
else
  echo "إنشاء $SQL_INSTANCE … (قد يستغرق ~10 دقائق)"
  # --edition صريحة: مشاريع كثيرة صارت افتراضياً ENTERPRISE_PLUS، وهي لا تقبل
  # الفئات المشتركة مثل db-g1-small وترفض الإنشاء. ENTERPRISE تقبلها وهي الأرخص.
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --storage-auto-increase \
    --backup \
    --quiet
fi

exists "gcloud sql databases describe '$DB_NAME' --instance='$SQL_INSTANCE'" \
  || gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --quiet

# كلمة مرور قاعدة البيانات تُولَّد هنا وتُحفظ في Secret Manager فقط — لا تُطبع.
if exists "gcloud sql users describe '$DB_USER' --instance='$SQL_INSTANCE'"; then
  if exists "gcloud secrets describe DATABASE_URL"; then
    echo "✓ المستخدم $DB_USER موجود وDATABASE_URL محفوظ — لم يُمسّ أيّهما"
    DB_PASSWORD=""
  else
    # المستخدم موجود بلا سرّ محفوظ: إمّا تعثّر تشغيل سابق بعد إنشائه وقبل حفظ
    # السرّ، أو حُذف السرّ. كلمة المرور حينها ضائعة لا يعرفها أحد، فالمشروع عالق
    # بلا DATABASE_URL ولا يقلع الخادم. نولّد بديلاً ونحفظه.
    echo "⚠ المستخدم $DB_USER موجود لكن DATABASE_URL غير محفوظ — تُضبط كلمة مرور جديدة"
    DB_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
    gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" \
      --password="$DB_PASSWORD" --quiet
  fi
else
  DB_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" --quiet
  echo "✓ أُنشئ المستخدم $DB_USER"
fi

CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"

step "٣/٦  خزنة الوصفات (Cloud Storage)"
if exists "gcloud storage buckets describe 'gs://$BUCKET'"; then
  echo "✓ الدلو $BUCKET موجود"
else
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --quiet
  echo "✓ أُنشئ $BUCKET (وصول عام ممنوع)"
fi

step "٤/٦  مفتاح التشفير (Cloud KMS)"
exists "gcloud kms keyrings describe '$KEYRING' --location='$REGION'" \
  || gcloud kms keyrings create "$KEYRING" --location="$REGION" --quiet
exists "gcloud kms keys describe '$KEY_NAME' --keyring='$KEYRING' --location='$REGION'" \
  || gcloud kms keys create "$KEY_NAME" --keyring="$KEYRING" --location="$REGION" --purpose=encryption --quiet
KMS_KEY="projects/$PROJECT_ID/locations/$REGION/keyRings/$KEYRING/cryptoKeys/$KEY_NAME"
echo "✓ $KMS_KEY"

step "٥/٦  الأسرار (Secret Manager)"
put_secret() {
  local name="$1" value="$2"
  if exists "gcloud secrets describe '$name'"; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet >/dev/null
    echo "  ↻ $name (إصدار جديد)"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --quiet >/dev/null
    echo "  + $name"
  fi
}

# الأسرار العشوائية. 48 بايت → 64 محرفاً، فوق حدّ الـ32 الذي يفرضه الكود.
rnd() { openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_' | tr -d '='; }

for NAME in AUTH_SESSION_SECRET AUTH_ENCRYPTION_KEY SETTLEMENT_RECONCILIATION_SECRET \
            SECURITY_KILL_SWITCH_SECRET CANARY_SIGNING_SECRET TRUST_ATTESTATION_SECRET \
            SEALED_COMPUTE_KEY LEDGER_ANCHOR_SECRET \
            PACI_ADAPTER_SHARED_SECRET PACI_DATA_PEPPER PACI_INTERNAL_CALLBACK_SECRET; do
  # لا نُدوّر سرّاً موجوداً: AUTH_ENCRYPTION_KEY تحديداً تغييره يُبطل كل سرّ مشفَّر.
  if exists "gcloud secrets describe '$NAME'"; then
    echo "  = $NAME موجود — لم يُمس (تدويره قد يُبطل بيانات مشفّرة أو مُلبّدة)"
  else
    put_secret "$NAME" "$(rnd)"
  fi
done

if [[ -n "$DB_PASSWORD" ]]; then
  put_secret DATABASE_URL "postgresql://$DB_USER:$DB_PASSWORD@/$DB_NAME?host=/cloudsql/$CONNECTION_NAME"
else
  echo "  = DATABASE_URL موجود مسبقاً — لم يُمسّ"
fi

step "٦/٦  صلاحيات حساب خدمة Cloud Run"
RUNTIME_SA="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [[ -z "$RUNTIME_SA" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  RUNTIME_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
  echo "الخدمة $SERVICE_NAME غير منشورة بعد — تُمنح الصلاحيات لحساب الحوسبة الافتراضي:"
fi
echo "  $RUNTIME_SA"

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/storage.objectAdmin --quiet >/dev/null
gcloud kms keys add-iam-policy-binding "$KEY_NAME" \
  --keyring="$KEYRING" --location="$REGION" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/cloudsql.client --quiet >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
echo "✓ مُنحت"

cat <<SUMMARY

════════════════════════════════════════════════════════════════
  تم. الخطوة التالية — انشر، والربط يتم تلقائياً:

    bash scripts/deploy-cloud-run.sh

  ذلك السكربت يكتشف بنفسه Cloud SQL والدلو ومفتاح KMS وكل سرّ أُنشئ هنا،
  ويربطها بالخدمة. لا شيء يُنسخ باليد.

  يبقى عليك ما لا يُنشأ من هنا (حسابات لدى أطراف أخرى): مفاتيح مزوّد الدفع
  والبريد. احفظها في Secret Manager وأعد تشغيل سكربت النشر — سيلتقطها.
  التفاصيل في CONNECT.md.

════════════════════════════════════════════════════════════════
SUMMARY
