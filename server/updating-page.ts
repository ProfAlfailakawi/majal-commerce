import { createHash } from 'node:crypto';

/**
 * CSP لصفحة «نُحدّث البرنامج» (public/updating.html) وحدها.
 *
 * الصفحة مستقلّة تماماً: يقدّمها عامل الخدمة من ذاكرته حين تجيب واجهة Google الأمامية
 * بـ 5xx أثناء النشر، فلا يمكن أن تطلب ملفاً آخر من خادمٍ لا يجيب. سكربتها إذن مضمَّن،
 * وسياسة الموقع العامة (script-src 'self') تحجبه. فبدل توسيع تلك السياسة، يُسمح لهذا
 * الملف وحده ببصمة sha256 لسكربته هو، وبلا شيء آخر: لا خطّ ولا صورة ولا اتصال خارج
 * الموقع، ولا إطار ولا نموذج.
 *
 * عامل الخدمة ينسخ هذه الترويسة مع الصفحة المحفوظة، فتبقى السياسة نفسها حين تُقدَّم منه.
 */
export function updatingPageCsp(html: string): string | null {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  if (!scripts.length) return null;
  const hashes = scripts.map(body => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  return [
    "default-src 'none'",
    `script-src ${hashes.join(' ')}`,
    "style-src 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
