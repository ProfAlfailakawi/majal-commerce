# MAJAL — QA & Security Review (2026-08-20)

## النتائج المنفذة فعليًا

- TypeScript: `npm run lint` — PASS.
- Automated tests: 13/13 PASS؛ تشمل Auth sessions/cookies/CSRF/logout، lockout والسجل الموقوف، TOTP، migrations/schema/indexes، KWD minor units، payment webhook idempotency/mismatch، notification coalescing، وخمسة اختبارات صلاحيات تغطي الأدوار العشرة.
- Production build: PASS؛ client/server منفصلان ولا توجد source maps خادمية داخل `dist`.
- Initial JS: 289.70 kB / 87.48 kB gzip؛ أسطح Creator/Host/Admin/Super Admin ونوافذ Auth/MFA lazy-loaded.
- Browser role walkthrough: 10/10 PASS — Consumer, Super Admin, Admin, Creator وخمسة أدوار Host؛ عناوين صحيحة، زر توجيه ذكي، لا أزرار بلا اسم ولا horizontal overflow.
- Mobile 390×844: Creator PASS؛ `scrollWidth=390` و0 أزرار بلا accessible name.
- Production browser auth: تسجيل مستخدم ودخول وخروج واستعادة جلسة PASS، ولا يظهر role switcher في production.
- Production super-admin bootstrap/routing: PASS بقاعدة Smoke محلية مستقلة وخالية من seed التجاري.
- MFA: enrollment + encrypted TOTP secret + confirmation + mandatory next-login challenge — PASS end-to-end.
- Decision inbox: server-backed fetch/read/read-all + duplicate coalescing + action target — PASS.
- Production API: Secure/HttpOnly/SameSite cookies، CSRF، headers، no-store، JSON limit، rate limits، وhealth schema v4 — PASS.
- Payment boundary: intent idempotency، exact KWD fils، signed raw webhook path، replay/mismatch guard — PASS؛ المزود يبقى disabled حتى الاعتماد الرسمي.
- PACI boundary: hashed civil ID، readiness contract، signed raw internal callback — PASS؛ المزود يبقى disabled حتى وثائق/اعتماد PACI الرسمية.
- Scale simulator: 1,000,000 catalog rows + 2,000,000 order events عبر 10,000 tenants — PASS؛ 0 FK/integrity failures.
- Scale query p95: tenant feed 2.706 ms، category feed 0.063 ms، order timeline 0.522 ms؛ جميعها تحت هدف 400 ms، والفهارس ظهرت في query plans.
- Dependency audit: `npm audit --omit=dev` — PASS، 0 vulnerabilities.

## إصلاحات المخاطر الأعلى

- كلمات المرور أصبحت scrypt مع salt، session token لا يُخزن إلا كـ hash، وCSRF مرتبط بالجلسة.
- المصادقة الثنائية TOTP مشفرة بـ AES-256-GCM، والحسابات الموقوفة وlockout تُفرض خادميًا.
- تبديل الأدوار والـseed محصوران في development؛ production يبدأ بلا بيانات مجال وهمية.
- كل domain mutation قديم يعتمد على client Store يفشل مغلقًا في production بدل صناعة حالة قانونية/مالية وهمية.
- الدفع لا يصل إلى `PAID` إلا من callback موثّق من adapter مزود؛ PACI لا يدّعي إثبات هوية دون مزود رسمي.
- الوصفات والعقود والإشعارات والدفاتر لها schema وفهارس وحدود وصول خادمية؛ recipe versions غير قابلة للتعديل بعد إنشائها.
- أضيف مركز قرارات ذكي، توجيه «أفضل خطوة الآن»، مستويات Simple/Guided/Expert، command palette، offline sentinel، معاينة أثر السياسة قبل اعتمادها، و«رادار ما قبل الاختناق» القابل للتفسير.

## Production Gate الصريح

هذه النسخة جاهزة للعرض المحلي واختبار الحسابات والجلسات والصلاحيات وحدود التكامل والأداء. ليست جاهزة بعد لإطلاق تجاري أو أموال حقيقية: يجب نقل جميع domain mutations إلى API، تشغيل PostgreSQL متعدد النسخ وObject Storage/KMS، ربط PACI والدفع والبريد/Push من المزودين، تنفيذ backup/restore وobservability/on-call، إكمال E2E/accessibility/browser matrix، ثم الاعتماد القانوني والخصوصية والتسويات.
