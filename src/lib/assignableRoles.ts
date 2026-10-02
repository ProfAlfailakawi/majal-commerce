import type { UserRole } from '../types/majal';

/*
 * الأدوار التي يجوز للسوبر أدمن إسنادها عبر POST /api/v1/moderation/users/:id/role.
 * مصدر واحد مشترك بين الخادم (server/moderation.ts) والواجهة (قائمة تغيير الدور) حتى لا
 * تتباعد المجموعتان. SUPER_ADMIN مستثنى عمدًا: حسابات السوبر أدمن تُدار عبر bootstrap فقط.
 * وهو ملف خالٍ من أي اعتماد على node/express فيصلح للمتصفح.
 */
export const ASSIGNABLE_ROLES: readonly UserRole[] = [
  'CREATOR', 'HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE',
  'HOST_MARKETING', 'HOST_SUPPORT', 'ADMIN', 'CONSUMER'
];

/** خيارات قائمة تغيير الدور: الأدوار القابلة للإسناد فقط، مع إبقاء الدور الحالي ظاهرًا كقيمة مختارة. */
export function roleChangeOptions(currentRole: UserRole, roles: readonly UserRole[] = ASSIGNABLE_ROLES): UserRole[] {
  return roles.includes(currentRole) ? [...roles] : [currentRole, ...roles];
}
