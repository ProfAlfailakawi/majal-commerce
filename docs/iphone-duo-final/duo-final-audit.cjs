/*
 * iPhone Duo final audit for مجال — Playwright WebKit, presentation only.
 *
 * Server (one at a time; demo comes from a session flag and every /api call is intercepted in
 * the browser, so nothing reaches a real endpoint and no order or payment can be created):
 *   npm run build:client && npx vite preview --port 5180 --strictPort --host 127.0.0.1
 *   (or the dev server: DISABLE_HMR=true npx vite --port 5180 --strictPort --host 127.0.0.1)
 *
 * Full run (every screen x the ten pose sizes, then poses J and I on the same page):
 *   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *     node docs/iphone-duo-final/duo-final-audit.cjs --resize --with-ij --out /tmp/duo-audit \
 *       --vps 669x867,951x585,951x350,600x350,594x368,382x580,669x520,1280x800,390x844,844x390
 * Options: --screens id,id  --vps WxH,...  --no-shots  --only-live (detailed pose I)
 *          without --resize every size is a fresh page load (slower, same layout: CSS-only).
 *
 * Writes <out>/report.json (matrix, stress, liveAll) and JPEG screenshots for the review sizes.
 */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(name);
const BASE = arg('--base', 'http://127.0.0.1:5180');
const OUT = arg('--out', path.join(process.cwd(), 'duo-audit-out'));
fs.mkdirSync(OUT, { recursive: true });

// Poses A–H. I (live sequence) and J (stress) run separately.
const POSES = {
  A: ['382x580', '385x571', '320x568'],
  B: ['594x368'],
  C: ['669x867'],
  D: ['951x585'],
  E: ['951x350', '600x350'],
  F: ['669x520', '600x480'],
  G: ['768x1024', '1024x768', '1280x800', '1440x900'],
  H: ['360x640', '390x844', '844x390', '320x350', '320x600', '320x900', '470x350', '470x600', '470x900', '620x350', '620x600', '620x900']
};
const SHOT_VPS = ['669x867', '951x585', '951x350', '600x350', '594x368', '382x580', '669x520', '1280x800'];
const INNER = vp => vp === '669x867' || vp === '951x585' || vp === '669x520';
const SPINE = 32;

const ROLE = {
  CREATOR: 'مبدع', HOST: 'مالك منشأة', ADMIN: 'أدمن تشغيلي وامتثال', SUPER_ADMIN: 'سوبر أدمن المنصة', SUPPLIER: 'مورد', CONSUMER: 'عميل / جمهور'
};
const CHIP = { PUBLIC: 'عن مجال', SHOWCASE: 'مشاريع للبيع', DIRECTORY: 'دليل الموردين', CONSUMER: 'السوق' };

const click = async (p, sel, opts = {}) => { const l = p.locator(sel, opts).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: 4000 }); };
const tab = (name, nth = 0) => async p => { await p.locator('[role=tab]', { hasText: name }).nth(nth).click({ timeout: 4000 }); };
const btn = name => async p => { await click(p, `button:has-text("${name}")`); };

// Every screen reachable from the router (App.tsx surfaces, portal tabs, private links, legal
// pages) plus the dialogs, menus and states that sit on top of them.
const SCREENS = [
  { id: 'anon-landing', anon: true, path: '/' },
  { id: 'anon-auth-modal', anon: true, path: '/', act: async p => { await click(p, 'header button:has-text("دخول")'); } },
  { id: 'public', role: 'CONSUMER', surface: 'PUBLIC' },
  { id: 'onboarding-1', role: 'CONSUMER', onboarding: true },
  { id: 'onboarding-3', role: 'CONSUMER', onboarding: true, act: async p => { for (let i = 0; i < 2; i++) await click(p, '.majal-onb-bar button:has-text("التالي"), .majal-onb-bar button:has-text("متابعة")').catch(() => {}); } },
  { id: 'showcase', role: 'CONSUMER', surface: 'SHOWCASE' },
  { id: 'showcase-sell-form', role: 'CONSUMER', surface: 'SHOWCASE', act: btn('اعرض مشروعك للبيع') },
  { id: 'directory', role: 'CONSUMER', surface: 'DIRECTORY' },
  { id: 'directory-form', role: 'CONSUMER', surface: 'DIRECTORY', act: btn('سجّل مورّدًا') },
  { id: 'consumer', role: 'CONSUMER', surface: 'CONSUMER' },
  { id: 'consumer-order-dialog', role: 'CONSUMER', surface: 'CONSUMER', act: btn('اطلب التجربة') },
  { id: 'role-menu', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, 'button[aria-label="تبديل هوية العرض المحلية"]'); } },
  { id: 'notifications', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, 'button[aria-label^="فتح التنبيهات"]'); } },
  { id: 'command-palette', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, '.majal-guide button:has-text("بحث")'); } },
  { id: 'ai-drawer', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, 'button[aria-label="فتح مساعد مجال الذكي"]'); } },
  { id: 'creator-home', role: 'CREATOR' },
  { id: 'creator-radar', role: 'CREATOR', act: tab('رادار الفرص') },
  { id: 'creator-products', role: 'CREATOR', act: tab('منتجاتي') },
  { id: 'creator-deals', role: 'CREATOR', act: tab('تعاوناتي') },
  { id: 'creator-earnings', role: 'CREATOR', act: tab('مستحقاتي') },
  { id: 'creator-wizard', role: 'CREATOR', act: btn('تسجيل منتج جديد') },
  { id: 'creator-calculator', role: 'CREATOR', act: btn('حاسبة الاقتصاديات') },
  { id: 'host-overview', role: 'HOST' },
  { id: 'host-discovery', role: 'HOST', act: tab('اكتشاف المنتجات') },
  { id: 'host-challenges', role: 'HOST', act: tab('التحديات') },
  { id: 'host-lab', role: 'HOST', act: tab('المختبر والصفقة') },
  { id: 'host-warroom', role: 'HOST', act: tab('غرفة الإطلاق') },
  { id: 'host-finance', role: 'HOST', act: tab('المالية') },
  { id: 'host-team', role: 'HOST', act: tab('الفريق والصلاحيات') },
  { id: 'host-publisher', role: 'HOST', act: btn('نشر تحدي ابتكار') },
  { id: 'supplier-overview', role: 'SUPPLIER' },
  { id: 'supplier-supply', role: 'SUPPLIER', act: tab('التوريد') },
  { id: 'supplier-jobs', role: 'SUPPLIER', act: tab('التوظيف الكويتي') },
  { id: 'admin-overview', role: 'ADMIN' },
  { id: 'admin-approvals', role: 'ADMIN', act: tab('الاعتمادات') },
  { id: 'admin-approvals-ecosystem', role: 'ADMIN', act: async p => { await tab('الاعتمادات')(p); await tab('الموردون والوظائف')(p); } },
  { id: 'admin-approvals-directory', role: 'ADMIN', act: async p => { await tab('الاعتمادات')(p); await tab('دليل الموردين')(p); } },
  { id: 'admin-approvals-listings', role: 'ADMIN', act: async p => { await tab('الاعتمادات')(p); await tab('مشاريع للبيع')(p); } },
  { id: 'admin-approvals-campaigns', role: 'ADMIN', act: async p => { await tab('الاعتمادات')(p); await tab('حملات الشركات')(p); } },
  { id: 'admin-compliance', role: 'ADMIN', act: tab('الامتثال والمنشآت') },
  { id: 'admin-access', role: 'ADMIN', act: tab('أذونات الوصفات والعقود') },
  { id: 'admin-settlements', role: 'ADMIN', act: tab('التسويات') },
  { id: 'admin-risk', role: 'ADMIN', act: tab('الثقة والمخاطر') },
  { id: 'admin-audit', role: 'ADMIN', act: tab('سجل التدقيق') },
  { id: 'super-command', role: 'SUPER_ADMIN' },
  { id: 'super-permissions', role: 'SUPER_ADMIN', act: tab('الصلاحيات') },
  { id: 'super-liquidity', role: 'SUPER_ADMIN', act: tab('سيولة السوق') },
  { id: 'super-trust', role: 'SUPER_ADMIN', act: tab('الثقة والمخاطر') },
  { id: 'super-system', role: 'SUPER_ADMIN', act: tab('النظام') },
  { id: 'super-audit', role: 'SUPER_ADMIN', act: tab('سجل التدقيق') },
  { id: 'creator-recipe-vault', role: 'CREATOR', act: async p => { await tab('منتجاتي')(p); await btn('فتح خزنة الوصفة')(p); } },
  { id: 'host-contract', role: 'HOST', act: async p => { await tab('المختبر والصفقة')(p); await btn('فتح العقد التجاري')(p); } },
  { id: 'host-job-composer', role: 'HOST', act: btn('إعلان جديد') },
  { id: 'supplier-job-composer', role: 'SUPPLIER', act: btn('إعلان وظيفة كويتية') },
  { id: 'supplier-job-applications', role: 'SUPPLIER', act: async p => { await tab('التوظيف الكويتي')(p); await btn('طلبات التوظيف')(p); } },
  { id: 'showcase-listing-detail', role: 'CONSUMER', surface: 'SHOWCASE', act: btn('التفاصيل والتواصل') },
  { id: 'showcase-ad-form', role: 'CONSUMER', surface: 'SHOWCASE', act: btn('اطلب مساحة إعلانية') },
  { id: 'consumer-job-dialog', role: 'CONSUMER', surface: 'CONSUMER', act: btn('عرض والتقديم') },
  { id: 'directory-empty', role: 'CONSUMER', surface: 'DIRECTORY', act: async p => { await p.locator('main input').first().fill('لا يوجد مورد بهذا الاسم'); } },
  { id: 'legal-terms', role: 'CONSUMER', path: '/terms' },
  { id: 'legal-privacy', role: 'CONSUMER', path: '/privacy' },
  { id: 'legal-refund', role: 'CONSUMER', path: '/refund' },
  { id: 'legal-compliance', role: 'CONSUMER', path: '/compliance' },
  { id: 'payment-return-error', role: 'CONSUMER', path: '/payment/return?order=demo-missing' },
  { id: 'gate-report', role: 'CONSUMER', path: '/?my-report=demo-token' },
  { id: 'gate-report-error', anon: true, path: '/?my-report=invalid-token' },
  { id: 'ad-report-error', role: 'CONSUMER', path: '/?ad-report=invalid-token' },
  { id: 'partner-kit', role: 'CONSUMER', path: '/?partners=demo-token' },
  { id: 'partner-kit-error', anon: true, path: '/?partners=invalid-token' },
  { id: 'invite-error', role: 'CONSUMER', path: '/?invite=invalid-token' },
  { id: 'loading-fallback', anon: true, path: '/?my-report=slow-token', slow: true }
];

async function newContext(browser, vp, opts = {}) {
  const [width, height] = vp.split('x').map(Number);
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, locale: 'ar', serviceWorkers: 'block',
    colorScheme: opts.dark ? 'dark' : 'light', reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference'
  });
  await ctx.addInitScript(({ anon, onboarding, dark }) => {
    try {
      if (!onboarding) localStorage.setItem('majal_onboarding_v1', JSON.stringify({ completedAt: '2026-11-14T00:00:00Z', skipped: true }));
      else localStorage.removeItem('majal_onboarding_v1');
      if (dark) localStorage.setItem('majal-theme', 'dark');
      sessionStorage.setItem('majal_overture_seen', '1');
      // The branded splash holds the first ~1.2s by design; the audit measures the app under it.
      document.addEventListener('DOMContentLoaded', () => document.getElementById('majal-splash')?.remove(), { once: true });
      if (!anon) {
        sessionStorage.setItem('majal_demo_active_v1', 'true');
        sessionStorage.setItem('majal_demo_sandbox_id_v1', 'demo_' + 'a'.repeat(64));
      }
    } catch (e) { /* storage blocked */ }
  }, { anon: !!opts.anon, onboarding: !!opts.onboarding, dark: !!opts.dark });
  // No request leaves the browser: every API call gets a canned answer (401 for the session probe,
  // 404 elsewhere). The slow token keeps the private-report page in its loading state.
  await ctx.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('slow-token')) { await new Promise(r => setTimeout(r, 15000)); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' }).catch(() => {}); }
    const status = /auth\/(me|session)/.test(url) ? 401 : 404;
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'غير متاح في وضع الفحص' }) });
  });
  return ctx;
}

const DEBUG = !!process.env.AUDIT_DEBUG;
async function reach(p, s) {
  let t0 = Date.now(); const lap = m => { if (DEBUG) { console.log('  ', m, Date.now() - t0); t0 = Date.now(); } };
  await p.goto(BASE + (s.path || '/'), { waitUntil: s.slow ? 'domcontentloaded' : 'networkidle', timeout: 45000 });
  lap('goto');
  await p.waitForFunction(() => !document.getElementById('majal-splash'), null, { timeout: 15000 }).catch(() => {});
  lap('splash');
  await p.waitForTimeout(s.slow ? 1500 : 400);
  if (s.anon || s.onboarding || s.slow) { if (s.act) { await s.act(p); await p.waitForTimeout(700); } return; }
  if (s.role && !s.path) {
    const current = await p.locator('button[aria-label="تبديل هوية العرض المحلية"]').innerText().catch(() => '');
    if (!current.includes(ROLE[s.role]) || s.role === 'SUPPLIER') {
      await click(p, 'button[aria-label="تبديل هوية العرض المحلية"]');
      await p.locator('[role=menuitem]').filter({ has: p.locator('span', { hasText: new RegExp('^' + ROLE[s.role]) }) }).first().click({ timeout: 4000 });
      await p.waitForTimeout(700);
    }
  }
  lap('role');
  if (s.surface) {
    const sel = `[aria-label="أقسام المنصة"] button:has-text("${CHIP[s.surface]}"), nav[aria-label="التنقل الرئيسي"] button:has-text("${CHIP[s.surface]}")`;
    const chips = p.locator(sel);
    const n = await chips.count();
    for (let i = 0; i < n; i++) if (await chips.nth(i).isVisible()) { await chips.nth(i).click(); break; }
    await p.waitForTimeout(800);
  }
  lap('surface');
  await p.evaluate(() => window.scrollTo(0, 0));
  await settle(p);
  lap('settle');
  if (s.act) { await s.act(p); await p.waitForTimeout(800); await settle(p); }
}

// Lazy surfaces show a skeleton first; measure the real screen, not the placeholder.
async function settle(p) {
  await p.waitForFunction(() => ![...document.querySelectorAll('main [role=status][data-fade]')].some(e => e.textContent.includes('جاري تحميل مساحة العمل')), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(250);
}

// Measures the whole document, not only the first screen.
async function measure(p, inner) {
  return p.evaluate(({ inner, SPINE }) => {
    const vw = document.documentElement.clientWidth;
    const doc = document.scrollingElement;
    const styles = new Map();
    const getComputedStyle = el => { let cs = styles.get(el); if (!cs) { cs = window.getComputedStyle(el); styles.set(el, cs); } return cs; };
    const visCache = new Map();
    const visible = el => {
      if (visCache.has(el)) return visCache.get(el);
      const v = visible0(el); visCache.set(el, v); return v;
    };
    const visible0 = el => {
      if (!el.getClientRects().length) return false;
      if (el.closest('[aria-hidden="true"], .sr-only, [inert]')) return false;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      return true;
    };
    const inHScroller = el => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden' || cs.overflowX === 'clip') && a.scrollWidth > a.clientWidth + 1) return true;
      }
      return false;
    };
    const describe = el => {
      const t = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} «${t}»`;
    };
    const interactive = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=menuitem], summary')].filter(visible);
    const offscreen = [];
    const smallTargets = [];
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !inHScroller(el)) offscreen.push(describe(el));
      const inlineLink = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      if (!inlineLink && (r.width < 44 || r.height < 44) && r.width > 2 && r.height > 2) smallTargets.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const headings = [...document.querySelectorAll('h1, h2, h3')].filter(visible);
    const clippedHeadings = headings.filter(h => h.scrollWidth > h.clientWidth + 2 && getComputedStyle(h).overflowX !== 'visible').map(describe);
    const spine = [];
    if (inner) {
      const cx = window.innerWidth / 2;
      const lo = cx - SPINE / 2, hi = cx + SPINE / 2;
      const hits = new Set();
      // Text cut off by an overflow ancestor (ellipsis, line clamp) is not painted there.
      const clipCache = new Map();
      const clipX = el => {
        if (clipCache.has(el)) return clipCache.get(el);
        let l = -Infinity, r = Infinity;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowX !== 'visible') { const b = a.getBoundingClientRect(); l = Math.max(l, b.left); r = Math.min(r, b.right); }
        }
        clipCache.set(el, [l, r]);
        return [l, r];
      };
      for (const el of interactive) {
        if (el.closest('.majal-spine-ok')) continue;
        for (const r of el.getClientRects()) if (r.width > 0 && r.left < hi && r.right > lo) { hits.add(el); break; }
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const el = n.parentElement;
        if (!el || hits.has(el) || !visible(el) || el.closest('.majal-spine-ok')) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        const clip = clipX(el);
        for (const r of range.getClientRects()) {
          const left = Math.max(r.left, clip[0]), right = Math.min(r.right, clip[1]);
          if (r.width > 0 && r.height > 0 && right > left && left < hi && right > lo) { hits.add(el); break; }
        }
      }
      for (const el of document.querySelectorAll('td, th')) if (visible(el) && el.textContent.trim()) { const r = el.getBoundingClientRect(); const c = clipX(el); const l = Math.max(r.left, c[0]), rr = Math.min(r.right, c[1]); if (rr > l && l < hi && rr > lo) hits.add(el); }
      for (const el of hits) spine.push(describe(el));
    }
    return {
      scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflowX: doc.scrollWidth > doc.clientWidth ? doc.scrollWidth - doc.clientWidth : 0,
      offscreen, smallTargets: smallTargets.length, smallTargetSamples: smallTargets.slice(0, 8), clippedHeadings, spineHits: spine.length, spineSamples: spine.slice(0, 12),
      pageHeight: doc.scrollHeight
    };
  }, { inner, SPINE });
}

async function runMatrix(browser, screens, vps, shots, report) {
  for (const vp of vps) {
    for (const s of screens) {
      const ctx = await newContext(browser, vp, { anon: s.anon, onboarding: s.onboarding });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
      let result;
      try {
        await reach(p, s);
        result = await measure(p, INNER(vp));
        if (shots && SHOT_VPS.includes(vp)) {
          await p.screenshot({ path: path.join(OUT, `${s.id}_${vp}.jpg`), type: 'jpeg', quality: 62 });
        }
      } catch (e) {
        result = { error: String(e.message).split('\n')[0].slice(0, 200) };
      }
      result.pageErrors = errors;
      report.matrix.push({ screen: s.id, vp, ...result });
      const r = result;
      process.stdout.write(`${s.id} ${vp} ${r.error ? 'ERROR ' + r.error : `ox=${r.overflowX} off=${r.offscreen.length} spine=${r.spineHits} small=${r.smallTargets}`}\n`);
      await ctx.close();
    }
  }
}

// Faster matrix: reach each screen once (at 951x585), then measure every pose by resizing the
// same page. Layout here is CSS-only (no viewport reads in JS), so a resize lands on the same
// layout a fresh load at that size would; the live-sequence pass (pose I) relies on the same fact.
async function runResizeMatrix(browser, screens, vps, shots, report) {
  for (const s of screens) {
    const ctx = await newContext(browser, '951x585', { anon: s.anon, onboarding: s.onboarding });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
    let reached = true;
    try { await reach(p, s); } catch (e) { reached = String(e.message).split('\n')[0].slice(0, 200); }
    for (const vp of vps) {
      let result;
      if (reached !== true) result = { error: reached };
      else try {
        const [w, h] = vp.split('x').map(Number);
        await p.setViewportSize({ width: w, height: h });
        await p.waitForTimeout(350);
        // Spread: the task starts at the top of the right leaf. Single column: bring the
        // selected section into view so the evidence shows the screen, not only the hero.
        await p.evaluate(tabbed => {
          const spread = document.querySelector('.majal-spread');
          const isSpread = spread && getComputedStyle(spread).display === 'grid';
          const sel = document.querySelector('main [role=tab][aria-selected="true"]');
          if (!isSpread && tabbed && sel) sel.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
        }, !!(s.act && !s.surface));
        await p.waitForTimeout(150);
        result = await measure(p, INNER(vp));
        if (shots && SHOT_VPS.includes(vp)) await p.screenshot({ path: path.join(OUT, `${s.id}_${vp}.jpg`), type: 'jpeg', quality: 62 });
      } catch (e) { result = { error: String(e.message).split('\n')[0].slice(0, 200) }; }
      result.pageErrors = errors.slice();
      report.matrix.push({ screen: s.id, vp, ...result });
      process.stdout.write(`${s.id} ${vp} ${result.error ? 'ERROR ' + result.error : `ox=${result.overflowX} off=${result.offscreen.length} spine=${result.spineHits} small=${result.smallTargets}`}\n`);
    }
    if (reached === true && flag('--with-ij')) await stressAndLive(p, s, report);
    await ctx.close();
  }
}

// Pose J on the same page (theme, text size, insets and motion are applied the way the app
// itself applies them), then pose I: the fold/unfold sequence with a typed value.
async function stressAndLive(p, s, report) {
  report.stress = report.stress || []; report.liveAll = report.liveAll || [];
  const size = async vp => { const [w, h] = vp.split('x').map(Number); await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(300); };
  const J = async (variant, vp, prep, undo, extra) => {
    let r;
    try {
      await size(vp); await prep(); await p.waitForTimeout(250);
      r = await measure(p, false);
      if (extra) Object.assign(r, await extra());
      if (['public', 'creator-home', 'admin-overview', 'host-overview', 'consumer', 'legal-terms'].includes(s.id)) await p.screenshot({ path: path.join(OUT, `J-${variant}_${s.id}_${vp}.jpg`), type: 'jpeg', quality: 55 });
      await undo();
    } catch (e) { r = { error: String(e.message).split('\n')[0].slice(0, 200) }; }
    report.stress.push({ variant, screen: s.id, vp, ...r });
    process.stdout.write(`J ${variant} ${s.id} ${vp} ${r.error ? 'ERROR ' + r.error : `ox=${r.overflowX} off=${r.offscreen.length}${'focusedInView' in r ? ' focus=' + r.focusedInView : ''}`}\n`);
  };
  const style = css => p.evaluate(css => { const el = document.createElement('style'); el.id = 'duo-j'; el.textContent = css; document.head.append(el); }, css);
  const unstyle = () => p.evaluate(() => document.getElementById('duo-j')?.remove());
  await J('text200', '669x867', () => style('html{font-size:200% !important}'), unstyle);
  await J('text200', '382x580', () => style('html{font-size:200% !important}'), unstyle);
  await J('dark', '951x585', () => p.evaluate(() => { window.__theme = document.documentElement.getAttribute('data-theme'); document.documentElement.removeAttribute('data-theme'); }), () => p.evaluate(() => { if (window.__theme) document.documentElement.setAttribute('data-theme', window.__theme); }));
  await J('dark', '669x867', () => p.evaluate(() => { window.__theme = document.documentElement.getAttribute('data-theme'); document.documentElement.removeAttribute('data-theme'); }), () => p.evaluate(() => { if (window.__theme) document.documentElement.setAttribute('data-theme', window.__theme); }));
  await J('reduced-motion', '669x867', () => p.emulateMedia({ reducedMotion: 'reduce' }), () => p.emulateMedia({ reducedMotion: 'no-preference' }));
  await J('insets', '594x368', () => style('.majal-shell{padding-left:47px!important;padding-right:0!important}'), unstyle);
  await J('keyboard', '951x350', async () => {
    const input = p.locator('main input:not([type=checkbox]):not([type=radio]):visible, main textarea:visible, [role=dialog] input:not([type=checkbox]):not([type=radio]):visible, .majal-onb input:visible').first();
    if (await input.count()) { await input.scrollIntoViewIfNeeded(); await input.focus(); }
  }, async () => p.evaluate(() => document.activeElement?.blur?.()), () => p.evaluate(() => {
    const a = document.activeElement; if (!a || !a.matches('input, textarea, select')) return { focusedInView: null };
    // A dialog sits above the dock, so only page fields can be covered by it.
    const b = a.getBoundingClientRect(); const dock = document.querySelector('.majal-section-rail'); const dt = dock && !a.closest('.fixed.inset-0') && getComputedStyle(dock).position === 'fixed' ? dock.getBoundingClientRect().top : window.innerHeight;
    return { focusedInView: b.top >= 0 && b.bottom <= dt };
  }));
  // Pose I.
  const seq = ['951x585', '669x867', '470x700', '382x580', '594x368', '951x350', '951x585'];
  let row;
  try {
    await size('951x585');
    const typed = p.locator('main input:not([type=checkbox]):not([type=radio]):not([type=number]):visible, [role=dialog] input:not([type=checkbox]):not([type=radio]):not([type=number]):visible').first();
    const hasInput = await typed.count();
    if (hasInput) await typed.fill('اختبار').catch(() => {});
    await p.evaluate(() => window.scrollTo(0, 300));
    const sig = () => p.evaluate(() => ({
      tab: [...document.querySelectorAll('[role=tab][aria-selected="true"]')].map(t => t.textContent.trim()).join('|'),
      dialog: document.querySelectorAll('[role=dialog], .fixed.inset-0, .majal-onb, [role=menu]').length,
      value: [...document.querySelectorAll('input')].some(i => i.value === 'اختبار'),
      h1: (document.querySelector('[role=dialog] h2, [role=dialog] h3, .majal-onb h2, main h1') || {}).textContent?.trim().slice(0, 30) || null
    }));
    const first = await sig();
    const steps = [];
    for (const vp of seq) {
      await size(vp);
      const now = await sig();
      const ox = await p.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
      steps.push({ vp, ox, same: JSON.stringify(now) === JSON.stringify(first) });
    }
    row = { screen: s.id, first, hasInput: !!hasInput, steps, pass: steps.every(x => x.same && x.ox === 0) };
  } catch (e) { row = { screen: s.id, error: String(e.message).split('\n')[0].slice(0, 200) }; }
  report.liveAll.push(row);
  process.stdout.write(`I ${s.id} ${row.error ? 'ERROR ' + row.error : row.pass ? 'PASS' : 'FAIL ' + JSON.stringify(row.steps.filter(x => !x.same || x.ox))}\n`);
}

// Pose I: one page, no reload, state checked after every step.
async function runLive(browser, report) {
  const seq = ['951x585', '669x867', '470x700', '382x580', '594x368', '951x350', '951x585'];
  const ctx = await newContext(browser, seq[0], {});
  const p = await ctx.newPage();
  // Phase 1: supplier directory — typed search, a selected category chip, a scroll position.
  await reach(p, { id: 'live', role: 'CONSUMER', surface: 'DIRECTORY' });
  const field = p.locator('main input[type="search"], main input').first();
  const hasField = await field.count();
  if (hasField) await field.fill('تغليف');
  const chip = p.locator('[aria-label="تصفية حسب الفئة"] button').nth(1);
  if (await chip.count()) await chip.click();
  await p.evaluate(() => window.scrollTo(0, 400));
  await p.waitForTimeout(300);
  const anchor = await p.evaluate(() => { const els = [...document.querySelectorAll('main h2, main h3, main article')]; const e = els.find(x => x.getBoundingClientRect().top > 0); return e ? e.textContent.trim().slice(0, 30) : null; });
  const steps = [];
  for (const vp of seq) {
    const [w, h] = vp.split('x').map(Number);
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    const st = await p.evaluate(() => ({
      scrollY: Math.round(window.scrollY),
      typed: document.querySelector('main input')?.value ?? null,
      selectedChip: document.querySelector('[aria-label="تصفية حسب الفئة"] [aria-pressed="true"]')?.textContent?.trim() ?? null,
      overflowX: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth
    }));
    steps.push({ vp, ...st });
  }
  // Phase 2: a portal tab stays selected and a dialog stays open with its value.
  await p.setViewportSize({ width: 951, height: 585 });
  await reach(p, { id: 'live2', role: 'CREATOR', act: tab('تعاوناتي') });
  // Dialog survives the sequence too.
  await p.evaluate(() => window.scrollTo(0, 0));
  await btn('حاسبة الاقتصاديات')(p);
  await p.locator('[role=dialog] input, .fixed.inset-0 input').first().fill('7').catch(() => {});
  const dialogSteps = [];
  for (const vp of seq) {
    const [w, h] = vp.split('x').map(Number);
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(400);
    dialogSteps.push({ vp, activeTab: await p.evaluate(() => document.querySelector('[role=tab][aria-selected="true"]')?.textContent?.trim() || null), dialogOpen: await p.locator('.fixed.inset-0').first().isVisible().catch(() => false), value: await p.locator('[role=dialog] input, .fixed.inset-0 input').first().inputValue().catch(() => null) });
  }
  report.live = { steps, dialogSteps, hasField: !!hasField, anchor };
  console.log('live', JSON.stringify(report.live));
  await ctx.close();
}

// Pose I for every screen: reach it once, then fold/unfold through the sequence without a
// reload. The screen's signature (selected tab, open dialog, field values, scroll) must hold.
async function runLiveAll(browser, screens, report) {
  const seq = ['951x585', '669x867', '470x700', '382x580', '594x368', '951x350', '951x585'];
  const out = [];
  for (const s of screens) {
    const ctx = await newContext(browser, seq[0], { anon: s.anon, onboarding: s.onboarding });
    const p = await ctx.newPage();
    let row;
    try {
      await reach(p, s);
      const typed = p.locator('main input:not([type=checkbox]):not([type=radio]):not([type=number]):visible, [role=dialog] input:not([type=checkbox]):not([type=radio]):not([type=number]):visible').first();
      const hasInput = await typed.count();
      if (hasInput) await typed.fill('اختبار').catch(() => {});
      await p.evaluate(() => { const d = document.querySelector('.fixed.inset-0 .overflow-y-auto, [role=dialog].overflow-y-auto'); if (!d) window.scrollTo(0, 300); });
      const sig = () => p.evaluate(() => ({
        tab: [...document.querySelectorAll('[role=tab][aria-selected="true"]')].map(t => t.textContent.trim()).join('|'),
        dialog: document.querySelectorAll('[role=dialog], .fixed.inset-0, .majal-onb, [role=menu]').length,
        value: document.activeElement && 'value' in document.activeElement ? document.activeElement.value : [...document.querySelectorAll('input')].map(i => i.value).find(v => v === 'اختبار') || null,
        h1: (document.querySelector('main h1, .majal-onb h2, [role=dialog] h2, [role=dialog] h3') || {}).textContent?.trim().slice(0, 30) || null,
        scrolled: window.scrollY > 0
      }));
      const first = await sig();
      const steps = [];
      for (const vp of seq) {
        const [w, h] = vp.split('x').map(Number);
        await p.setViewportSize({ width: w, height: h });
        await p.waitForTimeout(350);
        const now = await sig();
        const ox = await p.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
        steps.push({ vp, ox, same: now.tab === first.tab && now.dialog === first.dialog && now.value === first.value && now.h1 === first.h1 });
      }
      row = { screen: s.id, first, hasInput: !!hasInput, steps, pass: steps.every(x => x.same && x.ox === 0) };
    } catch (e) { row = { screen: s.id, error: String(e.message).split('\n')[0].slice(0, 200) }; }
    out.push(row);
    process.stdout.write(`I ${s.id} ${row.error ? 'ERROR ' + row.error : row.pass ? 'PASS' : 'FAIL ' + JSON.stringify(row.steps.filter(x => !x.same || x.ox))}\n`);
    await ctx.close();
  }
  report.liveAll = out;
}

// Pose J: text zoom 200%, dark, reduced motion, keyboard (short + focused input), asymmetric insets.
async function runStress(browser, screens, report) {
  const out = [];
  const compact = flag('--stress-compact');
  const variants = compact ? [
    { id: 'text200', css: 'html{font-size:200% !important}', vps: ['669x867'] },
    { id: 'dark', dark: true, vps: ['951x585'] },
    { id: 'keyboard', keyboard: true, vps: ['951x350'] },
    { id: 'insets', css: '.majal-shell{padding-left:47px!important;padding-right:0!important}', vps: ['594x368'] }
  ] : [
    { id: 'text200', css: 'html{font-size:200% !important}', vps: ['382x580', '669x867', '951x585'] },
    { id: 'dark', dark: true, vps: ['382x580', '669x867', '951x585', '951x350'] },
    { id: 'reduced-motion', reducedMotion: true, vps: ['669x867', '951x585'] },
    { id: 'keyboard', keyboard: true, vps: ['669x350', '951x350', '382x350'] },
    { id: 'insets', css: '.majal-shell{padding-left:47px!important;padding-right:0!important}', vps: ['951x585', '594x368'] }
  ];
  for (const v of variants) for (const vp of v.vps) for (const s of screens) {
    const ctx = await newContext(browser, vp, { anon: s.anon, onboarding: s.onboarding, dark: v.dark, reducedMotion: v.reducedMotion });
    const p = await ctx.newPage();
    let r;
    try {
      await reach(p, s);
      if (v.css) await p.addStyleTag({ content: v.css });
      if (v.keyboard) {
        const input = p.locator('main input:not([type=checkbox]):not([type=radio]):visible, main textarea:visible').first();
        if (await input.count()) { await input.scrollIntoViewIfNeeded(); await input.focus(); }
      }
      await p.waitForTimeout(300);
      r = await measure(p, false);
      if (v.keyboard) r.focusedInView = await p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const b = a.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; });
      if (['public', 'creator-home', 'admin-overview', 'host-overview', 'consumer'].includes(s.id) && ['669x867', '951x585', '382x580', '951x350'].includes(vp)) await p.screenshot({ path: path.join(OUT, `J-${v.id}_${s.id}_${vp}.jpg`), type: 'jpeg', quality: 55 });
    } catch (e) { r = { error: String(e.message).split('\n')[0].slice(0, 200) }; }
    out.push({ variant: v.id, screen: s.id, vp, ...r });
    process.stdout.write(`J ${v.id} ${s.id} ${vp} ${r.error ? 'ERROR ' + r.error : `ox=${r.overflowX} off=${r.offscreen.length}${v.keyboard ? ' focusVisible=' + r.focusedInView : ''}`}\n`);
    await ctx.close();
  }
  report.stress = out;
}

(async () => {
  const want = arg('--screens', '');
  const screens = want ? SCREENS.filter(s => want.split(',').includes(s.id)) : SCREENS;
  const vps = arg('--vps', '') ? arg('--vps').split(',') : Object.values(POSES).flat();
  const report = { generatedAt: new Date().toISOString(), base: BASE, spinePx: SPINE, poses: POSES, screens: SCREENS.map(s => s.id), matrix: [] };
  const browser = await webkit.launch();
  if (flag('--resize')) await runResizeMatrix(browser, screens, vps, !flag('--no-shots'), report);
  else if (!flag('--only-live') && !flag('--only-stress') && !flag('--live-all')) await runMatrix(browser, screens, vps, !flag('--no-shots'), report);
  if (flag('--live') || flag('--only-live')) await runLive(browser, report);
  if (flag('--live-all')) await runLiveAll(browser, screens, report);
  if (flag('--stress') || flag('--only-stress')) await runStress(browser, screens.filter(s => !arg('--stress-screens') || arg('--stress-screens').split(',').includes(s.id)), report);
  await browser.close();
  const file = path.join(OUT, arg('--report', 'report.json'));
  fs.writeFileSync(file, JSON.stringify(report, null, 1));
  const m = report.matrix.filter(r => !r.error);
  console.log(`\nSUMMARY rows=${report.matrix.length} errors=${report.matrix.length - m.length} overflowX=${m.filter(r => r.overflowX).length} offscreen=${m.filter(r => r.offscreen.length).length} spineRows=${m.filter(r => r.spineHits).length} -> ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
