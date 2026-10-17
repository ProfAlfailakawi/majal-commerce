/**
 * Demo showcase: businesses for sale and sponsor campaigns, kept in the tab's
 * sessionStorage like the rest of the demo so an approval made as admin is visible to the
 * public gate straight away. Every company, person and number here is invented.
 */
import type { AdCampaign, AdSlot, BusinessListing, DirectorySupplier, PublicAd } from '../types/majal';

export const DEMO_SHOWCASE_STORAGE_KEY = 'majal_demo_showcase_v2';

interface DemoShowcaseState { listings: BusinessListing[]; campaigns: AdCampaign[]; suppliers: DirectorySupplier[] }

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const dayFrom = (offset: number) => new Date(Date.now() + 3 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

export function buildDemoShowcase(): DemoShowcaseState {
  const l = (id: string, title: string, sector: BusinessListing['sector'], city: string, summary: string, highlights: string[], includes: string[], askingPriceKwd: number | null, revenueBand: string, yearsOperating: number | null, reason: string, status: BusinessListing['status'], age: number, contactPublic = true, adminNote?: string): BusinessListing => ({
    id, title, sector, city, summary, highlights, includes, askingPriceKwd, revenueBand, yearsOperating, reason, contactPublic,
    contactPhone: '+96550001234', sellerName: 'بائع تجريبي', status, submittedAt: ago(age), adminNote
  });
  const c = (id: string, company: string, headline: string, tagline: string, slot: AdSlot, accent: PublicAd['accent'], icon: string, status: AdCampaign['status'], impressions: number, clicks: number, startsOn: string | null = null, endsOn: string | null = null): AdCampaign => ({
    id, company, headline, tagline, slot, accent, icon, linkUrl: 'https://example.com/demo', status, startsOn, endsOn, createdAt: ago(10), impressions, clicks, contactPhone: '+96550002222'
  });
  const d = (id: string, name: string, category: DirectorySupplier['category'], region: string, description: string, products: string[], minOrder: string, delivers: boolean, status: DirectorySupplier['status'], age: number, contactPublic = true): DirectorySupplier => ({
    id, name, category, region, description, products, minOrder, delivers, contactPublic, contactPhone: '+96560001234', contactName: 'مسؤول تجريبي', status, submittedAt: ago(age)
  });
  return {
    suppliers: [
      d('sdir_demo_1', 'الندى للتغليف الغذائي', 'PACKAGING', 'الري', 'علب وأكياس وأغطية للأغذية بكميات صغيرة للمشاريع الناشئة وطباعة اسم المشروع.', ['علب كرتون', 'أكياس ورقية', 'أغطية'], '٢٠٠ قطعة', true, 'APPROVED', 5),
      d('sdir_demo_2', 'بهارات الديرة', 'SPICES', 'المباركية', 'بهارات مطحونة طازجة وخلطات كويتية جاهزة بشهادة مصدر لكل دفعة.', ['هيل', 'زعفران', 'خلطة مجبوس'], '١ كغ', true, 'APPROVED', 7),
      d('sdir_demo_3', 'مزرعة الوفرة', 'PRODUCE', 'الوفرة', 'خضار وأعشاب طازجة تُقطف يوم التوريد وتصل مبرّدة للمطابخ والمخابز.', ['أعشاب', 'خضار ورقية', 'طماطم'], '١٠ كغ', true, 'APPROVED', 9),
      d('sdir_demo_4', 'مطبعة الرقعي للملصقات', 'PRINTING', 'حولي', 'ملصقات منتجات وبطاقات شكر وقوائم بجودة عالية وتسليم سريع.', ['ملصقات', 'بطاقات', 'قوائم'], '١٠٠ قطعة', false, 'APPROVED', 11),
      d('sdir_demo_5', 'لحوم الخليج الطازجة', 'MEAT', 'الشويخ', 'دجاج ولحوم مبرّدة مرخّصة مع سلسلة تبريد موثقة وتقطيع حسب الطلب.', ['دجاج', 'لحم غنم', 'لحم بقر'], '٥ كغ', true, 'APPROVED', 14),
      d('sdir_demo_6', 'مخزن الطحين الأول', 'INGREDIENTS', 'الجهراء', 'طحين وسكر وسمن وزيوت بالجملة والتجزئة بأسعار ثابتة للمخابز.', ['طحين', 'سكر', 'سمن', 'زيت'], '٢٥ كغ', true, 'APPROVED', 16),
      d('sdir_demo_7', 'معدات المطبخ المركزي', 'EQUIPMENT', 'الشويخ الصناعية', 'أفران وعجانات وأدوات استانلس للمطابخ والمخابز مع صيانة.', ['أفران', 'عجانات', 'أدوات'], 'حسب الطلب', false, 'APPROVED', 20),
      d('sdir_demo_8', 'توصيلة للمطابخ', 'DELIVERY', 'الكويت', 'مناديب بسيارات مبرّدة لتوصيل طلبات المشاريع الغذائية في كل المناطق.', ['توصيل مبرّد', 'توصيل سريع'], 'توصيلة واحدة', true, 'APPROVED', 23),
      d('sdir_demo_9', 'ورق وعلب الرميثية', 'PACKAGING', 'الرميثية', 'علب هدايا وتغليف حلويات. بانتظار مراجعة الإدارة.', ['علب هدايا'], '٥٠ قطعة', false, 'PENDING_REVIEW', 1),
    ],
    listings: [
      l('biz_demo_1', 'مقهى مختص في حولي — جاهز للتشغيل', 'CAFE', 'حولي', 'مقهى بتصميم عصري وعقد إيجار ساري وقاعدة زبائن ثابتة، يشمل معدات التحميص والتحضير.', ['زبائن ثابتون', 'موقع على شارع رئيسي', 'فريق مدرّب'], ['معدات كاملة', 'العلامة التجارية', 'حسابات التواصل'], 38000, '٤–٦ آلاف د.ك شهريًا', 3, 'انتقال المالك للعمل خارج الكويت', 'APPROVED', 6),
      l('biz_demo_2', 'مطبخ سحابي للوجبات البيتية', 'CLOUD_KITCHEN', 'الفروانية', 'مطبخ توصيل فقط على ثلاث منصات، بوصفات معتمدة وتدفق طلبات يومي.', ['٣ منصات توصيل', 'وصفات موثقة', 'بلا إيجار صالة'], ['وصفات', 'حسابات المنصات', 'معدات المطبخ'], 22000, '٣–٤ آلاف د.ك شهريًا', 2, 'التفرغ لمشروع آخر', 'APPROVED', 9),
      l('biz_demo_3', 'مخبز حرفي بعلامة معروفة', 'BAKERY', 'السالمية', 'مخبز صغير بمنتجات صباحية مطلوبة وعقود توريد مع ثلاثة مقاهٍ.', ['عقود توريد', 'منتجات موسمية'], ['فرن ومعدات', 'العلامة التجارية', 'عقود التوريد'], 27500, '٥–٧ آلاف د.ك شهريًا', 5, 'تقاعد المؤسس', 'APPROVED', 12),
      l('biz_demo_4', 'متجر إلكتروني للهدايا والتغليف', 'ONLINE_STORE', 'الكويت', 'متجر على الإنترنت بمنتجات هدايا مخصصة وقائمة عملاء بريدية نشطة.', ['قائمة عملاء', 'مخزون جاهز'], ['الدومين والمتجر', 'المخزون', 'حسابات الإعلانات'], 9500, '٢ آلاف د.ك شهريًا', 2, 'قلة الوقت لإدارته', 'APPROVED', 15, false),
      l('biz_demo_5', 'صالون نسائي بعقد ممتد', 'SALON', 'الجهراء', 'صالون مجهز بالكامل بعقد إيجار حتى ٢٠٢٩ وقاعدة عميلات منتظمة.', ['عقد حتى ٢٠٢٩', 'مجهز بالكامل'], ['التجهيزات', 'قاعدة العميلات'], 18000, '٣ آلاف د.ك شهريًا', 4, 'سفر العائلة', 'APPROVED', 18),
      l('biz_demo_6', 'ورشة تصنيع صلصات وتتبيلات', 'PRODUCTION', 'الشويخ الصناعية', 'خط إنتاج صغير مرخّص لصلصات وتتبيلات يورّد لمطاعم محلية.', ['ترخيص ساري', 'عملاء مطاعم'], ['خط الإنتاج', 'التراخيص', 'وصفات'], 45000, '٧–٩ آلاف د.ك شهريًا', 6, 'توسّع يحتاج شريكًا', 'APPROVED', 21),
      l('biz_demo_7', 'كافيه صغير في السالمية', 'CAFE', 'السالمية', 'كافيه بمساحة جلوس خارجية وإيجار مناسب. بانتظار مراجعة الإدارة.', ['جلسة خارجية'], ['المعدات'], 15000, '', 1, 'تغيّر الاهتمامات', 'PENDING_REVIEW', 1),
    ],
    campaigns: [
      c('ad_demo_1', 'الخليج للتغليف', 'علب أنيقة لمنتجك الغذائي', 'تغليف مخصص بكميات صغيرة للمشاريع الناشئة', 'SPONSOR', 'gold', 'package', 'APPROVED', 4210, 188, dayFrom(-20), dayFrom(40)),
      c('ad_demo_2', 'دفعتي', 'اقبل الدفع الإلكتروني في دقائق', 'حلول دفع لأصحاب المشاريع الصغيرة', 'MARKET', 'sky', 'credit-card', 'APPROVED', 3120, 96, dayFrom(-12), dayFrom(30)),
      c('ad_demo_3', 'توصيلة', 'توصيل سريع لطلبات مشروعك', 'مناديب موثوقون في كل مناطق الكويت', 'MARKET', 'emerald', 'truck', 'APPROVED', 2740, 131, dayFrom(-8), dayFrom(50)),
      c('ad_demo_4', 'مطبعة الرقعي', 'ملصقات ومطبوعات بجودة عالية', 'ملصقات منتجات وبطاقات شكر', 'PORTAL', 'rose', 'printer', 'APPROVED', 1480, 52, dayFrom(-3), dayFrom(60)),
      c('ad_demo_5', 'بهارات المباركية', 'بهارات طازجة لمطبخك', 'هيل وزعفران بشهادة مصدر', 'PORTAL', 'violet', 'leaf', 'APPROVED', 1190, 47, dayFrom(-1), dayFrom(25)),
      c('ad_demo_6', 'ستوديو لقطة', 'تصوير منتجات يبيع', 'جلسات تصوير للمشاريع الغذائية', 'MARKET', 'gold', 'sparkles', 'PENDING_REVIEW', 0, 0),
    ],
  };
}

function load(): DemoShowcaseState {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(DEMO_SHOWCASE_STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw) as DemoShowcaseState;
  } catch { /* fresh seed */ }
  return buildDemoShowcase();
}
let state: DemoShowcaseState | null = null;
const current = () => (state ??= load());
const commit = () => { try { window.sessionStorage.setItem(DEMO_SHOWCASE_STORAGE_KEY, JSON.stringify(current())); } catch { /* demo only */ } };
const delay = <T>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(value)) as T), 100));
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const live = (ad: AdCampaign) => ad.status === 'APPROVED' && (!ad.startsOn || ad.startsOn <= today()) && (!ad.endsOn || ad.endsOn >= today());
export const SLOT_CAPACITY: Record<AdSlot, number> = { SPONSOR: 1, MARKET: 3, PORTAL: 3 };

export const demoShowcase = {
  businesses() {
    return delay({ listings: current().listings.filter(x => x.status === 'APPROVED').map(x => ({ ...x, sellerName: undefined, adminNote: undefined, contactPhone: x.contactPublic ? x.contactPhone : undefined })) });
  },
  submitBusiness(input: Partial<BusinessListing> & { sellerName: string; contactPhone: string }) {
    const at = new Date().toISOString();
    current().listings.unshift({
      id: `biz_demo_${Date.now()}`, title: input.title || '', sector: input.sector || 'OTHER', city: input.city || '', summary: input.summary || '',
      highlights: input.highlights || [], includes: input.includes || [], askingPriceKwd: input.askingPriceKwd ?? null, revenueBand: input.revenueBand || '',
      yearsOperating: input.yearsOperating ?? null, reason: input.reason || '', contactPublic: !!input.contactPublic, contactPhone: input.contactPhone,
      sellerName: input.sellerName, status: 'PENDING_REVIEW', submittedAt: at,
    });
    commit();
    return delay({ id: 'demo', message: 'وصل طلبك. لن يظهر للجمهور قبل مراجعة الإدارة، وهي خدمة مجانية.' });
  },
  serve(slot: AdSlot) {
    return delay({ ads: current().campaigns.filter(a => a.slot === slot && live(a)).slice(0, SLOT_CAPACITY[slot]).map(({ id, company, headline, tagline, slot: s, accent, icon }) => ({ id, company, headline, tagline, slot: s, accent, icon })) });
  },
  event(id: string, type: 'impression' | 'click') {
    const ad = current().campaigns.find(a => a.id === id);
    if (ad && live(ad)) { if (type === 'click') ad.clicks += 1; else ad.impressions += 1; commit(); }
  },
  requestAd(input: { company: string; headline: string; tagline?: string; linkUrl: string; contactPhone: string; slot?: AdSlot }) {
    current().campaigns.unshift({ id: `ad_demo_${Date.now()}`, company: input.company, headline: input.headline, tagline: input.tagline || '', slot: input.slot || 'MARKET', accent: 'gold', icon: 'megaphone', linkUrl: input.linkUrl, status: 'PENDING_REVIEW', startsOn: null, endsOn: null, createdAt: new Date().toISOString(), impressions: 0, clicks: 0, contactPhone: input.contactPhone });
    commit();
    return delay({ id: 'demo', reportToken: 'demo-report-token-not-real', message: 'وصل طلب الإعلان. لا يظهر قبل اعتماد الإدارة وتحديد المدة.' });
  },
  suppliers() {
    return delay({ suppliers: current().suppliers.filter(x => x.status === 'APPROVED').map(x => ({ ...x, contactName: undefined, adminNote: undefined, contactPhone: x.contactPublic ? x.contactPhone : undefined })) });
  },
  submitSupplier(input: Partial<DirectorySupplier> & { contactName: string; contactPhone: string }) {
    current().suppliers.unshift({
      id: `sdir_demo_${Date.now()}`, name: input.name || '', category: input.category || 'OTHER', region: input.region || '', description: input.description || '',
      products: input.products || [], minOrder: input.minOrder || '', delivers: !!input.delivers, contactPublic: !!input.contactPublic,
      contactPhone: input.contactPhone, contactName: input.contactName, status: 'PENDING_REVIEW', submittedAt: new Date().toISOString(),
    });
    commit();
    return delay({ id: 'demo', message: 'وصل طلبك. لن يظهر قبل مراجعة الإدارة، والتسجيل مجاني.' });
  },
  reviewSupplier(id: string, decision: 'APPROVED' | 'REJECTED', adminNote = '') {
    const row = current().suppliers.find(x => x.id === id);
    if (!row) return Promise.reject(new Error('المورد غير موجود.'));
    Object.assign(row, { status: decision, adminNote: adminNote || undefined }); commit();
    return delay({ supplier: row });
  },
  overview() {
    const s = current();
    const rank = (x: string) => (x === 'PENDING_REVIEW' ? 0 : x === 'APPROVED' ? 1 : 2);
    return delay({ suppliers: [...s.suppliers].sort((a, b) => rank(a.status) - rank(b.status)), listings: [...s.listings].sort((a, b) => rank(a.status) - rank(b.status)), campaigns: [...s.campaigns].sort((a, b) => rank(a.status) - rank(b.status)) });
  },
  reviewBusiness(id: string, decision: 'APPROVED' | 'REJECTED' | 'SOLD', adminNote = '') {
    const row = current().listings.find(x => x.id === id);
    if (!row) return Promise.reject(new Error('الإعلان غير موجود.'));
    Object.assign(row, { status: decision, adminNote: adminNote || undefined }); commit();
    return delay({ listing: row });
  },
  setCampaignStatus(id: string, status: 'APPROVED' | 'PAUSED' | 'REJECTED', dates: { startsOn?: string | null; endsOn?: string | null } = {}) {
    const s = current(); const ad = s.campaigns.find(x => x.id === id);
    if (!ad) return Promise.reject(new Error('الحملة غير موجودة.'));
    const startsOn = dates.startsOn === undefined ? ad.startsOn : dates.startsOn, endsOn = dates.endsOn === undefined ? ad.endsOn : dates.endsOn;
    if (status === 'APPROVED') {
      const clashes = s.campaigns.filter(o => o.id !== id && o.slot === ad.slot && o.status === 'APPROVED' && (!o.endsOn || !startsOn || o.endsOn >= startsOn) && (!endsOn || !o.startsOn || endsOn >= o.startsOn)).length;
      if (clashes >= SLOT_CAPACITY[ad.slot]) return Promise.reject(new Error(ad.slot === 'SPONSOR' ? 'موقع الراعي حصري وفيه حملة معتمدة في هذه الفترة.' : 'امتلأ هذا الموقع في الفترة المحددة.'));
    }
    Object.assign(ad, { status, startsOn, endsOn }); commit();
    return delay({ campaign: ad });
  },
};
