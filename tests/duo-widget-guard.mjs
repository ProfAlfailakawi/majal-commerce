/*
 * iPhone Duo widget-corner guard (Playwright WebKit, falls back to Chromium only if asked).
 *
 * Fails when ANY important element (visible text, a, button, input, select, textarea, [role=tab],
 * [role=button], img, svg) has a bounding box that intersects the reserved top-right box:
 *     x >= viewportWidth - 96px   and   y <= clamp(64px, 31vh, 270px)       (physical right)
 * across the Duo viewports (portrait + landscape), light + dark, 200% text, and the open menus,
 * dialogs, drawers and the signed-out/error/loading screens. It also asserts that the reserved box
 * is ACTIVE on every Duo size and ZERO on ordinary tablets/desktops.
 *
 * The 96/270 numbers are deliberately re-typed here (not read from the CSS) so the guard cannot be
 * satisfied by shrinking the CSS variables.
 *
 * Usage:   npm run test:duo-widget            (builds the client, serves it, runs the matrix)
 *   DUO_GUARD_BASE=http://127.0.0.1:5181  use an already running server (skips build and serve)
 *   DUO_GUARD_ENGINE=chromium             only when WebKit is impossible; the report says so
 *   DUO_GUARD_EXPECT=fail                 control run on a build WITHOUT the fix (inverts the exit code)
 *   DUO_GUARD_OUT=/path/report.json  DUO_GUARD_SCREENS=id,id  DUO_GUARD_QUICK=1
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pw = require('playwright');
const ENGINE = process.env.DUO_GUARD_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const EXPECT_FAIL = process.env.DUO_GUARD_EXPECT === 'fail';
const OUT = process.env.DUO_GUARD_OUT || '';
const ONLY = (process.env.DUO_GUARD_SCREENS || '').split(',').filter(Boolean);

const W = 96;                                   // widget width incl. the ~6pt edge gap
const H = (vh) => Math.min(270, Math.max(64, vh * 0.31));

const SIZES = ['382x580', '470x780', '594x368', '669x867', '951x585'];
// Inferred in-app viewport (~457x678, estimated from owner screenshots) and a taller neighbour.
const INFERRED = ['457x678', '457x760', '720x900', '951x669', '951x800', '951x940']; // + the portrait book and the tall landscape book that earlier rounds protected
const VIEWPORTS = [...SIZES.flatMap(s => { const [w, h] = s.split('x').map(Number); return [`${w}x${h}`, `${h}x${w}`]; }), ...INFERRED];
const QUICK_VIEWPORTS = ['382x580', '457x678', '669x867', '951x585', '594x368'];
// Known Duo landscape geometry only: the swapped sizes are exercised for the guard, but the CSS
// gate lists the real landscape sizes (594x368, 951x585, 780x470, 867x669 and neighbours).
const TALL = ['382x780', '382x844', '470x900', '669x1000', '951x700']; // app viewports have no browser toolbars
const WK_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const NEGATIVE = ['1280x800', '1024x768', '744x1024', '820x1180', '1440x900'];

const ROLE = { CREATOR: 'مبدع', HOST: 'مالك منشأة', ADMIN: 'أدمن تشغيلي وامتثال', SUPER_ADMIN: 'سوبر أدمن المنصة', SUPPLIER: 'مورد', CONSUMER: 'عميل / جمهور' };
const CHIP = { PUBLIC: 'عن مجال', SHOWCASE: 'مشاريع للبيع', DIRECTORY: 'دليل الموردين', CONSUMER: 'السوق' };
const click = async (p, sel) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: 4000 }); };
const tab = name => async p => { await p.locator('[role=tab]', { hasText: name }).first().click({ timeout: 4000 }); };
const btn = name => async p => { await click(p, `button:has-text("${name}")`); };

const SCREENS = [
  { id: 'anon-landing', anon: true, path: '/' },
  { id: 'anon-auth-modal', anon: true, path: '/', act: async p => { await click(p, 'header button:has-text("دخول")'); } },
  { id: 'skip-link-focus', anon: true, path: '/', act: async p => { await p.keyboard.press('Tab'); } },
  { id: 'boot-splash', anon: true, path: '/', keepSplash: true },
  { id: 'overture', anon: true, path: '/', overture: true },
  { id: 'public', role: 'CONSUMER', surface: 'PUBLIC' },
  { id: 'onboarding-1', role: 'CONSUMER', onboarding: true },
  { id: 'showcase', role: 'CONSUMER', surface: 'SHOWCASE' },
  { id: 'showcase-sell-form', role: 'CONSUMER', surface: 'SHOWCASE', act: btn('اعرض مشروعك للبيع') },
  { id: 'directory', role: 'CONSUMER', surface: 'DIRECTORY' },
  { id: 'consumer', role: 'CONSUMER', surface: 'CONSUMER' },
  { id: 'consumer-order-dialog', role: 'CONSUMER', surface: 'CONSUMER', act: btn('اطلب التجربة') },
  { id: 'role-menu', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, 'button[aria-label="تبديل هوية العرض المحلية"]'); } },
  { id: 'notifications', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, 'button[aria-label^="فتح التنبيهات"]'); } },
  { id: 'command-palette', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, '.majal-guide button:has-text("بحث")'); } },
  { id: 'ai-drawer', role: 'CONSUMER', surface: 'CONSUMER', act: async p => { await click(p, 'button[aria-label="فتح مساعد مجال الذكي"]'); } },
  { id: 'creator-home', role: 'CREATOR' },
  { id: 'creator-products', role: 'CREATOR', act: tab('منتجاتي') },
  { id: 'creator-wizard', role: 'CREATOR', act: btn('تسجيل منتج جديد') },
  { id: 'host-overview', role: 'HOST' },
  { id: 'host-lab', role: 'HOST', act: tab('المختبر والصفقة') },
  { id: 'supplier-overview', role: 'SUPPLIER' },
  { id: 'admin-overview', role: 'ADMIN' },
  { id: 'admin-approvals', role: 'ADMIN', act: tab('الاعتمادات') },
  { id: 'super-command', role: 'SUPER_ADMIN' },
  { id: 'legal-terms', role: 'CONSUMER', path: '/terms' },
  { id: 'payment-return-error', role: 'CONSUMER', path: '/payment/return?order=demo-missing' },
  { id: 'gate-report-error', anon: true, path: '/?my-report=invalid-token' },
  { id: 'invite-error', role: 'CONSUMER', path: '/?invite=invalid-token' },
  { id: 'loading-fallback', anon: true, path: '/?my-report=slow-token', slow: true },
].filter(s => !ONLY.length || ONLY.includes(s.id));

async function newContext(browser, vp, o) {
  const [width, height] = vp.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: o.app ? 2 : 1, isMobile: true, hasTouch: true, locale: 'ar', serviceWorkers: 'block', colorScheme: o.dark ? 'dark' : 'light', ...(o.app ? { userAgent: WK_UA } : {}) });
  // APP context = Capacitor WKWebView emulated in desktop WebKit: no Safari/ token, Capacitor native ios, no navigator.standalone.
  if (o.app) await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', platform: 'ios' }; Object.defineProperty(navigator, 'standalone', { get: () => undefined, configurable: true }); });
  await ctx.addInitScript(({ anon, onboarding, dark, keepSplash, overture }) => {
    try {
      if (!onboarding) localStorage.setItem('majal_onboarding_v1', JSON.stringify({ completedAt: '2026-11-14T00:00:00Z', skipped: true })); else localStorage.removeItem('majal_onboarding_v1');
      localStorage.setItem('majal-theme', dark ? 'dark' : 'light');
      if (!overture) sessionStorage.setItem('majal_overture_seen', '1');
      if (!keepSplash) document.addEventListener('DOMContentLoaded', () => document.getElementById('majal-splash')?.remove(), { once: true });
      if (!anon) { sessionStorage.setItem('majal_demo_active_v1', 'true'); sessionStorage.setItem('majal_demo_sandbox_id_v1', 'demo_' + 'a'.repeat(64)); }
    } catch { /* storage blocked */ }
  }, { anon: !!o.anon, onboarding: !!o.onboarding, dark: !!o.dark, keepSplash: !!o.keepSplash, overture: !!o.overture });
  await ctx.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('slow-token')) { await new Promise(r => setTimeout(r, 15000)); return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }).catch(() => {}); }
    return route.fulfill({ status: /auth\/(me|session)/.test(url) ? 401 : 404, contentType: 'application/json', body: '{"error":"guard"}' });
  });
  return ctx;
}

async function reach(p, s) {
  await p.goto(BASE + (s.path || '/'), { waitUntil: s.slow || s.keepSplash ? 'domcontentloaded' : 'networkidle', timeout: 45000 });
  if (s.keepSplash) { await p.waitForTimeout(300); return; }
  if (s.overture) { await p.waitForTimeout(1200); return; }
  await p.waitForFunction(() => !document.getElementById('majal-splash'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(s.slow ? 1500 : 450);
  if (s.anon || s.onboarding || s.slow) { if (s.act) { await s.act(p); await p.waitForTimeout(700); } return; }
  if (s.role && !s.path) {
    const current = await p.locator('button[aria-label="تبديل هوية العرض المحلية"]').innerText().catch(() => '');
    if (!current.includes(ROLE[s.role]) || s.role === 'SUPPLIER') {
      await click(p, 'button[aria-label="تبديل هوية العرض المحلية"]');
      await p.locator('[role=menuitem]').filter({ has: p.locator('span', { hasText: new RegExp('^' + ROLE[s.role]) }) }).first().click({ timeout: 4000 });
      await p.waitForTimeout(700);
    }
  }
  if (s.surface) {
    const chips = p.locator(`[aria-label="أقسام المنصة"] button:has-text("${CHIP[s.surface]}"), nav[aria-label="التنقل الرئيسي"] button:has-text("${CHIP[s.surface]}")`);
    const n = await chips.count();
    for (let i = 0; i < n; i++) if (await chips.nth(i).isVisible()) { await chips.nth(i).click(); break; }
    await p.waitForTimeout(800);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForFunction(() => ![...document.querySelectorAll('main [role=status][data-fade]')].some(e => e.textContent.includes('جاري تحميل مساحة العمل')), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(250);
  if (s.act) { await s.act(p); await p.waitForTimeout(800); }
}

// Runs in the page. Returns the active flag, the CSS values and every important element in the box.
function measure({ W, Hmin, Hmax, Hk }) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const rootCs = getComputedStyle(document.documentElement);
  const active = rootCs.getPropertyValue('--duo-widget-active').trim();
  const cssW = rootCs.getPropertyValue('--duo-widget-w').trim();
  const cssH = rootCs.getPropertyValue('--duo-widget-h').trim();
  const bx = vw - W, by = Math.min(Hmax, Math.max(Hmin, vh * Hk));
  const csCache = new Map();
  const cs = el => { let c = csCache.get(el); if (!c) { c = getComputedStyle(el); csCache.set(el, c); } return c; };
  const visible = el => el.getClientRects().length > 0 && !el.closest('.sr-only, [inert]') && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  // Painted rect = own rect clipped by every overflow-clipping ancestor.
  const painted = (el, r) => {
    let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const c = cs(a);
      if (c.overflowX !== 'visible' || c.overflowY !== 'visible') {
        const ar = a.getBoundingClientRect();
        if (c.overflowX !== 'visible') { l = Math.max(l, ar.left); rr = Math.min(rr, ar.right); }
        if (c.overflowY !== 'visible') { t = Math.max(t, ar.top); b = Math.min(b, ar.bottom); }
      }
    }
    return { left: l, top: t, right: rr, bottom: b };
  };
  const hits = (r) => r.right > bx + 0.5 && r.left < vw && r.top < by - 0.5 && r.bottom > 0.5 && r.right > r.left && r.bottom > r.top;
  const name = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} «${(el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)}»`;
  const violations = new Set(), exceptions = [];
  const consider = (el, r, kind) => {
    if (!visible(el)) return;
    const pr = painted(el, r);
    if (!hits(pr)) return;
    if (el.closest('[data-duo-bleed]')) { exceptions.push(`bleed-marked ${name(el)}`); return; }
    if ((kind === 'img' || kind === 'svg') && el.closest('[aria-hidden="true"]')) { exceptions.push(`decorative ${kind} ${name(el)}`); return; }
    violations.add(`${kind} ${name(el)} @${Math.round(pr.left)},${Math.round(pr.top)}-${Math.round(pr.right)},${Math.round(pr.bottom)}`);
  };
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=menuitem]')) consider(el, el.getBoundingClientRect(), 'control');
  for (const el of document.querySelectorAll('img, svg')) { if (el.closest('svg') && el.tagName.toLowerCase() === 'svg' && el.parentElement.closest('svg')) continue; consider(el, el.getBoundingClientRect(), el.tagName.toLowerCase()); }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script, style, noscript, svg')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) { if (r.width > 0 && r.height > 0) { consider(el, r, 'text'); } }
  }
  return { active, cssW, cssH, box: [Math.round(bx), Math.round(by)], violations: [...violations], exceptions: [...new Set(exceptions)] };
}

const results = [];
let total = 0, bad = 0, errored = 0, retries = 0;
const exceptionTally = new Map();
async function check(p, label, vp, expectActive) {
  const [w, h] = vp.split('x').map(Number);
  await p.setViewportSize({ width: w, height: h });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0));
  let r = await p.evaluate(measure, { W, Hmin: 64, Hmax: 270, Hk: 0.31 });
  // A media-query change can take a frame to reach the style engine after a resize: re-read (and
  // count it) before calling a stale 'active' flag a failure.
  for (let i = 0; i < 3 && expectActive !== null && (r.active === '1') !== expectActive; i++) { retries++; await p.waitForTimeout(500); r = await p.evaluate(measure, { W, Hmin: 64, Hmax: 270, Hk: 0.31 }); }
  total++;
  // Outside Duo the page uses its normal layout: only the variables are checked there.
  const problems = expectActive === false ? [] : [...r.violations];
  const isActive = r.active === '1';
  if (expectActive !== null && isActive !== expectActive && !process.env.DUO_GUARD_SKIP_ACTIVE) problems.push(`reserved box ${expectActive ? 'NOT active' : 'unexpectedly active'} (--duo-widget-active=${r.active || 'unset'}, w=${r.cssW}, h=${r.cssH})`);
  if (expectActive === false && r.cssW !== '0px' && !process.env.DUO_GUARD_SKIP_ACTIVE) problems.push(`variables must be 0 outside Duo (w=${r.cssW})`);
  for (const e of r.exceptions) exceptionTally.set(e, (exceptionTally.get(e) || 0) + 1);
  if (problems.length) bad++;
  results.push({ label, vp, active: isActive, box: r.box, problems, exceptions: r.exceptions });
  process.stdout.write(`${problems.length ? 'FAIL' : 'ok  '} ${label} ${vp}${problems.length ? '\n     ' + problems.slice(0, 6).join('\n     ') : ''}\n`);
}

let BASE = process.env.DUO_GUARD_BASE || '';
let server = null;
async function startServer() {
  if (BASE) return;
  if (!existsSync(resolve('dist/index.html'))) throw new Error('dist/ missing: run "npm run build:client" first (npm run test:duo-widget does)');
  const port = 5190 + Math.floor(Math.random() * 50);
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  BASE = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* waiting */ } await new Promise(r => setTimeout(r, 500)); }
  throw new Error('preview server did not start');
}

async function main() {
  await startServer();
  let browser = await pw[ENGINE].launch();
  console.log(`engine: ${ENGINE} ${browser.version()}  base: ${BASE}`);
  const vps = process.env.DUO_GUARD_QUICK ? QUICK_VIEWPORTS : VIEWPORTS;
  const passes = [
    { name: 'light', dark: false, text200: false },
    { name: 'dark', dark: true, text200: false },
    { name: 'text200', dark: false, text200: true },
    { name: 'app-light', dark: false, text200: false, app: true },
    { name: 'app-dark', dark: true, text200: false, app: true },
    { name: 'app-text200', dark: false, text200: true, app: true },
  ].filter(x => !process.env.DUO_GUARD_PASSES || process.env.DUO_GUARD_PASSES.split(',').includes(x.name));
  for (const pass of passes) {
    for (const s of SCREENS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        // A fresh engine if the last one died: a crashed WebKit process must cost one state, not the run.
        if (!browser.isConnected()) browser = await pw[ENGINE].launch();
        const ctx = await newContext(browser, '951x585', { ...s, dark: pass.dark, app: pass.app });
        const p = await ctx.newPage();
        const mark = [total, bad];
        try {
          await reach(p, s);
          if (pass.text200) await p.addStyleTag({ content: 'html{font-size:200%}' });
          for (const vp of pass.app ? [...vps, ...TALL] : vps) {
            if (s.keepSplash || s.overture) { const [w, h] = vp.split('x').map(Number); await p.setViewportSize({ width: w, height: h }); }
            await check(p, `${pass.name}/${s.id}`, vp, true);
          }
          if (!pass.app && !pass.text200 && !pass.dark && !s.keepSplash && !s.overture) for (const vp of NEGATIVE) await check(p, `negative/${s.id}`, vp, false);
          await ctx.close().catch(() => {});
          break;
        } catch (e) {
          await ctx.close().catch(() => {});
          if (attempt === 0) { total = mark[0]; bad = mark[1]; results.length = results.filter(r => true).length; process.stdout.write(`retry ${pass.name}/${s.id}: ${String(e.message).split('\n')[0]}\n`); continue; }
          total++; errored++;
          results.push({ label: `${pass.name}/${s.id}`, vp: '-', problems: [`unreachable state: ${String(e.message).split('\n')[0]}`] });
          process.stdout.write(`FAIL ${pass.name}/${s.id} unreachable state: ${String(e.message).split('\n')[0]}\n`);
        }
      }
    }
  }
  await browser.close();
  server?.kill();
  const summary = { engine: ENGINE, cases: total, failures: bad, unreachable: errored, activeRereads: retries, screens: SCREENS.length, viewports: vps.length, passes: passes.map(x => x.name), exceptions: Object.fromEntries(exceptionTally), results: results.filter(r => r.problems.length) };
  if (OUT) { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(OUT, JSON.stringify(summary, null, 2)); }
  console.log(`\n${ENGINE}: ${total} cases (${SCREENS.length} states x ${vps.length} viewports x ${passes.length} passes + negatives), ${bad} with violations, ${errored} unreachable states, ${retries} active-flag re-reads, ${exceptionTally.size} distinct exceptions`);
  for (const [k, v] of exceptionTally) console.log(`  exception x${v}: ${k}`);
  if (EXPECT_FAIL) { console.log(bad ? 'control run: violations found, as expected on a build without the fix' : 'control run: NO violations found, the guard would not catch the bug'); process.exit(bad && !errored ? 0 : 1); }
  process.exit(bad || errored ? 1 : 0);
}
main().catch(e => { server?.kill(); console.error(e); process.exit(2); });
