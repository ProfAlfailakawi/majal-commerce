import React from 'react';
import {
  ChefHat,
  CircleDollarSign,
  Crown,
  Megaphone,
  Settings2,
  ShieldCheck,
  Users,
  Wrench
} from 'lucide-react';
import { store } from '../../lib/store';
import { getRolePermissions, roleLabel } from '../../lib/permissions';
import { Avatar } from '../common/Avatar';

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

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-300"><Settings2 className="w-6 h-6" /></div>
        <div>
          <h3 className="text-lg font-black text-slate-100">فريق المنشأة</h3>
          <p className="text-xs text-slate-400 mt-1">لا يرى كل موظف كل شيء. الصلاحيات تتبع الدور، والسياق، وحساسية البيانات.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {team.map(member => {
          const permissions = getRolePermissions(member.role);
          return (
            <div key={member.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={member.name} src={member.avatar} size={44} shape="squircle" />
                <div className="min-w-0">
                  <div className="font-black text-slate-100 truncate">{member.name}</div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">{roleIcon(member.role)} {roleLabel(member.role)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {permissions.slice(0, 7).map(permission => (
                  <span key={permission} className="px-2.5 py-1 rounded-lg bg-slate-950/50 border border-white/10 text-[10px] text-slate-400">{permission}</span>
                ))}
              </div>
              <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-400/15 text-[11px] text-slate-400 leading-6 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-emerald-300" /> صلاحيات هذا العضو لا تتجاوز نطاق منشأته.</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
