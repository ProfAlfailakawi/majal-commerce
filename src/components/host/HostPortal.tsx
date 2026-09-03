import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  CircleDollarSign,
  Factory,
  FlaskConical,
  LayoutDashboard,
  Plus,
  Radar,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { store } from '../../lib/store';
import { HostBusiness } from '../../types/majal';
import { hasPermission, roleLabel } from '../../lib/permissions';
import { ProductDiscovery } from './ProductDiscovery';
import { ChallengePublisher } from './ChallengePublisher';
import { LabWorkspace } from './LabWorkspace';
import { OfferBuilder } from './OfferBuilder';
import { LaunchGateManager } from './LaunchGateManager';
import { ContractModal } from '../common/ContractModal';
import { DealRoom } from '../common/DealRoom';
import { DigitalTwinPanel } from '../common/DigitalTwinPanel';
import { LaunchWarRoom } from './LaunchWarRoom';
import { TeamPermissions } from './TeamPermissions';
import { StatusPill } from '../common/StatusPill';
import { SurfaceTabs } from '../common/SurfaceTabs';

export const HostPortal: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DISCOVERY' | 'CHALLENGES' | 'LAB' | 'WAR_ROOM' | 'FINANCE' | 'TEAM'>('OVERVIEW');
  const [showPublisher, setShowPublisher] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);

  const currentHostId = store.activeUser.hostBusinessId || '';
  const host = store.hosts.find(h => h.id === currentHostId);
  const myCollaborations = store.collaborations.filter(c => c.hostBusinessId === currentHostId);
  const activeCol = myCollaborations[0];
  const activeProduct = activeCol ? store.products.find(p => p.id === activeCol.productId) : undefined;
  const hostOrders = store.orders.filter(o => o.hostBusinessId === currentHostId);

  const canSeeFinance = hasPermission(store.activeUser, 'VIEW_HOST_FINANCE');
  const canDiscover = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_MARKETING'].includes(store.activeUser.role);
  const canSeeTwin = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF'].includes(store.activeUser.role);
  const canSeeWarRoom = ['HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_MARKETING', 'HOST_SUPPORT'].includes(store.activeUser.role);

  const finance = useMemo(() => ({
    gmv: hostOrders.reduce((s, o) => s + o.grossAmountKwd, 0),
    hostNet: hostOrders.reduce((s, o) => s + o.hostNetKwd, 0),
    creatorRoyalties: hostOrders.reduce((s, o) => s + o.creatorRoyaltyKwd, 0),
    platformFees: hostOrders.reduce((s, o) => s + o.platformFeeKwd, 0)
  }), [hostOrders]);

  useEffect(() => {
    const forbidden =
      (activeTab === 'DISCOVERY' && !canDiscover) ||
      (activeTab === 'CHALLENGES' && !hasPermission(store.activeUser, 'MANAGE_CHALLENGES')) ||
      (activeTab === 'LAB' && !(hasPermission(store.activeUser, 'MANAGE_LAB') || hasPermission(store.activeUser, 'MANAGE_OFFERS'))) ||
      (activeTab === 'WAR_ROOM' && !canSeeWarRoom) ||
      (activeTab === 'FINANCE' && !canSeeFinance) ||
      (activeTab === 'TEAM' && store.activeUser.role !== 'HOST_OWNER');
    if (forbidden) setActiveTab('OVERVIEW');
  }, [store.activeUser.id, store.activeUser.role, activeTab, canDiscover, canSeeFinance, canSeeWarRoom]);

  const tabs = [
    { id: 'OVERVIEW', label: 'الرئيسية', icon: <LayoutDashboard className="w-4 h-4" />, show: true },
    { id: 'DISCOVERY', label: 'اكتشاف المنتجات', icon: <Radar className="w-4 h-4" />, show: canDiscover },
    { id: 'CHALLENGES', label: 'التحديات', icon: <Sparkles className="w-4 h-4" />, show: hasPermission(store.activeUser, 'MANAGE_CHALLENGES') },
    { id: 'LAB', label: 'المختبر والصفقة', icon: <FlaskConical className="w-4 h-4" />, show: hasPermission(store.activeUser, 'MANAGE_LAB') || hasPermission(store.activeUser, 'MANAGE_OFFERS') },
    { id: 'WAR_ROOM', label: 'غرفة الإطلاق', icon: <Rocket className="w-4 h-4" />, show: canSeeWarRoom },
    { id: 'FINANCE', label: 'المالية', icon: <CircleDollarSign className="w-4 h-4" />, show: canSeeFinance },
    { id: 'TEAM', label: 'الفريق والصلاحيات', icon: <Settings2 className="w-4 h-4" />, show: store.activeUser.role === 'HOST_OWNER' }
  ].filter(t => t.show) as { id: typeof activeTab; label: string; icon: React.ReactNode }[];

  if (!host) {
    if (store.activeUser.role === 'HOST_OWNER') {
      return (
        <div className="max-w-3xl mx-auto p-8 text-center text-slate-400 space-y-4">
          <Building2 className="w-12 h-12 mx-auto text-slate-500 opacity-50" />
          <h2 className="text-xl font-bold text-slate-200">لا توجد منشأة مرتبطة بحسابك</h2>
          <p>للبدء في استخدام منصة المنشآت، يرجى إنشاء ملف منشأتك.</p>
          <button 
            onClick={() => {
              const newHost: HostBusiness = {
                id: 'hst_' + Math.random().toString(36).substr(2, 9),
                commercialName: 'منشأة جديدة (تجريبية)',
                businessType: 'RESTAURANT',
                commercialRegistrationNo: 'CR-' + Math.floor(Math.random() * 100000),
                verificationStatus: 'VERIFIED',
                branches: [{ id: 'br_1', name: 'الفرع الرئيسي', area: 'العاصمة', isActive: true }],
                capabilities: {
                  equipment: ['فرن', 'خلاط'],
                  cuisines: ['مخبوزات', 'حلويات'],
                  dietary: ['عضوي'],
                  packaging: ['علب كرتون'],
                  storage: ['تبريد عادي'],
                  batchCapacityMin: 10,
                  batchCapacityMax: 500,
                  serviceModels: ['DINE_IN', 'DELIVERY'],
                  priceBand: '5.0 - 15.0 KWD',
                  leadTimeDays: 2
                },
                brandPositioning: 'عصري وحديث',
                targetAudience: 'العائلات والشباب',
                contacts: [{ name: 'المالك', role: 'مدير عام', phone: '+965 99999999', email: 'owner@host.kw' }],
                logoUrl: '',
                createdAt: new Date().toISOString()
              };
              store.hosts = [...store.hosts, newHost];
              store.activeUser = { ...store.activeUser, hostBusinessId: newHost.id };
              setTick(t => t + 1);
            }}
            className="mt-4 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> إنشاء منشأة افتراضية للبدء
          </button>
        </div>
      );
    }
    return <div className="max-w-3xl mx-auto p-8 text-center text-slate-400">لا توجد منشأة مرتبطة بهذا الحساب. الرجاء التواصل مع المالك.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-100">
      <section className="glass-panel rounded-[30px] p-6 md:p-8 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-[18rem] -right-[17rem] w-[42rem] h-[42rem]" style={{ '--glow': 'rgba(56,189,248,0.08)' } as React.CSSProperties} />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src={host.logoUrl} alt={host.commercialName} decoding="async" className="w-20 h-20 rounded-3xl object-cover ring-2 ring-sky-400/25 shadow-xl" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-400/20 text-[10px] font-black">LICENSED HOST</span>
                <span className="px-2.5 py-1 rounded-full bg-gold-500/10 text-gold-300 border border-gold-300/20 text-[10px] font-black">{roleLabel(store.activeUser.role)}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black mt-2">{host.commercialName}</h1>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-7">Innovation OS للمنشأة: اكتشاف مواهب، اختبار منتج، تفاوض، إطلاق، تشغيل وقياس — بصلاحيات مختلفة لكل عضو فريق.</p>
            </div>
          </div>

          {hasPermission(store.activeUser, 'MANAGE_CHALLENGES') && (
            <button onClick={() => setShowPublisher(true)} className="px-5 py-3 rounded-2xl bg-gradient-to-l from-gold-500 to-gold-300 text-slate-950 text-xs font-black flex items-center gap-2"><Plus className="w-4 h-4" /> نشر تحدي ابتكار</button>
          )}
        </div>
      </section>

      <SurfaceTabs tabs={tabs} active={activeTab} onChange={setActiveTab} tone="sky" label="أقسام مساحة المنشأة" />

      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'التعاونات', value: myCollaborations.length, icon: <Sparkles className="w-4 h-4 text-fuchsia-300" /> },
              { label: 'الفروع', value: host.branches.length, icon: <Building2 className="w-4 h-4 text-sky-300" /> },
              { label: canSeeFinance ? 'GMV' : 'الإطلاقات', value: canSeeFinance ? `${finance.gmv.toFixed(3)} د.ك` : store.launches.filter(l => l.hostBusinessId === currentHostId && ['LIVE','PERMANENT'].includes(l.status)).length, icon: <Activity className="w-4 h-4 text-emerald-300" /> },
              { label: canSeeFinance ? 'صافي المنشأة' : 'المنتجات النشطة', value: canSeeFinance ? `${finance.hostNet.toFixed(3)} د.ك` : store.products.filter(p => myCollaborations.some(c => c.productId === p.id) && !['PAUSED','COMPLETED'].includes(p.status)).length, icon: <CircleDollarSign className="w-4 h-4 text-gold-300" /> }
            ].map((item, idx) => (
              <div key={idx} className="glass-card rounded-2xl p-4 border border-white/10"><div className="flex items-center gap-2 text-[11px] text-slate-400">{item.icon}{item.label}</div><div className="mt-2 text-xl font-black text-slate-100 font-mono">{item.value}</div></div>
            ))}
          </div>

          {canDiscover && <ProductDiscovery />}
          {canSeeTwin && activeProduct && activeCol && (
            <DigitalTwinPanel product={activeProduct} hostBusinessId={currentHostId} collaborationId={activeCol.id} />
          )}
          {canSeeWarRoom && <LaunchWarRoom hostBusinessId={currentHostId} />}
          {!canDiscover && !canSeeTwin && !canSeeWarRoom && canSeeFinance && (
            <div className="glass-panel rounded-3xl p-6 border border-white/10 text-sm text-slate-400 leading-7">هذا الحساب مالي؛ تم إخفاء أدوات الاكتشاف والوصفة والمختبر. استخدم تبويب المالية لمتابعة الأرقام المصرح بها فقط.</div>
          )}
        </div>
      )}

      {activeTab === 'DISCOVERY' && <ProductDiscovery />}

      {activeTab === 'CHALLENGES' && (
        <div className="space-y-5">
          <div className="glass-panel rounded-3xl p-5 border border-white/10 flex items-center justify-between gap-4">
            <div><h3 className="font-black text-lg">تحديات الابتكار</h3><p className="text-xs text-slate-400 mt-1">حوّل احتياج المنشأة إلى Brief واضح يستقبل حلول المبدعين.</p></div>
            <button onClick={() => setShowPublisher(true)} className="px-4 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black flex items-center gap-2"><Plus className="w-4 h-4" /> تحدٍ جديد</button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {store.challenges.filter(c => c.hostBusinessId === currentHostId).map(ch => (
              <article key={ch.id} className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between"><StatusPill status={ch.status} /><span className="text-[10px] text-slate-500">{ch.estimatedVolumeUnits} وحدة متوقعة</span></div>
                <h4 className="font-black text-slate-100">{ch.title}</h4>
                <p className="text-xs text-slate-400 leading-6">{ch.brief}</p>
                <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl p-3 bg-white/5 border border-white/10">سعر مستهدف <strong className="block mt-1">{ch.targetPriceKwd.toFixed(3)} د.ك</strong></div><div className="rounded-xl p-3 bg-white/5 border border-white/10">سقف التكلفة <strong className="block mt-1">{ch.costCeilingKwd.toFixed(3)} د.ك</strong></div></div>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'LAB' && activeCol && (
        <div className="space-y-6">
          <DealRoom collaboration={activeCol} />
          {hasPermission(store.activeUser, 'MANAGE_LAB') && <LabWorkspace collaboration={activeCol} />}
          {hasPermission(store.activeUser, 'MANAGE_OFFERS') && <OfferBuilder collaboration={activeCol} />}
          <LaunchGateManager collaboration={activeCol} />
          {activeCol.contract && <button onClick={() => setSelectedContract(activeCol.contract)} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black">فتح العقد التجاري</button>}
        </div>
      )}

      {activeTab === 'WAR_ROOM' && <LaunchWarRoom hostBusinessId={currentHostId} />}

      {activeTab === 'FINANCE' && (
        <section className="glass-panel rounded-3xl p-5 md:p-6 border border-white/10 space-y-5">
          <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300"><CircleDollarSign className="w-6 h-6" /></div><div><h3 className="text-lg font-black">Finance Surface</h3><p className="text-xs text-slate-400 mt-1">هذه الشاشة تظهر فقط للأدوار المصرح لها ماليًا.</p></div></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['GMV', finance.gmv], ['صافي المنشأة', finance.hostNet], ['حقوق المبدعين', finance.creatorRoyalties], ['رسوم مجال', finance.platformFees]
            ].map(([label, value], idx) => <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10"><div className="text-xs text-slate-400">{label as string}</div><div className="mt-2 text-xl font-black font-mono">{Number(value).toFixed(3)} د.ك</div></div>)}
          </div>
          <div className="rounded-2xl p-4 bg-sky-500/5 border border-sky-400/15 text-xs text-slate-300 leading-6 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 mt-1 text-sky-300" /> فصل الصلاحيات المالية يمنع الشيف والتسويق من تعديل أو اعتماد قواعد التسوية والعقود المالية.</div>
        </section>
      )}

      {activeTab === 'TEAM' && <TeamPermissions hostBusinessId={currentHostId} />}

      {showPublisher && <ChallengePublisher isOpen={showPublisher} onClose={() => setShowPublisher(false)} />}
      {selectedContract && <ContractModal isOpen={!!selectedContract} onClose={() => setSelectedContract(null)} contract={selectedContract} />}
    </div>
  );
};
