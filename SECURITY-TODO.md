# SECURITY-TODO — حالة الفجوات الأمنية/التشغيلية

الوثيقة تتابع الفجوات الأمنية والتشغيلية الكبرى. كل بند مُعلَّم بحالته:
**[نُفِّذ]** طُبِّق في الكود · **[قرار مالك]** يحتاج قرار منتج/بنية ولم يُنفَّذ.

---

## 1. [نُفِّذ] واجهة الإنتاج تعرض بيانات Seed
- `src/lib/runtime.ts`: `IS_DEMO_MODE = import.meta.env.DEV && VITE_ENABLE_DEMO_MODE === 'true'`.
  الربط بـ`DEV` يعني أن حزمة الإنتاج **لا يمكن** تحويلها لوضع العرض بخطأ في متغيّر بيئة.
- `src/lib/store.ts`: `demoData()` تُعيد `[]` خارج وضع العرض، فلا تدخل أي بذرة حالة الإنتاج أصلاً
  (بدل محاولة مسحها بعد تحميلها).
- **ملاحظة سجل:** `clearSeedDomainData` المذكورة سابقاً لم تعد موجودة.

## 2. [نُفِّذ] إجراءات الأدمن والطلبات والتقييمات صارت خادمية
- **`server/orders.ts`** — دورة الشراء: `POST /api/v1/orders` ينشئ الطلب ونية الدفع في معاملة واحدة.
  السعر يُشتق من العرض المعتمد (`offer_versions` بحالة ACCEPTED) لا من العميل، وسقف الكمية يُتحقق منه
  داخل المعاملة من الصفوف المكتوبة فعلاً. `Idempotency-Key` إلزامي فلا يُسحب المبلغ مرتين. فشل المزوّد
  يُلغي الطلب بدل تركه يحجز من السقف.
  ما بعد ذلك (PAID → استحقاق → استرجاع) كان مبنياً ومختبَراً في `server/payments.ts` ولم يكن يعمل لغياب
  مُنشئ الطلب فقط.
- **التقييم موثّق الشراء بنيوياً** — `POST /api/v1/orders/:id/review` مربوط بطلب مدفوع يملكه صاحب الجلسة،
  وقيد `UNIQUE(order_id)` يمنع أكثر من تقييم لكل طلب. القراءة العامة لا تُعيد أي هوية للمقيّم.
- **`server/moderation.ts`** — تغيير الدور (SUPER_ADMIN فقط)، تعليق/تفعيل الحساب، إيقاف/إعادة تشغيل
  المنتج. كلها تتطلب سبباً مكتوباً يُحفظ في `moderation_actions` + `domain_audit_events`. **تعليق حساب
  أو تغيير دوره يبطل جلساته فوراً** — وهو ما لم يكن العميل يستطيعه أصلاً. إيقاف المنتج يوقف إطلاقاته
  الحيّة فعلاً، فيتوقف البيع.
- ترحيل المخطط 19 (`product_reviews`, `moderation_actions` + فهارس الطلبات).
- تغطية: `server/commerce.test.ts` (٩ اختبارات) — التسعير من الخادم، رفض بلا بوابة دفع، السقف،
  منع التكرار، ملكية التقييم، إبطال الجلسات، وحصر تغيير الدور.
- **المتبقّي وهو قرار مالك:** `markSettlementPaid` يبقى مقفولاً عمداً حتى يصل مرجع دفع موثّق من المزوّد
  (`applySettlementPaid` جاهزة ومحروسة بانتقال حالة ذرّي).

## 3. [قرار مالك] توقيع العقد معطّل (PACI)
- تكامل PACI للتوقيع الرقمي معطّل — لا توقيع قانوني فعلي على العقود (`server/paci.ts` جاهز لكن بلا مزوّد).
- **القرار المطلوب:** تفعيل PACI أو مزوّد توقيع بديل قبل أي التزام قانوني. راجع `LEGAL_GATES_KUWAIT.md`.
  تفعيل التوقيع الملزم قرار قانوني/تعاقدي، لا قرار هندسي.

## 4. [نُفِّذ جزئياً] استعادة كلمة المرور
### نُفِّذ — مولّد الرمز الآمن
- `server/auth.ts`: كان الرمز `Math.floor(100000 + Math.random() * 900000)` — رمز من 6 أرقام مولَّد من
  `Math.random` (ليس CSPRNG، ويمكن التنبؤ ببقية مخرجاته من عدد قليل من العيّنات) وفضاؤه 10⁶ فقط.
- صار: `randomBytes(32).toString('base64url')` — 256 بت عشوائية تشفيرياً (43 محرفاً).
- الرمز يُخزَّن **مُجزَّأً فقط** (`sha256`) في `password_reset_tokens`، وله انتهاء صلاحية 15 دقيقة،
  والمقارنة صارت **زمنياً ثابتة** (`safeTextEqual`/`timingSafeEqual`) بدل `!==`.
- الرمز المنتهي يُستهلك (يُحذف) عند المحاولة، والرمز يُحذف بعد نجاح الاستعادة (استعمال واحد).
- استُبدل `require('crypto')` داخل الدالة بالاستيراد العلوي (ESM-safe).
- الواجهة `src/components/common/AuthModal.tsx` تقبل الرمز الطويل كما هو (لا تصفية أرقام، لا حدّ 6 محارف).
- اختبار حماية: `server/auth.test.ts` — «reset tokens are CSPRNG-generated, high entropy and stored hashed».

### [نُفِّذ] قناة التسليم
- الرمز يُرسل عبر Resend مباشرة (`sendResendEmail` في `server/delivery.ts`)، لا عبر صندوق الإشعارات —
  فلا يُخزَّن رمز الاستعادة كصف في `notification_inbox`.
- فشل الإرسال **يحذف** الرمز المخزَّن بدل ترك اعتماد صالح ينتظر بريداً لن يصل. الردّ يبقى موحّداً في كل
  الحالات فلا يكشف وجود الحساب.
- **يتبقّى إعداد فقط:** `RESEND_API_KEY` و`RESEND_FROM`.

## 5. [نُفِّذ جزئياً] كود API ميت
### نُفِّذ — حُذف ما يمكن الجزم بموته
- `src/lib/intelligence.ts`: حُذفت الدوال والواجهات غير المستدعاة من أي ملف (بما فيه الاختبارات):
  `buildDeterministicEligibility`, `buildSemanticMatchIntelligence`, `buildOpportunityRadar`,
  `buildRecipeLabIntelligence`, `buildLaunchIntelligence` + أنواعها + `tokenize`/`overlapRatio`
  + تعريف مكرر لـ`GroundedMarketSignal` (التعريف الحيّ في `src/lib/intelligenceClient.ts`).
  الملف: 351 → 81 سطراً. الباقي مستخدم فعلاً: `buildDealRoomCopilot` (DealRoom)،
  `marketQueryForProduct` (OpportunityRadar)، `effectiveRecipeDisclosureLevel` (مُختبَر).
- `src/lib/onboarding.ts`: حُذفت `readOnboarding` و`resetOnboarding` (صفر مراجع).
- `src/lib/runtime.ts`: حُذف `FIREBASE_SYNC_ENABLED` — علم ميت لمزامنة Firebase عميلية أُزيلت سابقاً
  (متغيّره `VITE_ENABLE_FIREBASE_SYNC` كان قد أُزيل من `.env.example` في البند 12).

### [قرار مالك] لم يُحذف — سطح API غير مستدعى لكنه ليس «ميتاً» بالضرورة
الجرد الدقيق أدناه ناتج عن بحث آلي عن كل مسار في `src/` وفي أي عميل. **لا شيء منها يُستدعى من الواجهة**،
لكن حذفها إزالة ميزات/أدوات تشغيل، لا تنظيف — لذلك تُترك لقرار المالك:

| السطح | الملف | الحجم | مستدعى من العميل؟ | مغطّى باختبارات؟ |
|---|---|---|---|---|
| `/api/v1/advanced/*` (33 مساراً) | `server/advanced.ts` (mount في `server.ts:107`) | 427 سطراً / 33 KB | لا | الموجِّه نفسه: **لا**. وحداته الـ17 (`ledger`, `secret-halflife`, `kill-switch`, `canary`, `lineage`, `merkle`, `shamir`, `threshold-escrow`, `proof-of-reserves`, `time-anchor`, `sealed-compute`, `blast-radius`, `trust-proof`, `contract-drift`, `royalty-radar`, `counterfactual`, `operational-twin`) ≈ 1,700 سطر و**28 اختباراً** |
| `/api/v1/domain/innovations/*` (19 مساراً) | `server/domain.ts:480-520` | ≈ 25 KB مضغوطة | لا | لا |
| `/api/v1/catalog` + `/catalog/admin/scale-summary` | `server/catalog.ts` | 130 سطراً | لا | فهارسه فقط (`database.test.ts`) |
| `/api/v1/notifications/push-subscriptions`, `/push-subscriptions/:id`, `/preferences/current` (GET+PUT) | `server/notifications.ts` | — | لا | لا |
| `/api/v1/compliance/jurisdiction-config` | `server.ts:187` | — | لا | لا |
| `/api/v1/paci/readiness`, `/api/v1/payments/readiness` | `server/paci.ts`, `server/payments.ts` | — | لا | لا |

**سبب عدم الحذف:**
1. **`/api/v1/advanced` سطح تشغيلي/أمني مقصود، لا كود ميت.** يحتوي مفاتيح الإيقاف الطارئ
   (`/security/kill-switch/:name/engage|release` — SUPER_ADMIN فقط)، والتحقق من سلسلة الدفتر
   (`/ledger/verify`)، وإثبات الاحتياطي، وكشف الإسكرو العتبي. هذه أدوات استجابة حوادث تُستدعى عادةً
   يدوياً (curl) من مشغّل — و«لا نتيجة في `src/`» **لا يثبت** عدم الاستخدام وقت التشغيل. حذفها يزيل
   قدرة احتواء حادثة دون أن يلاحظ أحد حتى وقوع الحادثة.
2. **حذف الموجِّه يترك 17 وحدة مع 28 اختباراً بلا أي مستدعٍ** — يحوّل السطح من «API غير موصول»
   إلى «مكتبة ميتة مع اختبارات»، أي يزيد الالتباس ولا ينقصه.
3. **`/innovations/*` ميزات منتج نصف مبنية** (بصمة Taste DNA، سوق السعة، كبسولة ذاكرة العميل مع
   موافقة/سحب موافقة، إسكرو الكشف التدريجي، إسناد القيمة). حذفها قرار منتج صريح — وهو ضمن
   «لا تنفّذ» في تعليمات جولة العمل هذه.
4. **قاعدة الجولة:** يجب بقاء الاختبارات ناجحة وبلا نقصان؛ حذف حزمة `advanced` كان سيسقط 28 اختباراً.

**القرار المطلوب من المالك — أحد ثلاثة لكل سطح:**
(أ) وصله بالواجهة، أو (ب) حذفه كلياً مع وحداته واختباراته، أو (ج) إبقاؤه صراحةً كسطح تشغيلي
موثّق مع تقييد وصوله شبكياً (IAM/IAP بدل الاعتماد على الأدوار فقط).

## 6. [نُفِّذ] قواعد Firestore — قراءة واسعة
- `firestore.rules` (كان السطر 15): `match /users/{userId} { allow read: if isAuthenticated(); }`
  — أي حساب مسجَّل (بما فيه حساب يُنشأ في ثوانٍ) كان يستطيع قراءة **كل** وثائق المستخدمين:
  الاسم والبريد والهاتف والدور وروابط المنشأة/المبدع. تسريب دليل مستخدمين كامل.
- صار: `allow read: if isOwner(userId) || isAdmin();` مع دالة مساعدة `isAdmin()` جديدة.
- **التحقق قبل التضييق:** فُحص كل الكود العميلي — لا يوجد أي استيراد لـFirebase SDK في `src/`،
  ولا أي قراءة Firestore من العميل. النموذج المعتمد (`server/firebase-mirror.ts`) هو أن الخادم
  يكتب المرآة عبر Admin SDK (يتجاوز القواعد)، والعميل لا يقرأها إطلاقاً. لذلك التضييق بلا مستهلك متضرر.
- اختبار حماية في `server/firestore-rules.test.ts`.
- **متبقٍّ (قرار مالك):** `creators` و`hosts` و`products` ما زالت `allow read: if true` (قراءة عامة
  دون مصادقة). تُركت لأنها قد تكون خياراً مقصوداً لكتالوج عام. لا أثر حيّ اليوم — المرآة خاملة كلياً
  (`mirrorDoc` بلا مستدعٍ إنتاجي، والإعداد غير مضبوط). **يجب حسمها قبل تفعيل المرآة**، وإلا فأي حقل
  يُنسخ إلى `creators` سيصبح عالمي القراءة.

## 7. [نُفِّذ] انحراف firebase-blueprint.json عن firestore.rules
- كان `firebase-blueprint.json` يحمل قواعد **أضعف** من `firestore.rules`: `write: request.auth != null`
  على `creators`/`hosts`/`products` (أي مستخدم مسجّل يعدّل أي وثيقة — بما فيها الأسعار)،
  و`read/write: request.auth != null` على `orders`/`contracts` (قراءة/كتابة طلبات وعقود الآخرين — IDOR).
- صار الملف مطابقاً لـ`firestore.rules`: كتابة `users` للمالك فقط، `creators`/`products` إنشاء/تحديث
  للمالك مع منع نقل الملكية ومنع الحذف، `hosts` كتابة للأدمن فقط، `orders`/`contracts` قراءة مقيّدة
  بالأطراف والكتابة `false` (تمرّ عبر الخادم).
- اختبار حماية ضد الانحراف مستقبلاً في `server/firestore-rules.test.ts`
  («firebase-blueprint.json never carries weaker rules than firestore.rules»).

## 8. [نُفِّذ جزئياً] Rate limit — موثوقية IP العميل
### نُفِّذ — TRUST_PROXY_HOPS
- كان `server.ts`: `Number(process.env.TRUST_PROXY_HOPS || 0)` ولا يُستدعى `app.set('trust proxy', …)`
  إلا إذا كانت القيمة > 0. خلف Cloud Run هذا يعني أن `req.ip` = عنوان البروكسي دائماً، فينهار
  حدّ المعدّل إلى **دلو واحد عالمي** (متصل مسيء واحد يخنق كل المستخدمين)، ويفسد قفل الدخول
  وسجلات تدقيق المصادقة المبنية كلها على `req.ip`.
- صار: `resolveTrustProxyHops()` في `server/observability.ts` — الافتراضي **1 في الإنتاج**
  (قفزة Cloud Run الواحدة) و**0 محلياً**، قابل للضبط عبر `TRUST_PROXY_HOPS`، مع تحقّق صارم:
  أي قيمة غير صحيحة أو خارج المدى 0..5 تعود للافتراضي مع تحذير مُهيكل بدل القبول الصامت
  (الوثوق بقفزات أكثر من الواقع يسمح للعميل بتزوير `X-Forwarded-For` وانتحال IP).
  و`app.set('trust proxy', hops)` صار يُستدعى دائماً، مع سطر سجل يبيّن القيمة الفعلية.
- `.env.example` وُثِّق فيه معنى كل قيمة.
- اختبار حماية: `server/observability.test.ts`.

### [قرار مالك] المخزن في الذاكرة
- حدّ المعدّل ما زال `Map` في الذاكرة (`server.ts`): يُفقد عند إعادة التشغيل ولا يصمد أفقياً
  (كل نسخة Cloud Run لها عدّادها، فالحد الفعلي = الحد × عدد النسخ).
- **القرار المطلوب:** مخزن مشترك (Redis/Memorystore) — يحتاج بنية تحتية وقرار تكلفة.

## 9. [قرار مالك] تنظيف تاريخ git
- جولات التنظيف حذفت ملفات من الشجرة فقط (commits جديدة). لم يُعَد كتابة التاريخ.
- لم تُحذف أي ملفات PII (لم يُعثر على JSON/CSV تحوي بيانات حقيقية).
- `firebase-applet-config.json` (المحذوف) كان يحمل إعداد Firebase عام؛ إن اعتُبر أي مفتاح حسّاساً
  فتنظيف التاريخ يحتاج موافقة المالك.

## 10. [قرار مالك] تبعيات غير مستخدمة في package.json
- `firebase` (`^12.17.1`): لا يُستورَد في أي ملف بعد حذف `src/lib/firebase.ts` و`src/lib/cloudSync.ts`.
- `motion` (`^12.23.24`): غير مستورَد في أي مكان.
- لم تُحذف تجنّباً لاعتماد بناء غير مباشر. **القرار المطلوب:** التحقق ثم الإزالة (توفير حجم حزمة).

## 11. تقارير التدقيق قبل الإطلاق (مرجع)
تقارير جاهزية ما قبل الإطلاق في `docs/changelog/`:
`AUDIT_REPORT_PRELAUNCH.md`, `RELEASE_READINESS_REPORT.md`, `QA_REPORT.md`,
`INTEGRATION_READINESS.md`, `RELEASE_CHECKLIST.md`, `BUILD_MANIFEST.md`, `CHANGES_REPORT.md`.
ملاحظة: `RELEASE_READINESS_REPORT.md` (CONDITIONAL GO) و`AUDIT_REPORT_PRELAUNCH.md` (58/100)
متعارضان — يحتاجان توحيداً قبل أي إعلان جاهزية.

## 12. [نُفِّذ] تنظيف إعداد Firebase الميت من .env.example
أُزيلت متغيّرات Firebase العميلية الميتة (`VITE_ENABLE_FIREBASE_SYNC` و`VITE_FIREBASE_*`) لأنها بلا
مستهلك. المزامنة الخادمية (`server/firebase-mirror.ts`) تستخدم `FIREBASE_PROJECT_ID` /
`FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS` — تبقى قرار إعداد خادمي عند التفعيل.

## 13. [نُفِّذ] XSS محتمل عبر روابط الاستشهاد من طبقة الذكاء (OpportunityRadar)
- `src/components/creator/OpportunityRadar.tsx` (كان السطر ~152): كان يُمرِّر `cite.uri` مباشرةً إلى
  `<a href={...}>`. مصدر هذه الروابط هو طبقة التأريض (Google Search grounding عبر Gemini) وهي
  **شبه موثوقة فقط**؛ رابط بمخطط `javascript:` أو `data:` كان سيُنفَّذ عند النقر (Reflected/DOM XSS).
- **الخطورة:** MEDIUM (مسار الهجوم يمرّ عبر مخرجات نموذج قابلة للتأثّر بحقن الأوامر؛ React لا يُعقّم
  مخططات `javascript:` في `href`).
- **الإصلاح:** أُضيفت `safeHttpUrl()` التي تقبل `http:`/`https:` فقط عبر `new URL()`؛ الرابط غير الآمن
  يُعرض كنصّ (`<span>`) بلا `href`. تغيير جراحي متوافق رجعياً — الروابط الصحيحة تعمل كما هي.
- تحقّق: `npm run lint` (tsc --noEmit) نظيف، و`npm test` (84/84) ناجح.

## 14. [قرار مالك] كتابة العميل مسموحة لمجموعات المرآة (creators/products/users/hosts)
- امتداد للبند 6: `firestore.rules` و`firebase-blueprint.json` يسمحان بكتابة مقيّدة بالمالك
  (`allow create/update` بمطابقة `request.auth.uid`) على `creators`/`products`/`users`، وكتابة الأدمن
  على `hosts` — بينما النموذج خادمي-موثوق والعميل لا يستخدم Firestore SDK إطلاقاً (المرآة تُكتب حصراً
  عبر Admin SDK الذي يتجاوز القواعد). أي طرف مُصادَق عبر Firebase Auth يستطيع تزوير/تعديل وثائق مرآته
  العامة القراءة (`read: if true`) خارج تحقّق الخادم وتدقيقه.
- **لماذا لم يُنفَّذ الآن:** حزمة الاختبارات (`server/firestore-rules.test.ts`) تُرسِّخ الكتابة المقيّدة
  بالمالك كخط الأساس المقصود من المشرفين؛ تحويلها إلى `write: false` يكسر الاختبارات ويخالف حاجز
  «تغييرات جراحية متوافقة رجعياً لا تكسر البناء/الاختبارات». المرآة خاملة اليوم فلا أثر حيّ.
- **التوصية:** بما أن العميل لا يكتب Firestore، حوّل كل كتابات `creators`/`products`/`users`/`hosts`
  إلى `write: if false` (كما في `orders`/`contracts`) وحدّث الاختبارات لترسيخ المنع — **قبل تفعيل المرآة**.

## 15. [قرار مالك] كشف معلومات عبر حقل `code` في أخطاء غير معالَجة
- `server/domain.ts` (`handleDomainError`) و`server/advanced.ts` (`handleError`): للأخطاء غير المصنَّفة
  تُعاد رسالة عربية عامة (جيّد) لكن حقل `code` يُملأ بـ`error.message` الخام، ما قد يسرّب تفاصيل
  داخلية (أجزاء SQL، أسماء قيود، مسارات) لأي عميل مُصادَق.
- **الخطورة:** LOW (رسالة المستخدم آمنة؛ التسريب محصور في `code`، والحالة الشائعة رموز معروفة).
- **لماذا لم يُنفَّذ:** قد يعتمد عملاء على رموز محدّدة؛ التغيير يحتاج قرار عقد API لتفادي كسر تدفّق حيّ.
- **التوصية:** إعادة رمز ثابت (مثل `DOMAIN_OPERATION_FAILED`/`ADVANCED_OPERATION_FAILED`) لأي مفتاح
  غير موجود في خريطة الرسائل الآمنة، وتسجيل التفصيل الخام في السجلّ الخادمي فقط.
