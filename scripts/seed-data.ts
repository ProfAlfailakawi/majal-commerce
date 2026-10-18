/**
 * Deterministic, idempotent development seed (NOT for production).
 *
 *   npm run seed:dev            # seeds MAJAL_DATABASE_PATH or ./var/majal.sqlite
 *   SEED_PASSWORD=... npm run seed:dev
 *
 * Creates ~1,200 users spread over every role (super admin, admin, consumers, creators,
 * suppliers, business owners and their staff) with proportionate related records: creator
 * profiles, organizations + branches + compliance docs, products, collaborations, offers,
 * launches + branch stock, orders + payments, accruals + settlements, reviews, follows,
 * waitlists, notifications, supplier catalogs, jobs, directory/listing/ad entries.
 *
 * Every id/email is derived from a fixed seed, so re-running never duplicates anything
 * (INSERT OR IGNORE keyed on deterministic ids). No demo mode / demo accounts are used.
 */
import { createHash } from 'node:crypto';
import { hashPassword } from '../server/auth';
import { openMajalDatabase, type MajalDatabase } from '../server/database';

if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
  throw new Error('seed-data refuses to run against production / PostgreSQL (NODE_ENV=production or DATABASE_URL set).');
}

export const SEED_EMAIL_DOMAIN = 'seed.majal.test';
const PASSWORD = process.env.SEED_PASSWORD || 'MajalSeed#2026-Test';
if (PASSWORD.length < 12) throw new Error('SEED_PASSWORD must be at least 12 characters.');

// ── deterministic PRNG ────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260926);
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;
const pad = (n: number, w = 5) => String(n).padStart(w, '0');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ── Arabic-realistic vocabulary ───────────────────────────────────────────────
const FIRST_M = ['محمد', 'أحمد', 'عبدالله', 'فهد', 'خالد', 'يوسف', 'سلمان', 'ناصر', 'بدر', 'مبارك', 'سعود', 'جاسم', 'حمد', 'عيسى', 'صالح', 'طلال', 'راشد', 'مشعل', 'عبدالعزيز', 'نواف'];
const FIRST_F = ['فاطمة', 'مريم', 'نورة', 'سارة', 'هند', 'دانة', 'لولوة', 'شيخة', 'أمل', 'ريم', 'عالية', 'جود', 'منيرة', 'بدرية', 'حصة', 'غادة', 'ليلى', 'دلال', 'أسرار', 'وفاء'];
const FAMILY = ['العتيبي', 'المطيري', 'الرشيدي', 'العجمي', 'الشمري', 'الهاجري', 'الكندري', 'الصباح', 'الفيلكاوي', 'العنزي', 'الدوسري', 'البلوشي', 'الخالدي', 'الغانم', 'الحمدان', 'السعيدي', 'القطان', 'الأنصاري', 'الزامل', 'المنصور'];
const AREAS = ['السالمية', 'حولي', 'الجابرية', 'الفروانية', 'الفحيحيل', 'مدينة الكويت', 'الأحمدي', 'الجهراء', 'صباح السالم', 'الرميثية', 'سلوى', 'القرين'];
const CATEGORIES = ['حلويات', 'صلصات', 'مخبوزات', 'وجبات', 'مشروبات', 'سناكات'];
const DISHES: Record<string, string[]> = {
  حلويات: ['كنافة بالقشطة', 'لقيمات بالدبس', 'كيك التمر', 'بسبوسة اللوز', 'ساغو بالحليب', 'حلاوة الراشي'],
  صلصات: ['صلصة طماطم مدخنة', 'مايونيز الثوم', 'صلصة الدقوس', 'صوص الكاري الأصفر', 'صلصة الفلفل الحار'],
  مخبوزات: ['خبز الرقاق', 'كعك الزعتر', 'خبز التنور', 'معجنات الجبن', 'كرواسون التمر'],
  وجبات: ['مجبوس دجاج', 'هريس', 'مطبق سمك', 'برياني لحم', 'مسقعة', 'ثريد'],
  مشروبات: ['شاي كرك بالزعفران', 'قهوة سعودية', 'عصير ليمون بالنعناع', 'لبن عيران'],
  سناكات: ['بطاطس مقرمشة بالبهارات', 'حمص مقرمش', 'جبس الشعير', 'مكسرات محمصة'],
};
const BUSINESS_PREFIX = ['مطبخ', 'مخبز', 'مطعم', 'كافيه', 'مصنع', 'بيت'];
const BUSINESS_NAME = ['الديرة', 'السدرة', 'البحر', 'الفنار', 'اللؤلؤ', 'الصبّار', 'القرقيعان', 'الجزيرة', 'النخيل', 'الشرق', 'دانة', 'الغوص', 'السيف', 'الكوت'];
const BUSINESS_TYPES = ['RESTAURANT', 'BAKERY', 'CENTRAL_KITCHEN', 'CAFE', 'FACTORY'];
const SUPPLIER_CATEGORIES = ['لحوم ودواجن', 'خضار وفواكه', 'أغلفة وتعبئة', 'بهارات وتوابل', 'ألبان وأجبان', 'معدات مطابخ', 'مواد جافة', 'مأكولات بحرية'];
const SUPPLIER_ITEMS = ['صدور دجاج طازجة', 'لحم غنم محلي', 'أرز بسمتي', 'زعفران إيراني', 'علب تعبئة كرتون', 'أكياس تفريغ', 'دقيق خاص بالمخبوزات', 'زبدة طبيعية', 'جبنة عكاوي', 'ربيان كويتي', 'هيل أخضر', 'طماطم محلية', 'عبوات زجاج', 'زيت زيتون'];
const REVIEW_COMMENTS = ['طعمه ممتاز والحجم مناسب للسعر', 'التوصيل تأخر شوي بس الطعم يستاهل', 'أفضل كنافة جربتها في الكويت', 'مرة حلو، بنكرر الطلب إن شاء الله', 'الطعم عادي ما توقعته كذا', 'تغليف ممتاز وطازج', 'كمية قليلة نسبياً', 'يستاهل كل فلس', '', 'ما وصلني الطلب كامل بس عوضوني', 'نكهة أصيلة تذكرني ببيت جدتي'];
const JOB_TITLES = ['طاهٍ مساعد', 'محاسب', 'مشرف مبيعات', 'مسؤول جودة الأغذية', 'منسق توصيل', 'مصمم محتوى', 'أخصائي مشتريات'];

const iso = (daysAgo: number, hour = 10) => {
  const d = new Date(Date.UTC(2026, 8, 20, hour, 0, 0)); // anchored for determinism
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
};

interface Counts { [k: string]: number }

export async function seed(db: MajalDatabase, options: { users?: number } = {}) {
  const counts: Counts = {};
  const bump = (k: string, n = 1) => { counts[k] = (counts[k] || 0) + n; };
  const target = Math.max(60, options.users ?? 1200);
  const { hash, salt } = await hashPassword(PASSWORD);

  const mix = {
    superAdmin: 2,
    admin: 8,
    creators: Math.round(target * 0.17),
    suppliers: Math.round(target * 0.12),
    owners: Math.round(target * 0.11),
    staff: Math.round(target * 0.12)
  };
  const consumers = target - (mix.superAdmin + mix.admin + mix.creators + mix.suppliers + mix.owners + mix.staff);

  let nameSeq = 0;
  const personName = () => { nameSeq++; return `${chance(0.5) ? pick(FIRST_M) : pick(FIRST_F)} ${pick(FAMILY)}`; };
  const phone = (n: number) => `+9655${String(1000000 + ((n * 7919) % 8999999))}`;
  const email = (kind: string, n: number) => `${kind}${pad(n, 4)}@${SEED_EMAIL_DOMAIN}`;
  const statusFor = (n: number) => (n % 53 === 0 ? 'SUSPENDED' : 'ACTIVE');

  const ids = {
    consumers: [] as string[],
    creators: [] as { user: string; profile: string; n: number }[],
    suppliers: [] as { user: string; profile: string }[],
    orgs: [] as { id: string; owner: string; branches: string[]; verified: boolean }[],
    staff: [] as string[]
  };

  await db.transaction(async tx => {
    const u = (id: string, name: string, em: string, n: number, role: string, o: { creator?: string; org?: string; supplier?: string; status?: string; daysAgo?: number } = {}) =>
      tx.prepare(`INSERT OR IGNORE INTO users(id,name,email,phone,role,status,creator_id,host_business_id,password_hash,password_salt,created_at,updated_at,account_type,supplier_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, name, em, phone(n), role, o.status || 'ACTIVE', o.creator ?? null, o.org ?? null, hash, salt, iso(o.daysAgo ?? int(1, 300)), iso(o.daysAgo ?? 1), o.supplier ? 'SUPPLIER' : 'STANDARD', o.supplier ?? null);

    for (let i = 1; i <= mix.superAdmin; i++) { await u(`usr_seed_sa_${pad(i, 3)}`, personName(), email('superadmin', i), i, 'SUPER_ADMIN', { daysAgo: 400 }); bump('users.SUPER_ADMIN'); }
    for (let i = 1; i <= mix.admin; i++) { await u(`usr_seed_ad_${pad(i, 3)}`, personName(), email('admin', i), 10 + i, 'ADMIN', { daysAgo: 380 }); bump('users.ADMIN'); }

    for (let i = 1; i <= consumers; i++) {
      const id = `usr_seed_co_${pad(i)}`;
      await u(id, personName(), email('client', i), 100 + i, 'CONSUMER', { status: statusFor(i) });
      ids.consumers.push(id); bump('users.CONSUMER');
      await tx.prepare('INSERT OR IGNORE INTO notification_preferences(user_id,in_app_enabled,email_enabled,push_enabled,timezone,digest_mode,updated_at) VALUES(?,1,?,0,?,?,?)')
        .run(id, i % 3 === 0 ? 1 : 0, 'Asia/Kuwait', 'SMART', iso(1));
    }

    for (let i = 1; i <= mix.creators; i++) {
      const id = `usr_seed_cr_${pad(i)}`, pid = `cr_seed_${pad(i)}`;
      const name = personName();
      await u(id, name, email('creator', i), 2000 + i, 'CREATOR', { creator: pid, status: statusFor(i) });
      const specialty = pick(CATEGORIES);
      await tx.prepare(`INSERT OR IGNORE INTO creator_profiles(id,user_id,display_name,specialty,completion_score,matching_enabled,created_at,updated_at,legal_name,creator_type,bio,region,badges_json,units_sold,repeat_purchase_rate,story,avatar_url)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(pid, id, name, specialty, int(20, 100), chance(0.8) ? 1 : 0, iso(int(5, 300)), iso(2), name, pick(['RECIPE_DEVELOPER', 'HOME_CHEF', 'CREATOR']),
          `مبدع متخصص في ${specialty} من ${pick(AREAS)}، أطوّر وصفات عائلية بلمسة عصرية.`, pick(AREAS), JSON.stringify(chance(0.3) ? ['VERIFIED'] : []), int(0, 900), Math.round(rnd() * 60) / 100, 'بدأت الطبخ في مطبخ البيت وصار شغفي أطلق منتجاتي الخاصة.', '');
      ids.creators.push({ user: id, profile: pid, n: i }); bump('users.CREATOR'); bump('creator_profiles');
    }

    for (let i = 1; i <= mix.suppliers; i++) {
      const id = `usr_seed_su_${pad(i)}`, pid = `sup_seed_${pad(i)}`;
      await u(id, personName(), email('supplier', i), 4000 + i, 'CONSUMER', { supplier: pid, status: statusFor(i) });
      const cat = pick(SUPPLIER_CATEGORIES);
      const status = pick(['VERIFIED', 'VERIFIED', 'VERIFIED', 'PENDING', 'UNVERIFIED', 'NEEDS_ACTION'] as const);
      await tx.prepare(`INSERT OR IGNORE INTO supplier_profiles(id,user_id,commercial_name,category,verification_status,commercial_registration_no,description,region,contact_phone,contact_email,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(pid, id, `شركة ${pick(BUSINESS_NAME)} ل${cat.split(' ')[0]} ${i}`, cat, status, `CR-${100000 + i}`, `مورد معتمد في مجال ${cat} يخدم المطاعم والمطابخ المركزية.`, pick(AREAS), phone(4000 + i), email('supplier', i), iso(int(10, 280)), iso(3));
      ids.suppliers.push({ user: id, profile: pid }); bump('users.SUPPLIER'); bump('supplier_profiles');
      for (let k = 0; k < int(2, 6); k++) {
        await tx.prepare(`INSERT OR IGNORE INTO supplier_offerings(id,supplier_id,name,category,description,unit,min_order_qty,lead_time_days,price_from_fils,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(`so_seed_${pad(i)}_${k}`, pid, pick(SUPPLIER_ITEMS), cat, 'جودة عالية وتوريد منتظم.', pick(['كجم', 'كرتون', 'لتر', 'حبة']), int(1, 50), int(0, 7), int(250, 45000), chance(0.9) ? 'ACTIVE' : 'PAUSED', iso(int(1, 200)), iso(1));
        bump('supplier_offerings');
      }
    }

    for (let i = 1; i <= mix.owners; i++) {
      const id = `usr_seed_ho_${pad(i)}`, org = `org_seed_${pad(i)}`;
      await u(id, personName(), email('owner', i), 6000 + i, 'HOST_OWNER', { org, status: statusFor(i) });
      const branchCount = int(1, 3);
      const branches = Array.from({ length: branchCount }, (_, b) => ({ id: `br_${pad(i)}_${b + 1}`, name: `فرع ${pick(AREAS)}`, area: pick(AREAS), isActive: true }));
      const verified = chance(0.7);
      const name = `${pick(BUSINESS_PREFIX)} ${pick(BUSINESS_NAME)} ${i}`;
      const caps = JSON.stringify({ equipment: ['فرن صناعي', 'ثلاجة تبريد'], cuisines: ['كويتية', 'خليجية'], dietary: ['حلال'], packaging: ['علب'], storage: ['مبرد'], batchCapacityMin: 20, batchCapacityMax: int(100, 800), serviceModels: ['PICKUP', 'DELIVERY'], priceBand: pick(['اقتصادي', 'متوسط', 'مميز']), leadTimeDays: int(1, 7) });
      await tx.prepare(`INSERT OR IGNORE INTO organizations(id,commercial_name,organization_type,verification_status,created_at,updated_at,business_type,commercial_registration_no,logo_url,brand_positioning,target_audience,branches_json,capabilities_json,contacts_json)
        VALUES(?,?,'HOST',?,?,?,?,?,?,?,?,?,?,?)`)
        .run(org, name, verified ? 'VERIFIED' : pick(['UNVERIFIED', 'PENDING', 'NEEDS_ACTION']), iso(int(10, 300)), iso(2), pick(BUSINESS_TYPES), `CR-${500000 + i}`, '', 'جودة عالية بأسعار عادلة', 'العائلات والموظفين', JSON.stringify(branches), caps, '[]');
      await tx.prepare("INSERT OR IGNORE INTO organization_memberships(organization_id,user_id,role,status,created_at) VALUES(?,?,'HOST_OWNER','ACTIVE',?)").run(org, id, iso(int(10, 300)));
      for (const doc of ['COMMERCIAL_LICENSE', 'HEALTH_PERMIT'] as const) {
        await tx.prepare('INSERT OR IGNORE INTO compliance_documents(organization_id,doc_type,reference,expires_at,verified,updated_by_user_id,updated_at) VALUES(?,?,?,?,?,?,?)')
          .run(org, doc, `${doc.slice(0, 3)}-${pad(i)}`, iso(-int(30, 700)), verified ? 1 : 0, id, iso(5));
        bump('compliance_documents');
      }
      ids.orgs.push({ id: org, owner: id, branches: branches.map(b => b.id), verified }); bump('users.HOST_OWNER'); bump('organizations');
    }

    const staffRoles = ['HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE', 'HOST_MARKETING', 'HOST_SUPPORT'] as const;
    for (let i = 1; i <= mix.staff; i++) {
      const org = ids.orgs[(i - 1) % ids.orgs.length];
      const role = staffRoles[i % staffRoles.length];
      const id = `usr_seed_hs_${pad(i)}`;
      await u(id, personName(), email('staff', i), 8000 + i, role, { org: org.id });
      await tx.prepare('INSERT OR IGNORE INTO organization_memberships(organization_id,user_id,role,status,created_at) VALUES(?,?,?,?,?)').run(org.id, id, role, 'ACTIVE', iso(int(1, 200)));
      ids.staff.push(id); bump(`users.${role}`);
    }
  });

  // ── products, collaborations, offers, launches, stock ───────────────────────
  const launches: { id: string; org: typeof ids.orgs[number]; creator: typeof ids.creators[number]; price: number; branches: string[]; status: string; collab: string; product: string }[] = [];
  const verifiedOrgs = ids.orgs.filter(o => o.verified);
  await db.transaction(async tx => {
    let pn = 0;
    for (const cr of ids.creators) {
      const productCount = chance(0.25) ? 0 : int(1, 4);
      for (let k = 0; k < productCount; k++) {
        pn++;
        const category = pick(CATEGORIES);
        const pid = `prd_seed_${pad(pn)}`;
        const live = chance(0.35) && verifiedOrgs.length > 0;
        const status = live ? 'LIVE_TRIAL' : pick(['DRAFT', 'SUBMITTED', 'SCREENING', 'AVAILABLE_FOR_MATCHING', 'IN_DISCUSSION', 'TESTING', 'COMMERCIAL_NEGOTIATION', 'PAUSED']);
        const price = int(8, 160) * 100;
        const dish = pick(DISHES[category]);
        await tx.prepare(`INSERT OR IGNORE INTO products(id,creator_id,public_name,category,short_description,status,estimated_unit_cost_fils,target_price_fils,is_secret_recipe,created_at,updated_at,internal_name,story,media_json,general_ingredients_json,allergens_json,dietary_tags_json,serving_size,shelf_life,prep_time_minutes,expected_equipment_json,accepts_exclusivity,desired_partnership_type)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(pid, cr.profile, `${dish} - دفعة ${pn}`, category, `${dish} بوصفة عائلية أصيلة وطعم لا يُنسى.`, status, Math.round(price * 0.45), price, 1, iso(int(5, 250)), iso(2), `INT-${pn}`, 'وصفة توارثناها في العائلة.', '[]', JSON.stringify(['طحين', 'سكر', 'سمن']), JSON.stringify(chance(0.4) ? ['غلوتين'] : []), JSON.stringify(['حلال']), '1 شخص', '3 أيام', int(10, 120), '[]', chance(0.2) ? 1 : 0, 'ROYALTY');
        bump('products');
        if (['IN_DISCUSSION', 'TESTING', 'COMMERCIAL_NEGOTIATION'].includes(status) || live) {
          const org = live ? pick(verifiedOrgs) : pick(ids.orgs);
          const cid = `col_seed_${pad(pn)}`;
          const stage = live ? 'LIVE_TRIAL' : status === 'COMMERCIAL_NEGOTIATION' ? 'OFFER_SENT' : status === 'TESTING' ? 'TASTING_COMPLETED' : 'INTEREST';
          await tx.prepare('INSERT OR IGNORE INTO collaborations(id,product_id,creator_id,organization_id,stage,version,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)')
            .run(cid, pid, cr.profile, org.id, stage, iso(int(5, 150)), iso(1)); bump('collaborations');
          if (live || stage === 'OFFER_SENT') {
            await tx.prepare(`INSERT OR IGNORE INTO offer_versions(id,collaboration_id,version_number,sender_user_id,selling_price_fils,creator_royalty_basis_points,platform_fee_basis_points,status,terms_json,created_at)
              VALUES(?,?,1,?,?,?,?,?,'{}',?)`).run(`off_seed_${pad(pn)}`, cid, org.owner, price, int(500, 2500), 1000, live ? 'ACCEPTED' : 'PENDING', iso(int(3, 100))); bump('offer_versions');
          }
          if (live) {
            const lid = `lch_seed_${pad(pn)}`;
            const lst = chance(0.1) ? 'PAUSED' : chance(0.15) ? 'PERMANENT' : 'LIVE';
            await tx.prepare('INSERT OR IGNORE INTO launches(id,collaboration_id,product_id,organization_id,status,quantity_cap,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
              .run(lid, cid, pid, org.id, lst, int(200, 2000), iso(int(2, 60)), null, iso(60), iso(1)); bump('launches');
            for (const br of org.branches) {
              const cap = int(40, 400);
              await tx.prepare('INSERT OR IGNORE INTO launch_branch_stock(launch_id,branch_id,capacity_units,reserved_units,alert_threshold_pct,manual_cutoff,updated_at) VALUES(?,?,?,0,80,0,?)').run(lid, br, cap, iso(1)); bump('launch_branch_stock');
            }
            launches.push({ id: lid, org, creator: cr, price, branches: org.branches, status: lst, collab: cid, product: pid });
          }
        }
      }
    }
  });

  // ── orders, payments, accruals, reviews, follows, waitlist ──────────────────
  await db.transaction(async tx => {
    let on = 0;
    const eligibleConsumers = ids.consumers;
    for (const l of launches) {
      const orderCount = int(10, 60);
      for (let k = 0; k < orderCount; k++) {
        on++;
        const buyer = pick(eligibleConsumers);
        const units = int(1, 4);
        const total = units * l.price;
        const status = pick(['PAID', 'PAID', 'FULFILLED', 'FULFILLED', 'FULFILLED', 'PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'] as const);
        const oid = `ord_seed_${pad(on, 6)}`, piId = `pi_seed_${pad(on, 6)}`;
        const created = iso(int(0, 55), int(8, 22));
        const branch = pick(l.branches);
        const hasPayment = status !== 'PENDING_PAYMENT' || chance(0.5);
        // Draw every remaining random value up-front so a re-run consumes the PRNG identically.
        const accStatus = status === 'FULFILLED' ? pick(['ELIGIBLE', 'ELIGIBLE', 'PENDING'] as const) : 'PENDING';
        const wantsReview = chance(0.45);
        const reviewVals = [int(2, 5), int(2, 5), int(2, 5), chance(0.8) ? 1 : 0, pick(REVIEW_COMMENTS), chance(0.04) ? 'HIDDEN' : 'PUBLISHED'] as const;
        if (hasPayment) {
          const piStatus = status === 'PENDING_PAYMENT' ? 'REDIRECT_REQUIRED' : status === 'CANCELLED' ? 'CANCELLED' : status === 'REFUNDED' ? 'REFUNDED' : 'PAID';
          await tx.prepare(`INSERT OR IGNORE INTO payment_intents(id,order_public_id,user_id,provider,amount_fils,currency,status,idempotency_key,provider_reference,checkout_url,failure_code,created_at,updated_at)
            VALUES(?,?,?,?,?,'KWD',?,?,?,?,NULL,?,?)`).run(piId, oid, buyer, 'MYFATOORAH', total, piStatus, `seed-idem-${on}`, piStatus === 'PAID' || piStatus === 'REFUNDED' ? `seed-ref-${on}` : null, null, created, created);
          bump('payment_intents');
        }
        const r = await tx.prepare(`INSERT OR IGNORE INTO orders(id,launch_id,consumer_user_id,payment_intent_id,units,unit_price_fils,total_fils,status,created_at,updated_at,branch_id,fulfillment_type,delivery_fee_fils,contact_phone,hold_expires_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,NULL)`).run(oid, l.id, buyer, hasPayment ? piId : null, units, l.price, total, status, created, created, branch, 'PICKUP', '+96555500000');
        if (!r.changes) continue;
        bump('orders');
        if (status === 'PAID' || status === 'FULFILLED' || status === 'PENDING_PAYMENT') {
          await tx.prepare('UPDATE launch_branch_stock SET reserved_units = MIN(capacity_units, reserved_units + ?) WHERE launch_id=? AND branch_id=?').run(units, l.id, branch);
        }
        if (status === 'FULFILLED' || status === 'PAID') {
          await tx.prepare('INSERT OR IGNORE INTO accruals(id,order_id,creator_id,amount_fils,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
            .run(`acc_seed_${pad(on, 6)}`, oid, l.creator.profile, Math.round(total * 0.15), accStatus, created, created); bump('accruals');
        }
        if (status === 'FULFILLED' && wantsReview) {
          await tx.prepare(`INSERT OR IGNORE INTO product_reviews(id,order_id,launch_id,product_id,reviewer_user_id,taste_rating,value_rating,portion_rating,keep_it_vote,comment,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`rev_seed_${pad(on, 6)}`, oid, l.id, l.product, buyer, ...reviewVals, created, created); bump('product_reviews');
        }
      }
      // waitlist + follows
      for (let k = 0; k < int(3, 15); k++) {
        const w = pick(ids.consumers);
        const res = await tx.prepare("INSERT OR IGNORE INTO drop_waitlist(id,launch_id,user_id,phone,whatsapp_opt_in,status,created_at,updated_at) VALUES(?,?,?,?,?,'WAITING',?,?)")
          .run(`wl_seed_${l.id}_${w}`, l.id, w, '+96555500001', chance(0.5) ? 1 : 0, iso(int(0, 30)), iso(1));
        if (res.changes) bump('drop_waitlist');
      }
    }
    for (const c of ids.creators) {
      for (let k = 0; k < int(0, 12); k++) {
        const res = await tx.prepare('INSERT OR IGNORE INTO creator_follows(user_id,creator_id,alerts_opt_in,created_at) VALUES(?,?,?,?)').run(pick(ids.consumers), c.profile, chance(0.7) ? 1 : 0, iso(int(0, 120)));
        if (res.changes) bump('creator_follows');
      }
    }
    // one approved settlement batch + one paid batch for a handful of creators
    let sn = 0;
    for (const c of ids.creators.slice(0, 40)) {
      const row = await tx.prepare("SELECT COALESCE(SUM(amount_fils),0) AS s, COUNT(*) AS n FROM accruals WHERE creator_id=? AND status='ELIGIBLE'").get<{ s: number; n: number }>(c.profile);
      if (!row || Number(row.n) < 2) continue;
      sn++;
      const batch = `stl_seed_${pad(sn)}`;
      const paid = sn % 2 === 0;
      const res = await tx.prepare('INSERT OR IGNORE INTO settlement_batches(id,creator_id,total_fils,status,provider_reference,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(batch, c.profile, Number(row.s), paid ? 'PAID' : 'APPROVED', paid ? `seed-payout-${sn}` : null, iso(3), iso(2));
      if (res.changes) {
        await tx.prepare("UPDATE accruals SET status=?, settlement_batch_id=?, updated_at=? WHERE creator_id=? AND status='ELIGIBLE'").run(paid ? 'PAID' : 'LOCKED', batch, iso(2), c.profile);
        bump('settlement_batches');
      }
    }
  });

  // ── notifications, jobs, directory, listings, ads ───────────────────────────
  await db.transaction(async tx => {
    const all = [...ids.consumers.slice(0, 300), ...ids.creators.map(c => c.user), ...ids.orgs.map(o => o.owner)];
    const titles: [string, string, string][] = [
      ['ORDER', 'تم استلام طلبك', 'طلبك قيد التجهيز وسنخبرك عند الجاهزية.'],
      ['LAUNCH', 'إطلاق جديد من مبدع تتابعه', 'منتج جديد متاح الآن لفترة محدودة.'],
      ['SETTLEMENT', 'مستحقاتك جاهزة', 'تمت إضافة مستحقات جديدة إلى رصيدك.'],
      ['SYSTEM', 'مرحبًا بك في مجال', 'أكمل ملفك الشخصي لتحصل على أفضل النتائج.']
    ];
    for (const [i, uid] of all.entries()) {
      const [cat, title, body] = titles[i % titles.length];
      await tx.prepare(`INSERT OR IGNORE INTO notification_inbox(id,user_id,category,priority,title,body,dedupe_key,occurrence_count,status,first_occurred_at,last_occurred_at)
        VALUES(?,?,?,?,?,?,?,1,?,?,?)`).run(`nt_seed_${pad(i, 6)}`, uid, cat, pick(['NOW', 'SOON', 'WATCH']), title, body, `seed:${i}`, i % 3 === 0 ? 'READ' : 'UNREAD', iso(int(0, 20)), iso(int(0, 10)));
    }
    counts.notifications = all.length;

    const approvedOrgs = ids.orgs.filter(o => o.verified).slice(0, 40);
    for (let i = 0; i < approvedOrgs.length; i++) {
      const o = approvedOrgs[i];
      const st = pick(['APPROVED', 'APPROVED', 'PENDING_REVIEW', 'REJECTED', 'CLOSED'] as const);
      const res = await tx.prepare(`INSERT OR IGNORE INTO job_posts(id,employer_type,employer_id,created_by_user_id,employer_name,title,department,employment_type,location,description,requirements_json,salary_min_fils,salary_max_fils,kuwaiti_only,status,admin_note,submitted_at,created_at,updated_at)
        VALUES(?,'HOST',?,?,?,?,?,?,?,?,?,?,?,1,?,'',?,?,?)`)
        .run(`job_seed_${pad(i, 4)}`, o.id, o.owner, `منشأة ${o.id}`, pick(JOB_TITLES), 'التشغيل', pick(['FULL_TIME', 'PART_TIME', 'CONTRACT']), pick(AREAS), 'نبحث عن موظف مجتهد للانضمام إلى فريقنا.', JSON.stringify(['خبرة سنتين', 'جنسية كويتية']), 350000, 600000, st, iso(10), iso(10), iso(2));
      if (res.changes) bump('job_posts');
      {
        if (st === 'APPROVED') for (let k = 0, n = int(0, 5); k < n; k++) {
          const app = ids.consumers[(i * 7 + k) % ids.consumers.length];
          const r2 = await tx.prepare(`INSERT OR IGNORE INTO job_applications(id,job_post_id,applicant_user_id,full_name,email,phone,summary,years_experience,kuwaiti_declaration,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`).run(`ja_seed_${pad(i, 4)}_${k}`, `job_seed_${pad(i, 4)}`, app, personName(), `applicant${i}${k}@${SEED_EMAIL_DOMAIN}`, '+96555500002', 'خبرة جيدة في المجال.', int(0, 12), pick(['SUBMITTED', 'SHORTLISTED', 'REJECTED']), iso(5), iso(4));
          if (r2.changes) bump('job_applications');
        }
      }
    }
    for (let i = 1; i <= 30; i++) {
      const res = await tx.prepare(`INSERT OR IGNORE INTO supplier_directory(id,name,category,region,description,products_json,min_order,delivers,contact_name,contact_phone,contact_public,status,admin_note,submitted_at,updated_at,report_token_hash)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'',?,?,?)`).run(`sd_seed_${pad(i, 3)}`, `مورّد ${pick(BUSINESS_NAME)} ${i}`, pick(SUPPLIER_CATEGORIES), pick(AREAS), 'نورد للمطاعم والمخابز بأسعار الجملة.', JSON.stringify(['منتج 1', 'منتج 2']), 'حد أدنى 20 كجم', chance(0.6) ? 1 : 0, personName(), '+96555500003', 1, pick(['APPROVED', 'APPROVED', 'PENDING_REVIEW', 'REJECTED']), iso(20), iso(5), sha(`sd${i}`));
      if (res.changes) bump('supplier_directory');
    }
    for (let i = 1; i <= 24; i++) {
      const res = await tx.prepare(`INSERT OR IGNORE INTO business_listings(id,title,sector,city,summary,highlights_json,includes_json,asking_price_kwd,revenue_band,years_operating,reason,seller_name,contact_phone,contact_public,status,admin_note,submitted_at,updated_at,report_token_hash)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,'',?,?,?)`).run(`bl_seed_${pad(i, 3)}`, `مطعم للبيع في ${pick(AREAS)}`, pick(['مطاعم', 'مخابز', 'كافيهات']), pick(AREAS), 'نشاط قائم بسجل تجاري ومعدات كاملة.', '[]', '[]', int(15, 120) * 1000, '10-25 ألف شهريًا', int(1, 12), 'التفرغ لمشروع آخر', personName(), '+96555500004', pick(['APPROVED', 'APPROVED', 'PENDING_REVIEW', 'REJECTED']), iso(15), iso(4), sha(`bl${i}`));
      if (res.changes) bump('business_listings');
    }
    for (let i = 1; i <= 16; i++) {
      const res = await tx.prepare(`INSERT OR IGNORE INTO ad_campaigns(id,company,headline,tagline,link_url,slot,contact_phone,status,starts_on,ends_on,admin_note,report_token_hash,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'',?,?,?)`).run(`ad_seed_${pad(i, 3)}`, `شركة ${pick(BUSINESS_NAME)}`, 'عرض خاص لأعضاء مجال', 'اطلب الآن واستمتع بخصم', 'https://example.com/offer', pick(['SPONSOR', 'MARKET', 'PORTAL']), '+96555500005', pick(['APPROVED', 'APPROVED', 'PENDING_REVIEW', 'PAUSED', 'REJECTED']), '2026-09-01', '2026-12-31', sha(`ad${i}`), iso(25), iso(5));
      if (res.changes) bump('ad_campaigns');
    }
  });

  const totalUsers = await db.prepare('SELECT COUNT(*) AS c FROM users').get<{ c: number | string }>();
  return { counts, totalUsers: Number(totalUsers?.c ?? 0), password: PASSWORD === 'MajalSeed#2026-Test' ? 'MajalSeed#2026-Test (default dev seed password)' : '(from SEED_PASSWORD)' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await openMajalDatabase();
  try {
    const summary = await seed(db, { users: Number(process.env.SEED_USERS) || 1200 });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await db.close();
  }
}
