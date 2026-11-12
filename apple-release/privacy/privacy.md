# الخصوصية — مجال

- **التتبع (ATT):** لا. لا SDK إعلانات أو تتبع في الغلاف الأصلي.
- **Privacy Manifest:** `apple/ios/App/App/PrivacyInfo.xcprivacy` — UserDefaults (CA92.1) لحفظ آخر صفحة. Capacitor يضمّن ملفاته الخاصة عبر SPM.
- **أذونات الجهاز:** camera, photos.
- **بيانات يجمعها الموقع المستضاف (تُعلن في App Store Connect):** OWNER-TODO — راجع سياسة الموقع؛ عادةً: البريد/الاسم (حساب)، المحتوى الذي يرفعه المستخدم، بيانات التشخيص إن وُجدت. لا تُعلن ما لم يُتحقق منه.
- **الحساب والحذف:** يلزم حذف الحساب.
- **التشفير:** HTTPS فقط → `ITSAppUsesNonExemptEncryption = false`.
