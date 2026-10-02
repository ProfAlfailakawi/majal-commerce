import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSIGNABLE_ROLES, roleChangeOptions } from './assignableRoles';

test('SUPER_ADMIN is never an assignable role option', () => {
  assert.ok(!ASSIGNABLE_ROLES.includes('SUPER_ADMIN'));
  assert.ok(!roleChangeOptions('CONSUMER').includes('SUPER_ADMIN'));
  assert.deepEqual(roleChangeOptions('ADMIN'), [...ASSIGNABLE_ROLES]);
});

test('a non-assignable current role stays visible as the selected value only', () => {
  const options = roleChangeOptions('SUPER_ADMIN');
  assert.equal(options[0], 'SUPER_ADMIN');
  assert.equal(options.filter(role => role === 'SUPER_ADMIN').length, 1);
  assert.deepEqual(options.slice(1), [...ASSIGNABLE_ROLES]);
});
