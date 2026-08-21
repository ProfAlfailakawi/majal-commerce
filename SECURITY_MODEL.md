# MAJAL — Security & Authorization Model

## المبدأ

Zero implicit trust. كل عملية حساسة تحتاج Identity + Permission + Context + State.

## أمثلة إنفاذ

- Creator يستطيع منح Recipe Grant فقط لمنتجه.
- HOST_CHEF يستطيع L3 فقط إذا كان عضوًا في المنشأة المستفيدة ويوجد Grant L3 نشط.
- HOST_OWNER لا يرى السر الكامل تلقائيًا لمجرد أنه المالك إذا كانت سياسة الدور لا تسمح.
- ADMIN ينفذ الامتثال والتسويات، لكنه لا يغير سياسة المنصة العليا.
- SUPER_ADMIN يغير السياسة والحسابات، لكنه لا ينتحل هوية المبدع/المنشأة بصمت.
- قبول العرض يجب أن يأتي من الطرف المقابل، لا من مرسل العرض.
- توقيع العقد محصور بصاحب المنتج ومالك المنشأة في السياق الصحيح.
- Launch لا يتحول LIVE إلا بعد Launch Gate مشتقة من السجلات.

## بيانات حساسة

الوصفات، الأسرار، العقود، مستندات الامتثال، أدلة النزاعات، وبيانات التسوية تعامل كـSensitive/Restricted.

## ما هو غير كافٍ

localStorage، hidden buttons، client-side role checks، روابط ثابتة، أو أسماء ملفات مخفية ليست ضوابط أمنية إنتاجية.

## وضع الحزمة الحالية

- الإنتاج fail-closed: لا تبديل أدوار، لا Firebase browser sync، لا دفع/PACI/POS simulator، ولا AI API افتراضيًا.
- المصادقة خادمية: كلمة المرور `scrypt` بملح مستقل، جلسة عشوائية لا يُحفظ منها إلا hash، Cookies `HttpOnly + SameSite=Strict + Secure` في الإنتاج، CSRF مزدوج، lockout، وMFA/TOTP مع تشفير السر بـAES-GCM.
- قاعدة البيانات تطبق Foreign Keys وCHECK constraints وmigrations؛ RecipeVersion غير قابلة للتعديل بعد الإنشاء، والمال minor units لا floating point.
- بوابة الدفع لا تقبل `PAID` إلا من Adapter يتحقق من webhook؛ الحدث يحمل idempotency ويُرفض إذا اختلف المبلغ أو العملة أو مسار الحالة.
- PACI لا يخزن الرقم المدني الخام؛ adapter الرسمي مقفول حتى استلام بروتوكول مزود الخدمة، والممر الداخلي يطلب HMAC على الـraw body.
- Firestore مغلق بالكامل حتى نشر Auth + tenant rules + اختبارات emulator سالبة وموجبة.
- `sessionStorage` يحتفظ بسياق واجهة غير حساس فقط داخل التطوير؛ الوصفات وPII والعقود والدفاتر تبقى في الذاكرة المؤقتة ولا يجوز إدخال بيانات حقيقية.
- الطلب التجريبي يبقى `PENDING_PAYMENT` ولا يرفع المبيعات أو ينشئ مستحقات.
- التوقيع والتسوية مدخلان مقفولان إنتاجيًا حتى ربط الهوية والدفع في طبقة موثوقة.
- هذه الضوابط تغطي Auth/MFA/DB وحدود التكامل، لكنها لا تستبدل نقل جميع Domain mutations إلى API، PostgreSQL متعدد النسخ، Object Storage/KMS، مزودي الدفع/PACI/الإشعارات، Monitoring/Backups والاختبارات القانونية المطلوبة قبل التشغيل التجاري.
