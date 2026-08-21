# MAJAL — Production Architecture Blueprint

هذا الملف يحدد الانتقال من نسخة العرض الحالية إلى تشغيل تجاري فعلي دون تغيير فلسفة المنتج.

## الحالة المنفذة في v5

- `node:sqlite` هو مصدر الحقيقة المحلي للمصادقة والجلسات والإشعارات وحدود الدفع/PACI، ويحتوي schema مترابطًا لباقي المجال عبر migrations v1–v4.
- PostgreSQL يبقى هدف الإنتاج متعدد النسخ؛ أسماء الجداول والقيود والفهارس الحالية هي عقد الترحيل، وليست سببًا للإبقاء على SQLite في العنقود.
- Session auth وMFA وCSRF وlockout مفعلة، والواجهة الإنتاجية تستعيد المستخدم من الخادم بدل تبديل دور العميل.
- Catalog API يستخدم signed cursor وحدًا أقصى 50؛ محاكي الحمل يقيس الفهارس بدون تحميل السجلات داخل React.
- Payment وPACI مفصولان خلف Adapter contracts غير مهيأة، مع readiness endpoints وفشل آمن.
- Notification inbox/outbox يدعم coalescing والأولوية وساعات الهدوء، وتبقى email/push معلقة حتى ربط المزود.

## 1. حدود الثقة

- المتصفح **غير موثوق** ولا يملك قرارًا نهائيًا في الصلاحيات أو المال أو العقود أو الوصفات.
- كل mutation حساس ينتقل إلى API خادمية وتتحقق الخادمية من: الهوية، الدور، سياق المنشأة/المبدع، حالة الكيان، والسياسة الحالية.
- إخفاء زر في الواجهة UX فقط، وليس Security Control.

## 2. طبقات الإنتاج

- Web/PWA: React/Next-compatible UI مع RTL عربي كامل.
- API: TypeScript service layer بنمط Modular Monolith أولًا.
- PostgreSQL: المصدر الحقيقي للحسابات، الكيانات، العقود، الصفقات، الإطلاقات والتسويات.
- Object Storage: الوصفات، العقود، الأدلة والصور؛ تشفير at-rest، مفاتيح منفصلة، وروابط قصيرة العمر.
- Queue/Event Bus: أحداث Audit، الإشعارات، التقارير والتسويات غير المتزامنة.
- Redis: sessions/rate limits/cache فقط؛ ليس مصدر الحقيقة المالي.

## 3. الوحدات

Auth & Identity / Users & Organizations / Creators / Hosts / Products / Recipe Vault / Matching / Challenges / Lab / Deal Room / Contracts / Launches / Orders / Royalties / Settlements / Compliance / Disputes / Audit / Notifications / Analytics / Platform Policy.

## 4. الصلاحيات

RBAC + Context + Sensitivity:

- الدور يحدد نوع العملية الممكنة.
- السياق يثبت أن المستخدم عضو في نفس المنشأة أو صاحب المنتج.
- الحساسية تحدد L1/L2/L3 ومدته وسبب الوصول.
- السوبر أدمن لا يحصل تلقائيًا على L3؛ override الطارئ يحتاج workflow منفصلًا وسببًا ومراجعة لاحقة.

## 5. Recipe Vault

- كل RecipeVersion immutable بعد النشر؛ أي تعديل = Version جديدة.
- secrets لا تُرسل إلى المتصفح ما لم ينجح authorization server-side.
- export يولد خادميًا مع tracking id وwatermark، وليس ملفًا مجهزًا بالكامل في الواجهة.
- كل view/export/revoke/grant يسجل كحدث Audit خادمي.

## 6. المال

- Orders وAccruals وSettlementBatches سجلات منفصلة.
- اعتماد التسوية لا يعني الدفع.
- PAID لا يسجل إلا بعد confirmation موثوق من مزود الدفع/التحويل أو reconciliation معتمد.
- idempotency keys لكل عملية مالية.
- لا تستخدم floating point للحساب النهائي؛ استخدم minor units أو decimal database type.

## 7. العقود

- ContractVersion immutable.
- التوقيع داخل مجال منفصل عن خدمة التوقيع القانوني النهائية حتى يتم اختيار آلية معتمدة قانونيًا.
- تحفظ signer identity/session evidence والتوقيت وdocument hash.

## 8. Audit

- Append-only server event store.
- actor, role, organization, action, entity, before/after hash, timestamp, request/session reference.
- لا يوجد delete من واجهة الإدارة.
- سياسات retention وlegal hold تحدد قبل الإنتاج.

## 9. Security Baseline

MFA للإدارة والمنشآت الحساسة، session rotation، CSRF protection، secure cookies، CSP، rate limiting، signed URLs، antivirus/file validation، secret management، dependency scanning، SAST/DAST، backup restore tests، incident response.

المطبق الآن: password hashing، session hashing، secure cookie policy، CSRF، TOTP MFA، lockout، CSP، request limits، signed cursors، schema constraints واختبارات سلبية. المتبقي: KMS/Object Storage، rotation عند تغيير الامتياز، Redis rate limits، SAST/DAST في CI، backup restore وincident operations.

## 10. Observability

Structured logs + traces + metrics + alerting. أهم alerts: failed auth spikes، unusual recipe access، duplicate settlement attempts، launch safety pause، webhook/payment mismatch، document expiry.

## 11. Deployment

Dev → Staging → Production، مع migrations versioned، CI gates، preview deployments، feature flags، rollback، backups، وrelease checklist إلزامية.

## 12. عقد الأداء عند مليون سجل فأكثر

نسخة المتصفح الحالية لا تُعتبر مسار البيانات الإنتاجي. الوصول إلى مليون سجل يتطلب الضوابط التالية مجتمعة:

- لا تُحمّل collections كاملة إلى React أو `sessionStorage`؛ كل شاشة تستخدم API بصفحات cursor لا تتجاوز 50 سجلًا.
- فهارس PostgreSQL مركبة حسب الاستعلام الفعلي، مثل `(host_business_id, status, created_at desc)` و`(creator_id, settlement_status, created_at desc)`.
- تقسيم orders/audit/events زمنيًا، وسياسة أرشفة تمنع نمو الجداول الساخنة بلا حد.
- لوحات GMV والسيولة والمستحقات تقرأ من read models/materialized views محدثة بالأحداث، لا من `filter/reduce` على كل الطلبات.
- البحث يستخدم index مخصصًا ونتائج محدودة؛ الصور والملفات من Object Storage + CDN وروابط قصيرة العمر.
- الواجهة تستخدم lazy chunks (مطبق حاليًا) وvirtualized tables للصفحات الإدارية الطويلة.
- Cache keys تحمل tenant + role + filters، مع منع أي cache مشترك من خلط بيانات منشأتين.
- اختبارات تحميل مرحلية ببيانات مصطنعة: 1M orders، 100k products، 10M audit events، مع p95 API أقل من 400ms للقراءة القياسية ومراقبة الخطأ والذاكرة.
- الـrate limiting والإقفال الموزع وidempotency تنتقل إلى Redis/قاعدة البيانات؛ الذاكرة المحلية للخادم ليست كافية عند تعدد النسخ.

أي ادعاء بدعم مليون سجل قبل بناء وقياس هذا المسار مرفوض كمعيار إصدار.
