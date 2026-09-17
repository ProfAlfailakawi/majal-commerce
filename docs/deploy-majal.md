# نشر مجال — إعدادٌ لمرة واحدة

المستودع يحمل سكربت نشر، لكنه كان يُشغَّل باليد. فكل ما يُدمج في `main` يبقى في
GitHub ولا يصل إلى الخدمة — ومنه البيئة التجريبية.

`.github/workflows/deploy-cloud-run.yml` ينشر عند كل دفع إلى `main` بعد اجتياز
الفحوص. ويحتاج مرة واحدة إلى هوية نشرٍ بلا مفتاح دائم.

**الهدف:** الخدمة `majal-app` في المشروع `tebyan-clean-2026-5f13b` بمنطقة
`europe-west2` — مأخوذ من رابط الخدمة الحيّ
`majal-app-522016905178.europe-west2.run.app`.

> مشروع `majal-b6309` هو مشروع Firebase، لا موضع الخدمة. النشر عليه لا يغيّر
> شيئًا في الموقع الذي يفتحه الناس.

## الخطوات — من Google Cloud Shell

```sh
PROJECT=tebyan-clean-2026-5f13b
POOL=github
SA=majal-deployer
REPO=ProfAlfailakawi/majal-commerce

gcloud config set project "$PROJECT"

# ١. حساب خدمة للنشر
gcloud iam service-accounts create "$SA" || true
for ROLE in roles/run.admin \
            roles/cloudbuild.builds.editor \
            roles/artifactregistry.admin \
            roles/storage.admin \
            roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$SA@$PROJECT.iam.gserviceaccount.com" \
    --role "$ROLE" --condition=None
done

# ٢. اتحاد هوية لـGitHub — مقيَّد بهذا المستودع وحده
#    (المجمّع `github` قد يكون منشأً في هذا المشروع من قبل — الأمر لا يضرّ إن تكرّر)
gcloud iam workload-identity-pools create "$POOL" --location global || true
gcloud iam workload-identity-pools providers create-oidc majal \
  --location global --workload-identity-pool "$POOL" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='$REPO'" || true

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding \
  "$SA@$PROJECT.iam.gserviceaccount.com" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/majal"
echo "GCP_DEPLOY_SERVICE_ACCOUNT     = $SA@$PROJECT.iam.gserviceaccount.com"
```

> **لماذا مزوّدٌ باسم `majal` لا `github`:** المشروع نفسه يستضيف أكثر من خدمة
> ومستودع، ولكل مستودعٍ شرطُه (`attribute-condition`). مزوّدٌ واحد مشترك كان
> سيجبرنا على توسيع الشرط ليشمل مستودعات أخرى — والتوسيع هنا يعني منح مستودعٍ
> صلاحية النشر على خدمة غيره.

## ثم في GitHub

Settings → Secrets and variables → Actions → **Variables** (لا Secrets):

| المتغيّر | القيمة |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | السطر المطبوع أعلاه |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `majal-deployer@tebyan-clean-2026-5f13b.iam.gserviceaccount.com` |

## ما يحرسه الورك-فلو

* **لا نشر فوق فحصٍ أحمر**: الأنواع والاختبارات قبل النشر.
* **لا يمحو إعدادًا**: لا يُمرَّر `--set-env-vars` ولا `--set-secrets`، فما هو
  مضبوط على الخدمة اليوم يبقى كما هو. الشيفرة وحدها تُحدَّث.
* **الخدمة تردّ بعد النشر**: يُطلب جذرها ويُتحقَّق من الاستجابة. نشرٌ ينتهي بخدمةٍ
  صامتة ليس نشرًا ناجحًا وإن قال `gcloud` إنه تمّ.

## للتجربة قبل الاعتماد

الورك-فلو يقبل `workflow_dispatch`: شغّله يدويًا من تبويب Actions بعد ضبط
المتغيّرين، وراقب النتيجة قبل أن تعتمد على النشر التلقائي.
