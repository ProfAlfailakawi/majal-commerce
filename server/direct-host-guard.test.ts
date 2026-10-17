import test from 'node:test';
import assert from 'node:assert/strict';
import { directRunAppTarget } from './direct-host-guard';

test('a direct visit to the run.app address forwards, a proxied one does not', () => {
  const to = 'https://example.web.app';
  assert.equal(directRunAppTarget('svc-abc-nw.a.run.app', '', to, '/x?y=1'), 'https://example.web.app/x?y=1');
  assert.equal(directRunAppTarget('svc-abc-nw.a.run.app', 'example.web.app', to, '/'), null);
  assert.equal(directRunAppTarget('svc-abc-nw.a.run.app', '', '', '/'), null);
  assert.equal(directRunAppTarget('localhost', '', to, '/'), null);
});
