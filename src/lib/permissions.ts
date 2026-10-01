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

/** Arabic display names for permission codes (display only). */
export const permissionLabel = (action: PermissionAction): string => ({
  VIEW_CREATOR_PORTAL: 'دخول بوابة المبدع', VIEW_HOST_PORTAL: 'دخول بوابة المنشأة', VIEW_ADMIN_PORTAL: 'دخول لوحة الأدمن', VIEW_SUPER_ADMIN_PORTAL: 'دخول لوحة السوبر أدمن',
  VIEW_RECIPE_L1: 'اطلاع وصفة — مستوى 1', VIEW_RECIPE_L2: 'اطلاع وصفة — مستوى 2', VIEW_RECIPE_L3: 'اطلاع وصفة — مستوى 3', MANAGE_RECIPE_GRANTS: 'إدارة أذونات الوصفات',
  MANAGE_CHALLENGES: 'إدارة التحديات', MANAGE_LAB: 'إدارة المختبر', MANAGE_OFFERS: 'إدارة العروض', SIGN_CONTRACT: 'توقيع العقود', VIEW_HOST_FINANCE: 'اطلاع على مالية المنشأة',
  RUN_SETTLEMENTS: 'تشغيل التسويات', MANAGE_COMPLIANCE: 'إدارة الامتثال', MANAGE_DISPUTES: 'إدارة النزاعات', MANAGE_USERS: 'إدارة المستخدمين', MANAGE_ROLES: 'إدارة الأدوار',
  CHANGE_PLATFORM_POLICY: 'تغيير سياسة المنصة', PAUSE_PRODUCT: 'إيقاف منتج', VIEW_AUDIT_LOGS: 'اطلاع على سجل التدقيق', VIEW_RISK_ENGINE: 'اطلاع على محرك المخاطر'
}[action] ?? action);

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
  if (surface === 'SUPPLIER') return user.accountType === 'SUPPLIER' && !!user.supplierId;
  if (surface === 'ADMIN') return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (surface === 'SUPER_ADMIN') return user.role === 'SUPER_ADMIN';
  return false;
}
