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
  assert.match(css, /\(min-width: 640px\) and \(max-width: 760px\) and \(min-height: 520px\)/);
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
  const block = css.slice(css.indexOf('@media (max-height: 480px) and (orientation: landscape) and (min-width: 560px) {\n  :root { --duo-dock'));
  assert.match(block, /\.majal-section-rail \{[^}]*position: fixed;[^}]*bottom: 0;/);
  assert.match(block, /footer\.majal-footer[^{]*\{ padding-bottom: calc\(var\(--duo-dock\)/);
  assert.match(block, /scroll-padding-bottom: calc\(var\(--duo-dock\)/);
});
