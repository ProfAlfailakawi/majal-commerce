# مجال — MAJAL Platform | Absolute Edition

**مجال** منصة تشغيل للشراكات التجارية بين المبدعين (أصحاب الوصفات والأفكار) والمنشآت المرخّصة في الكويت. تبدأ بقطاع الأغذية، ومسارها: اكتشاف → مطابقة → حماية الوصفة → عرض وتفاوض → عقد → بوابة إطلاق → إطلاق وطلبات → تنفيذ → مستحقات وتسويات. ومعها أسطح مجانية مساندة: معرض المشاريع المعروضة للبيع، دليل الموردين، الوظائف، ودعوات فريق المنشأة، وإعلانات الرعاة بموافقة الإدارة.

- الموقع الحيّ: **https://majal.web.app** (Firebase Hosting يمرّر كل الطلبات إلى خدمة Cloud Run `majal-app`؛ الرابط المباشر `run.app` يُحوَّل إلى هذا الأصل).
- الجاهزية: [https://majal.web.app/api/ready](https://majal.web.app/api/ready) · الإصدار المنشور: [https://majal.web.app/api/version](https://majal.web.app/api/version)

[![CI](https://github.com/ProfAlfailakawi/majal-commerce/actions/workflows/ci.yml/badge.svg)](https://github.com/ProfAlfailakawi/majal-commerce/actions/workflows/ci.yml)
[![Deploy](https://github.com/ProfAlfailakawi/majal-commerce/actions/workflows/deploy-cloud-run.yml/badge.svg)](https://github.com/ProfAlfailakawi/majal-commerce/actions/workflows/deploy-cloud-run.yml)

> **ملاحظة صدق:** الدفع الإلكتروني (MyFatoorah / Lemon Squeezy) وهوية PACI الرقمية مبنيّان كمحوّلات تفشل مغلقة، و**غير مفعّلين على الموقع الحيّ** حتى اليوم (`/api/v1/payments/readiness` و`/api/v1/paci/readiness` تردّان `configured: false`). بعض أدوات المنشأة (المختبر، قرارات غرفة الصفقة، نشر التحديات، تعديل سياسة المنصة من الواجهة) تعمل في **وضع العرض** فقط؛ في الإنتاج ترفضها الواجهة صراحةً لأن كتابتها الخادمية لم تُربط بعد.

---

## خريطة الميزات / Feature map

الأسطح في الواجهة تُبدَّل داخل التطبيق (حالة `activeSurface` في [src/App.tsx](src/App.tsx))، لا بمسارات URL؛ لذا عمود «الرابط المباشر» يذكر المسار فقط حين يوجد مسار أو رابط فعلي.

الحالة: **يعمل** = مربوط بالخادم ومنشور · **تجريبي** = وضع العرض فقط أو بيانات محلية · **قيد التفعيل** = الشيفرة جاهزة وتنتظر مفاتيح/اعتماد خارجي · **API فقط** = مسارات خادمية بلا واجهة مستخدم بعد.

### الأسطح العامة والمستهلك

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| الصفحة العامة (هوية «البوابة») | قصة مجال، رحلة الشراكة، الإطلاقات القادمة، زر دخول العرض | [/](https://majal.web.app/) | [src/components/public/PublicLanding.tsx](src/components/public/PublicLanding.tsx), [src/components/public/JourneyInfographic.tsx](src/components/public/JourneyInfographic.tsx) | يعمل |
| المركز القانوني | الشروط، الخصوصية، الاسترجاع، الامتثال والتتبع (مسارات حقيقية + sitemap) | [/terms](https://majal.web.app/terms) · [/privacy](https://majal.web.app/privacy) · [/refund](https://majal.web.app/refund) · [/compliance](https://majal.web.app/compliance) | [src/components/legal/LegalCenter.tsx](src/components/legal/LegalCenter.tsx), [src/lib/legalRoutes.ts](src/lib/legalRoutes.ts) | يعمل |
| صفحة الخصوصية المستقلة (لمتاجر التطبيقات) | صفحة ثابتة غير مرتبطة من القائمة | [/privacy-policy.html](https://majal.web.app/privacy-policy.html) | [hosting/privacy-policy.html](hosting/privacy-policy.html) | يعمل |
| الإطلاقات المجدولة | عدّ تنازلي، «ذكّرني»، تنبيه قبل ساعة وعند الافتتاح | — | [server/launch-schedule.ts](server/launch-schedule.ts), [src/components/consumer/LaunchCountdown.tsx](src/components/consumer/LaunchCountdown.tsx), [src/components/consumer/UpcomingDropStrip.tsx](src/components/consumer/UpcomingDropStrip.tsx) | يعمل |
| لوحة المستهلك والطلب | تصفّح الإطلاقات، قائمة الانتظار، متابعة المبدعين، الطلب والتقييم | — | [src/components/consumer/ConsumerDashboard.tsx](src/components/consumer/ConsumerDashboard.tsx), [src/components/consumer/DropCheckout.tsx](src/components/consumer/DropCheckout.tsx), [server/orders.ts](server/orders.ts), [server/commerce-ops.ts](server/commerce-ops.ts) | يعمل (الطلب يبقى `PENDING_PAYMENT` حتى تفعيل الدفع) |
| الدفع الإلكتروني + صفحة العودة | إنشاء الشحنة، Webhook موقّع، صفحة عودة الدفع | [/payment/return](https://majal.web.app/payment/return) | [server/payments.ts](server/payments.ts), [server/checkout.ts](server/checkout.ts), [src/components/consumer/PaymentReturnPage.tsx](src/components/consumer/PaymentReturnPage.tsx) | قيد التفعيل |
| معرض المشاريع للبيع | نشر مشروع للبيع مجانًا بلا حساب، يظهر بعد موافقة الإدارة | — | [src/components/showcase/BusinessShowcase.tsx](src/components/showcase/BusinessShowcase.tsx), [server/showcase.ts](server/showcase.ts) | يعمل |
| دليل الموردين | تسجيل مورد ومراجعته وعرضه | — | [src/components/showcase/SupplierDirectory.tsx](src/components/showcase/SupplierDirectory.tsx), [server/showcase.ts](server/showcase.ts) | يعمل |
| إعلانات الرعاة | طلب رعاية، حملات بسعة وجمهور، تقرير خاص للشركة برمز | `/?ad-report=<token>` | [src/components/showcase/AdSlot.tsx](src/components/showcase/AdSlot.tsx), [src/components/showcase/AdReportPage.tsx](src/components/showcase/AdReportPage.tsx), [server/showcase.ts](server/showcase.ts) | يعمل (التسوية خارج التطبيق) |
| تقرير «بوابتي» وحقيبة الشركاء | قياس جمهور مجهول، تقرير خاص وحقيبة شركاء برموز | `/?my-report=<token>` · `/?partners=<token>` | [server/audience.ts](server/audience.ts), [src/components/showcase/GateReportPage.tsx](src/components/showcase/GateReportPage.tsx), [src/components/showcase/PartnerKitPage.tsx](src/components/showcase/PartnerKitPage.tsx) | يعمل |
| الوظائف | نشر وظيفة، تقديم، مراجعة إدارية | — | [src/components/jobs/KuwaitiJobs.tsx](src/components/jobs/KuwaitiJobs.tsx), [src/components/jobs/JobComposer.tsx](src/components/jobs/JobComposer.tsx), [server/ecosystem.ts](server/ecosystem.ts) | يعمل |
| البيئة التجريبية المعزولة (Demo Sandbox) | دخول بلا حساب لمراجعي المتاجر بقاعدة في الذاكرة ومعرّف موقّع | زر «تجربة العرض» · `POST /api/v1/demo/enter` | [server/demo-sandbox.ts](server/demo-sandbox.ts), [src/lib/runtime.ts](src/lib/runtime.ts), [docs/demo-sandbox.md](docs/demo-sandbox.md) | يعمل |

### المبدع (Creator OS)

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| بوابة المبدع وجواز المبدع | ملف المبدع ولوحة أعماله | — | [src/components/creator/CreatorPortal.tsx](src/components/creator/CreatorPortal.tsx), [src/components/creator/CreatorPassport.tsx](src/components/creator/CreatorPassport.tsx) | يعمل |
| تقديم منتج وحالة المراجعة | معالج تقديم المنتج ونسخ الوصفة، ثم اعتماد الإدارة | — | [src/components/creator/ProductSubmissionWizard.tsx](src/components/creator/ProductSubmissionWizard.tsx), [src/components/creator/ProductReviewStatus.tsx](src/components/creator/ProductReviewStatus.tsx), [server/domain.ts](server/domain.ts) | يعمل |
| خزنة الوصفات (Recipe Vault) | طلب وصول بمستويات إفصاح، موافقة المبدع، إلغاء، تدقيق | — | [src/components/common/RecipeVaultModal.tsx](src/components/common/RecipeVaultModal.tsx), [src/components/creator/RecipeAccessRequests.tsx](src/components/creator/RecipeAccessRequests.tsx), [server/domain.ts](server/domain.ts), [server/secure-storage.ts](server/secure-storage.ts) | يعمل |
| رادار الفرص | ترشيح فرص للمبدع (بالذكاء الاصطناعي إن فُعّل) | — | [src/components/creator/OpportunityRadar.tsx](src/components/creator/OpportunityRadar.tsx) | يعمل جزئيًا (الذكاء الاصطناعي اختياري) |
| المستحقات وكشف الحساب | كشف المبدع وتصديره CSV، مراحل الصرف | — | [src/components/creator/CreatorEarnings.tsx](src/components/creator/CreatorEarnings.tsx), [src/components/creator/PayoutStatement.tsx](src/components/creator/PayoutStatement.tsx), [server/commerce-ops.ts](server/commerce-ops.ts), [server/ledger.ts](server/ledger.ts) | يعمل |

### المنشأة (Host Innovation OS)

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| اكتشاف المنتجات | تصفّح المنتجات المعتمدة وطلب التعاون | — | [src/components/host/ProductDiscovery.tsx](src/components/host/ProductDiscovery.tsx) | يعمل |
| منشئ العروض والعقود | عرض بإصدارات، قبول، توقيع العقد من الطرفين فقط | — | [src/components/host/OfferBuilder.tsx](src/components/host/OfferBuilder.tsx), [src/components/common/ContractModal.tsx](src/components/common/ContractModal.tsx), [server/domain.ts](server/domain.ts) | يعمل (الأثر الملزم يتطلب PACI واعتمادًا قانونيًا) |
| بوابة الإطلاق (Launch Gate) | شروط مشتقة من البيانات قبل التحويل إلى LIVE، وجدولة الإطلاق | — | [src/components/host/LaunchGateManager.tsx](src/components/host/LaunchGateManager.tsx), [server/domain.ts](server/domain.ts) | يعمل |
| غرفة عمليات الإطلاق | المبيعات والمخزون والفروع والتنبيهات | — | [src/components/host/LaunchWarRoom.tsx](src/components/host/LaunchWarRoom.tsx), [src/components/host/WarRoomOps.tsx](src/components/host/WarRoomOps.tsx), [server/commerce-ops.ts](server/commerce-ops.ts) | يعمل |
| تنفيذ الطلبات | قائمة الطلبات للتنفيذ ووسمها «تم التنفيذ» | — | [src/components/host/OrdersToFulfil.tsx](src/components/host/OrdersToFulfil.tsx), [server/commerce-ops.ts](server/commerce-ops.ts) | يعمل |
| فريق المنشأة والدعوات | دعوة أعضاء برابط، أدوار، إزالة | `/?invite=<token>` | [src/components/host/TeamManager.tsx](src/components/host/TeamManager.tsx), [src/components/common/InviteAcceptPage.tsx](src/components/common/InviteAcceptPage.tsx), [server/team.ts](server/team.ts) | يعمل |
| غرفة الصفقة (Deal Room) | ملاحظات وقرارات ومخاطر التفاوض | — | [src/components/common/DealRoom.tsx](src/components/common/DealRoom.tsx), [src/lib/store.ts](src/lib/store.ts) | تجريبي (القرارات تُحفظ في وضع العرض فقط) |
| مختبر التجارب (Lab) | دفعات مختبر: الإنتاجية، التكلفة، الهدر، المقارنة | — | [src/components/host/LabWorkspace.tsx](src/components/host/LabWorkspace.tsx), [src/lib/store.ts](src/lib/store.ts) | تجريبي |
| التحديات | نشر تحدٍّ للمبدعين | — | [src/components/host/ChallengePublisher.tsx](src/components/host/ChallengePublisher.tsx), [src/lib/store.ts](src/lib/store.ts) | تجريبي |
| بوابة المورد | تقديم التحقق وعروض المورد | — | [src/components/supplier/SupplierPortal.tsx](src/components/supplier/SupplierPortal.tsx), [server/ecosystem.ts](server/ecosystem.ts) | يعمل |

### الإدارة والسوبر أدمن

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| اعتماد المنتجات والإشراف | اعتماد/رفض/إيقاف المنتجات، أدوار وحالة المستخدمين | — | [src/components/admin/ProductApprovals.tsx](src/components/admin/ProductApprovals.tsx), [server/moderation.ts](server/moderation.ts) | يعمل |
| موافقات المنظومة | مراجعة الموردين والوظائف والمعرض والإعلانات | — | [src/components/admin/EcosystemApprovals.tsx](src/components/admin/EcosystemApprovals.tsx), [src/components/admin/ShowcaseAdmin.tsx](src/components/admin/ShowcaseAdmin.tsx) | يعمل |
| أرقام المنصة | مؤشرات محسوبة على الخادم مع تحديث كل دقيقة | — | [src/components/admin/AdminDashboard.tsx](src/components/admin/AdminDashboard.tsx), [server/admin-metrics.ts](server/admin-metrics.ts) | يعمل |
| قياس الجمهور | لوحة جمهور مجهول الهوية | — | [src/components/admin/AudienceDashboard.tsx](src/components/admin/AudienceDashboard.tsx), [server/audience.ts](server/audience.ts) | يعمل |
| سجل التدقيق | الخادم يدوّن الأحداث الحساسة؛ شاشة الإدارة تعرض سجل مخزن الواجهة فقط | — | [src/components/admin/AdminAuditLogs.tsx](src/components/admin/AdminAuditLogs.tsx), [server/database.ts](server/database.ts) | تجريبي (الشاشة لا تجلب سجل الخادم بعد) |
| مركز سياسة المنصة | العمولة، مدة منح الوصفة، حدود الطلب، دورة التسوية | — | [src/components/admin/PlatformPolicyCenter.tsx](src/components/admin/PlatformPolicyCenter.tsx), [src/lib/store.ts](src/lib/store.ts) | تجريبي (التعديل من الواجهة في وضع العرض فقط) |
| نبض مجال، السيولة، محرك الثقة | لقطات تحليلية مفسّرة (heuristic) | — | [src/components/admin/MajalPulse.tsx](src/components/admin/MajalPulse.tsx), [src/components/admin/MarketplaceLiquidity.tsx](src/components/admin/MarketplaceLiquidity.tsx), [src/components/admin/TrustEngine.tsx](src/components/admin/TrustEngine.tsx) | تجريبي (مشتقة من مخزن الواجهة) |

### الحساب، الأمان، والمنصة

| الميزة | ما تفعله | الرابط المباشر | الشيفرة | الحالة |
|---|---|---|---|---|
| المصادقة | تسجيل، دخول، جلسات HttpOnly، CSRF، `scrypt`، قفل المحاولات، استعادة كلمة المرور | — | [server/auth.ts](server/auth.ts), [src/components/common/AuthModal.tsx](src/components/common/AuthModal.tsx) | يعمل |
| التحقق الثنائي (MFA/TOTP) | تسجيل TOTP مشفّر، منع إعادة الاستخدام، إعادة التسجيل تتطلب الرمز الحالي | — | [server/auth.ts](server/auth.ts), [src/components/common/AccountSecurityModal.tsx](src/components/common/AccountSecurityModal.tsx) | يعمل |
| الإشعارات | صندوق وارد، تفضيلات، اشتراكات Push | — | [server/notifications.ts](server/notifications.ts), [src/lib/notificationClient.ts](src/lib/notificationClient.ts) | يعمل (قنوات البريد/Push الخارجية قيد التفعيل) |
| هوية PACI | تحقق Kuwait Mobile ID وأدلة توقيع العقد | — | [server/paci.ts](server/paci.ts), [src/lib/paciClient.ts](src/lib/paciClient.ts) | قيد التفعيل |
| مساعد الذكاء الاصطناعي (Gemini) | صياغة الوصف، شرح المطابقة، قراءة السوق — من الخادم فقط | `POST /api/ai/*` | [server/gemini.ts](server/gemini.ts), [server/ai-intelligence.ts](server/ai-intelligence.ts), [src/components/common/AiAssistantDrawer.tsx](src/components/common/AiAssistantDrawer.tsx) | اختياري (يتطلب `ENABLE_AI_API` ومفتاحًا خادميًا) |
| ابتكارات وأدوات متقدمة | أختام الوصفات، إسكرو الكشف التدريجي، سوق السعة، عدالة الصفقة، دفتر Merkle، مفاتيح الإيقاف، Canary… | `/api/v1/domain/innovations/*` · `/api/v1/advanced/*` | [server/domain.ts](server/domain.ts), [server/advanced.ts](server/advanced.ts), [server/kill-switch.ts](server/kill-switch.ts), [server/merkle.ts](server/merkle.ts) | API فقط |
| صفحة «نُحدّث البرنامج» | صفحة بهوية مجال بدل صفحة خطأ أثناء النشر، والواجهة تتعرّف عليها | — | [server/updating-page.ts](server/updating-page.ts), [public/updating.html](public/updating.html), [src/lib/updatingNotice.ts](src/lib/updatingNotice.ts) | يعمل |
| PWA وتطبيق الويب | Service worker، manifest، شاشات إطلاق، ضغط gzip/brotli | — | [public/sw.js](public/sw.js), [public/site.webmanifest](public/site.webmanifest), [server/static-compression.ts](server/static-compression.ts) | يعمل |
| تخطيطات iPhone Duo والشاشات العريضة | تخطيطات حسب العرض 600–1279px للوحات الأدوار | — | [src/lib/duoLayout.test.ts](src/lib/duoLayout.test.ts), [src/index.css](src/index.css) | يعمل |
| تطبيق Apple (iOS/iPadOS/Mac) | غلاف Capacitor أصلي وبيانات المتجر وسكربت إصدار | — | [apple/apple-release.sh](apple/apple-release.sh), [apple/capacitor.config.json](apple/capacitor.config.json), [apple-release/checklists/release.md](apple-release/checklists/release.md) | قيد التطوير (لم يُرفع للمتجر بعد) |
| حسّاس ORBIT | رصد أخطاء المتصفح لخدمة مراقبة ذاتية الاستضافة | — | [public/orbit-sensor.js](public/orbit-sensor.js) | يعمل |

## البنية

- **الواجهة:** React 19 + Vite 6 + Tailwind 4، تطبيق صفحة واحدة عربي RTL مع PWA. نقطة الدخول [src/main.tsx](src/main.tsx) و[src/App.tsx](src/App.tsx)؛ المكونات في [src/components](src/components)، العملاء والمنطق في [src/lib](src/lib)، بيانات العرض في [src/data](src/data).
- **الخادم:** Express 5 كوحدة واحدة في [server.ts](server.ts) مع الموجّهات في [server](server). رؤوس أمان وCSP، حدود معدّل على كل المسارات (مشتركة عبر Redis عند ضبط `REDIS_URL` — [server/rate-limit-store.ts](server/rate-limit-store.ts))، سجلات بصيغة Cloud Error Reporting ([server/observability.ts](server/observability.ts))، ومؤقتات تراعي الخمول لتنام قاعدة البيانات ([server/idle-aware.ts](server/idle-aware.ts)).
- **قاعدة البيانات:** PostgreSQL في الإنتاج (`DATABASE_URL` إلزامي مع `NODE_ENV=production`)، و`node:sqlite` للتطوير والاختبار وصناديق العرض — كلاهما عبر [server/database.ts](server/database.ts) بنفس الترحيلات.
- **الاستضافة:** Firebase Hosting ([firebase.json](firebase.json)) يعيد كتابة كل المسارات إلى Cloud Run `majal-app` في `europe-west2`؛ الصورة من [Dockerfile](Dockerfile).

### نقاط الخادم الرئيسية

| المسار | الملف |
|---|---|
| `/api/live` · `/api/ready` · `/api/health` · `/api/version` | [server.ts](server.ts) |
| `/api/v1/auth` | [server/auth.ts](server/auth.ts) |
| `/api/v1/domain` (منتجات، وصفات، عروض، عقود، إطلاق، تسويات، ابتكارات) | [server/domain.ts](server/domain.ts) |
| `/api/v1/orders` | [server/orders.ts](server/orders.ts) |
| `/api/v1/commerce` · `/api/v1/public` | [server/commerce-ops.ts](server/commerce-ops.ts) |
| `/api/v1/payments` + `/api/v1/payments/webhooks/:provider` | [server/payments.ts](server/payments.ts) |
| `/api/v1/paci` | [server/paci.ts](server/paci.ts) |
| `/api/v1/showcase` | [server/showcase.ts](server/showcase.ts) |
| `/api/v1/ecosystem` (موردون، وظائف) | [server/ecosystem.ts](server/ecosystem.ts) |
| `/api/v1/team` | [server/team.ts](server/team.ts) |
| `/api/v1/audience` | [server/audience.ts](server/audience.ts) |
| `/api/v1/notifications` | [server/notifications.ts](server/notifications.ts) |
| `/api/v1/moderation` | [server/moderation.ts](server/moderation.ts) |
| `/api/v1/admin/metrics` | [server/admin-metrics.ts](server/admin-metrics.ts) |
| `/api/v1/advanced` | [server/advanced.ts](server/advanced.ts) |
| `/api/v1/demo` | [server/demo-sandbox.ts](server/demo-sandbox.ts) |
| `/api/v1/catalog` | [server/catalog.ts](server/catalog.ts) |

## الأدوار

`SUPER_ADMIN` / `ADMIN` / `CREATOR` / `HOST_OWNER` / `HOST_OPERATIONS` / `HOST_CHEF` / `HOST_FINANCE` / `HOST_MARKETING` / `HOST_SUPPORT` / `CONSUMER`، ومصفوفة الصلاحيات في [src/lib/permissions.ts](src/lib/permissions.ts).

## التشغيل المحلي

يلزم Node.js 22 (`engines: 22.x`؛ `node:sqlite` يتطلب 22.13 أو أحدث).

```bash
npm ci
cp .env.example .env   # ثم املأ القيم محليًا؛ لا تُرفع .env أبدًا
npm run lint
npm test
npm run dev
```

لإنشاء أول حساب تشغيلي اضبط قيم `BOOTSTRAP_ADMIN_*` و`BOOTSTRAP_USER_ROLE` في البيئة ثم `npm run auth:bootstrap` (لا توجد كلمة مرور افتراضية). لبيانات تطوير واقعية: `npm run seed:dev` — يرفض العمل مع `NODE_ENV=production` أو `DATABASE_URL`، وكلمة مرور حسابات البذر تُضبط بـ`SEED_PASSWORD` (انظر [scripts/seed-data.ts](scripts/seed-data.ts)).

| السكربت | ما يفعله |
|---|---|
| `npm run dev` | خادم التطوير (`tsx server.ts`) مع Vite middleware |
| `npm run build` | `verify:pwa` ثم بناء العميل (Vite) والخادم (esbuild → `dist/server.cjs`) |
| `npm run build:client` / `npm run build:server` | بناء كل جزء منفردًا |
| `npm start` | تشغيل البناء `node dist/server.cjs` |
| `npm run preview` | معاينة بناء Vite |
| `npm run clean` | حذف `dist` |
| `npm run lint` | فحص الأنواع `tsc --noEmit` |
| `npm test` | اختبارات `node --test` على `src/lib/*.test.ts` و`server/*.test.ts` |
| `npm run auth:bootstrap` | إنشاء أول حساب تشغيلي ([scripts/bootstrap-admin.ts](scripts/bootstrap-admin.ts)) |
| `npm run seed:dev` | بذر قاعدة التطوير ([scripts/seed-data.ts](scripts/seed-data.ts)) |
| `npm run simulate:scale` | محاكي حمل ([scripts/simulate-scale.ts](scripts/simulate-scale.ts)) |
| `npm run audit:production` | `npm audit --omit=dev` |
| `npm run deploy:cloudrun` | نشر يدوي عبر [scripts/deploy-cloud-run.sh](scripts/deploy-cloud-run.sh) (اضبط `CLOUD_RUN_REGION=europe-west2` و`CLOUD_RUN_SERVICE_NAME=majal-app`؛ الافتراضي في السكربت مختلف) |
| `npm run verify:pwa` / `verify:demo` / `verify:env` | فحوص ثابتة ([scripts/verify-pwa.mjs](scripts/verify-pwa.mjs), [scripts/verify-demo-entry.mjs](scripts/verify-demo-entry.mjs), [scripts/verify-env.mjs](scripts/verify-env.mjs)) |
| `npm run secrets:generate` | توليد أسرار محلية ([scripts/generate-secrets.mjs](scripts/generate-secrets.mjs)) |

جميع المحاكيات والذكاء الاصطناعي مقفلة افتراضيًا؛ مفتاح Gemini يوضع في الخادم فقط ولا يُعرض في العميل. قائمة المتغيرات كاملة في [.env.example](.env.example).

## الاختبارات وبوابات الجودة

- نحو 70 ملف اختبار: [server](server) (`*.test.ts`) و[src/lib](src/lib) (`*.test.ts`)، منها العزل في [server/demo-sandbox.test.ts](server/demo-sandbox.test.ts)، الدفع في [server/payment-webhook.test.ts](server/payment-webhook.test.ts)، التوقيع في [server/contract-signing.test.ts](server/contract-signing.test.ts)، وقواعد Firestore في [server/firestore-rules.test.ts](server/firestore-rules.test.ts).
- اختبار PostgreSQL الحيّ ([server/postgres-integration.test.ts](server/postgres-integration.test.ts)) يُتخطّى بلا `TEST_DATABASE_URL`، واختبار Redis المشترك ([server/rate-limit-store.test.ts](server/rate-limit-store.test.ts)) يُتخطّى بلا `redis-server`. CI يوفّر الاثنين.
- [.github/workflows/ci.yml](.github/workflows/ci.yml): عند كل push/PR إلى `main` — `npm ci` ← `npm run lint` ← `npm test` (مع PostgreSQL 16 وRedis) ← `npm run build`.
- تقارير الجودة: [docs/QUALITY-SCORECARD.md](docs/QUALITY-SCORECARD.md), [docs/QA_AUDIT_REPORT.md](docs/QA_AUDIT_REPORT.md), [docs/VISUAL-POLISH-AUDIT.md](docs/VISUAL-POLISH-AUDIT.md).

## النشر

- [.github/workflows/deploy-cloud-run.yml](.github/workflows/deploy-cloud-run.yml) («نشر مجال إلى Cloud Run»): **يدوي فقط (`workflow_dispatch`)** منذ إيقاف النشر التلقائي لتقليل التكلفة. يشغّل `lint` و`test`، ثم إن كانت هوية النشر (Workload Identity) مضبوطة في متغيرات المستودع ينفّذ `gcloud run deploy majal-app --source .` في `europe-west2`، ثم يتحقق من `https://majal.web.app/` و`/api/ready`.
- الإعداد لمرة واحدة: [docs/deploy-majal.md](docs/deploy-majal.md). التشغيل والنسخ الاحتياطي والمراقبة: [docs/operations.md](docs/operations.md).
- Firebase Hosting (الموقع `majal`) يحمل [hosting/](hosting) فقط ويعيد الكتابة إلى Cloud Run.

## ربط الدفع

[server/payments.ts](server/payments.ts) يحوي محوّلين، يُختار أحدهما بـ`PAYMENT_PROVIDER`:

- `MYFATOORAH` — يسوّي بالدينار الكويتي مباشرة.
- `LEMONSQUEEZY` — لا يسوّي بالدينار، فيلزم `LEMONSQUEEZY_SETTLEMENT_CURRENCY` و`LEMONSQUEEZY_KWD_RATE` صراحةً، ولا يُقبل الحدث إلا بتوقيع `X-Signature` صحيح ومبلغ مطابق.

كلاهما يفشل مغلقًا إن نقص متغير. الحجز يبقى `PENDING_PAYMENT` ولا ينشئ بيعًا أو مستحقات، وتحويل التسوية إلى `PAID` مقفول حتى مرجع موثّق من المزوّد. متطلبات التفعيل: [docs/changelog/INTEGRATION_READINESS.md](docs/changelog/INTEGRATION_READINESS.md).

## وثائق مرجعية

- [PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md) · [SECURITY_MODEL.md](SECURITY_MODEL.md) · [SECURITY-TODO.md](SECURITY-TODO.md) · [LEGAL_GATES_KUWAIT.md](LEGAL_GATES_KUWAIT.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) · [CONNECT.md](CONNECT.md) · [AGENTS.md](AGENTS.md)
- [docs/showcase-and-ads.md](docs/showcase-and-ads.md) · [docs/demo-sandbox.md](docs/demo-sandbox.md) · [docs/LAUNCH_2026-09-26.md](docs/LAUNCH_2026-09-26.md)
- [docs/changelog/RELEASE_CHECKLIST.md](docs/changelog/RELEASE_CHECKLIST.md) · [docs/changelog/QA_REPORT.md](docs/changelog/QA_REPORT.md) · [docs/changelog/RELEASE_READINESS_REPORT.md](docs/changelog/RELEASE_READINESS_REPORT.md)

## الحدود المتبقية

- الدفع وPACI ومزوّدا البريد/Push تنتظر مفاتيح المزوّد والاعتماد القانوني قبل أي بيع أو أثر ملزم.
- المختبر وقرارات غرفة الصفقة والتحديات وتعديل سياسة المنصة من الواجهة ما زالت في وضع العرض؛ تحتاج كتابات خادمية مدقّقة.
- مسارات `innovations` و`advanced` موجودة على الخادم ومختبرة لكن بلا واجهة مستخدم.
- طبقة أحداث/عمّال مخصّصة وتخزين كائنات/KMS للإنتاج ما زالت هدفًا (انظر [PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md)). لا بيانات حساسة في تخزين المتصفح.

---

آخر تحديث للتوثيق: 2026-11-12
