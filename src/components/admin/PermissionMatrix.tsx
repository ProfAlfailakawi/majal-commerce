import React from 'react';
import { getRolePermissions, roleLabel, PermissionAction } from '../../lib/permissions';
import { UserRole } from '../../types/majal';
import { StateDot } from '../common/Viz';

/** Display-only grouping of the permission codes the app already defines. */
export const PERMISSION_GROUPS: { label: string; actions: PermissionAction[] }[] = [
  { label: 'الدخول', actions: ['VIEW_CREATOR_PORTAL', 'VIEW_HOST_PORTAL', 'VIEW_ADMIN_PORTAL', 'VIEW_SUPER_ADMIN_PORTAL'] },
  { label: 'الوصفات', actions: ['VIEW_RECIPE_L1', 'VIEW_RECIPE_L2', 'VIEW_RECIPE_L3', 'MANAGE_RECIPE_GRANTS'] },
  { label: 'التشغيل', actions: ['MANAGE_CHALLENGES', 'MANAGE_LAB', 'MANAGE_OFFERS', 'SIGN_CONTRACT'] },
  { label: 'المالية', actions: ['VIEW_HOST_FINANCE', 'RUN_SETTLEMENTS'] },
  { label: 'الإدارة', actions: ['MANAGE_COMPLIANCE', 'MANAGE_DISPUTES', 'MANAGE_USERS', 'MANAGE_ROLES', 'CHANGE_PLATFORM_POLICY', 'PAUSE_PRODUCT'] },
  { label: 'الرقابة', actions: ['VIEW_AUDIT_LOGS', 'VIEW_RISK_ENGINE'] }
];

/** Compact role × capability-group dot matrix, computed from getRolePermissions(). */
export const PermissionMatrix: React.FC<{ roles: UserRole[] }> = ({ roles }) => (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-2.5 sm:p-4 overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-400">
          <th scope="col" className="text-start font-bold pb-2 pe-3">الدور</th>
          {PERMISSION_GROUPS.map(g => <th key={g.label} scope="col" className="font-bold pb-2 px-0.5 sm:px-1.5 text-center whitespace-nowrap max-sm:text-[11px]">{g.label}</th>)}
          <th scope="col" className="hidden sm:table-cell font-bold pb-2 ps-2 text-center">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {roles.map(role => {
          const perms = getRolePermissions(role);
          const total = PERMISSION_GROUPS.reduce((n, g) => n + g.actions.length, 0);
          return (
            <tr key={role} className="border-t border-white/5">
              <th scope="row" className="text-start font-black text-slate-100 py-2 pe-2 sm:pe-3 max-sm:w-[5.5rem] max-sm:leading-4 sm:whitespace-nowrap">{roleLabel(role)}</th>
              {PERMISSION_GROUPS.map(g => {
                const have = g.actions.filter(a => perms.includes(a)).length;
                return <td key={g.label} className="px-0.5 sm:px-1.5 py-2 text-center"><StateDot have={have} of={g.actions.length} title={`${g.label}: ${have}/${g.actions.length}`} /></td>;
              })}
              <td className="hidden sm:table-cell ps-2 py-2 text-center font-mono tabular-nums text-slate-300 whitespace-nowrap">{perms.length}/{total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
      <span className="flex items-center gap-1.5"><StateDot have={1} of={1} />كاملة</span>
      <span className="flex items-center gap-1.5"><StateDot have={1} of={2} />جزئية</span>
      <span className="flex items-center gap-1.5"><StateDot have={0} of={1} />لا يوجد</span>
    </div>
  </div>
);
