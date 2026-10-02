import React from 'react';
import {
  ChefHat,
  CircleDollarSign,
  Crown,
  Megaphone,
  Settings2,
  ShieldCheck,
  ChevronDown,
  Users,
  Wrench
} from 'lucide-react';
import { store } from '../../lib/store';
import { getRolePermissions, permissionLabel, roleLabel } from '../../lib/permissions';
import { Avatar } from '../common/Avatar';
import { PERMISSION_GROUPS } from '../admin/PermissionMatrix';

interface TeamPermissionsProps {
  hostBusinessId: string;
}

const roleIcon = (role: string) => {
  if (role === 'HOST_OWNER') return <Crown className="w-4 h-4 text-gold-300" />;
  if (role === 'HOST_CHEF') return <ChefHat className="w-4 h-4 text-rose-300" />;
  if (role === 'HOST_FINANCE') return <CircleDollarSign className="w-4 h-4 text-emerald-300" />;
  if (role === 'HOST_MARKETING') return <Megaphone className="w-4 h-4 text-fuchsia-300" />;
  if (role === 'HOST_OPERATIONS') return <Wrench className="w-4 h-4 text-sky-300" />;
  return <Users className="w-4 h-4 text-slate-300" />;
};

export const TeamPermissions: React.FC<TeamPermissionsProps> = ({ hostBusinessId }) => {
  const team = store.users.filter(u => u.hostBusinessId === hostBusinessId);
  const totalPermissions = PERMISSION_GROUPS.reduce((n, g) => n + g.actions.length, 0);

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-300"><Settings2 className="w-6 h-6" /></div>
        <div>
          <h3 className="text-lg font-black text-slate-100">فريق المنشأة</h3>
          <p className="text-xs text-slate-400 mt-1">لا يرى كل موظف كل شيء. الصلاحيات تتبع الدور، والسياق، وحساسية البيانات.</p>
        </div>
      </div>

      {team.length > 0 && (
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="flex gap-1.5">
            {team.map(m => <Avatar key={m.id} name={m.name} src={m.avatar} size={32} shape="squircle" />)}
          </div>
          <span className="text-xs text-slate-400">{team.length} أعضاء</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {team.map(member => {
          const permissions = getRolePermissions(member.role);
          return (
            <div key={member.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={member.name} src={member.avatar} size={44} shape="squircle" />
                <div className="min-w-0">
                  <div className="font-black text-slate-100 break-words sm:truncate" title={member.name}>{member.name}</div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">{roleIcon(member.role)} {roleLabel(member.role)}</div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1" role="img" aria-label={`${permissions.length} من ${totalPermissions} صلاحية`}>
                  {PERMISSION_GROUPS.map(g => {
                    const have = g.actions.filter(a => permissions.includes(a)).length;
                    return <span key={g.label} title={`${g.label}: ${have}/${g.actions.length}`} className="h-1.5 rounded-full bg-white/10 overflow-hidden" style={{ flex: g.actions.length }}><span className="block h-full bg-gold-400" style={{ width: `${(have / g.actions.length) * 100}%` }} /></span>;
                  })}
                  <span className="ps-2 text-xs font-mono tabular-nums text-slate-300">{permissions.length}/{totalPermissions}</span>
                </div>
                <details className="group mt-2">
                  <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">تفاصيل<ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" aria-hidden="true" /></summary>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {permissions.slice(0, 7).map(permission => (
                      <span key={permission} className="px-2.5 py-1 rounded-lg bg-slate-950/50 border border-white/10 text-xs text-slate-400">{permissionLabel(permission)}</span>
                    ))}
                  </div>
                </details>
              </div>
              <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-400/15 text-xs text-slate-400 leading-6 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-emerald-300" /> صلاحيات هذا العضو لا تتجاوز نطاق منشأته.</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
