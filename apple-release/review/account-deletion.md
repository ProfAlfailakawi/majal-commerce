# طلب حذف الحساب — مجال (App Store 5.1.1(v))

**For App Review (EN):** Registered users can request deletion of their account inside the app: Account security (the shield icon in the top bar) > "Request account deletion". After a confirmation and a password re-entry the request is recorded, the user is signed out immediately and cannot log in again. The app then states: "We will delete your account within 30 days; records we are legally required to keep are retained in de-identified form." The operator erases the operational data within 30 days of the request.

## ما يحدث عند الطلب

`POST /api/v1/safety/account/deletion-request` (جلسة + CSRF + كلمة المرور في كل طلب، 5 طلبات كل 15 دقيقة لكل IP):

1. يتحقق الخادم أن الحساب هو صاحب الجلسة (معرّف مختلف في الجسم = 403)، ويعيد التحقق من كلمة المرور (بدونها 401 `REAUTH_REQUIRED`).
2. يُسجَّل صف واحد في `account_deletion_requests` (`user_id`، `requested_at`، `status = 'PENDING'`) — بلا أي بيانات شخصية أخرى.
3. يُعلَّق الحساب (`users.status = 'SUSPENDED'`) فيُمنع الدخول، وتُحذف كل جلساته، وتُمسح كوكيز الجلسة، ويُسجَّل حدث `ACCOUNT_DELETION_REQUESTED` في `domain_audit_events`.
4. حسابات `ADMIN` و`SUPER_ADMIN` لا تستخدم هذه الشاشة (409)؛ تُدار عبر المالك.

**لا يُحذف شيء** من العقود أو التسويات أو المدفوعات أو سجل التدقيق المتسلسل بالتجزئة. سياسة الاحتفاظ لم تُعتمد بعد، فالطلب يضع الحذف التشغيلي في طابور المالك فقط.

## واجب المالك التشغيلي: التنفيذ خلال 30 يومًا

النص الذي يراه المستخدم يَعِد بالحذف **خلال 30 يومًا**؛ المالك مسؤول عن تنفيذ كل طلب قبل مرور 30 يومًا على `requested_at`. لا يوجد تنفيذ آلي ولا تذكير آلي: راجع القائمة أسبوعيًا على الأقل.

الرؤية: لوحة الإدارة > الاعتمادات > «البلاغات وطلبات الحذف»، أو الاستعلام المباشر:

```sql
SELECT d.id, d.user_id, d.requested_at, u.email, u.role
FROM account_deletion_requests d JOIN users u ON u.id = d.user_id
WHERE d.status = 'PENDING'
ORDER BY d.requested_at;

-- المتأخر عن 30 يومًا (PostgreSQL)
SELECT id, user_id FROM account_deletion_requests
WHERE status = 'PENDING' AND requested_at::timestamptz < now() - interval '30 days';
```

عند التنفيذ (بعد قرار الاحتفاظ والتجهيل لكل جدول، وبموافقة المختص): امسح أو جهّل البيانات التشغيلية للحساب (الاسم، البريد، الهاتف، أسرار MFA، التفضيلات، الإشعارات)، وأبقِ السجلات الملزمة قانونيًا بصيغة مجهّلة، ثم أغلق الطلب:

```sql
UPDATE account_deletion_requests SET status = 'COMPLETED', completed_at = :now WHERE id = :id;
```

لا تحذف صفوفًا من `contract_versions` أو `contract_signatures` أو `settlement_batches` أو `accruals` أو `financial_ledger` أو `domain_audit_events`، فهي مرتبطة بقيود `ON DELETE RESTRICT` وبسلسلة تجزئة. إن أراد المستخدم التراجع قبل التنفيذ فأعد تفعيل الحساب من لوحة الإدارة (تغيير الحالة إلى ACTIVE) واجعل الطلب `REJECTED`.

## ملاحظة للمراجع
حساب تجربة المراجعة: OWNER-TODO (انظر review-notes.md). يمكن تجربة الطلب بحساب مستهلك تجريبي؛ سيُعلَّق الحساب بعد الطلب، لذا استخدم حسابًا مخصصًا لهذا الاختبار.
