import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceOf } from './adAudience';

test('audience is derived from the role alone', () => {
  const u = (role: string, accountType?: string, id = 'u1') => ({ id, role, accountType } as never);
  assert.equal(audienceOf(undefined), 'VISITOR');
  assert.equal(audienceOf(u('CONSUMER', undefined, 'anonymous')), 'VISITOR');
  assert.equal(audienceOf(u('CONSUMER')), 'CONSUMER');
  assert.equal(audienceOf(u('CREATOR')), 'CREATOR');
  assert.equal(audienceOf(u('HOST_CHEF')), 'HOST');
  assert.equal(audienceOf(u('CONSUMER', 'SUPPLIER')), 'SUPPLIER');
  assert.equal(audienceOf(u('ADMIN')), 'VISITOR');
  assert.equal(audienceOf(u('SUPER_ADMIN')), 'VISITOR');
});
