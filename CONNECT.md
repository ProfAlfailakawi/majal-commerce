# MAJAL — دليل الربط

كل شيء في الكود جاهز. هذا الملف يقول **من أين تأتي كل قيمة** وأين تلصقها.

اطبع الجاهزية في أي لحظة:

```bash
npm run verify:env
```

يخبرك بالضبط ما هو مضبوط، وما هو ناقص، وماذا ينكسر بسبب كل نقص.

> **«مضبوط» لا تعني «صحيح».** الفاحص يرى وجود القيمة لا صلاحيتها لدى المزوّد.
> التحقق الحقيقي الوحيد هو عملية شراء فعلية على بيئة منشورة.

---

## الخطوة ١ — الأسرار التي لا تحتاج أحداً (دقيقتان)

هذه عشوائية محضة، لا حساب ولا اشتراك:

```bash
npm run secrets:generate >> .env
```

يولّد ١١ سرّاً بالطول الذي يفرضه الكود (٣٢ محرفاً فأكثر).

⚠ **`AUTH_ENCRYPTION_KEY` ولّده مرة واحدة فقط.** تغييره بعد الإطلاق يُبطل كل سرّ
مشفَّر (أسرار MFA مثلاً) بلا رجعة. `AUTH_SESSION_SECRET` أهون: تغييره يُخرج
الجميع من جلساتهم فحسب.

للنشر على Cloud Run بصيغة Secret Manager:

```bash
node scripts/generate-secrets.mjs --gcloud
```

---

## الخطوة ٢ — قاعدة البيانات (إلزامية للإقلاع)

Postgres مطلوب في الإنتاج؛ SQLite للتطوير فقط. بدونه يرفض الخادم الإقلاع
(`DATABASE_URL_MISSING`).

| القيمة | من أين |
|---|---|
| `DATABASE_URL` | Cloud SQL → أنشئ نسخة Postgres → انسخ رابط الاتصال |

عبر مقبس Cloud SQL:

```
DATABASE_URL=postgresql://USER:PASS@/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
```

الترحيلات تُطبَّق تلقائياً عند الإقلاع بقفل استشاري، فالنسخ المتزامنة لا تتسابق عليها.

---

## الخطوة ٣ — بوابة الدفع (بدونها لا بيع إطلاقاً)

بدون هذه الخطوة يردّ `POST /api/v1/orders` بـ`503 PAYMENT_NOT_CONFIGURED`.
اختر مزوّداً واحداً.

### MyFatoorah — الموصى به للكويت (يسوّي بالدينار مباشرة)

| القيمة | من أين |
|---|---|
| `MYFATOORAH_API_TOKEN` | لوحة MyFatoorah → API Key |
| `MYFATOORAH_WEBHOOK_SECRET` | لوحة MyFatoorah → Webhook Settings → Secret |
| `MYFATOORAH_PAYMENT_METHOD_ID` | من `InitiatePayment` — رقم وسيلة الدفع (KNET له رقمه) |
| `MYFATOORAH_BASE_URL` | اختبار `https://apitest.myfatoorah.com` · إنتاج `https://api.myfatoorah.com` |

في لوحة المزوّد، وجّه الـwebhook إلى:

```
https://<APP_URL>/api/v1/payments/webhooks/myfatoorah
```

### LemonSqueezy — بديل دولي

يسوّي بعملة أجنبية، فيلزم سعر صرف. كل تغيّر في السعر الحقيقي يعني فارقاً في
ما يصل المبدع فعلاً — راجع `LEMONSQUEEZY_KWD_RATE` دورياً.

| القيمة | من أين |
|---|---|
| `LEMONSQUEEZY_API_KEY` | Settings → API |
| `LEMONSQUEEZY_STORE_ID` | من رابط المتجر في اللوحة |
| `LEMONSQUEEZY_VARIANT_ID` | المنتج → Variant → المعرّف |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Settings → Webhooks → Signing secret |
| `LEMONSQUEEZY_KWD_RATE` | كم وحدة من عملة التسوية يساوي الدينار |

الـwebhook:

```
https://<APP_URL>/api/v1/payments/webhooks/lemonsqueezy
```

**اختبر الحلقة كاملة قبل الإطلاق:** أنشئ طلباً، ادفع في وضع الاختبار، ثم تأكد أن
الطلب صار `PAID` وأن سطر استحقاق للمبدع ظهر في `accruals` بالنسبة الصحيحة.

---

## الخطوة ٤ — البريد (بدونه لا استعادة لكلمة المرور)

| القيمة | من أين |
|---|---|
| `RESEND_API_KEY` | resend.com → API Keys |
| `RESEND_FROM` | نطاق **موثَّق** لديك في Resend، مثل `MAJAL <no-reply@your-domain>` |

نطاق غير موثَّق يجعل كل إرسال يفشل. عند الفشل يُحذف رمز الاستعادة المخزَّن بدل
تركه معلّقاً — فالمستخدم يعيد الطلب بدل انتظار بريد لن يصل.

---

## الخطوة ٥ — خزنة الوصفات (إلزامية في الإنتاج)

الوصفات هي الملكية الفكرية الأساسية للمنصة. بدون هذين يفشل **أي** حفظ لوصفة
بـ`SECURE_STORAGE_NOT_CONFIGURED`.

| القيمة | من أين |
|---|---|
| `GCS_SECURE_BUCKET` | Cloud Storage → دلو خاص (لا وصول عام إطلاقاً) |
| `GCP_KMS_KEY_NAME` | Cloud KMS → `projects/P/locations/L/keyRings/R/cryptoKeys/K` |

امنح حساب خدمة Cloud Run:

- `roles/storage.objectAdmin` على الدلو
- `roles/cloudkms.cryptoKeyEncrypterDecrypter` على المفتاح

---

## الخطوة ٦ — اختيارية

| الميزة | المتغيّرات | أثر الغياب |
|---|---|---|
| المساعد الذكي | `ENABLE_AI_API=true` + `GEMINI_API_KEY` | مسارات `/api/ai` تردّ 503 |
| إشعارات المتصفح | `FCM_PROJECT_ID` + بيانات اعتماد Google | لا إشعارات دفع |
| استخراج المستندات | `DOCUMENT_AI_PROCESSOR_NAME` | `zero-form/extract` معطّل |
| ختم زمني خارجي | `TSA_URL` | يُستعمل ختم محلي أضعف إثباتاً |

---

## الخطوة ٧ — التوقيع القانوني PACI

**هذا قرار قانوني قبل أن يكون تقنياً.** المسار جاهز في `server/paci.ts`، لكن
تفعيله يعني أن التوقيع صار مُلزِماً. راجع `LEGAL_GATES_KUWAIT.md` واعتماد مستشار
كويتي قبل ضبط `PACI_SERVICE_PROVIDER_APPROVED`.

الستة مطلوبة معاً: `PACI_ADAPTER_URL` · `PACI_ADAPTER_SHARED_SECRET` ·
`PACI_CALLBACK_URL` · `PACI_INTERNAL_CALLBACK_SECRET` · `PACI_DATA_PEPPER` ·
`PACI_SERVICE_PROVIDER_APPROVED`

`PACI_ADAPTER_SHARED_SECRET` يجب أن يطابق ما لدى المزوّد — نسّقه معهم.
`PACI_DATA_PEPPER` لا تغيّره بعد أول توقيع.

---

## الخطوة ٨ — أول حساب مشرف

```bash
BOOTSTRAP_ADMIN_EMAIL=you@example.com \
BOOTSTRAP_ADMIN_PASSWORD='<كلمة مرور قوية>' \
BOOTSTRAP_ADMIN_NAME='اسمك' \
BOOTSTRAP_USER_ROLE=SUPER_ADMIN \
npm run auth:bootstrap
```

---

## قبل الإطلاق

```bash
npm run verify:env      # 0 مانع
npm test                # 93/93
npm run build
```

ثم على بيئة منشورة، بيدك:

1. سجّل حساباً جديداً وادخل به.
2. اطلب استعادة كلمة المرور وتأكد أن البريد وصل فعلاً.
3. نفّذ **عملية شراء كاملة** بوضع الاختبار.
4. تأكد أن الطلب صار `PAID` وأن استحقاق المبدع حُسب بالنسبة الصحيحة.
5. جرّب استرجاعاً وتأكد أن الاستحقاق انعكس إلى `REVERSED`.

لم تُختبر أيٌّ من هذه الخمس على مزوّد حقيقي — الاختبارات تغطي المنطق، لا صحة
مفاتيحك ولا سلوك المزوّد.

---

## ما يبقى قراراً لك

| البند | الحال |
|---|---|
| ~٥٨ نقطة API بلا واجهة (`advanced/*`, `innovations/*`) | مبنية ومؤمَّنة ومختبَرة، لا يصلها زر. صِلها أو احذفها |
| حدّ المعدّل في الذاكرة | الحدّ الفعلي = الحدّ × عدد النسخ. مخزن مشترك قرار تكلفة |
| `markSettlementPaid` | مقفول عمداً حتى يصل مرجع دفع موثّق من المزوّد |
| قراءة عامة في `firestore.rules` | `creators`/`hosts`/`products` مقروءة للعموم — صحيحة لكتالوج عام، خطأ لو أردتها خاصة |
