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

test('layout does not depend on preview-only posture media features', () => {
  assert.doesNotMatch(css, /device-posture|viewport-segments/);
});

test('section rail is one non-wrapping row below xl and the page uses dynamic viewport height', () => {
  assert.match(navbar, /majal-section-rail xl:hidden flex flex-nowrap/);
  assert.match(css, /min-height:\s*100dvh/);
});

test('inner screen composes a two-leaf spread around a centred spine (width rules only)', () => {
  assert.match(css, /\(min-width: 640px\) and \(max-width: 720px\) and \(min-height: 520px\)/);
  assert.match(css, /\(min-width: 860px\) and \(max-width: 1000px\) and \(min-height: 520px\) and \(max-height: 760px\)/);
  assert.match(css, /\.majal-spread \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--spine\) minmax\(0, 1fr\)/);
  // Leaves are gated in rem against the page, so 200% text falls back to one readable column.
  assert.match(css, /body \{ container: majal-page \/ inline-size; \}/);
  assert.match(css, /@container majal-page \(min-width: 40rem\)/);
  // Odd chip counts weigh both halves equally so the rail's spine track sits on the fold.
  assert.match(css, /repeat\(3, minmax\(min-content, 2fr\)\) var\(--spine\) repeat\(2, minmax\(min-content, 3fr\)\)/);
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

test('every @media in the Duo book/laptop section is screen-only (print must stay one column)', () => {
  const section = css.slice(css.indexOf('Book spread: iPhone Duo inner screen'));
  const queries = [...section.matchAll(/^@media ([^{]+)\{/gm)].map(m => m[1]);
  assert.ok(queries.length >= 5);
  for (const q of queries) {
    for (const alt of q.split(',')) assert.match(alt.trim(), /^screen and /, alt);
  }
});

test('Duo is not an iPad: portrait book is capped at 720px wide, landscape book at 1000px', () => {
  const section = css.slice(css.indexOf('Book spread: iPhone Duo inner screen'));
  const queries = [...section.matchAll(/^@media ([^{]+)\{/gm)].map(m => m[1]);
  let portrait = 0;
  let landscape = 0;
  for (const q of queries) {
    for (const alt of q.split(',').map(a => a.trim())) {
      const min = Number(alt.match(/min-width: (\d+)px/)?.[1] ?? 0);
      const max = Number(alt.match(/max-width: (\d+)px/)?.[1] ?? Infinity);
      if (/min-height: 520px/.test(alt)) {
        // iPad mini portrait is 744 wide, iPad landscape 1024+: width is the only safe discriminator.
        if (min < 800) { portrait++; assert.ok(min >= 640 && max <= 720, alt); }
        else { landscape++; assert.ok(max <= 1000, alt); }
      } else {
        // Laptop posture: height-gated, so an iPad (never <= 480px tall) cannot match.
        assert.match(alt, /max-height: 480px/, alt);
      }
    }
  }
  assert.ok(portrait >= 2 && landscape >= 2);
});

test('recipe vault header can shrink: its badge wraps below sm so the sheet never overflows at 320px', () => {
  const vault = readFileSync(new URL('../components/common/RecipeVaultModal.tsx', import.meta.url), 'utf8');
  // A nowrap badge made the header wider than the sheet; overflow-hidden then clipped it and scrolled the content.
  assert.doesNotMatch(vault, /rounded-full text-xs font-bold whitespace-nowrap/);
  assert.match(vault, /sm:whitespace-nowrap/);
  assert.match(vault, /flex items-center gap-3 min-w-0/);
});
