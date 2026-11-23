# Tebyan / MAJAL Absolute Edition — Production Architecture

This repository operates on a phased architecture for its production environment, leveraging both modern database solutions and strict server-side enforcements for robust security.

## Architecture States

### Implemented Now
- **Primary Datastore:** `node:sqlite` is the local/development source of truth for authentication, sessions, notifications, and payment boundaries/limits. In production (`NODE_ENV=production`) the server refuses to start without `DATABASE_URL` (PostgreSQL).
- **API & Server Layer:** Express 5/Node.js based modular monolith routing under `/api/**`.
- **Security Boundaries:** Zero implicit trust. Authentication relies on server-side HttpOnly/SameSite cookies, CSRF protections, MFA via TOTP (AES-256-GCM encrypted), and strict RBAC.
- **Frontend / Web App:** React (Vite-based) PWA serving as a pure presentation layer.
- **AI Integration:** Gemini AI endpoints isolated entirely within the server layer (`server/gemini.ts` and `server/ai-intelligence.ts`). No API keys or configurations exposed to clients.
- **Showcase & Ads:** free business-for-sale gate, sponsor campaigns (capacity-checked, token-based company reports) and owner-managed facility team invites, all admin-approved or owner-gated server-side. See `docs/showcase-and-ads.md`.
- **Audit Trails:** Maintained for all sensitive events locally.
- **Rate Limiting:** `express-rate-limit` on every route (app-wide ceiling plus per-route limits); counters are shared across instances through Redis when `REDIS_URL` is set (`server/rate-limit-store.ts`), with automatic per-instance fallback if Redis is unavailable.
- **Error Reporting:** 5xx and process-level faults are logged in the Cloud Error Reporting format (`reportError` in `server/observability.ts`).

### Adapter/Code Ready but External Configuration Required
- **Integrations:** PACI (Kuwait Mobile ID) and Payment gateways are interfaced via adapters that enforce idempotency, amounts, and signature verifications, but require official onboarding and external credentials to activate.
- **Firebase:** Integrated for client-side configuration features/applets. App Check (ReCaptcha V3) is implemented but requires a valid production configuration key.
- **Notifications:** Inbox/outbox infrastructure exists, but email/push providers require linkage and consent validation.
- **Operations (scripts ready, run once per project):** `scripts/setup-backups.sh` (Cloud SQL daily backups, PITR, daily SQL export), `scripts/setup-monitoring.sh` (uptime check and alert policies), `scripts/setup-redis.sh` (Memorystore). Portable `scripts/backup-db.sh` / `scripts/restore-db.sh`. Runbook: `docs/operations.md`.

### Target / Not Yet Production-Verified
- **Target Datastore:** PostgreSQL is the intended multi-instance production target. Current SQLite schema serves as a migration node.
- **Object Storage / KMS:** Intended for Recipe Vault contents, contracts, compliance documents, and proofs.
- **Redis / Distributed Systems:** Distributed rate limiting is implemented (see above). Sessions stay in the database, which is already shared across instances; caching is not implemented.
- **Event / Worker Infrastructure:** A dedicated event/worker platform remains outstanding. Backups, monitoring/alerting and the incident runbook are covered under Operations above but must be activated per project.

<!-- native-parity-rule:start -->
## قاعدة إلزامية: أي تحديث للموقع يُستكمل في Apple وGoogle وعلى iPhone Duo

تسري على كل وكيل (Claude، Codex، Gemini وغيرها) وكل مساهم. لا يُعدّ أي تغيير في الموقع منجزًا، ولا يُدمج ولا يُنشر، قبل استيفاء البنود التالية.

تطبيقات مجال:

| المنصة | المعرّف | المكان |
|---|---|---|
| Apple (Capacitor: iPhone / iPad / Mac) | `com.dralfailakawi.majal` | `apple/` في هذا المستودع |
| Google Play (Capacitor Android) | `kw.edu.majal.app` | `google/` في هذا المستودع |

الموقع الحي: https://majal.web.app. قشرة Capacitor تحمّله مباشرة عبر `server.url`، فكل ما يُنشر على الموقع يصل إلى مستخدمي التطبيق فورًا دون مراجعة متجر.

1. **افحص داخل القشرة لا في المتصفح فقط.** كل تغيير في الواجهة أو السلوك يُجرَّب داخل WebView التطبيق (WKWebView في Apple وAndroid WebView في Google). انتبه خصوصًا لما يختلف عن المتصفح: الطباعة، التنزيل، المشاركة، النوافذ المنبثقة، تسجيل الدخول الخارجي، العودة من بوابة الدفع، الكاميرا والميكروفون، الإشعارات، والروابط الخارجية.

2. **حدّث المشروع الأصلي عندما يمسّه التغيير.** يلزم تحديث القشرتين معًا إذا أضاف التغيير أو عدّل: نطاقًا جديدًا يتنقل إليه التطبيق (`allowNavigation`)، إذنًا (كاميرا، ميكروفون، صور، موقع، إشعارات)، إضافة Capacitor أو جسرًا أصليًا، الاسم أو الأيقونة أو الألوان أو شاشة الإطلاق، الروابط العميقة، أو ما يغيّر بيانات المتجر والخصوصية.
   - Apple: عدّل `apple/app.config.json` و`apple/capacitor.config.json` وما يلزم في `apple/ios`، ثم `npx cap sync ios`، وارفع رقم البناء، وتحقق بـ `apple/apple-release.sh preflight` و`apple/apple-release.sh build-sim`. حدّث `apple-release/` إن تغيّرت بيانات المتجر أو الخصوصية.
   - Google: طبّق التغيير نفسه في `google/capacitor.config.json` و`google/android` (ومنه `AndroidManifest.xml`)، وارفع `versionCode`، وتحقق بـ `google/google-release.sh preflight` و`google/google-release.sh build-debug`. الحزمة الموقّعة للمتجر: `google/google-release.sh bundle` على جهاز المالك.
   - صفحات القشرة (`apple/www`) مصدر واحد للتطبيقين: `google/google-release.sh sync` ينسخها إلى Android، فلا تُنشئ نسخة ثانية منها.

3. **iPhone Duo بكل الوضعيات.** كل تغيير يظهر للمستخدم يُفحص على محاكي iPhone Duo في: الوضع المغلق (الشاشة الخارجية)، نصف المفتوح (وضع الطاولة ووضع الكتاب)، والمفتوح (الشاشة الداخلية) طولًا وعرضًا، وفي المظهرين الفاتح والداكن وباتجاه RTL. المطلوب: لا تمرير أفقي، لا محتوى أو أزرار تحت المفصل أو خارج المنطقة الآمنة، ولا نص مقطوع، وتبقى الحالة محفوظة عند الطي والفتح. احفظ لقطات الإثبات في `docs/iphone-duo/`. إن تعذّر المحاكي فاستخدم المقاسات المكافئة الموثّقة في `docs/` واذكر ذلك.

4. **التقرير إلزامي.** كل PR وكل تقرير نهائي يتضمن قسمًا بعنوان «Apple / Google / iPhone Duo» يذكر: ما فُحص وبأي وضعية، ما عُدّل في المشروعين الأصليين، وما لم يُنفَّذ ولماذا. فحص `Native parity` في CI يفشل على أي PR يخلو وصفه من هذا القسم. ممنوع تخطّي أي بند بصمت؛ التغيير الذي لا يمسّ التطبيقات يُكتب فيه ذلك مع السبب.

5. **حدود ثابتة.** الإرسال لمراجعة App Store أو لإنتاج Google Play قرار المالك وحده. الرفع إلى TestFlight أو الاختبار الداخلي يكون بطلب منه. لا تُرفع مفاتيح التوقيع أو كلمات المرور إلى Git أبدًا.
<!-- native-parity-rule:end -->
