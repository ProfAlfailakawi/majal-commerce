import React, { useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Building2,
  Crown,
  Database,
  FileKey2,
  KeyRound,
  Network,
  Scale,
  ScrollText,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { store } from '../../lib/store';
import { getRolePermissions, roleLabel } from '../../lib/permissions';
import { UserRole } from '../../types/majal';
import { TrustEngine } from './TrustEngine';
import { MarketplaceLiquidity } from './MarketplaceLiquidity';
import { AdminAuditLogs } from './AdminAuditLogs';
import { MajalPulse } from './MajalPulse';
import { PlatformPolicyCenter } from './PlatformPolicyCenter';
import { PredictiveInterventionRadar } from './PredictiveInterventionRadar';
import { SurfaceTabs } from '../common/SurfaceTabs';
import { Avatar } from '../common/Avatar';

export const SuperAdminDashboard: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  const [activeTab, setActiveTab] = useState<'COMMAND' | 'PERMISSIONS' | 'LIQUIDITY' | 'TRUST' | 'SYSTEM' | 'AUDIT'>('COMMAND');

  const metrics = {
    gmv: store.orders.reduce((s, o) => s + o.grossAmountKwd, 0),
    platform: store.orders.reduce((s, o) => s + o.platformFeeKwd, 0),
    live: store.launches.filter(l => ['LIVE', 'PERMANENT'].includes(l.status)).length,
    signed: store.contracts.filter(c => c.status === 'FULLY_SIGNED').length
  };

  const roleRows: UserRole[] = ['SUPER_ADMIN','ADMIN','HOST_OWNER','HOST_OPERATIONS','HOST_CHEF','HOST_FINANCE','HOST_MARKETING','HOST_SUPPORT','CREATOR','CONSUMER'];

  const tabs = [
    ['COMMAND', 'Command Center'],
    ['PERMISSIONS', 'الصلاحيات'],
    ['LIQUIDITY', 'سيولة السوق'],
    ['TRUST', 'الثقة والمخاطر'],
    ['SYSTEM', 'النظام'],
    ['AUDIT', 'Audit Log']
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-100">
      <section className="glass-panel rounded-[32px] p-6 md:p-8 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-[19rem] -left-[17rem] w-[44rem] h-[44rem]" style={{ '--glow': 'rgba(232,121,249,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-200 text-xs font-black"><Crown className="w-4 h-4" /> MAJAL SUPER ADMIN</div>
            <h1 className="text-2xl md:text-4xl font-black">Command Center — مركز قيادة «مجال»</h1>
            <p className="text-sm text-slate-400 leading-7">السوبر أدمن لا يدير شاشة فقط؛ يدير السوق نفسه: الأدوار، السياسات، المخاطر، سيولة العرض والطلب، سلامة الوصول والبيانات، ومؤشرات الشركة العليا.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[320px]">
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-[11px] text-slate-500">GMV</div><div className="mt-2 text-2xl font-black text-gold-300 font-mono">{metrics.gmv.toFixed(3)}</div></div>
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-[11px] text-slate-500">رسوم مجال</div><div className="mt-2 text-2xl font-black text-emerald-300 font-mono">{metrics.platform.toFixed(3)}</div></div>
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-[11px] text-slate-500">إطلاقات LIVE</div><div className="mt-2 text-2xl font-black text-sky-300 font-mono">{metrics.live}</div></div>
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-[11px] text-slate-500">عقود موقعة</div><div className="mt-2 text-2xl font-black text-fuchsia-300 font-mono">{metrics.signed}</div></div>
          </div>
        </div>
      </section>

      <SurfaceTabs
        tabs={[
          { id: 'COMMAND' as const, label: 'مركز القيادة', icon: <Crown className="w-4 h-4" /> },
          { id: 'PERMISSIONS' as const, label: 'الصلاحيات', icon: <Users className="w-4 h-4" /> },
          { id: 'LIQUIDITY' as const, label: 'سيولة السوق', icon: <Scale className="w-4 h-4" /> },
          { id: 'TRUST' as const, label: 'الثقة والمخاطر', icon: <ShieldAlert className="w-4 h-4" /> },
          { id: 'SYSTEM' as const, label: 'النظام', icon: <Settings2 className="w-4 h-4" /> },
          { id: 'AUDIT' as const, label: 'سجل التدقيق', icon: <ScrollText className="w-4 h-4" /> }
        ]}
        active={activeTab}
        onChange={setActiveTab}
        tone="fuchsia"
        label="أقسام مركز القيادة"
      />

      {activeTab === 'COMMAND' && (
        <div className="space-y-6">
          <MajalPulse />
          <PredictiveInterventionRadar onNavigate={target => setActiveTab(target)} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <Users className="w-5 h-5 text-sky-300" />, label: 'الحسابات', value: store.users.length },
              { icon: <Sparkles className="w-5 h-5 text-emerald-300" />, label: 'المبدعون', value: store.creators.length },
              { icon: <Building2 className="w-5 h-5 text-gold-300" />, label: 'المنشآت', value: store.hosts.length },
              { icon: <Network className="w-5 h-5 text-fuchsia-300" />, label: 'Matches', value: store.matches.length }
            ].map((item, idx) => (
              <div key={idx} className="glass-card rounded-2xl p-5 border border-white/10"><div>{item.icon}</div><div className="mt-4 text-xs text-slate-400">{item.label}</div><div className="mt-1 text-3xl font-black font-mono">{item.value}</div></div>
            ))}
          </div>

          <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-6">
            <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-300" /><h2 className="text-lg font-black">Executive Pulse</h2></div>
              {[
                ['حركة السوق', 'المنصة تملك عرضًا من المبدعين وطلبات من المنشآت ويمكن قياس التوازن في Liquidity Center.'],
                ['حماية الحقوق', 'كل Recipe Grant وسجل عقد وتغيير حساس يدخل في Audit Trail.'],
                ['الفصل التشغيلي', 'صلاحيات المالية، الشيف، التسويق، الأدمن والسوبر أدمن منفصلة.'],
                ['التوسع', 'نواة المنصة مصممة لتبدأ بالطعام ثم تضيف Verticals جديدة بنفس محرك الشراكة.']
              ].map(([title, body], idx) => <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="font-black text-slate-100">{title}</div><div className="text-xs text-slate-400 mt-2 leading-6">{body}</div></div>)}
            </section>

            <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-gold-300" /><h2 className="text-lg font-black">Governance Guardrails</h2></div>
              {[
                'لا يمكن للأدمن منح نفسه صلاحية سوبر أدمن.',
                'الوصفة الكاملة لا تُعرض للسوبر أدمن افتراضيًا لمجرد امتلاكه الإدارة.',
                'تغيير السياسات الحساسة يجب أن يسجل في سجل التدقيق.',
                'تعطيل منتج أو منشأة يحتاج سببًا موثقًا وقابلًا للمراجعة.',
                'التسويات المالية منفصلة عن حسابات التسويق والطبخ.'
              ].map((body, idx) => <div key={idx} className="rounded-xl p-3 bg-slate-950/45 border border-white/10 text-xs text-slate-400 leading-6 flex gap-2"><BadgeCheck className="w-4 h-4 shrink-0 mt-1 text-emerald-300" />{body}</div>)}
            </section>
          </div>
        </div>
      )}

      {activeTab === 'PERMISSIONS' && (
        <section className="glass-panel rounded-3xl p-5 md:p-6 border border-white/10 space-y-5">
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-300"><KeyRound className="w-6 h-6" /></div><div><h3 className="text-lg font-black">Permission Matrix</h3><p className="text-xs text-slate-400 mt-1">الصلاحيات العليا محسوبة حسب الدور والسياق، وليست قائمة واحدة مشتركة.</p></div></div>
          <div className="space-y-3">
            {roleRows.map(role => (
              <div key={role} className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div><div className="font-black text-slate-100">{roleLabel(role)}</div><div className="text-[10px] text-slate-500 mt-1">{role}</div></div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {getRolePermissions(role).map(permission => <span key={permission} className="px-2 py-1 rounded-lg bg-slate-950/50 border border-white/10 text-[10px] text-slate-400">{permission}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-5 border-t border-white/10">
            <div className="flex items-center gap-2 mb-4"><Users className="w-5 h-5 text-sky-300" /><h4 className="font-black text-slate-100">إدارة الحسابات الفعلية</h4></div>
            <div className="grid md:grid-cols-2 gap-3">
              {store.users.filter(u => u.id !== store.activeUser.id).map(user => (
                <div key={user.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} src={user.avatar} size={40} shape="squircle" />
                    <div className="min-w-0"><div className="font-bold text-slate-100 truncate">{user.name}</div><div className="text-[10px] text-slate-500">{user.email}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={user.role}
                      onChange={e => store.changeUserRole(user.id, e.target.value as UserRole)}
                      className="glass-input rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      {roleRows.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                    <button
                      onClick={() => store.setUserStatus(user.id, user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')}
                      className={`px-3 py-2 rounded-xl text-xs font-black border ${user.status === 'SUSPENDED' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-rose-500/10 text-rose-300 border-rose-400/20'}`}
                    >
                      {user.status === 'SUSPENDED' ? 'إعادة التفعيل' : 'تعليق الحساب'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'LIQUIDITY' && <MarketplaceLiquidity />}
      {activeTab === 'TRUST' && <TrustEngine />}

      {activeTab === 'SYSTEM' && (
        <div className="space-y-6">
          <PlatformPolicyCenter />
          <div className="grid lg:grid-cols-3 gap-4">
            {[
              { icon: <Server className="w-5 h-5 text-emerald-300" />, title: 'Application Layer', body: 'واجهة React/Vite معيارية تفصل تجارب الأطراف، مع Domain Guards داخل طبقة الحالة وليس مجرد إخفاء أزرار.' },
              { icon: <Database className="w-5 h-5 text-sky-300" />, title: 'Production Data Path', body: 'المصادقة والجلسات وصندوق القرارات وسجلات التكامل أصبحت خادمية ودائمة. عمليات المجال الحساسة تبقى مقفلة إنتاجيًا حتى نقلها بالكامل إلى API وPostgreSQL وObject Storage مشفّر.' },
              { icon: <FileKey2 className="w-5 h-5 text-fuchsia-300" />, title: 'Sensitive Domains', body: 'الوصفات والعقود والأذونات تعامل كبيانات حساسة؛ الوصول الكامل سياقي ومؤقت، وليس نتيجة رتبة إدارية فقط.' },
              { icon: <Settings2 className="w-5 h-5 text-gold-300" />, title: 'Policy Layer', body: 'القيم التشغيلية العليا أصبحت سياسة فعلية قابلة للتحكم من السوبر أدمن وتنعكس مباشرة على منطق المتجر.' },
              { icon: <ShieldCheck className="w-5 h-5 text-emerald-300" />, title: 'Compliance Layer', body: 'Launch Gate وحالة المستندات والنزاعات وأذونات الوصفة Records صريحة ومشتقة من بيانات حقيقية.' },
              { icon: <Activity className="w-5 h-5 text-rose-300" />, title: 'Observability', body: 'العمليات الحرجة—الوصول، التوقيع، المختبر، الإطلاق، الطلب، التقييم، السياسة والتسوية—تُصدر أحداث Audit واضحة.' }
            ].map((card, idx) => <section key={idx} className="glass-card rounded-3xl p-5 border border-white/10"><div>{card.icon}</div><h3 className="font-black mt-4">{card.title}</h3><p className="text-xs text-slate-400 leading-6 mt-2">{card.body}</p></section>)}
          </div>
        </div>
      )}

      {activeTab === 'AUDIT' && <AdminAuditLogs />}
    </div>
  );
};
