import { SurfaceType, User, UserRole } from '../types/majal';

export type PermissionAction =
  | 'VIEW_CREATOR_PORTAL'
  | 'VIEW_HOST_PORTAL'
  | 'VIEW_ADMIN_PORTAL'
  | 'VIEW_SUPER_ADMIN_PORTAL'
  | 'VIEW_RECIPE_L1'
  | 'VIEW_RECIPE_L2'
  | 'VIEW_RECIPE_L3'
  | 'MANAGE_RECIPE_GRANTS'
  | 'MANAGE_CHALLENGES'
  | 'MANAGE_LAB'
  | 'MANAGE_OFFERS'
  | 'SIGN_CONTRACT'
  | 'VIEW_HOST_FINANCE'
  | 'RUN_SETTLEMENTS'
  | 'MANAGE_COMPLIANCE'
  | 'MANAGE_DISPUTES'
  | 'MANAGE_USERS'
  | 'MANAGE_ROLES'
  | 'CHANGE_PLATFORM_POLICY'
  | 'PAUSE_PRODUCT'
  | 'VIEW_AUDIT_LOGS'
  | 'VIEW_RISK_ENGINE';

const rolePermissions: Record<UserRole, PermissionAction[]> = {
  SUPER_ADMIN: [
    'VIEW_ADMIN_PORTAL', 'VIEW_SUPER_ADMIN_PORTAL', 'VIEW_RECIPE_L1', 'VIEW_RECIPE_L2',
    'MANAGE_RECIPE_GRANTS', 'MANAGE_CHALLENGES', 'MANAGE_LAB', 'MANAGE_OFFERS', 'SIGN_CONTRACT',
    'VIEW_HOST_FINANCE', 'RUN_SETTLEMENTS', 'MANAGE_COMPLIANCE', 'MANAGE_DISPUTES', 'MANAGE_USERS',
    'MANAGE_ROLES', 'CHANGE_PLATFORM_POLICY', 'PAUSE_PRODUCT', 'VIEW_AUDIT_LOGS', 'VIEW_RISK_ENGINE'
  ],
  ADMIN: [
    'VIEW_ADMIN_PORTAL', 'VIEW_RECIPE_L1', 'VIEW_RECIPE_L2', 'MANAGE_RECIPE_GRANTS', 'MANAGE_LAB',
    'MANAGE_OFFERS', 'RUN_SETTLEMENTS', 'MANAGE_COMPLIANCE', 'MANAGE_DISPUTES', 'PAUSE_PRODUCT',
    'VIEW_AUDIT_LOGS', 'VIEW_RISK_ENGINE'
  ],
  CREATOR: [
    'VIEW_CREATOR_PORTAL', 'VIEW_RECIPE_L1', 'VIEW_RECIPE_L2', 'VIEW_RECIPE_L3', 'MANAGE_RECIPE_GRANTS',
    'MANAGE_OFFERS', 'SIGN_CONTRACT'
  ],
  HOST_OWNER: [
    'VIEW_HOST_PORTAL', 'VIEW_RECIPE_L1', 'VIEW_RECIPE_L2', 'MANAGE_CHALLENGES', 'MANAGE_LAB',
    'MANAGE_OFFERS', 'SIGN_CONTRACT', 'VIEW_HOST_FINANCE'
  ],
  HOST_OPERATIONS: [
    'VIEW_HOST_PORTAL', 'VIEW_RECIPE_L1', 'VIEW_RECIPE_L2', 'MANAGE_CHALLENGES', 'MANAGE_LAB'
  ],
  HOST_CHEF: [
    'VIEW_HOST_PORTAL', 'VIEW_RECIPE_L1', 'VIEW_RECIPE_L2', 'VIEW_RECIPE_L3', 'MANAGE_LAB'
  ],
  HOST_FINANCE: ['VIEW_HOST_PORTAL', 'VIEW_HOST_FINANCE'],
  HOST_MARKETING: ['VIEW_HOST_PORTAL', 'VIEW_RECIPE_L1'],
  HOST_SUPPORT: ['VIEW_HOST_PORTAL', 'VIEW_RECIPE_L1'],
  CONSUMER: []
};

export const roleLabel = (role: UserRole): string => ({
  SUPER_ADMIN: 'سوبر أدمن',
  ADMIN: 'أدمن',
  CREATOR: 'مبدع',
  HOST_OWNER: 'مالك المنشأة',
  HOST_OPERATIONS: 'تشغيل المنشأة',
  HOST_CHEF: 'الشيف / تطوير المنتج',
  HOST_FINANCE: 'المالية',
  HOST_MARKETING: 'التسويق',
  HOST_SUPPORT: 'الدعم',
  CONSUMER: 'عميل'
}[role]);

export function hasPermission(user: User, action: PermissionAction): boolean {
  if (user.status === 'SUSPENDED' || user.status === 'INVITED') return false;
  return rolePermissions[user.role]?.includes(action) ?? false;
}

export function canViewFullRecipe(user: User, hostBusinessId?: string, productHostId?: string): boolean {
  if (!hasPermission(user, 'VIEW_RECIPE_L3')) return false;
  if (user.role === 'CREATOR') return true;
  if (user.role === 'HOST_CHEF') return !!user.hostBusinessId && user.hostBusinessId === (productHostId || hostBusinessId);
  return false;
}

export function getRolePermissions(role: UserRole): PermissionAction[] {
  return [...(rolePermissions[role] || [])];
}

export function canAccessSurface(user: User, surface: SurfaceType): boolean {
  if (surface === 'PUBLIC' || surface === 'CONSUMER') return true;
  if (user.status === 'SUSPENDED' || user.status === 'INVITED') return false;
  if (surface === 'CREATOR') return user.role === 'CREATOR';
  if (surface === 'HOST') return user.role.startsWith('HOST_');
  if (surface === 'ADMIN') return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (surface === 'SUPER_ADMIN') return user.role === 'SUPER_ADMIN';
  return false;
}
