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
