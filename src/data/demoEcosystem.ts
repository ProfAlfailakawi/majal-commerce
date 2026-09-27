/**
 * The demo ecosystem: suppliers, their offerings, Kuwaiti job posts and the
 * applications against them.
 *
 * Everywhere else the demo runs on the local store, but this layer is fetched
 * straight from `/api/v1/ecosystem`, and inside a demo tab there is no session
 * cookie — so the supplier portal opened on "تعذّر فتح ملف المورد", the admin
 * approvals tab on an error, and the jobs board and supplier directory simply
 * vanished. `ecosystemClient` routes to this module only when `IS_DEMO_MODE`
 * is on; live accounts never reach it.
 *
 * Everyone below is invented. Employers are the same hosts the demo universe
 * already seeds (hb_main, hb_demo_*), so a job posted by «مخبز السالمية الحديث»
 * in the jobs board is the same host a creator meets in the marketplace.
 */
import type { KuwaitiJobApplication, KuwaitiJobPost, SupplierOffering, SupplierProfile } from '../types/majal';

const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day).toISOString();

export const DEMO_SUPPLIER_ID = 'sup_demo_main';
export const DEMO_SUPPLIER_USER_ID = 'usr_supplier_demo';

function seedSuppliers(): SupplierProfile[] {
  return [
    { id: DEMO_SUPPLIER_ID, commercialName: 'مؤسسة الخليج لمواد التغليف', category: 'تغليف غذائي', verificationStatus: 'VERIFIED', commercialRegistrationNo: 'DEMO-SUP-4471', description: 'علب كرتون مطبوعة، أكياس ورقية مبطنة، وملصقات مكوّنات ومسببات حساسية مطابقة لاشتراطات الهيئة العامة للغذاء.', region: 'الري، العاصمة', contactPhone: '+965 2245 1180', contactEmail: 'sales@gulfpack.demo.majal.test', reviewedAt: ago(40), createdAt: ago(75), updatedAt: ago(3) },
    { id: 'sup_demo_2', commercialName: 'مزارع الوفرة للتمور', category: 'تمور ومكونات', verificationStatus: 'VERIFIED', commercialRegistrationNo: 'DEMO-SUP-3120', description: 'تمر خلاص وسكري ومعجون تمر للمعمول والسوبيا، بشحنات أسبوعية مبرّدة.', region: 'الوفرة، الأحمدي', contactPhone: '+965 2398 7741', contactEmail: 'orders@wafra-dates.demo.majal.test', reviewedAt: ago(52), createdAt: ago(90), updatedAt: ago(6) },
    { id: 'sup_demo_3', commercialName: 'بهارات السوق المباركية', category: 'بهارات وتوابل', verificationStatus: 'VERIFIED', commercialRegistrationNo: 'DEMO-SUP-2088', description: 'هيل وزعفران وبهارات مچبوس مطحونة حسب الطلب مع شهادة مصدر لكل دفعة.', region: 'المباركية، العاصمة', contactPhone: '+965 2241 6602', contactEmail: 'hello@mubarakiya-spice.demo.majal.test', reviewedAt: ago(33), createdAt: ago(61), updatedAt: ago(2) },
    { id: 'sup_demo_4', commercialName: 'الشويخ للتبريد والنقل', category: 'لوجستيات مبرّدة', verificationStatus: 'PENDING', commercialRegistrationNo: 'DEMO-SUP-5530', description: 'نقل مبرّد من المطابخ المركزية إلى الفروع خلال نافذة ٩٠ دقيقة داخل الكويت.', region: 'الشويخ الصناعية', contactPhone: '+965 2481 3307', contactEmail: 'fleet@shuwaikh-cold.demo.majal.test', reviewedAt: null, createdAt: ago(4), updatedAt: ago(1) },
    { id: 'sup_demo_5', commercialName: 'ألبان الصبية', category: 'ألبان ومنتجات طازجة', verificationStatus: 'PENDING', commercialRegistrationNo: 'DEMO-SUP-6012', description: 'لبن وقشطة وزبدة بلدية يومية للمخابز والمطابخ المركزية.', region: 'الصبية، الجهراء', contactPhone: '+965 2455 0194', contactEmail: 'supply@subiya-dairy.demo.majal.test', reviewedAt: null, createdAt: ago(2), updatedAt: ago(2) },
    { id: 'sup_demo_6', commercialName: 'معدات الفحيحيل للمطابخ', category: 'معدات مطابخ', verificationStatus: 'NEEDS_ACTION', commercialRegistrationNo: 'DEMO-SUP-7408', description: 'أفران حجرية وخلاطات صناعية وصيانة دورية للمطابخ المركزية.', region: 'الفحيحيل، الأحمدي', contactPhone: '+965 2391 5520', contactEmail: 'service@fahaheel-kitchens.demo.majal.test', adminNote: 'يرجى رفع صورة سارية من الترخيص التجاري.', reviewedAt: ago(5), createdAt: ago(12), updatedAt: ago(5) },
  ];
}

function seedOfferings(): SupplierOffering[] {
  const o = (id: string, supplierId: string, name: string, category: string, description: string, unit: string, minOrderQty: number, leadTimeDays: number, priceFromFils: number | null, age: number, status: SupplierOffering['status'] = 'ACTIVE'): SupplierOffering =>
    ({ id, supplierId, name, category, description, unit, minOrderQty, leadTimeDays, priceFromFils, status, createdAt: ago(age), updatedAt: ago(Math.max(0, age - 3)) });
  return [
    o('off_demo_1', DEMO_SUPPLIER_ID, 'علبة قرص عقيلي مطبوعة (١٢ حبة)', 'تغليف', 'كرتون مقوّى بطباعة ذهبية ونافذة شفافة، مع مساحة لملصق المكوّنات.', 'علبة', 500, 7, 185, 60),
    o('off_demo_2', DEMO_SUPPLIER_ID, 'كيس ورقي مبطّن للمخبوزات', 'تغليف', 'كيس ورقي مقاوم للدهون مناسب للمعجنات الحارة.', 'كيس', 1000, 4, 42, 44),
    o('off_demo_3', DEMO_SUPPLIER_ID, 'ملصقات مكوّنات ومسببات حساسية', 'ملصقات', 'ملصق عربي/إنجليزي مطابق للاشتراطات، يطبع من بيانات المنتج في مجال.', 'ملصق', 2000, 3, 12, 30),
    o('off_demo_4', DEMO_SUPPLIER_ID, 'كوب سوبيا مع غطاء محكم', 'تغليف', 'كوب ٤٠٠ مل بغطاء مانع للتسرب للمشروبات الباردة.', 'كوب', 800, 6, 95, 21, 'PAUSED'),
    o('off_demo_5', 'sup_demo_2', 'معجون تمر خلاص', 'تمور', 'معجون تمر ناعم لحشوة المعمول، بدون سكر مضاف.', 'كغ', 25, 5, 1450, 70),
    o('off_demo_6', 'sup_demo_2', 'تمر سكري فاخر', 'تمور', 'سكري منتقى للتقديم والضيافة.', 'كغ', 20, 3, 2250, 48),
    o('off_demo_7', 'sup_demo_3', 'هيل مطحون طازج', 'بهارات', 'هيل أخضر يطحن يوم الشحن.', 'كغ', 2, 2, 9800, 55),
    o('off_demo_8', 'sup_demo_3', 'خلطة بهارات مچبوس', 'بهارات', 'خلطة ثابتة النسب لخطوط الإنتاج.', 'كغ', 5, 3, 4200, 38),
    o('off_demo_9', 'sup_demo_3', 'زعفران إيراني درجة أولى', 'بهارات', 'شعيرات كاملة بشهادة مصدر.', 'غرام', 50, 4, 1150, 26),
  ];
}

function seedJobs(): KuwaitiJobPost[] {
  const j = (id: string, employerType: KuwaitiJobPost['employerType'], employerId: string, employerName: string, title: string, department: string, employmentType: KuwaitiJobPost['employmentType'], location: string, description: string, requirements: string[], salaryMinKwd: number | null, salaryMaxKwd: number | null, status: KuwaitiJobPost['status'], age: number, adminNote?: string): KuwaitiJobPost => ({
    id, employerType, employerId, employerName, title, department, employmentType, location, description, requirements,
    salaryMinFils: salaryMinKwd === null ? null : salaryMinKwd * 1000,
    salaryMaxFils: salaryMaxKwd === null ? null : salaryMaxKwd * 1000,
    kuwaitiOnly: true, status, adminNote, reviewedAt: status === 'PENDING_REVIEW' ? null : ago(Math.max(0, age - 1)), submittedAt: ago(age), createdAt: ago(age),
  });
  return [
    j('job_demo_1', 'HOST', 'hb_main', 'مطابخ الديرة المركزية', 'مشرف/ة خط إنتاج الحلويات', 'الإنتاج', 'FULL_TIME', 'الشويخ الصناعية', 'الإشراف على دفعات إطلاق الـDrops والتأكد من مطابقة الوصفة المعتمدة في كل وردية.', ['خبرة سنتين في مطبخ مركزي', 'شهادة سلامة غذاء سارية', 'إجادة العربية'], 650, 850, 'APPROVED', 9),
    j('job_demo_2', 'HOST', 'hb_main', 'مطابخ الديرة المركزية', 'منسق/ة عمليات التوصيل', 'العمليات', 'FULL_TIME', 'حولي', 'تنسيق نوافذ التوصيل مع الفروع ومتابعة غرفة العمليات أثناء الإطلاق.', ['مهارة تواصل عالية', 'معرفة بمناطق الكويت'], 550, 700, 'APPROVED', 6),
    j('job_demo_3', 'HOST', 'hb_main', 'مطابخ الديرة المركزية', 'متدرب/ة جودة (برنامج صيفي)', 'الجودة', 'INTERNSHIP', 'الشويخ الصناعية', 'برنامج تدريب ٨ أسابيع على فحوص الجودة وتتبع الدفعات.', ['طالب/ة تغذية أو علوم أغذية'], 250, 250, 'PENDING_REVIEW', 1),
    j('job_demo_4', 'HOST', 'hb_demo_2', 'مخبز السالمية الحديث', 'خبّاز/ة معجنات صباحي', 'المخبز', 'PART_TIME', 'السالمية', 'وردية صباحية من ٥ إلى ١١ لتجهيز المعجنات اليومية.', ['خبرة في العجائن', 'التزام بالمواعيد'], 350, 450, 'APPROVED', 12),
    j('job_demo_5', 'HOST', 'hb_demo_4', 'كافيه الرملة', 'باريستا قهوة عربية ومختصة', 'الخدمة', 'FULL_TIME', 'حولي', 'تحضير القهوة العربية والمختصة وتقديم منتجات المبدعين في الكافيه.', ['خبرة سنة على الأقل'], 400, 520, 'APPROVED', 15),
    j('job_demo_6', 'SUPPLIER', DEMO_SUPPLIER_ID, 'مؤسسة الخليج لمواد التغليف', 'مصمم/ة تغليف غذائي', 'التصميم', 'CONTRACT', 'الري', 'تصميم علب ومطبوعات لمنتجات المبدعين وفق هوية كل Drop.', ['ملف أعمال', 'إجادة Illustrator'], 600, 900, 'APPROVED', 18),
    j('job_demo_7', 'SUPPLIER', DEMO_SUPPLIER_ID, 'مؤسسة الخليج لمواد التغليف', 'مندوب/ة مبيعات للمطابخ المركزية', 'المبيعات', 'FULL_TIME', 'العاصمة', 'متابعة طلبات التغليف من المطابخ والمخابز الشريكة في مجال.', ['رخصة قيادة سارية'], 500, 650, 'PENDING_REVIEW', 2),
    j('job_demo_8', 'SUPPLIER', DEMO_SUPPLIER_ID, 'مؤسسة الخليج لمواد التغليف', 'أمين/ة مستودع', 'المستودع', 'FULL_TIME', 'الري', 'إدارة مخزون الكرتون والملصقات.', ['خبرة مخازن'], 420, 500, 'REJECTED', 20, 'يرجى توضيح ساعات العمل وبدل الورديات قبل إعادة الإرسال.'),
    j('job_demo_9', 'SUPPLIER', 'sup_demo_3', 'بهارات السوق المباركية', 'مسؤول/ة جودة ومصادر البهارات', 'الجودة', 'FULL_TIME', 'المباركية', 'فحص شهادات المصدر لكل دفعة ومطابقتها قبل الشحن.', ['بكالوريوس علوم'], 700, 950, 'PENDING_REVIEW', 1),
  ];
}

function seedApplications(): KuwaitiJobApplication[] {
  const a = (id: string, jobId: string, fullName: string, email: string, phone: string, summary: string, yearsExperience: number, status: KuwaitiJobApplication['status'], age: number): KuwaitiJobApplication =>
    ({ id, jobId, fullName, email, phone, summary, yearsExperience, kuwaitiDeclaration: true, status, createdAt: ago(age), updatedAt: ago(age) });
  return [
    a('app_demo_1', 'job_demo_1', 'فاطمة العنزي', 'fatma@demo.majal.test', '+965 5512 3301', 'مشرفة وردية في مطبخ فندقي ٣ سنوات، أتابع سجلات الحرارة والدفعات يوميًا.', 3, 'SHORTLISTED', 7),
    a('app_demo_2', 'job_demo_1', 'عبدالله الرشيدي', 'a.rashidi@demo.majal.test', '+965 6603 4412', 'فني إنتاج حلويات، شاركت في تجهيز طلبات رمضان لسلسلة محلية.', 2, 'SUBMITTED', 4),
    a('app_demo_3', 'job_demo_2', 'نوف المطيري', 'nouf@demo.majal.test', '+965 9901 2287', 'منسقة توصيل في تطبيق محلي، أعرف مناطق حولي والفروانية جيدًا.', 4, 'SUBMITTED', 3),
    a('app_demo_4', 'job_demo_2', 'يوسف الكندري', 'yousef.k@demo.majal.test', '+965 5087 6630', 'خبرة إدارة مناديب وتوزيع جداول.', 1, 'SUBMITTED', 1),
    a('app_demo_5', 'job_demo_4', 'مريم الشمري', 'mariam@demo.majal.test', '+965 6650 1178', 'خبّازة منزلية حوّلت هوايتها لمشروع صغير، أبحث عن خبرة في خط إنتاج.', 2, 'SUBMITTED', 5),
    a('app_demo_6', 'job_demo_6', 'سارة البلوشي', 'sara.b@demo.majal.test', '+965 9745 3319', 'مصممة جرافيك، صممت هويات لخمسة مشاريع أغذية منزلية.', 5, 'SHORTLISTED', 10),
    a('app_demo_7', 'job_demo_6', 'خالد العجمي', 'khaled@demo.majal.test', '+965 5561 0043', 'مصمم تغليف مستقل، أجيد التجهيز للطباعة.', 3, 'SUBMITTED', 6),
    a('app_demo_8', 'job_demo_5', 'حصة الفضلي', 'hessa@demo.majal.test', '+965 6012 8874', 'باريستا معتمدة، خبرة سنتين في مقهى مختص.', 2, 'HIRED', 11),
  ];
}

interface DemoEcosystemState {
  suppliers: SupplierProfile[];
  offerings: SupplierOffering[];
  jobs: KuwaitiJobPost[];
  applications: KuwaitiJobApplication[];
}

export function buildDemoEcosystem(): DemoEcosystemState {
  return { suppliers: seedSuppliers(), offerings: seedOfferings(), jobs: seedJobs(), applications: seedApplications() };
}

export const DEMO_ECOSYSTEM_STORAGE_KEY = 'majal_demo_ecosystem_v1';
const STORAGE_KEY = DEMO_ECOSYSTEM_STORAGE_KEY;

/* Kept in the same tab-scoped sessionStorage as the rest of the demo, so an
 * approval made as admin is still there when you switch to the supplier. */
function load(): DemoEcosystemState {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw) as DemoEcosystemState;
  } catch { /* fall through to a fresh seed */ }
  return buildDemoEcosystem();
}
function save(state: DemoEcosystemState) {
  try { if (typeof window !== 'undefined') window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* demo only */ }
}

let state: DemoEcosystemState | null = null;
const current = () => (state ??= load());
const commit = () => save(current());
const delay = <T>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(value)) as T), 120));

export interface DemoIdentity { id: string; accountType?: string; supplierId?: string; hostBusinessId?: string; name?: string; email?: string; phone?: string }

const employerOf = (who: DemoIdentity): { type: 'HOST' | 'SUPPLIER'; id: string } | null =>
  who.accountType === 'SUPPLIER' && who.supplierId ? { type: 'SUPPLIER', id: who.supplierId }
    : who.hostBusinessId ? { type: 'HOST', id: who.hostBusinessId } : null;

export const demoEcosystem = {
  publicView() {
    const s = current();
    const verified = s.suppliers.filter(x => x.verificationStatus === 'VERIFIED');
    const ids = new Set(verified.map(x => x.id));
    return delay({ suppliers: verified, offerings: s.offerings.filter(o => ids.has(o.supplierId) && o.status === 'ACTIVE'), jobs: s.jobs.filter(j => j.status === 'APPROVED') });
  },
  myView(who: DemoIdentity) {
    const s = current();
    const employer = employerOf(who);
    const supplier = employer?.type === 'SUPPLIER' ? s.suppliers.find(x => x.id === employer.id) ?? null : null;
    return delay({
      supplier,
      offerings: supplier ? s.offerings.filter(o => o.supplierId === supplier.id) : [],
      jobs: employer ? s.jobs.filter(j => j.employerType === employer.type && j.employerId === employer.id) : [],
    });
  },
  submitVerification(who: DemoIdentity, commercialRegistrationNo: string) {
    const supplier = current().suppliers.find(x => x.id === who.supplierId);
    if (!supplier) return Promise.reject(new Error('حساب المورد غير مربوط بملف مملوك له.'));
    Object.assign(supplier, { commercialRegistrationNo, verificationStatus: 'PENDING', adminNote: undefined, updatedAt: new Date().toISOString() });
    commit();
    return delay({ supplier });
  },
  createOffering(who: DemoIdentity, input: { name: string; category: string; description?: string; unit?: string; minOrderQty?: number; leadTimeDays?: number; priceFromFils?: number | null }) {
    if (!who.supplierId) return Promise.reject(new Error('حساب المورد غير مربوط بملف مملوك له.'));
    if (!input.name.trim() || !input.category.trim()) return Promise.reject(new Error('اسم المادة وفئتها مطلوبان.'));
    const now = new Date().toISOString();
    const offering: SupplierOffering = { id: `off_demo_${Date.now()}`, supplierId: who.supplierId, name: input.name.trim(), category: input.category.trim(), description: input.description?.trim() || '', unit: input.unit?.trim() || 'وحدة', minOrderQty: input.minOrderQty || 1, leadTimeDays: input.leadTimeDays || 0, priceFromFils: input.priceFromFils ?? null, status: 'ACTIVE', createdAt: now, updatedAt: now };
    current().offerings.unshift(offering); commit();
    return delay({ offering });
  },
  createJob(who: DemoIdentity, employerName: string, input: { title: string; department?: string; employmentType: string; location: string; description: string; requirements?: string[]; salaryMinFils?: number | null; salaryMaxFils?: number | null }) {
    const employer = employerOf(who);
    if (!employer) return Promise.reject(new Error('نشر الوظائف متاح للمنشآت والموردين فقط.'));
    const now = new Date().toISOString();
    const job: KuwaitiJobPost = { id: `job_demo_${Date.now()}`, employerType: employer.type, employerId: employer.id, employerName, title: input.title, department: input.department || '', employmentType: input.employmentType as KuwaitiJobPost['employmentType'], location: input.location, description: input.description, requirements: input.requirements || [], salaryMinFils: input.salaryMinFils ?? null, salaryMaxFils: input.salaryMaxFils ?? null, kuwaitiOnly: true, status: 'PENDING_REVIEW', reviewedAt: null, submittedAt: now, createdAt: now };
    current().jobs.unshift(job); commit();
    return delay({ job, message: 'أُرسل الإعلان للإدارة للمراجعة قبل النشر.' });
  },
  closeJob(id: string) {
    const job = current().jobs.find(j => j.id === id);
    if (job) { job.status = 'CLOSED'; commit(); }
    return delay({ id, status: 'CLOSED' as const });
  },
  applications(id: string) {
    const s = current();
    const job = s.jobs.find(j => j.id === id);
    if (!job) return Promise.reject(new Error('الإعلان غير موجود.'));
    return delay({ job, applications: s.applications.filter(a => a.jobId === id) });
  },
  apply(who: DemoIdentity, id: string, input: { summary?: string; yearsExperience?: number }) {
    const s = current();
    if (!s.jobs.some(j => j.id === id && j.status === 'APPROVED')) return Promise.reject(new Error('الإعلان لم يعد متاحًا.'));
    const now = new Date().toISOString();
    const application: KuwaitiJobApplication = { id: `app_demo_${Date.now()}`, jobId: id, fullName: who.name || 'متقدم تجريبي', email: who.email || 'visitor@demo.majal.test', phone: who.phone || '+965 5000 0000', summary: input.summary || '', yearsExperience: input.yearsExperience ?? 0, kuwaitiDeclaration: true, status: 'SUBMITTED', createdAt: now, updatedAt: now };
    s.applications.unshift(application); commit();
    return delay({ id: application.id, status: 'SUBMITTED', note: 'وصل طلبك إلى جهة التوظيف (بيئة العرض).' });
  },
  reviewQueue() {
    const s = current();
    return delay({ suppliers: s.suppliers.filter(x => x.verificationStatus === 'PENDING'), jobs: s.jobs.filter(j => j.status === 'PENDING_REVIEW') });
  },
  reviewSupplier(id: string, decision: 'VERIFIED' | 'NEEDS_ACTION' | 'SUSPENDED', adminNote = '') {
    const supplier = current().suppliers.find(x => x.id === id);
    if (!supplier) return Promise.reject(new Error('المورد غير موجود.'));
    Object.assign(supplier, { verificationStatus: decision, adminNote: adminNote || undefined, reviewedAt: new Date().toISOString() });
    commit();
    return delay({ supplier });
  },
  reviewJob(id: string, decision: 'APPROVED' | 'REJECTED', adminNote = '') {
    const job = current().jobs.find(j => j.id === id);
    if (!job) return Promise.reject(new Error('الإعلان غير موجود.'));
    Object.assign(job, { status: decision, adminNote: adminNote || undefined, reviewedAt: new Date().toISOString() });
    commit();
    return delay({ job });
  },
};
