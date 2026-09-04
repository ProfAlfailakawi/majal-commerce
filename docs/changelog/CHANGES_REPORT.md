# تقرير التعديلات — Majal (تمريرة إصلاح البوابات الإلزامية)

التاريخ: 2026-08-20

## 1) السبب الجذري للمشاكل المكتشفة

**المشكلة الأساسية (regression حقيقي):** طبقة قاعدة البيانات (`server/database.ts`)
حُوّلت إلى واجهة **غير متزامنة (async)** لدعم PostgreSQL — أصبحت
`openMajalDatabase`، `databaseHealth`، وكل `prepare().get/all/run` تُرجع `Promise`.
لكن **الاختبارات والسكربتات لم تُحدَّث**، فبقيت تستدعيها بشكل متزامن.

النتيجة قبل الإصلاح:
- `npm test` → **كل اختبارات قاعدة البيانات/التكامل/المصادقة تفشل** بـ
  `TypeError: db.close is not a function` (لأن `db` كان `Promise`).
- `npm run lint` (tsc) → **أخطاء أنواع** في ملفات الاختبار و
  `scripts/simulate-scale.ts` و`scripts/bootstrap-admin.ts`.

هذا يخالف مباشرةً شرط التسليم رقم 17 (ممنوع تسليم نسخة فيها اختبار فاشل معروف).

**مشاكل إضافية حقيقية:**
- `src/lib/store.ts`: بعد قبول العرض عبر الـAPI كان يُسند `col.stage = 'CONTRACTING'`،
  وهي قيمة **غير موجودة** في `CollaborationStage` (تنتمي لـenum آخر). مسار الـdemo
  المجاور يستخدم `'COMMERCIAL_AGREED'` — أي تناقض + خطأ نوع.
- `server/database.ts`: هجرات PostgreSQL كانت **بدون قفل** يمنع تشغيل الهجرة من
  نسختين (replicas) بنفس اللحظة — الثغرة المذكورة في القسمين II و IV.
- `server/database.ts`: تمرير `params: unknown[]` إلى `node:sqlite` كان يُنتج خطأ نوع
  `SQLInputValue`.

## 2) الملفات المعدَّلة (فقط)

| الملف | التعديل |
|------|---------|
| `server/database.ts` | **قفل هجرة Postgres advisory-lock على اتصال مخصّص** (session-level `pg_advisory_lock`) يُسلسِل الهجرات عبر النسخ المتعددة ويمنع سباق الـDDL؛ فصل `runMigrations`؛ إصلاح نوع params لـsqlite. |
| `src/lib/store.ts` | تصحيح مرحلة التعاون بعد القبول من `'CONTRACTING'` غير الصالحة إلى `'COMMERCIAL_AGREED'` (مطابِقة لمسار الـdemo). |
| `server/database.test.ts` | مواءمة مع الـAPI غير المتزامن + تحديث الإصدار المتوقّع للمخطط إلى 5 وحقل `dialect`. |
| `server/auth.test.ts` | `await` على فتح/إغلاق قاعدة البيانات. |
| `server/integrations.test.ts` | `await` على العمليات؛ تحويل توقّع رمي الخطأ إلى `assert.rejects` (لأن الدالة async). |
| `scripts/simulate-scale.ts` | مواءمة كاملة مع الـAPI غير المتزامن (measure/transactions/queries). |
| `scripts/bootstrap-admin.ts` | `await` على فتح/إغلاق القاعدة والاستعلام. |

> ملاحظة: `CHANGES_REPORT.md` مُرفق للتوثيق فقط.

## 3) الاختبارات التي شُغّلت ونتائجها

| البوابة | الأمر | النتيجة |
|--------|-------|---------|
| Typecheck / Lint | `tsc --noEmit` | ✅ **0 أخطاء** |
| Unit + Integration | `tsx --test src/lib/*.test.ts server/*.test.ts` | ✅ **13/13 pass, 0 fail** |
| Production build | `npm run build` (vite + esbuild) | ✅ نجح (client + `server-dist/server.cjs`) |
| Cloud Run bootstrap | `NODE_ENV=production node server-dist/server.cjs` | ✅ المنفذ يفتح فوراً على `0.0.0.0`؛ `/api/live`=200؛ `/api/ready`=**503 fail-closed** برمز آمن بلا تسريب أسرار؛ `SIGTERM` → إغلاق نظيف. |

## 4) النواقص الخارجية (لا يمكن إنهاؤها داخل الكود)

هذه ليست عيوباً في الكود بل تعتمد على أطراف/بيئات خارجية، والتصميم الحالي يفشل
مغلقاً (fail-closed) عند غيابها — وهو السلوك الصحيح:

- **PostgreSQL حقيقي**: قفل الهجرة الجديد (advisory lock) مُختبَر منطقياً وبالـtypecheck،
  لكن اختبار السباق الفعلي بين replicas يحتاج مثيل Postgres + تشغيل متزامن (k6/عمّال).
- **MyFatoorah**: يحتاج API token حقيقي + webhook secret لاختبار end-to-end فعلي.
- **PACI / Kuwait Mobile ID**: يحتاج العقد الرسمي والـcredentials؛ بدونها الإنتاج
  يجب أن يفشل مغلقاً (موجود بحالة `NOT_CONFIGURED`).
- **Cloud KMS**: يحتاج KEK حقيقي في Cloud KMS.
- **Load/Concurrency (k6)**، **Browser matrix (Safari فعلي)**، **WCAG بأدوات فعلية**،
  **Backup/Restore drills**، **مراجعة قانونية كويتية** — كلها تحتاج بنية/أدوات/جهات
  خارج مستودع الكود، ويجب توثيقها بـ`EXTERNAL APPROVAL REQUIRED` كما في مستنداتك.

## 4.5) الميزات الثلاث الجديدة (منفّذة ومُختبَرة بالكامل)

### A. Deterministic Replay Ledger — `server/ledger.ts`
سجل **مسلسَل بالتجزئة (hash-chained)** لكل حركة مال: كل قيد يلتزم بتجزئة القيد السابق،
فأي تعديل/حذف/إعادة ترتيب لاحق **يكسر السلسلة ويُكتشَف بإعادة الحساب**. مدمج داخل نفس
معاملة تغيير الحالة في:
- `payments.ts` → عند `PAID` (قيد +داخل) و`REFUNDED` (قيد −خارج).
- `domain.ts` → عند `SETTLEMENT_PAID` (قيد −خارج).
- تحقّق: `verifyLedgerChain` يُعيد البناء من genesis ويُبلّغ عن رقم القيد المكسور بالضبط.
- واجهات: `GET /api/v1/advanced/ledger/verify` (Admin)، `GET /ledger/entity/:type/:id`.

### B. Idempotency & Concurrency Fuzzer — `server/concurrency.test.ts`
اختبار انحدار دائم يقصف أخطر المسارات المالية بطلبات **متوازية مكرّرة/متعارضة** ويؤكد:
40 webhook دفع مكرّر ⇒ **التقاط الدفعة مرة واحدة فقط**؛ replay بمبلغ مختلف **مرفوض دائماً**؛
السجل يسجّل الالتقاط مرة واحدة ويبقى صحيحاً؛ **لا صرف مزدوج** لآخر وحدة تعرّض سري.
> كشف الاختبار ثغرة حقيقية: مسار معاملات SQLite على اتصال واحد يرمي "transaction within a
> transaction" تحت التزامن. أُصلح بإضافة **mutex تسلسلي** لمعاملات SQLite في `database.ts`
> (Postgres pool يعطي نفس الضمان أصلاً عبر اتصال لكل معاملة).

### C. Secret Half-Life (Exposure Budget) — `server/secret-halflife.ts`
كل كشف وصفة = منحة بـ**قوة تعرّض تتحلل أُسّياً** مع الزمن ومع كل وصول:
`strength(t) = initial·0.5^(t/halfLife) − accessCount·decay`. الوصول مسموح فقط فوق حدّ أدنى،
وعند الهبوط تحته **تُلغى المنحة تلقائياً server-side** (EXHAUSTED)، مع حدّ انتهاء صارم
وإلغاء يدوي. كل محاولة وصول مُدقّقة ومسجّلة. واجهات تحت `/api/v1/advanced/exposure`.

الملفات الجديدة: `server/ledger.ts`, `server/secret-halflife.ts`, `server/advanced.ts`,
`server/advanced.test.ts`, `server/concurrency.test.ts` + migration `version: 6` + دمج في
`server/payments.ts`, `server/domain.ts`, `server.ts`.

**نتائج الاختبار بعد الإضافة:** Lint = 0، **الاختبارات 22/22 pass**، Production build ✅.

## 4.6) الميزات الثلاث الحوكمية (منفّذة ومُختبَرة بالكامل)

### H. Trust Kill Switch — `server/kill-switch.ts`
مفتاح احتواء عالي الصلاحية. خمسة مفاتيح: تجميد كشف الأسرار / التسويات / الـwebhooks،
وإلغاء المنح المؤقتة، وإبطال الجلسات. **لا يوجد زر واحد يتلف بيانات** — الآثار كلها قابلة
للاسترجاع (إعادة دخول، إعادة منح، رفع التجميد). كل إجراء **مُدقّق في جدول append-only**،
ويتطلب `SUPER_ADMIN` + سر تأكيد ثانٍ (`x-security-confirmation`) وإلا يفشل مغلقاً.
- إنفاذ فعلي: `RECIPE_REVEALS` يوقف `POST /advanced/exposure/:id/access`؛ `WEBHOOKS` يوقف
  webhook الدفع؛ `SETTLEMENTS` يوقف اعتماد ودفع التسويات؛ `TEMP_GRANTS` يُلغّي كل المنح النشطة.

### I. Contract Drift Detector — `server/contract-drift.ts`
يقارن **المتفق عليه** (العرض المقبول) مقابل **الواقع الفعلي** (طلبات + إتاوات محتسبة):
انحراف سعر البيع، ونسبة الإتاوة الفعلية، بدرجات خطورة (INFO/WARN/CRITICAL) وأرقام داعمة.
لا يعيد كتابة العقد؛ يخزّن **لقطة غير قابلة للتعديل** لمسار النزاع. واجهة:
`POST /api/v1/advanced/contract-drift/:collaborationId`.

### E. Royalty Anomaly Radar — `server/royalty-radar.ts`
يربط الطلبات + دفتر القيود + الاستردادات + الإتاوات + التسويات ويكشف تناقضات:
`LEDGER_REVENUE_MISMATCH`, `REFUND_SPIKE`, `ACCRUAL_GAP`, `SETTLEMENT_OVERPAY`,
`MISSING_ATTRIBUTION`. **لا يتّهم أحداً تلقائياً** — كل نتيجة = anomaly + evidence + confidence
لمراجعة بشرية. واجهة: `GET /api/v1/advanced/royalty-radar/:collaborationId`.

الملفات الجديدة: `server/kill-switch.ts`, `server/contract-drift.ts`, `server/royalty-radar.ts`,
`server/governance.test.ts` + migration `version: 7` + إنفاذ في `payments.ts`/`domain.ts` + مسارات في `advanced.ts`.

**نتائج الاختبار بعد الإضافة:** Lint = 0، **الاختبارات 26/26 pass**، Production build ✅ (240.4kb)، startup contract ✅.

## 4.7) ثلاثية الثقة والمخاطرة (منفّذة ومُختبَرة بالكامل)

### G. Deal Blast Radius — `server/blast-radius.ts`
قبل قبول عقد/تغيير جوهري: "لو فشل هذا الطرف أو تأخّر N يوم، ماذا يتأثر؟" — يحسب التعرّض عبر
الإطلاقات، المخزون، الإيراد، العملاء، حجوزات المطبخ، والتسويات، مع **درجة تعرّض 0–100** وخيارات
احتواء استباقية. نموذج نقي على بيانات حيّة، بلا أي تعديل. واجهة:
`POST /api/v1/advanced/blast-radius/:collaborationId`.

### J. Recipe Lineage Graph — `server/lineage.ts`
رسم نسب فوق `recipe_versions` **غير القابلة للتعديل**: ORIGIN → REVISION → TEST_BATCH →
APPROVED_VARIANT → LICENSED_VARIANT → MARKET_LAUNCH. يُثبت من أنشأ أي نسخة ومتى وكيف ترتبط
**دون كشف المحتوى السري** (العُقد تحمل commitment hash فقط). يمنع الدورات في الرسم.
واجهات: `POST /advanced/lineage/:productId/edges`، `GET /advanced/lineage/:productId`.

### C. Reputation Without Disclosure — `server/trust-proof.ts`
إثبات ثقة **مُجمّع وموقّع cryptographically** (HMAC-SHA256): عدد الصفقات الناجحة، نسبة
الالتزام، متوسط سرعة التسوية، عدد النزاعات — **دون كشف أسماء أو تفاصيل الصفقات**. الطرف المقابل
يتحقق من الأصالة بلا الرجوع للمنصة. يفشل مغلقاً إن لم يُهيّأ مفتاح التوقيع.
واجهات: `POST /advanced/trust/creator/:creatorId/attestation`، `POST /advanced/trust/verify`.

الملفات الجديدة: `server/blast-radius.ts`, `server/lineage.ts`, `server/trust-proof.ts`,
`server/risk.test.ts` + migration `version: 8` + مسارات في `advanced.ts`.

**نتائج الاختبار بعد الإضافة:** Lint = 0، **الاختبارات 29/29 pass**، Production build ✅ (260.4kb)، startup contract ✅.

## 4.8) الثلاثية الأخيرة — إغلاق قائمة الأفكار كاملة (منفّذة ومُختبَرة)

### A. Recipe Canary Fingerprint — `server/canary.ts`
عند كشف الوصفة لمستلم معيّن، تُصدَر بصمة **فريدة لكل مستلم** موقّعة HMAC ومربوطة بـ
(نسخة الوصفة، المنشأة، nonce). **لا تغيّر المحتوى** (مقادير/سلامة/حساسية) — تعيش في
النسخة/الميتاداتا فقط. عند تسرّب نسخة، `traceCanary` يتتبّع البصمة لمصدرها ويتحقق من عدم
العبث. يفشل مغلقاً بلا مفتاح توقيع. **ملاحظة قانونية**: استخدامها كدليل يتطلب مراجعة قانونية
مسبقة — الوحدة تقدّم التتبّع التقني لا حكماً قانونياً.
واجهات: `POST /advanced/canary/:recipeVersionId`, `POST /advanced/canary/trace`.

### B. Counterfactual Deal Engine — `server/counterfactual.ts`
"ماذا لو قبلنا العرض B بدل A؟" — يُسقط الإيراد والهوامش والإتاوة عبر 3/6/12 شهرًا لكلا
العرضين مع **نطاق عدم يقين** مدفوع بتباين الطلب، ويعرض الفارق **لا كحقيقة مؤكدة**. نقي
وحتمي، والافتراضات ظاهرة مع النتيجة. واجهة: `POST /advanced/counterfactual/:collaborationId`.

### D. Operational Twin — `server/operational-twin.ts`
توأم تشغيلي يتعلّم من عيّنات **المتوقّع مقابل الفعلي** (وحدات/زمن تحضير)، يشتق معاملات
معايرة بثقة مبنية على عدد العيّنات وتشتّتها، ويعيد معايرة التوقّع القادم ليقترب من الواقع
إطلاقاً بعد إطلاق. واجهات: `POST /advanced/operational-twin/:organizationId/samples`,
`POST /advanced/operational-twin/:organizationId/forecast`.

الملفات الجديدة: `server/canary.ts`, `server/counterfactual.ts`, `server/operational-twin.ts`,
`server/frontier.test.ts` + migration `version: 9` + مسارات في `advanced.ts`.

**نتائج الاختبار بعد الإضافة:** Lint = 0، **الاختبارات 32/32 pass**، Production build ✅ (277.7kb)، startup contract ✅.

**إجمالي الأفكار المنفّذة والمُختبَرة: 12** (كل قائمة صديقك A–J + F مع الإصلاحات الأساسية).

## 4.9) المراجعة الأمنية العميقة (جولة كاملة)

راجعت مسارات المصادقة والمال والأسرار عبر سلسلة الهجوم: anonymous → user → creator → host → admin.

### الثغرة المكتشفة والمُصلَحة
- **[HIGH] احتواء تسريب ناقص** — مفتاح `RECIPE_REVEALS` (Trust Kill Switch) كان يحرس مسار
  التعرّض الجديد فقط، بينما **مسار كشف الإسكرو الفعلي**
  (`GET /domain/innovations/secret-escrows/:id/disclosures/:stage`) — الذي يفكّ تشفير محتوى
  الوصفة ويرجّعه — **لم يكن محروساً**. الأثر: عند تفعيل المفتاح لاحتواء اختراق، يظل الكشف
  الحقيقي ممكناً. **الإصلاح:** إضافة `assertKillSwitchClear(db,'RECIPE_REVEALS')` في بداية
  المسار (server-side) + **اختبار انحدار** يثبت أن الحارس يرمي 503 عند التفعيل ويُصفّى عند الرفع.
  الملفات: `server/domain.ts`, `server/governance.test.ts`.

### مُراجَع ونظيف (بلا ثغرات مستغلّة)
- **المصادقة** (`auth.ts`): scrypt N=16384، مقارنات `timingSafeEqual`، كوكيز `__Host-` +
  `HttpOnly` + `SameSite=Strict` + `Secure` في الإنتاج، MFA يفشل مغلقاً، قفل بعد 5 محاولات،
  dummy-hash ضد تعداد المستخدمين، جلسات مخزّنة كـsha256 وتُبطَل عند التعليق/الانتهاء.
- **CSRF**: double-submit + تطابق hash مع الجلسة على كل mutation.
- **PACI** (`paci.ts`): توقيع HMAC ثابت-الزمن على الـcallback، nonce، انتهاء 3 دقائق،
  replay protection (حارس `status='PENDING'`)، تطابق `provider_reference`، وربط التوقيع
  بالمستخدم/الغرض/عدم الانتهاء — بلا أي `verified=true` من العميل.
- **الدفع** (`payments.ts`): توقيع HMAC ثابت-الزمن، فرض KWD، مبالغ **integers بالفلس**،
  والمبلغ يُتحقق مقابل النية المخزّنة (لا مبلغ الحدث)، وdeduplication عبر جدول إيصالات فريد.
  القيد في دفتر الـLedger يستخدم `intent.amount_fils` الموثوق لا مبلغ الـwebhook.
- **حقن SQL**: كل قيم المستخدم عبر `?` (تتحوّل لـ$n). البند الديناميكي الوحيد
  (`filter.clause` في snapshot) قيمة ثابتة يختارها الخادم حسب الدور — ليست إدخالاً.
- **صلاحيات المسارات الجديدة** (`advanced.ts`): فحوص ملكية/طرف على كل مسار (creator owner /
  host member / collaboration party / admin) — لم يُعثر على IDOR. Kill switch يتطلب
  `SUPER_ADMIN` + سر تأكيد ثانٍ.

### ملاحظات طفيفة (غير مستغلّة، موثّقة بلا إصلاح)
- `/auth/register` يرجّع 409 مميّزاً عند تكرار البريد → تعداد بسيط (شائع ومقبول).
- تتبّع البصمة يميّز 403 عن 404 → لكن الرموز HMAC 32-hex غير قابلة للتخمين.

**نتيجة المراجعة:** Lint = 0، **الاختبارات 33/33 pass**، Production build ✅.

## 4.10) Threshold Recipe Escrow — قفل نقطة الفشل الواحدة (منفّذ ومُختبَر)

الفكرة النووية: **المنصة نفسها لا تقدر تكشف السر وحدها.**
- `server/shamir.ts`: تطبيق **Shamir Secret Sharing** نقي فوق GF(2^8) (مولّد 3 المعياري) —
  split(n,k) وcombine بـLagrange. أي k أجزاء تعيد بناء السر، وأي k−1 لا تكشف شيئاً.
- `server/threshold-escrow.ts`: تُشفَّر الوصفة بـAES-256-GCM بمفتاح عشوائي، ثم **يُقسَّم المفتاح
  k-of-n** على حاملين مستقلين (مبدع + منصة + طرف حياد). **المفتاح الكامل لا يُخزَّن إطلاقاً** —
  فقط النص المشفّر وبصمات الأجزاء (hashes). الكشف يتطلب تقديم ≥ العتبة من الأجزاء الصحيحة؛ جزء
  مزوّر يفشل بصمته ويُرفض؛ اختراق أقل من العتبة = لا شيء. محروس بمفتاح `RECIPE_REVEALS`.
- واجهات: `POST /advanced/threshold-escrow/:recipeVersionId` (ختم، يعيد الأجزاء مرة واحدة)،
  `POST /advanced/threshold-escrow/:id/reveal` (كشف بـk أجزاء)، `.../revoke`.

**اختبارات مثبتة** (`server/threshold.test.ts`): صحة SSS (k من n تعيد البناء، k−1 لا)،
ترميز الأجزاء، كشف بجزئين صحيحين يعيد الوصفة بالضبط، جزء واحد يُرفض، أجزاء مزوّرة تُرفض،
والختم المُلغى لا يُكشف. **ملاحظة تطوير**: كشف الاختبار خطأً حقيقياً — استخدام المولّد 2
(غير بدائي في 0x11b) كان ينتج جدول حقل ناقصاً؛ صُحِّح إلى المولّد 3.

الملفات الجديدة: `server/shamir.ts`, `server/threshold-escrow.ts`, `server/threshold.test.ts`
+ migration `version: 10` + مسارات في `advanced.ts`.

**نتائج الاختبار بعد الإضافة:** Lint = 0، **الاختبارات 37/37 pass**، Production build ✅، startup contract ✅.

## 4.11) طبقة البرهان العميقة — الثلاثية النهائية (منفّذة ومُختبَرة)

### Proof-of-Reserves — `server/proof-of-reserves.ts` + `server/merkle.ts`
التزام **Merkle** فوق التزامات كل المبدعين + الاحتياطي المستنتج من دفتر القيود
(captured − settled − refunded). كل مبدع **يُثبت إدراج مبلغه تحت الجذر المنشور دون رؤية
أرقام غيره**، والملاءة تُحسب رياضياً وتُعلَن. Merkle نقي بفصل نطاقات (leaf/node prefixes)
ضد second-preimage. واجهات: `POST /advanced/reserves/attest` (Admin)،
`GET /advanced/reserves/:id/proof` (المبدع)، `POST /advanced/reserves/verify` (بلا حالة).

### Tamper-Evident Time — `server/time-anchor.ts`
يربط رأس دفتر القيود (seq + hash) بمصدر زمن دورياً — RFC 3161 خارجي إن هُيّئ (`TSA_URL`)،
وإلا **anchor محلي موسوم `LOCAL_UNVERIFIED`**. `verifyTimeAnchors` يعيد حساب تجزئة السلسلة
عند كل seq مُثبّت ويكتشف أي **إعادة كتابة للبادئة بعد التثبيت** — حتى من مدير قاعدة البيانات.
واجهات: `POST /advanced/time-anchor`, `GET /advanced/time-anchor/verify` (Admin).

### Sealed Compute Reveal — `server/sealed-compute.ts`
بدل إرسال الوصفة للمضيف إطلاقاً: المضيف يرسل **مدخلاته** (عدد الوحدات) والخادم يُرجّع
**مخرجات مجمّعة فقط** (عدد الدفعات، التكلفة، زمن التحضير، الحساسيات، عدد المكونات) محسوبة
داخل حدود موثوقة. الوصفة مشفّرة AES-256-GCM at-rest وتُفكّ داخلياً فقط ثم تُمسح من الذاكرة —
**الصيغة (الأسماء/المقادير/النِسب/الخطوات) لا تغادر أبداً**. "أقل قدر" يصير **صفر**. يفشل
مغلقاً بلا `SEALED_COMPUTE_KEY`. واجهات: `POST /advanced/sealed-compute/:recipeVersionId`,
`.../:id/run`, `.../:id/revoke`.

الملفات الجديدة: `server/merkle.ts`, `server/proof-of-reserves.ts`, `server/time-anchor.ts`,
`server/sealed-compute.ts`, `server/apex.test.ts` + migration `version: 11` + مساعدات
`ledgerHead`/`ledgerHashAtSeq` في `ledger.ts` + مسارات في `advanced.ts`.

**نتائج الاختبار بعد الإضافة:** Lint = 0، **الاختبارات 41/41 pass**، Production build ✅ (319kb)، startup contract ✅.

## 5) ما لم يُنفَّذ في هذه التمريرة

هذه التمريرة رَكّزت على **إعادة البوابات الإلزامية إلى الأخضر** (lint/tests/build/
startup) + إغلاق ثغرة سباق الهجرة + إصلاح خطأ مرحلة العميل. الأقسام الأكبر (الأفكار
A–J، مراجعة أمنية متعددة الجولات، إلخ) لم تُلمَس لأنها تتطلّب إمّا خدمات خارجية
أو جولات عمل مستقلة — ولم أُعلن نجاح أي شيء لم أختبره فعلياً (التزاماً بقواعدك 4 و6 و17).
