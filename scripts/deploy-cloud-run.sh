#!/usr/bin/env bash
#
# MAJAL — النشر على Cloud Run.
#
# شغّله في **Cloud Shell** بعد `bash scripts/provision-gcp.sh`:
#
#     export PROJECT_ID=your-project-id
#     bash scripts/deploy-cloud-run.sh
#
# يبني الصورة وينشرها، **ويربط بنفسه** كل ما أنشأه سكربت التجهيز: Cloud SQL،
# ودلو الخزنة، ومفتاح KMS، وكل سرّ موجود في Secret Manager. لا شيء يُنسخ باليد.
#
# آمن للإعادة: يكتشف ما هو موجود ويتجاهل ما ليس كذلك. لا ينشئ سرّاً ولا يدوّره.

set -euo pipefail

PROJECT_ID="${CLOUD_RUN_PROJECT_ID:-${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}}"
REGION="${CLOUD_RUN_REGION:-${REGION:-europe-west1}}"
SERVICE_NAME="${CLOUD_RUN_SERVICE_NAME:-${SERVICE_NAME:-majal}}"
SQL_INSTANCE="${SQL_INSTANCE:-majal-db}"
DB_NAME="${DB_NAME:-majal}"
BUCKET="${BUCKET:-${PROJECT_ID}-majal-vault}"
KEYRING="${KEYRING:-majal}"
KEY_NAME="${KEY_NAME:-recipe-vault}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "يحتاج Google Cloud CLI. أسهل طريق: Cloud Shell." >&2
  exit 1
fi
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "اضبط PROJECT_ID أولاً:  export PROJECT_ID=your-project-id" >&2
  exit 1
fi
gcloud config set project "$PROJECT_ID" >/dev/null
step() { echo; echo "── $* ────────────────────────────────"; }

step "١/٥  جمع ما أنشأه سكربت التجهيز"

CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" \
  --format='value(connectionName)' 2>/dev/null || true)"
if [[ -n "$CONNECTION_NAME" ]]; then
  echo "  ✓ Cloud SQL: $CONNECTION_NAME"
else
  echo "  ⚠ لا توجد نسخة Cloud SQL باسم $SQL_INSTANCE."
  echo "    الخادم لا يقلع بلا DATABASE_URL. شغّل scripts/provision-gcp.sh أولاً."
fi

ENV_VARS="NODE_ENV=production"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  ENV_VARS="$ENV_VARS,GCS_SECURE_BUCKET=$BUCKET"
  echo "  ✓ الخزنة: $BUCKET"
else
  echo "  ⚠ الدلو $BUCKET غير موجود — تخزين الوصفات سيرفض العمل (فشل مقصود، لا صامت)"
fi

KMS_KEY="projects/$PROJECT_ID/locations/$REGION/keyRings/$KEYRING/cryptoKeys/$KEY_NAME"
if gcloud kms keys describe "$KEY_NAME" --keyring="$KEYRING" --location="$REGION" >/dev/null 2>&1; then
  ENV_VARS="$ENV_VARS,GCP_KMS_KEY_NAME=$KMS_KEY"
  echo "  ✓ مفتاح KMS"
else
  echo "  ⚠ مفتاح KMS غير موجود — تخزين الوصفات سيرفض العمل"
fi

# متغيّرات غير سرّية: تُمرَّر من بيئتك إن ضبطتها، وإلا تُترك على ما هي عليه في
# الخدمة. لا نضع لها قيماً افتراضية مخترعة.
for NAME in PAYMENT_PROVIDER MYFATOORAH_PAYMENT_METHOD_ID MYFATOORAH_BASE_URL \
            LEMONSQUEEZY_STORE_ID LEMONSQUEEZY_VARIANT_ID \
            LEMONSQUEEZY_SETTLEMENT_CURRENCY LEMONSQUEEZY_KWD_RATE \
            RESEND_FROM PACI_ADAPTER_URL PACI_CALLBACK_URL PACI_SERVICE_PROVIDER_APPROVED; do
  VALUE="${!NAME:-}"
  if [[ -n "$VALUE" ]]; then
    ENV_VARS="$ENV_VARS,$NAME=$VALUE"
    echo "  ✓ متغيّر: $NAME"
  fi
done

# نربط فقط ما هو موجود فعلاً: ذكر سرّ غير موجود يُفشل النشر كله.
SECRETS=""
for NAME in DATABASE_URL AUTH_SESSION_SECRET AUTH_ENCRYPTION_KEY \
            SETTLEMENT_RECONCILIATION_SECRET SECURITY_KILL_SWITCH_SECRET \
            CANARY_SIGNING_SECRET TRUST_ATTESTATION_SECRET SEALED_COMPUTE_KEY \
            LEDGER_ANCHOR_SECRET \
            PACI_ADAPTER_SHARED_SECRET PACI_DATA_PEPPER PACI_INTERNAL_CALLBACK_SECRET \
            MYFATOORAH_API_TOKEN MYFATOORAH_WEBHOOK_SECRET \
            LEMONSQUEEZY_API_KEY LEMONSQUEEZY_WEBHOOK_SECRET \
            RESEND_API_KEY; do
  if gcloud secrets describe "$NAME" >/dev/null 2>&1; then
    SECRETS="${SECRETS:+$SECRETS,}$NAME=$NAME:latest"
    echo "  ✓ سرّ: $NAME"
  fi
done

step "٢/٥  صلاحية حساب البناء"
# `gcloud run deploy --source` يبني عبر Cloud Build منتحلاً حساب الحوسبة
# الافتراضي. في المشاريع المنشأة بعد تغيير Google لحساب البناء الافتراضي، هذا
# الحساب يأتي بلا أدوار، فيفشل رفع المصدر بـ "could not resolve source:
# permission_denied" — رسالة تبدو كأنها مشكلة في حسابك أنت لا في حساب الخدمة.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${BUILD_SA}" \
     --role=roles/cloudbuild.builds.builder \
     --condition=None --quiet >/dev/null 2>&1; then
  echo "  ✓ $BUILD_SA"
else
  echo "  ⚠ تعذّر منح الدور لـ $BUILD_SA. إن فشل النشر بخطأ صلاحيات، امنحه يدوياً:" >&2
  echo "    gcloud projects add-iam-policy-binding $PROJECT_ID \\" >&2
  echo "      --member=serviceAccount:${BUILD_SA} --role=roles/cloudbuild.builds.builder" >&2
fi

step "٣/٥  البناء والنشر"
DEPLOY=(gcloud run deploy "$SERVICE_NAME"
  --source . --project "$PROJECT_ID" --region "$REGION"
  --allow-unauthenticated --update-env-vars "$ENV_VARS" --quiet)
[[ -n "$CONNECTION_NAME" ]] && DEPLOY+=(--add-cloudsql-instances "$CONNECTION_NAME")
[[ -n "$SECRETS" ]] && DEPLOY+=(--update-secrets "$SECRETS")
"${DEPLOY[@]}"

step "٤/٥  تثبيت APP_URL"
URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" \
  --region "$REGION" --format='value(status.url)')"
if [[ -z "$URL" ]]; then
  echo "نُشرت الخدمة، لكن تعذّر استخراج عنوانها." >&2
  exit 1
fi
# AI Studio تحقن APP_URL تلقائياً؛ النشر اليدوي يحتاج تثبيتها صراحةً.
gcloud run services update "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" \
  --update-env-vars "APP_URL=$URL" --quiet >/dev/null

step "٥/٥  ما يبقى عليك"
cat <<EOM
هذه حسابات لدى أطراف أخرى، لا تُنشأ من هنا. احفظ كلاً منها في Secret Manager
ثم أعد تشغيل هذا السكربت — سيلتقطها بنفسه:

  إن كان PAYMENT_PROVIDER=myfatoorah:
    MYFATOORAH_API_TOKEN         لوحة MyFatoorah ← API Token
    MYFATOORAH_WEBHOOK_SECRET    لوحة MyFatoorah ← Webhook Settings ← Secret
    (وMYFATOORAH_PAYMENT_METHOD_ID متغيّر عادي لا سرّ)
    الـwebhook يوجَّه إلى: $URL/api/v1/payments/webhooks/myfatoorah

  إن كان PAYMENT_PROVIDER=lemonsqueezy:
    LEMONSQUEEZY_API_KEY         Settings ← API
    LEMONSQUEEZY_WEBHOOK_SECRET  Settings ← Webhooks ← Signing secret
    الـwebhook يوجَّه إلى: $URL/api/v1/payments/webhooks/lemonsqueezy

  للبريد:
    RESEND_API_KEY               من resend.com (وRESEND_FROM نطاقاً موثَّقاً)

  مثال:  printf '%s' 'ضع-المفتاح-هنا' | gcloud secrets create MYFATOORAH_API_TOKEN --data-file=-

لا تضع أياً منها في --set-env-vars ولا في ملف داخل المستودع.
تفاصيل كل مفتاح ومن أين يُجلب: CONNECT.md

MAJAL على:  $URL
EOM
