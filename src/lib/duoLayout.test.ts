import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../components/Navbar.tsx', import.meta.url), 'utf8');

test('breakpoints follow the Duo widths (two columns from 600, three from 896)', () => {
  assert.match(css, /--breakpoint-sm:\s*37\.5rem/);
  assert.match(css, /--breakpoint-md:\s*45rem/);
  assert.match(css, /--breakpoint-lg:\s*56rem/);
});

test('zoom is never locked and the viewport covers the camera cutout', () => {
  const meta = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
  assert.doesNotMatch(meta, /user-scalable\s*=\s*no|maximum-scale/);
  assert.match(meta, /viewport-fit=cover/);
});

test('layout does not depend on preview-only posture media features (the widget corner may list a two-segment viewport as one extra alternative)', () => {
  assert.doesNotMatch(css, /device-posture/);
  const withoutCorner = css.replace(css.slice(css.indexOf('Widget corner: iPhone Duo'), css.indexOf('Laptop posture: wide and short')), '');
  assert.doesNotMatch(withoutCorner, /viewport-segments/);
});

test('section rail is one non-wrapping row below xl and the page uses dynamic viewport height', () => {
  assert.match(navbar, /majal-section-rail xl:hidden flex flex-nowrap/);
  assert.match(css, /min-height:\s*100dvh/);
});

const BOOK = 'screen and (min-width: 721px) and (max-width: 1000px) and (min-height: 520px) and (max-height: 960px) and (orientation: landscape)';
const DUO_PORTRAIT = 'screen and (min-width: 640px) and (max-width: 720px) and (min-height: 520px) and (max-height: 960px) and (orientation: portrait)';
const bookSection = css.slice(css.indexOf('Book spread: iPhone Duo inner screen'), css.indexOf('Widget corner: iPhone Duo'));
const cornerSection = css.slice(css.indexOf('Widget corner: iPhone Duo'), css.indexOf('Laptop posture: wide and short'));

test('book (two pages around a centred spine) is landscape only, with one shared media condition', () => {
  assert.ok(bookSection.includes(`@media ${BOOK} {`));
  assert.match(bookSection, /\.majal-spread \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--spine\) minmax\(0, 1fr\)/);
  // Leaves are gated in rem against the page, so 200% text falls back to one readable column.
  assert.match(css, /body \{ container: majal-page \/ inline-size; \}/);
  assert.match(css, /@container majal-page \(min-width: 40rem\)/);
  // Odd chip counts weigh both halves equally so the rail's spine track sits on the fold.
  assert.match(css, /repeat\(3, minmax\(min-content, 2fr\)\) var\(--spine\) repeat\(2, minmax\(min-content, 3fr\)\)/);
});

test('portrait is never a book: no portrait branch, no 640-720 width gate in the book section', () => {
  assert.doesNotMatch(bookSection, /orientation:\s*portrait/);
  assert.doesNotMatch(bookSection, /min-width: 640px\) and \(max-width: 720px/);
  assert.doesNotMatch(bookSection, /min-width: 860px/);
  assert.doesNotMatch(bookSection, /max-height: 760px/);
});

test('an opener is two pages: it loses its own frame, each page wears the page frame', () => {
  assert.match(bookSection, /\.majal-spread > \.majal-leaf-opener \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--spine\) minmax\(0, 1fr\)[^}]*background: none/);
  assert.match(bookSection, /\.majal-hero-copy, \.majal-hero-monument\)/);
  // The old behaviour (monument floating over one wide panel, centred on a quarter of the viewport) is gone.
  assert.doesNotMatch(bookSection, /left: 25%/);
});

test('every surface root opts into the spread', () => {
  const roots = [
    'public/PublicLanding.tsx', 'showcase/BusinessShowcase.tsx', 'showcase/SupplierDirectory.tsx', 'consumer/ConsumerDashboard.tsx',
    'creator/CreatorPortal.tsx', 'host/HostPortal.tsx', 'supplier/SupplierPortal.tsx', 'admin/AdminDashboard.tsx',
    'admin/SuperAdminDashboard.tsx', 'legal/LegalCenter.tsx', 'consumer/PaymentReturnPage.tsx', 'common/InviteAcceptPage.tsx',
    'showcase/GateReportPage.tsx', 'showcase/AdReportPage.tsx', 'showcase/PartnerKitPage.tsx'
  ];
  for (const file of roots) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
    assert.match(source, /majal-spread/, file);
  }
});

test('laptop posture docks the section rail at the bottom and reserves its height', () => {
  const block = css.slice(css.indexOf('@media screen and (max-height: 480px) and (orientation: landscape) and (min-width: 560px) {\n  :root { --duo-dock'));
  assert.match(block, /\.majal-section-rail \{[^}]*position: fixed;[^}]*bottom: 0;/);
  assert.match(block, /footer\.majal-footer[^{]*\{ padding-bottom: calc\(var\(--duo-dock\)/);
  assert.match(block, /scroll-padding-bottom: calc\(var\(--duo-dock\)/);
});

test('every @media in the Duo book / keep-out / laptop sections is screen-only (print must stay one column)', () => {
  const section = css.slice(css.indexOf('Book spread: iPhone Duo inner screen'));
  const queries = [...section.matchAll(/^@media ([^{]+)\{/gm)].map(m => m[1]);
  assert.ok(queries.length >= 5);
  for (const q of queries) {
    for (const alt of q.split(',')) assert.match(alt.trim(), /^screen and /, alt);
  }
});

test('Duo is not an iPad: the book never matches 744px+ portrait, 1024px+ landscape or short phone landscape', () => {
  const queries = [...bookSection.matchAll(/^@media ([^{]+)\{/gm)].map(m => m[1].trim());
  assert.ok(queries.length >= 2);
  for (const q of queries) assert.equal(q, BOOK);
  // Evaluate the condition itself against the reference devices.
  const matches = (w: number, h: number) => w >= 721 && w <= 1000 && h >= 520 && h <= 960 && w > h;
  assert.ok(matches(951, 585) && matches(951, 669) && matches(800, 600));
  assert.ok(!matches(669, 867) && !matches(720, 900), 'Duo portrait');
  assert.ok(!matches(744, 1024) && !matches(768, 1024), 'iPad portrait');
  assert.ok(!matches(1024, 768) && !matches(1280, 800), 'iPad landscape / desktop');
  assert.ok(!matches(844, 390) && !matches(951, 350), 'phone landscape / laptop posture');
  assert.ok(!matches(390, 844) && !matches(367, 740), 'phone portrait / folded outer screen');
});

// Evaluates the real media-query text (not a re-typed copy of the numbers) for a viewport.
function mediaMatches(query: string, w: number, h: number): boolean {
  return query.split(',').some(alt => alt.trim().split(/\s+and\s+/).every(part => {
    const p = part.trim();
    if (p === 'screen') return true;
    const m = p.match(/^\((min|max)-(width|height):\s*(\d+)px\)$/);
    if (m) { const v = m[2] === 'width' ? w : h; return m[1] === 'min' ? v >= +m[3] : v <= +m[3]; }
    const o = p.match(/^\(orientation:\s*(landscape|portrait)\)$/);
    if (o) return o[1] === 'landscape' ? w > h : h >= w;
    throw new Error(`unsupported media feature in keep-out: ${p}`);
  }));
}

test('widget corner: one box, defined once, 0 by default, applied to the shell, header, scrims, onboarding, panes', () => {
  const root = css.slice(css.indexOf(':root {\n  /* iPhone Duo widget corner'), css.indexOf('/* Aliases onto the @theme scale'));
  for (const v of ['--duo-widget-w: 0px;', '--duo-widget-gap: 0px;', '--duo-widget-h: 0px;', '--duo-widget-mirror: 0px;', '--duo-widget-active: 0;']) assert.ok(root.includes(v), v);
  const head = cornerSection.match(/@media ([^{]+)\{\s*:root \{\s*--duo-widget-w: 70px;\s*--duo-widget-gap: 8px;\s*--duo-widget-h: clamp\(64px, 30vh, 200px\);\s*--duo-widget-active: 1;/);
  assert.ok(head, 'the three values are set exactly once, under the Duo media condition');
  assert.equal(css.match(/--duo-widget-w: 70px/g)?.length, 1);
  // No display-mode: browser tab, installed app and Capacitor all get the same box.
  assert.doesNotMatch(cornerSection.replace(/\/\*[\s\S]*?\*\//g, ''), /display-mode|standalone/);
  // Physical right, never the logical end: the widget does not follow the writing direction.
  const shell = css.slice(css.indexOf('.majal-shell {'), css.indexOf('footer.majal-footer {'));
  assert.match(shell, /padding-right: calc\(env\(safe-area-inset-right, 0px\) \+ var\(--duo-widget-reserve\)\)/);
  assert.match(shell, /margin-right: calc\(-1 \* \(env\(safe-area-inset-right, 0px\) \+ var\(--duo-widget-reserve\)\)\)/);
  assert.doesNotMatch(cornerSection.replace(/\/\*[\s\S]*?\*\//g, ''), /padding-inline-(start|end)|margin-inline-(start|end)/);
  assert.match(css, /\.fixed\.inset-0\.p-4:not\(\[class\*="pt-\["\]\) \{\s*padding:\s*max\(1rem, env\(safe-area-inset-top, 0px\)\)\s*calc\(max\(1rem, env\(safe-area-inset-right, 0px\)\) \+ var\(--duo-widget-reserve\)\)/);
  assert.match(css, /\.majal-onb-frame \{[^}]*padding-right: calc\(max\(var\(--onb-px\), env\(safe-area-inset-right, 0px\)\) \+ var\(--duo-widget-reserve\)\)/);
  // The book keeps its fold on the window centre: the left edge gives up the same width, in book only.
  const mirror = cornerSection.match(/@media ([^{]+)\{\s*:root \{ --duo-widget-mirror: var\(--duo-widget-reserve\); \}/);
  assert.ok(mirror && mirror[1].trim() === BOOK);
  // The old, too-small corner is gone.
  assert.doesNotMatch(css, /--duo-cutout/);
});

test('widget corner is active on every Duo size and nothing else (real media queries evaluated)', () => {
  const alts = cornerSection.match(/@media ([^{]+)\{\s*:root/)![1].split(',').map(a => a.trim()).filter(a => !a.includes('viewport-segments'));
  assert.equal(alts.length, 5);
  const active = (w: number, h: number) => mediaMatches(alts.join(', '), w, h);
  const duo: Array<[number, number]> = [[382, 580], [470, 780], [669, 867], [320, 568], [700, 900], [594, 368], [951, 585], [951, 350], [951, 700], [600, 350], [780, 470], [867, 669], [580, 382], [382, 844], [669, 1000], [470, 900], [594, 420]];
  for (const [w, h] of duo) assert.ok(active(w, h), `${w}x${h} must reserve the corner`);
  const never: Array<[number, number, string]> = [
    [744, 1024, 'iPad portrait'], [820, 1180, 'iPad portrait'], [1024, 768, 'iPad landscape'], [1180, 820, 'iPad landscape'],
    [1280, 800, 'desktop'], [1440, 900, 'desktop'], [844, 390, 'iPhone landscape'], [932, 430, 'iPhone Pro Max landscape'], [1024, 600, 'small landscape']
  ];
  for (const [w, h, name] of never) assert.ok(!active(w, h), `${w}x${h} (${name}) must not reserve the corner`);
});

test('recipe vault header can shrink: its badge wraps below sm so the sheet never overflows at 320px', () => {
  const vault = readFileSync(new URL('../components/common/RecipeVaultModal.tsx', import.meta.url), 'utf8');
  // A nowrap badge made the header wider than the sheet; overflow-hidden then clipped it and scrolled the content.
  assert.doesNotMatch(vault, /rounded-full text-xs font-bold whitespace-nowrap/);
  assert.match(vault, /sm:whitespace-nowrap/);
  assert.match(vault, /flex items-center gap-3 min-w-0/);
});
