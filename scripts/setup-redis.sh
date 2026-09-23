#!/usr/bin/env bash
#
# MAJAL — Redis مشترك لحدود الطلبات (Memorystore) على Google Cloud.
#
# متى تحتاجه؟ حين تعمل الخدمة على أكثر من نسخة (Cloud Run يضيف نسخاً مع الزحام).
# بدونه كل نسخة تعدّ الطلبات وحدها، فيتضاعف الحدّ الفعلي بعدد النسخ.
# التكلفة: Memorystore Basic 1GB — راجع تسعير المنطقة قبل التشغيل.
#
#     export PROJECT_ID=your-project-id
#     bash scripts/setup-redis.sh
#     bash scripts/deploy-cloud-run.sh      # يلتقط REDIS_URL ويربط الشبكة تلقائياً
#
# الخادم يتحمّل غياب Redis: إن تعطّل تعود الحدود محلية لكل نسخة ويُرسل تنبيه
# (scripts/setup-monitoring.sh)، ولا يتوقف الموقع.
#
# آمن للإعادة: لا ينشئ نسخة موجودة ولا يحذف شيئاً.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-europe-west1}"
REDIS_INSTANCE="${REDIS_INSTANCE:-majal-redis}"
REDIS_SIZE_GB="${REDIS_SIZE_GB:-1}"
VPC_NETWORK="${VPC_NETWORK:-default}"

command -v gcloud >/dev/null 2>&1 || { echo "يحتاج Google Cloud CLI. أسهل طريق: Cloud Shell." >&2; exit 1; }
[[ -n "$PROJECT_ID" && "$PROJECT_ID" != "(unset)" ]] || { echo "اضبط PROJECT_ID أولاً" >&2; exit 1; }
gcloud config set project "$PROJECT_ID" >/dev/null
step() { echo; echo "── $* ────────────────────────────────"; }

step "١/٣  تفعيل الخدمات"
gcloud services enable redis.googleapis.com compute.googleapis.com secretmanager.googleapis.com --quiet
echo "✓"

step "٢/٣  نسخة Memorystore ($REDIS_INSTANCE)"
if gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" >/dev/null 2>&1; then
  echo "✓ موجودة — تُركت كما هي"
else
  echo "إنشاء $REDIS_INSTANCE … (قد يستغرق ~5 دقائق)"
  gcloud redis instances create "$REDIS_INSTANCE" \
    --region="$REGION" --tier=basic --size="$REDIS_SIZE_GB" \
    --redis-version=redis_7_2 --network="$VPC_NETWORK" \
    --enable-auth --quiet
fi
HOST="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format='value(host)')"
PORT="$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format='value(port)')"
AUTH="$(gcloud redis instances get-auth-string "$REDIS_INSTANCE" --region="$REGION" --format='value(authString)')"
echo "✓ $HOST:$PORT (داخل شبكة $VPC_NETWORK فقط — لا عنوان عام)"

step "٣/٣  حفظ REDIS_URL في Secret Manager"
# رمز AUTH لا يُطبع ولا يُكتب في ملف؛ يذهب مباشرة إلى Secret Manager.
REDIS_URL="redis://:$AUTH@$HOST:$PORT"
if gcloud secrets describe REDIS_URL >/dev/null 2>&1; then
  printf '%s' "$REDIS_URL" | gcloud secrets versions add REDIS_URL --data-file=- --quiet >/dev/null
  echo "↻ REDIS_URL (إصدار جديد)"
else
  printf '%s' "$REDIS_URL" | gcloud secrets create REDIS_URL --data-file=- --replication-policy=automatic --quiet >/dev/null
  echo "+ REDIS_URL"
fi

cat <<SUMMARY

════════════════════════════════════════════════════════════════
  تم. الخطوة التالية — أعد النشر:

    bash scripts/deploy-cloud-run.sh

  سكربت النشر يرى سرّ REDIS_URL فيربط الخدمة بشبكة $VPC_NETWORK
  (Direct VPC egress) تلقائياً. تأكّد بعدها في السجلات من:
    "event":"rate_limit_store","backend":"redis"
════════════════════════════════════════════════════════════════
SUMMARY
