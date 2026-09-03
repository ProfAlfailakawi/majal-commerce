# مجال — MAJAL Platform | Absolute Edition

**مجال** هو Product Operating System للشراكات التجارية بين المبدعين والمنشآت المرخّصة. يبدأ بقطاع الأغذية، لكن قلب النظام مصمم ليتمدد لاحقًا إلى Verticals أخرى عبر نفس منطق: اكتشاف → مطابقة → حماية → مختبر → تفاوض → عقد → Launch Gate → إطلاق → قياس → مستحقات.

## الأسطح الرئيسية

- **Public / Consumer**: قصة مجال، الإطلاقات، Drops، Keep It، الطلب والتقييم.
- **Creator OS**: Creator Passport، Opportunity Radar، Product Submission، Recipe Vault، Recipe Access Requests، Digital Twin، Deal Room، العقود والمستحقات.
- **Host Innovation OS**: Discovery، Challenges، Lab، Deal Room، Offer Builder، Launch Gate، Launch War Room، Finance، Team & Permissions.
- **Admin Control Center**: الامتثال، الأذونات، العقود، التسويات، Emergency Product Control، Trust & Risk، Audit.
- **Super Admin Command Center**: Majal Pulse، المستخدمون والأدوار، Marketplace Liquidity، Trust Engine، Platform Policy Center، System Readiness، Audit.

## ما يميز Absolute Edition

### 1. مصادقة خادمية ومصفوفة صلاحيات قابلة للاختبار
جلسات HttpOnly/SameSite، حماية CSRF، كلمات مرور `scrypt`، قفل مؤقت للمحاولات، MFA/TOTP اختياري، وRBAC + Context + Sensitivity. في وضع التطوير يبقى تبديل الأدوار متاحًا كعرض منفصل، ولا يتحول إلى هوية إنتاجية.

### 2. Recipe Vault متعددة المستويات
Request → Creator Approval → L1/L2/L3 → Expiry/Revoke. L2 يحجب الأسرار، وL3 يحتاج الدور والسياق والGrant المناسب. View/Export/Grant/Revoke كلها تدخل Audit Trail.

### 3. Product Digital Twin + Time Travel
كل منتج يربط النسخ الفعلية للوصفة، التعاون، الأذونات، العرض، العقد، الإطلاق، الطلبات، التقييمات والمستحقات. المقارنة تعتمد على RecipeVersions الفعلية ولا تختلق أرقامًا تاريخية.

### 4. Deal Room + Decision Ledger
القرارات والملاحظات والمخاطر والمراحل تحفظ داخل Store وترتبط بصاحب القرار ودوره ووقته والتعاون، بدل state مؤقت يختفي بعد Reload.

### 5. Lab Workspace حقيقي
دفعات مختبر persistent مرتبطة بالوصفة والـyield والتكلفة والوقت والهدر والقرار والتغييرات المقترحة، مع مقارنة آخر دفعتين.

### 6. Launch Gate مشتقة من البيانات
لا يمكن تحويل المنتج إلى LIVE لمجرد ضغط زر. شروط النظام مشتقة من التحقق، المستندات، العقد، الحساسية، الصور والفروع، والشروط التشغيلية اليدوية منفصلة ومراقبة.

### 7. Launch War Room
GMV، الوحدات، Sell-through، الفروع، تقييمات الشراء، التنبيهات ومصادر الاكتساب ضمن سياق المنشأة وصلاحية المستخدم.

### 8. Financial State Integrity
الحجز التجريبي يبقى `PENDING_PAYMENT` ولا ينشئ بيعًا أو مستحقات. اعتماد التسوية لا يساوي الدفع، وتحويلها إلى `PAID` مقفول حتى يصل مرجع موثّق من مزود الدفع إلى الخادم.

### 9. Platform Policy Center
السوبر أدمن يتحكم فعليًا في: عمولة مجال الافتراضية، مدة Recipe Grants، Max Order Units، Compliance Warning Window، Strong Match Threshold، وSettlement Cycle. هذه القيم تؤثر في Domain Logic وتدخل Audit.

### 10. Trust / Liquidity / Majal Pulse
- Trust Engine: heuristic مفسر وليس حكمًا آليًا.
- Marketplace Liquidity: قياس فجوات العرض/الطلب من البيانات المتاحة.
- Majal Pulse: لقطة الشركة كلها من المواهب والمنشآت إلى المختبر والعقود والإطلاق والقيمة الاقتصادية.

## الأدوار

`SUPER_ADMIN` / `ADMIN` / `CREATOR` / `HOST_OWNER` / `HOST_OPERATIONS` / `HOST_CHEF` / `HOST_FINANCE` / `HOST_MARKETING` / `HOST_SUPPORT` / `CONSUMER`.

## الأسطح العامة

بالإضافة إلى أسطح التشغيل، تنشر المنصة **مركزًا قانونيًا عامًا** يضم الشروط والأحكام، سياسة الخصوصية، سياسة الاسترجاع والإلغاء، وصفحة الامتثال وقابلية التتبع. الوصول إليه من تذييل الصفحة في أي حالة من حالات التطبيق، وهو شرط مسبق لاعتماد المتجر لدى مزودي الدفع.

## ملفات الجاهزية

- `PRODUCTION_ARCHITECTURE.md`
- `SECURITY_MODEL.md`
- `RELEASE_CHECKLIST.md`
- `LEGAL_GATES_KUWAIT.md`
- `DESIGN_SYSTEM.md`
- `QA_REPORT.md`

## التشغيل المحلي

```bash
npm install
cp .env.example .env
npm run lint
npm test
npm run dev
```

يلزم Node.js 22.13 أو أحدث لأن قاعدة البيانات المحلية تستخدم `node:sqlite`. لإنشاء أول حساب تشغيلي ضع قيم `BOOTSTRAP_ADMIN_*` وحدد `BOOTSTRAP_USER_ROLE` في البيئة ثم شغّل (لا توجد كلمة مرور افتراضية):

```bash
npm run auth:bootstrap
```

للبناء:

```bash
npm run build
npm run audit:production
npm run simulate:scale
```

انسخ `.env.example` محليًا عند الحاجة. جميع المحاكيات وFirebase sync وAI API مقفلة افتراضيًا؛ ضع `GEMINI_API_KEY` في الخادم فقط ولا تعرض أي مفتاح في العميل.

## ربط الدفع

`server/payments.ts` يحوي محوّلين جاهزين، ويُختار أحدهما عبر `PAYMENT_PROVIDER`:

- `MYFATOORAH` — يسوّي بالدينار الكويتي مباشرة.
- `LEMONSQUEEZY` — لا يسوّي بالدينار الكويتي، فيلزم تحديد `LEMONSQUEEZY_SETTLEMENT_CURRENCY` و`LEMONSQUEEZY_KWD_RATE` صراحةً. الحدث الوارد لا يُقبل إلا إذا صحّ توقيع `X-Signature` **و** طابقت القيمة المحصّلة لدى المزوّد المبلغ بالدينار المسجّل عند سعر التحويل المعتمد.

كلا المحوّلين يفشل مغلقًا إذا نقص أي متغير. راجع `INTEGRATION_READINESS.md` لمتطلبات التفعيل الكاملة قبل أي بيع حقيقي.

## ما أصبح فعليًا في v5

- قاعدة SQLite دائمة محلية مع migrations وعلاقات وفهارس لـAuth، المنظمات، المنتجات، الوصفات immutable، الأذونات، التعاونات، العروض، العقود، الإطلاقات، الطلبات، المستحقات، التسويات، الدفع، PACI، الإشعارات والتدقيق.
- مصادقة مستخدمة من واجهة الإنتاج، مع تسجيل عميل، استعادة جلسة، خروج، MFA وحدود أمان خادمية.
- Payment/PACI adapter contracts جاهزة وتفشل بأمان حتى وصول وثائق المزود والمفاتيح الرسمية.
- مركز قرار للإشعارات يدمج التكرار ويرتب الأولوية ويجهز Outbox للقنوات الخارجية.
- signed cursor pagination بحد أقصى 50 سجلًا ومحاكي حمل يولد ملايين السجلات المصطنعة.

## الحدود المتبقية

SQLite هنا محرك التطوير والمحاكاة، وليس بديل PostgreSQL للتشغيل متعدد النسخ. الواجهات الحساسة القديمة ما زالت مقفلة إنتاجيًا حتى نقل جميع عملياتها من Store التجريبي إلى خدمات API، وربط Object Storage للوصفات والعقود، مزود البريد/Push، الدفع، PACI، المراقبة والنسخ الاحتياطي، ثم الاعتماد القانوني. لا توجد بيانات حساسة في browser storage.
