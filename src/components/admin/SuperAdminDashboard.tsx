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
import { getRolePermissions, roleLabel, permissionLabel } from '../../lib/permissions';
import { UserRole } from '../../types/majal';
import { TrustEngine } from './TrustEngine';
import { MarketplaceLiquidity } from './MarketplaceLiquidity';
import { AdminAuditLogs } from './AdminAuditLogs';
import { MajalPulse } from './MajalPulse';
import { PlatformPolicyCenter } from './PlatformPolicyCenter';
import { PredictiveInterventionRadar } from './PredictiveInterventionRadar';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { completedOrderTotals } from '../../lib/money';
import { SurfaceTabs } from '../common/SurfaceTabs';
import { Avatar } from '../common/Avatar';

/** Icon + two-word label + optional state. The long sentence stays available as a tooltip. */
const InfoChip: React.FC<{ icon: React.ReactNode; label: string; status?: string; hint?: string }> = ({ icon, label, status, hint }) => (
  <div title={hint} className="flex items-center gap-2.5 rounded-xl p-3 bg-white/5 border border-white/10 min-w-0">
    <span className="shrink-0" aria-hidden="true">{icon}</span>
    <span className="font-black text-sm text-slate-100 truncate">{label}</span>
    {status && <span className="ms-auto shrink-0 text-xs text-slate-400">{status}</span>}
    {hint && <span className="sr-only">{hint}</span>}
  </div>
);

export const SuperAdminDashboard: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);
  const [activeTab, setActiveTab] = useState<'COMMAND' | 'PERMISSIONS' | 'LIQUIDITY' | 'TRUST' | 'SYSTEM' | 'AUDIT'>('COMMAND');

  const orderTotals = completedOrderTotals(store.orders);
  const metrics = {
    gmv: orderTotals.salesKwd,
    platform: orderTotals.platformFeesKwd,
    live: store.launches.filter(l => ['LIVE', 'PERMANENT'].includes(l.status)).length,
    signed: store.contracts.filter(c => c.status === 'FULLY_SIGNED').length
  };

  const roleRows: UserRole[] = ['SUPER_ADMIN','ADMIN','HOST_OWNER','HOST_OPERATIONS','HOST_CHEF','HOST_FINANCE','HOST_MARKETING','HOST_SUPPORT','CREATOR','CONSUMER'];

  const tabs = [
    ['COMMAND', 'مركز القيادة'],
    ['PERMISSIONS', 'الصلاحيات'],
    ['LIQUIDITY', 'سيولة السوق'],
    ['TRUST', 'الثقة والمخاطر'],
    ['SYSTEM', 'النظام'],
    ['AUDIT', 'سجل التدقيق']
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-100">
      <section className="glass-panel rounded-[32px] p-6 md:p-8 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-[19rem] -end-[17rem] w-[44rem] h-[44rem]" style={{ '--glow': 'rgba(232,121,249,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-200 text-xs font-black"><Crown className="w-4 h-4" /> سوبر أدمن مجال</div>
            <h1 className="text-2xl md:text-4xl font-black">مركز قيادة «مجال»</h1>
            <p className="text-sm text-slate-400 leading-7">السوبر أدمن لا يدير شاشة فقط؛ يدير السوق نفسه: الأدوار، السياسات، المخاطر، سيولة العرض والطلب، سلامة الوصول والبيانات، ومؤشرات الشركة العليا.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full xl:w-auto xl:min-w-[320px]">
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-xs text-slate-400">إجمالي المبيعات (د.ك، طلبات مكتملة)</div><div className="mt-2 text-2xl font-black text-gold-300 font-mono">{metrics.gmv.toFixed(3)}</div></div>
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-xs text-slate-400">رسوم مجال (د.ك)</div><div className="mt-2 text-2xl font-black text-emerald-300 font-mono">{metrics.platform.toFixed(3)}</div></div>
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-xs text-slate-400">إطلاقات حيّة</div><div className="mt-2 text-2xl font-black text-sky-300 font-mono">{metrics.live}</div></div>
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-xs text-slate-400">عقود موقعة</div><div className="mt-2 text-2xl font-black text-fuchsia-300 font-mono">{metrics.signed}</div></div>
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
              { icon: <Network className="w-5 h-5 text-fuchsia-300" />, label: 'إشارات المطابقة', value: store.matches.length }
            ].map((item, idx) => (
              <div key={idx} className="glass-card rounded-2xl p-5 border border-white/10"><div>{item.icon}</div><div className="mt-4 text-xs text-slate-400">{item.label}</div><div className="mt-1 text-3xl font-black font-mono">{item.value}</div></div>
            ))}
          </div>

          <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-6">
            <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-300" /><h2 className="text-lg font-black">النبض التنفيذي</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoChip icon={<Network className="w-4 h-4 text-sky-300" />} label="حركة السوق" status={`${store.creators.length} مبدع / ${store.hosts.length} منشأة`} />
                <InfoChip icon={<KeyRound className="w-4 h-4 text-gold-300" />} label="حماية الحقوق" status={`${store.recipeGrants.length} إذن وصفة`} />
                <InfoChip icon={<Users className="w-4 h-4 text-fuchsia-300" />} label="الفصل التشغيلي" status={`${roleRows.length} أدوار`} />
                <InfoChip icon={<Sparkles className="w-4 h-4 text-emerald-300" />} label="التوسع" />
              </div>
            </section>

            <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
              <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-gold-300" /><h2 className="text-lg font-black">حواجز الحوكمة</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['منع رفع الصلاحية', 'لا يمكن للأدمن منح نفسه صلاحية سوبر أدمن.'],
                  ['حماية الوصفة', 'الوصفة الكاملة لا تُعرض للسوبر أدمن افتراضيًا لمجرد امتلاكه الإدارة.'],
                  ['تدقيق السياسات', 'تغيير السياسات الحساسة يجب أن يسجل في سجل التدقيق.'],
                  ['تعطيل موثّق', 'تعطيل منتج أو منشأة يحتاج سببًا موثقًا وقابلًا للمراجعة.'],
                  ['فصل التسويات', 'التسويات المالية منفصلة عن حسابات التسويق والطبخ.']
                ].map(([label, rule]) => <InfoChip key={label} icon={<BadgeCheck className="w-4 h-4 text-emerald-300" />} label={label} hint={rule} />)}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'PERMISSIONS' && (
        <section className="glass-panel rounded-3xl p-5 md:p-6 border border-white/10 space-y-5">
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-400/20 flex items-center justify-center text-fuchsia-300"><KeyRound className="w-6 h-6" /></div><div><h3 className="text-lg font-black">مصفوفة الصلاحيات</h3><p className="text-xs text-slate-400 mt-1">الصلاحيات العليا محسوبة حسب الدور والسياق، وليست قائمة واحدة مشتركة.</p></div></div>
          <div className="space-y-3">
            {roleRows.map(role => (
              <div key={role} className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="lg:w-40 shrink-0"><div className="font-black text-slate-100">{roleLabel(role)}</div></div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {getRolePermissions(role).map(permission => <span key={permission} className="px-2.5 py-1 rounded-lg bg-slate-950/50 border border-white/10 text-xs text-slate-300" title={permission}>{permissionLabel(permission)}</span>)}
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
                    <div className="min-w-0"><div className="font-bold text-slate-100 break-words sm:truncate" title={user.name}>{user.name}</div><div className="text-xs text-slate-400">{user.email}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={user.role}
                      onChange={e => {
                        const next = e.target.value as UserRole;
                        if (next === user.role) return;
                        // Privileged mutation — confirm before applying. If declined, the
                        // controlled value reverts to user.role on the next render.
                        if (!window.confirm(`تغيير دور «${user.name}» إلى «${roleLabel(next)}»؟ هذا يعدّل صلاحيات الوصول فورًا.`)) {
                          setTick(t => t + 1);
                          return;
                        }
                        store.changeUserRole(user.id, next);
                      }}
                      className="glass-input rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      {roleRows.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                    </select>
                    <button
                      onClick={() => {
                        const suspending = user.status !== 'SUSPENDED';
                        if (!window.confirm(suspending
                          ? `تعليق حساب «${user.name}»؟ سيُمنع من تسجيل الدخول فورًا.`
                          : `إعادة تفعيل حساب «${user.name}»؟`)) return;
                        store.setUserStatus(user.id, suspending ? 'SUSPENDED' : 'ACTIVE');
                      }}
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <InfoChip icon={<Server className="w-4 h-4 text-emerald-300" />} label="طبقة التطبيق" hint="واجهة معيارية تفصل تجارب الأطراف، مع حواجز حماية داخل طبقة الحالة وليس مجرد إخفاء أزرار." />
            <InfoChip icon={<Database className="w-4 h-4 text-sky-300" />} label="مسار البيانات" status={IS_DEMO_MODE ? 'وضع تجريبي' : undefined} hint="المصادقة والجلسات وصندوق القرارات وسجلات التكامل أصبحت خادمية ودائمة. عمليات المجال الحساسة تبقى مقفلة إنتاجيًا حتى نقلها بالكامل إلى واجهة برمجية وقاعدة بيانات وتخزين مشفّر." />
            <InfoChip icon={<FileKey2 className="w-4 h-4 text-fuchsia-300" />} label="النطاقات الحساسة" hint="الوصفات والعقود والأذونات تعامل كبيانات حساسة؛ الوصول الكامل سياقي ومؤقت، وليس نتيجة رتبة إدارية فقط." />
            <InfoChip icon={<Settings2 className="w-4 h-4 text-gold-300" />} label="طبقة السياسات" hint="القيم التشغيلية العليا أصبحت سياسة فعلية قابلة للتحكم من السوبر أدمن وتنعكس مباشرة على منطق المتجر." />
            <InfoChip icon={<ShieldCheck className="w-4 h-4 text-emerald-300" />} label="طبقة الامتثال" hint="بوابة الإطلاق وحالة المستندات والنزاعات وأذونات الوصفة سجلات صريحة ومشتقة من بيانات حقيقية." />
            <InfoChip icon={<Activity className="w-4 h-4 text-rose-300" />} label="الرصد والمراقبة" hint="العمليات الحرجة—الوصول، التوقيع، المختبر، الإطلاق، الطلب، التقييم، السياسة والتسوية—تُصدر أحداث تدقيق واضحة." />
          </div>
        </div>
      )}

      {activeTab === 'AUDIT' && <AdminAuditLogs />}
    </div>
  );
};
