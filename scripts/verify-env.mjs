#!/usr/bin/env node
/*
 * MAJAL — فاحص جاهزية الإعداد.
 *
 * يجيب على سؤال واحد: "لو نشرت الآن، ما الذي سيعمل وما الذي لن يعمل؟"
 *
 * القاعدة التي يلتزم بها: لا يدّعي جاهزية لم يتحقق منها. وجود المتغيّر لا يعني
 * أن المفتاح صحيح — الفاحص يقول "مضبوط"، لا "يعمل". التحقق الحقيقي من المزوّد
 * لا يتم إلا بطلب فعلي على بيئة منشورة.
 *
 *   node scripts/verify-env.mjs          فحص عام
 *   node scripts/verify-env.mjs --strict رمز خروج غير صفري عند أي نقص إلزامي
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const strict = process.argv.includes('--strict');

// .env يُقرأ إن وُجد، فالفحص يعمل محلياً كما يعمل في بيئة النشر.
const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const val = (name) => (env[name] || '').trim();
const has = (name) => val(name).length > 0;
const long = (name, min = 32) => val(name).length >= min;

const C = { red: '\x1b[31m', green: '\x1b[32m', amber: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
let blocking = 0;
let locked = 0;

const line = (icon, color, label, detail) =>
  console.log(`  ${color}${icon}${C.off}  ${label}${detail ? `\n       ${C.dim}${detail}${C.off}` : ''}`);

function required(label, names, note) {
  const missing = names.filter((n) => !has(n));
  if (missing.length) { blocking += 1; line('✗', C.red, label, `ناقص: ${missing.join(', ')}${note ? ` — ${note}` : ''}`); }
  else line('✓', C.green, label, note);
}

function secretOf(label, name, min = 32) {
  if (!has(name)) { blocking += 1; line('✗', C.red, label, `ناقص: ${name}`); }
  else if (!long(name, min)) { blocking += 1; line('✗', C.red, label, `${name} أقصر من ${min} محرفاً — سيُرفض`); }
  else line('✓', C.green, label);
}

/** ميزة تُقفل بأمان حين لا تُربط: غيابها ليس عطلاً، لكنه يعني أنها لا تعمل. */
function feature(label, names, consequence) {
  const missing = names.filter((n) => !has(n));
  if (missing.length === names.length) { locked += 1; line('○', C.amber, label, `غير مربوط — ${consequence}`); }
  else if (missing.length) { locked += 1; line('◐', C.amber, label, `ناقص جزئياً: ${missing.join(', ')} — ${consequence}`); }
  else line('✓', C.green, label);
}

const production = val('NODE_ENV') === 'production';

console.log(`\n${C.bold}  MAJAL — جاهزية الإعداد${C.off}`);
console.log(`  ${C.dim}NODE_ENV=${val('NODE_ENV') || '(غير مضبوط)'}${C.off}`);
console.log('  ─────────────────────────────────────────────');

console.log(`\n${C.bold}  إلزامي للإقلاع${C.off}`);
if (production) {
  required('قاعدة بيانات الإنتاج', ['DATABASE_URL'], 'Postgres إلزامي؛ SQLite للتطوير فقط');
} else {
  line('○', C.dim, 'قاعدة بيانات الإنتاج', 'NODE_ENV ليس production — سيُستعمل SQLite محلياً');
}
secretOf('سرّ الجلسات (AUTH_SESSION_SECRET)', 'AUTH_SESSION_SECRET');
secretOf('مفتاح التشفير (AUTH_ENCRYPTION_KEY)', 'AUTH_ENCRYPTION_KEY');
required('عنوان النشر (APP_URL)', ['APP_URL'], 'يُبنى عليه رابط العودة من بوابة الدفع');

console.log(`\n${C.bold}  البيع والمال${C.off}`);
const provider = val('PAYMENT_PROVIDER').toUpperCase();
if (!provider) {
  locked += 1;
  line('○', C.amber, 'بوابة الدفع', 'PAYMENT_PROVIDER غير مضبوط — /api/v1/orders يردّ 503، أي لا بيع');
} else if (provider === 'MYFATOORAH') {
  feature('بوابة الدفع (MyFatoorah)',
    ['MYFATOORAH_API_TOKEN', 'MYFATOORAH_WEBHOOK_SECRET', 'MYFATOORAH_PAYMENT_METHOD_ID'],
    'الطلبات مرفوضة حتى تكتمل');
} else if (provider === 'LEMONSQUEEZY') {
  feature('بوابة الدفع (LemonSqueezy)',
    ['LEMONSQUEEZY_API_KEY', 'LEMONSQUEEZY_STORE_ID', 'LEMONSQUEEZY_VARIANT_ID',
     'LEMONSQUEEZY_WEBHOOK_SECRET', 'LEMONSQUEEZY_SETTLEMENT_CURRENCY', 'LEMONSQUEEZY_KWD_RATE'],
    'الطلبات مرفوضة حتى تكتمل');
} else {
  blocking += 1;
  line('✗', C.red, 'بوابة الدفع', `PAYMENT_PROVIDER='${provider}' غير معروف — المعروف: MYFATOORAH أو LEMONSQUEEZY`);
}
if (has('SETTLEMENT_RECONCILIATION_SECRET') && !long('SETTLEMENT_RECONCILIATION_SECRET')) {
  blocking += 1;
  line('✗', C.red, 'سرّ تأكيد التسوية', 'أقصر من 32 محرفاً — سيُرفض كل تأكيد دفع');
} else {
  feature('تأكيد دفع التسوية', ['SETTLEMENT_RECONCILIATION_SECRET'], 'تعليم الدفعات مدفوعة سيُرفض دائماً');
}

console.log(`\n${C.bold}  الحسابات والأسرار${C.off}`);
feature('البريد الصادر (Resend)', ['RESEND_API_KEY', 'RESEND_FROM'],
  'استعادة كلمة المرور لن تصل أبداً');
if (production) {
  required('تخزين الوصفات المؤمَّن', ['GCS_SECURE_BUCKET', 'GCP_KMS_KEY_NAME'],
    'بدونه أي حفظ لوصفة يفشل — وهي الملكية الفكرية الأساسية');
} else {
  feature('تخزين الوصفات المؤمَّن', ['GCS_SECURE_BUCKET', 'GCP_KMS_KEY_NAME'],
    'محلياً تُستعمل خزنة على القرص؛ الإنتاج يرفض ذلك');
}

console.log(`\n${C.bold}  ميزات اختيارية${C.off}`);
feature('التوقيع الرقمي PACI',
  ['PACI_ADAPTER_URL', 'PACI_ADAPTER_SHARED_SECRET', 'PACI_CALLBACK_URL',
   'PACI_INTERNAL_CALLBACK_SECRET', 'PACI_DATA_PEPPER', 'PACI_SERVICE_PROVIDER_APPROVED'],
  'توقيع العقود معطّل (قرار قانوني قبل أن يكون تقنياً)');
feature('المساعد الذكي',
  val('ENABLE_AI_API') === 'true' ? ['GEMINI_API_KEY'] : ['ENABLE_AI_API', 'GEMINI_API_KEY'],
  'مسارات /api/ai تردّ 503');
feature('إشعارات الدفع (FCM)', ['FCM_PROJECT_ID'], 'إشعارات المتصفح لا تُرسَل');
feature('استخراج المستندات', ['DOCUMENT_AI_PROCESSOR_NAME'], 'zero-form/extract يردّ غير مهيأ');
feature('ختم زمني خارجي', ['TSA_URL'], 'يُستعمل ختم محلي أضعف إثباتاً');
feature('حدود طلبات مشتركة (Redis)', ['REDIS_URL'], 'كل نسخة تعدّ وحدها — يكفي لنسخة واحدة؛ scripts/setup-redis.sh');

console.log(`\n${C.bold}  أسرار العمليات الحسّاسة${C.off}`);
for (const [name, label, consequence] of [
  ['SECURITY_KILL_SWITCH_SECRET', 'مفاتيح الإيقاف الطارئ', 'لا يمكن تفعيل إيقاف طارئ وقت الحادثة'],
  ['CANARY_SIGNING_SECRET', 'تتبّع تسريب الوصفات', 'إصدار علامات التتبّع مرفوض'],
  ['TRUST_ATTESTATION_SECRET', 'شهادات ثقة المبدعين', 'إصدار الشهادات مرفوض'],
  ['SEALED_COMPUTE_KEY', 'الحوسبة المختومة', 'العمليات المختومة مرفوضة'],
]) {
  if (has(name) && !long(name)) { blocking += 1; line('✗', C.red, label, `${name} أقصر من 32 محرفاً — سيُرفض`); }
  else feature(label, [name], consequence);
}

console.log(`\n${C.bold}  التشغيل${C.off}`);
const hops = val('TRUST_PROXY_HOPS');
if (production && hops && !/^[0-5]$/.test(hops)) {
  line('◐', C.amber, 'TRUST_PROXY_HOPS', `القيمة '${hops}' خارج المدى 0..5 — سيُتجاهَل ويُستعمل الافتراضي`);
} else if (production && !hops) {
  line('✓', C.green, 'TRUST_PROXY_HOPS', 'غير مضبوط — الافتراضي 1، وهو الصحيح خلف Cloud Run');
} else {
  line('✓', C.green, 'TRUST_PROXY_HOPS', hops ? `hops=${hops}` : 'تطوير محلي');
}
if (production && val('ENABLE_INTEGRATION_SIMULATORS') === 'true') {
  line('✓', C.green, 'محاكيات POS', 'مضبوطة لكن الإنتاج يتجاهلها — مقفولة على أي حال');
}

console.log('\n  ─────────────────────────────────────────────');
console.log(`  ${blocking ? C.red : C.green}${blocking} مانع${C.off} · ${C.amber}${locked} ميزة غير مربوطة${C.off}`);
if (blocking) console.log(`  ${C.red}لا تنشر: الموانع أعلاه تمنع الإقلاع أو تكسر المال.${C.off}`);
else if (locked) console.log(`  ${C.amber}يقلع ويعمل، لكن الميزات المعلّمة ○ لن تعمل حتى تُربط.${C.off}`);
else console.log(`  ${C.green}كل ما يقرأه الكود مضبوط. يبقى التحقق الحقيقي بطلب فعلي على بيئة منشورة.${C.off}`);
console.log(`  ${C.dim}"مضبوط" ≠ "صحيح": هذا الفاحص يرى وجود القيمة لا صلاحيتها لدى المزوّد.${C.off}\n`);

if (strict && blocking) process.exit(1);
