import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSrc = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const csp = /setHeader\('Content-Security-Policy', "([^"]+)"\)/.exec(serverSrc)?.[1] ?? '';
const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) ?? '';

test('CSP connect-src allows the ORBIT sensor origin and script-src stays self-only', () => {
  assert.match(directive('connect-src'), /(^| )https:\/\/orbitq8\.web\.app( |$)/);
  assert.equal(directive('script-src'), "script-src 'self'");
});

test('index.html loads the self-hosted ORBIT sensor', () => {
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /<script src="\/orbit-sensor\.js" async><\/script>\s*<\/body>/);
});
