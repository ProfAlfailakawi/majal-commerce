import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessSurface, canViewFullRecipe, getRolePermissions, hasPermission } from './permissions';
import { SurfaceType, User, UserRole } from '../types/majal';

const roles: UserRole[] = [
  'CONSUMER', 'CREATOR', 'HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF',
  'HOST_FINANCE', 'HOST_MARKETING', 'HOST_SUPPORT', 'ADMIN', 'SUPER_ADMIN'
];
const surfaces: SurfaceType[] = ['PUBLIC', 'CONSUMER', 'CREATOR', 'HOST', 'ADMIN', 'SUPER_ADMIN'];

const expected: Record<UserRole, SurfaceType[]> = {
  CONSUMER: ['PUBLIC', 'CONSUMER'],
  CREATOR: ['PUBLIC', 'CONSUMER', 'CREATOR'],
  HOST_OWNER: ['PUBLIC', 'CONSUMER', 'HOST'],
  HOST_OPERATIONS: ['PUBLIC', 'CONSUMER', 'HOST'],
  HOST_CHEF: ['PUBLIC', 'CONSUMER', 'HOST'],
  HOST_FINANCE: ['PUBLIC', 'CONSUMER', 'HOST'],
  HOST_MARKETING: ['PUBLIC', 'CONSUMER', 'HOST'],
  HOST_SUPPORT: ['PUBLIC', 'CONSUMER', 'HOST'],
  ADMIN: ['PUBLIC', 'CONSUMER', 'ADMIN'],
  SUPER_ADMIN: ['PUBLIC', 'CONSUMER', 'ADMIN', 'SUPER_ADMIN']
};

const userFor = (role: UserRole, status: User['status'] = 'ACTIVE'): User => ({
  id: `test-${role}`,
  name: role,
  email: `${role.toLowerCase()}@example.test`,
  phone: '+96550000000',
  role,
  status,
  creatorId: role === 'CREATOR' ? 'creator-1' : undefined,
  hostBusinessId: role.startsWith('HOST_') ? 'host-1' : undefined
});

test('every role reaches only its intended surfaces', () => {
  for (const role of roles) {
    const user = userFor(role);
    assert.deepEqual(surfaces.filter(surface => canAccessSurface(user, surface)), expected[role]);
  }
});

test('suspended and invited users lose protected permissions and surfaces', () => {
  for (const status of ['SUSPENDED', 'INVITED'] as const) {
    const user = userFor('SUPER_ADMIN', status);
    assert.equal(canAccessSurface(user, 'SUPER_ADMIN'), false);
    assert.equal(hasPermission(user, 'MANAGE_USERS'), false);
    assert.equal(canAccessSurface(user, 'PUBLIC'), true);
  }
});

test('host financial permission is limited to owner and finance roles', () => {
  const allowed = roles.filter(role => role.startsWith('HOST_') && hasPermission(userFor(role), 'VIEW_HOST_FINANCE'));
  assert.deepEqual(allowed, ['HOST_OWNER', 'HOST_FINANCE']);
});

test('full recipe visibility is tenant bound and never inherited by administrators', () => {
  assert.equal(canViewFullRecipe(userFor('CREATOR')), true);
  assert.equal(canViewFullRecipe(userFor('HOST_CHEF'), 'host-1', 'host-1'), true);
  assert.equal(canViewFullRecipe(userFor('HOST_CHEF'), 'host-1', 'host-2'), false);
  assert.equal(canViewFullRecipe(userFor('SUPER_ADMIN')), false);
});

test('permission matrix contains no duplicate actions', () => {
  for (const role of roles) {
    const permissions = getRolePermissions(role);
    assert.equal(new Set(permissions).size, permissions.length, role);
  }
});
