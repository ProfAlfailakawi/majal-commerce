/*
 * فحص ثابت لمدخل العرض (يُشغَّل مع `npm run verify:demo`).
 * حذف أي حلقة من هذه السلسلة لا يكسر بناءً ولا نوعًا، لكنه يفتح باب العرض على البيانات الحقيقية
 * أو يخفي المدخل عن المراجع. فنفحصها نصًّا:
 *   - زر العرض ظاهر في نافذة الدخول والصفحة الرئيسية والشريط العلوي.
 *   - ناقل المعرّف يركّب نفسه عند تقييم وحدته، و runtime يستورده قبل الاستعمال.
 *   - الخادم: الحارس قبل أي موجّه، والسياق بعد express.json، ومسارات /api/v1/demo، والإغلاق.
 *   - المفتاح MAJAL_DEMO_ENABLED موثّق، والصندوق ذاكرة فقط (لا اتصال بـ DATABASE_URL).
 */
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const fail = message => { console.error(`فشل فحص مدخل العرض: ${message}`); process.exit(1); };

for (const [file, label] of [
  ['src/components/common/AuthModal.tsx', 'نافذة الدخول'],
  ['src/components/public/PublicLanding.tsx', 'الصفحة الرئيسية']
]) {
  if (!read(file).includes('<DemoEntryButton')) fail(`${label} (${file}) لا تعرض زر العرض النصي.`);
}
if (!read('src/components/Navbar.tsx').includes('enterDemoMode()')) fail('الشريط العلوي لا يعرض مدخل العرض.');
if (!/تجربة العرض/.test(read('src/components/common/DemoEntryButton.tsx'))) fail('نص زر العرض العربي مفقود.');

const transport = read('src/lib/demoTransport.ts');
if (!/^installDemoTransport\(\);/m.test(transport)) fail('ناقل الصندوق لا يركّب نفسه عند تقييم الوحدة.');
if (!transport.includes("x-majal-demo")) fail('ترويسة الصندوق مفقودة من الناقل.');
if (!read('src/lib/runtime.ts').includes("from './demoTransport'")) fail('runtime.ts لا يستورد ناقل الصندوق (لن يُركَّب قبل الاستعمال).');
if (!/readDemoSandboxId\(\) !== ''/.test(read('src/lib/runtime.ts'))) fail('علم العرض لا يشترط معرّف صندوق من الخادم.');

const server = read('server.ts');
const at = needle => { const i = server.indexOf(needle); if (i < 0) fail(`server.ts لا يحتوي «${needle}».`); return i; };
const guard = at('app.use(demoGuard())');
const firstRoute = Math.min(at("app.post('/api/v1/payments/webhooks/:provider'"), at("app.use('/api/v1/auth'"));
const json = at("app.use(express.json({ limit: '64kb', strict: true }))");
const context = at('app.use(demoContext(demoRegistry))');
if (!(guard < firstRoute)) fail('حارس الصندوق يجب أن يسبق كل الموجّهات والويب هوك.');
if (!(json < context)) fail('سياق الصندوق يجب أن يلي express.json (قراءة الجسم تُضيّع AsyncLocalStorage).');
if (!(context < at("app.use('/api/v1/auth'"))) fail('سياق الصندوق يجب أن يسبق موجّه المصادقة.');
at("app.use('/api/v1/demo'");
at('createDemoAwareDb(realDb, demoRegistry)');
at('demoRegistry.closeAll()');
if (/createXRouter\(\s*realDb/.test(server) || /Router\(realDb/.test(server)) fail('موجّه يستقبل realDb مباشرة: يتجاوز الصندوق.');

const sandbox = read('server/demo-sandbox.ts');
if (!/openMajalDatabase\(\{ filename: ':memory:' \}\)/.test(sandbox)) fail('الصندوق لا يفتح SQLite في الذاكرة.');
if (!sandbox.includes('MAJAL_DEMO_ENABLED')) fail('مفتاح الإيقاف MAJAL_DEMO_ENABLED مفقود.');
if (!read('.env.example').includes('MAJAL_DEMO_ENABLED')) fail('.env.example لا يوثّق MAJAL_DEMO_ENABLED.');

console.log('فحص مدخل العرض: الزر ظاهر في الدخول والرئيسية والشريط، الناقل يركّب نفسه، الحارس قبل الموجّهات والسياق بعد الجسم، والصندوق ذاكرة فقط مع مفتاح إيقاف.');
