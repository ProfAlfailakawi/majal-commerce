import React, { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  CircleCheck,
  FileCheck2,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Lock,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  ClipboardCheck,
  ChevronDown,
  PauseCircle,
  Wrench
} from 'lucide-react';
import { DnaHubMap } from '../dna/DnaKit';
import { SegBar, MiniRing } from '../common/Viz';
import { MajalMark } from '../brand/MajalMark';
import { shortRef } from '../../lib/displayRef';
import { store } from '../../lib/store';
import { arabicTerms } from '../../lib/arabicTerms';
import { AdminAuditLogs } from './AdminAuditLogs';
import { TrustEngine } from './TrustEngine';
import { StatusPill } from '../common/StatusPill';
import { EmptyState } from '../common/EmptyState';
import { completedOrderTotals } from '../../lib/money';
import { SurfaceTabs } from '../common/SurfaceTabs';
import { EcosystemApprovals } from './EcosystemApprovals';

const GRANTS_VISIBLE = 8;

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'APPROVALS' | 'COMPLIANCE' | 'ACCESS' | 'SETTLEMENTS' | 'RISK' | 'AUDIT'>('OVERVIEW');
  const [notice, setNotice] = useState<string | null>(null);

  const orderTotals = completedOrderTotals(store.orders);
  const totals = {
    totalGmv: orderTotals.salesKwd,
    totalPlatformFees: orderTotals.platformFeesKwd,
    signedContractsCount: store.contracts.filter(c => c.status === 'FULLY_SIGNED').length,
    openDisputes: store.disputes.filter(d => !['RESOLVED', 'CLOSED'].includes(d.status)).length,
    verifiedHosts: store.hosts.filter(h => h.verificationStatus === 'VERIFIED').length
  };

  // Copy of the former overview paragraphs, kept verbatim behind the disclosures below.
  const priorities = [
    'مراجعة طلبات الموردين وإعلانات التوظيف الكويتية قبل النشر، مع متابعة طلبات المبدعين والمنشآت.',
    'متابعة أذونات الإفصاح للوصفات عالية الحساسية.',
    'حل التعارضات بين المبدع والمنشأة حول الشروط التجارية.',
    'تشغيل التسويات المالية وإصدار إشعارات الاستحقاق.',
    'التعامل مع الشكاوى الحرجة أو المخاطر المتعلقة بالجودة.'
  ];
  const limits = [
    'يستطيع الأدمن إيقاف منتج مباشر عند الاشتباه في مشكلة امتثال أو سلامة.',
    'يستطيع اعتماد العقود النموذجية ومراجعة الأذونات والطلبات.',
    'لا يملك الأدمن تغيير سياسات النظام العليا أو منح نفسه صلاحيات السوبر أدمن.',
    'لا يستطيع الأدمن الاطلاع على كل الأسرار إلا وفق سياسة الوصول المعتمدة.',
    'كل إجراء حساس للأدمن يسجل في سجل التدقيق.'
  ];
  // Counts already held by the store; nothing is fetched or invented here.
  const overview = {
    review: store.products.filter(p => p.status === 'SUBMITTED' || p.status === 'SCREENING').length,
    paused: store.products.filter(p => p.status === 'PAUSED').length,
    access: store.recipeGrants.filter(g => g.status === 'REQUESTED').length,
    disputes: totals.openDisputes,
    compliance: store.hosts.filter(h => h.verificationStatus !== 'VERIFIED').length,
    settlements: new Set(store.accruals.filter(a => a.settlementStatus === 'SETTLEMENT_ELIGIBLE').map(a => a.creatorId)).size
  };

  const handleRunMonthlySettlementEngine = async () => {
    const creatorIds = [...new Set(store.accruals.filter(a => a.settlementStatus === 'SETTLEMENT_ELIGIBLE').map(a => a.creatorId))];
    if (creatorIds.length === 0) {
      setNotice('لا توجد مستحقات جديدة مؤهلة لدورة تسوية الآن.');
      setTimeout(() => setNotice(null), 3500);
      return;
    }
    const results = await Promise.all(creatorIds.map(creatorId => Promise.resolve(store.approveSettlementBatch(creatorId))));
    const completed = results.filter(Boolean).length;
    setNotice(`تم إنشاء واعتماد ${completed} دفعة تسوية. الدفع الخارجي لم يُعتبر مكتملًا حتى يتم تأكيده صراحة.`);
    setActiveTab('SETTLEMENTS');
    setTimeout(() => setNotice(null), 4500);
  };

  const renderGrant = (grant: (typeof store.recipeGrants)[number]) => (
              <div key={grant.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-slate-100" title={grant.id}>إذن وصفة — {store.products.find(p => p.id === grant.productId)?.publicName || 'منتج'} <span className="text-slate-400 font-normal">· {store.hosts.find(h => h.id === grant.hostBusinessId)?.commercialName || 'منشأة'}</span></div>
                  <div className="text-xs text-slate-400 mt-1">{grant.purpose}</div>
                </div>
                <div className="sm:text-end flex sm:block items-center justify-between gap-2">
                  <div className="text-sm font-black text-gold-300">L{grant.disclosureLevel}</div>
                  <div className="text-xs text-slate-400 flex items-center justify-end gap-2 mt-1"><span className="whitespace-nowrap">{new Date(grant.grantedAt || grant.requestedAt).toLocaleDateString('ar-KW-u-nu-latn')}</span><StatusPill status={grant.status} /></div>
                </div>
              </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-100">
      <section className="majal-hero glass-panel rounded-[28px] p-6 md:p-8 border border-white/10 relative overflow-hidden">
        <div className="absolute inset-y-0 start-0 w-64 bg-gradient-to-l from-gold-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-300/20 text-gold-300 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>مركز تحكّم أدمن مجال</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">مركز التحكم التشغيلي والامتثال — مجال</h1>
            <p className="text-sm text-slate-300 leading-7">
              طبقة الأدمن مخصصة للتشغيل اليومي: مراجعة الامتثال، أذونات الوصفات، العقود، التسويات، الشكاوى، وسجل التدقيق. أما إدارة النظام الكاملة فتبقى للسوبر أدمن.
            </p>
          </div>

          <button
            onClick={handleRunMonthlySettlementEngine}
            className="px-5 py-3 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black rounded-2xl text-xs flex items-center gap-2 shadow-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>تشغيل محرك التسويات الشهرية</span>
          </button>
        </div>
      </section>

      {notice && (
        <div className="p-4 bg-emerald-500 text-slate-950 rounded-2xl text-sm font-bold">
          <CircleCheck className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}

      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'إجمالي المبيعات (طلبات مكتملة)', value: `${totals.totalGmv.toFixed(3)} د.ك`, icon: <Wallet className="w-5 h-5 text-gold-300" /> },
          { label: 'رسوم المنصة', value: `${totals.totalPlatformFees.toFixed(3)} د.ك`, icon: <BadgeCheck className="w-5 h-5 text-emerald-300" /> },
          { label: 'عقود موقعة', value: `${totals.signedContractsCount}`, icon: <FileCheck2 className="w-5 h-5 text-sky-300" /> },
          { label: 'منشآت مرخّصة', value: `${totals.verifiedHosts}`, icon: <Building2 className="w-5 h-5 text-fuchsia-300" /> },
          { label: 'نزاعات مفتوحة', value: `${totals.openDisputes}`, icon: <AlertTriangle className="w-5 h-5 text-rose-300" /> }
        ].map((card, idx) => (
          <div key={idx} className={`glass-card rounded-2xl p-4 sm:p-5 border border-white/10 min-w-0 ${idx === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <div>{card.icon}</div>
            <div className="mt-3 sm:mt-4 text-xs text-slate-400">{card.label}</div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-slate-100 font-mono break-words">{card.value}</div>
          </div>
        ))}
      </section>

      <SurfaceTabs
        tabs={[
          { id: 'OVERVIEW' as const, label: 'نظرة تشغيلية', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'APPROVALS' as const, label: 'الاعتمادات', icon: <ClipboardCheck className="w-4 h-4" /> },
          { id: 'COMPLIANCE' as const, label: 'الامتثال والمنشآت', icon: <ShieldCheck className="w-4 h-4" /> },
          { id: 'ACCESS' as const, label: 'أذونات الوصفات والعقود', icon: <KeyRound className="w-4 h-4" /> },
          { id: 'SETTLEMENTS' as const, label: 'التسويات', icon: <Banknote className="w-4 h-4" /> },
          { id: 'RISK' as const, label: 'الثقة والمخاطر', icon: <ShieldAlert className="w-4 h-4" /> },
          { id: 'AUDIT' as const, label: 'سجل التدقيق', icon: <ScrollText className="w-4 h-4" /> }
        ]}
        active={activeTab}
        onChange={setActiveTab}
        tone="gold"
        label="أقسام مركز العمليات"
      />

      {activeTab === 'OVERVIEW' && (
        <section className="glass-panel rounded-3xl p-4 sm:p-6 border border-white/10 space-y-5">
          <DnaHubMap
            ariaLabel="خريطة أولويات الأدمن"
            animate={false}
            center={{ icon: <MajalMark size={40} tone="current" />, ariaLabel: 'مجال' }}
            overline="أولويات الأدمن اليومية"
            title="ما ينتظر قرارك اليوم"
            nodes={[
              { key: 'review', icon: <ClipboardCheck />, label: 'منتجات للمراجعة', value: overview.review, state: overview.review ? 'attention' : 'ok', title: 'منتجات مقدَّمة أو قيد الفحص' },
              { key: 'paused', icon: <PauseCircle />, label: 'منتجات موقوفة', value: overview.paused, onClick: () => setActiveTab('COMPLIANCE'), title: priorities[4] },
              { key: 'access', icon: <KeyRound />, label: 'طلبات الوصول', value: overview.access, state: overview.access ? 'attention' : 'ok', onClick: () => setActiveTab('ACCESS'), title: priorities[1] },
              { key: 'disputes', icon: <Gavel />, label: 'نزاعات مفتوحة', value: overview.disputes, state: overview.disputes ? 'attention' : 'ok', onClick: () => setActiveTab('RISK'), title: priorities[2] },
              { key: 'compliance', icon: <Building2 />, label: 'امتثال المنشآت', value: overview.compliance, onClick: () => setActiveTab('COMPLIANCE'), title: 'منشآت لم يكتمل تحققها' },
              { key: 'settlements', icon: <Banknote />, label: 'تسويات مستحقة', value: overview.settlements, onClick: () => setActiveTab('SETTLEMENTS'), title: priorities[3] }
            ]}
          />

          <div className="grid md:grid-cols-2 gap-3">
            {[
              { id: 'priorities', icon: <Users className="w-4 h-4 text-gold-300" />, title: 'أولويات الأدمن اليومية', items: priorities },
              { id: 'limits', icon: <Lock className="w-4 h-4 text-gold-300" />, title: 'حدود صلاحياتك', items: limits }
            ].map(group => (
              <details key={group.id} className="group rounded-2xl bg-white/5 border border-white/10">
                <summary className="list-none flex min-h-12 items-center justify-between gap-2 px-4 cursor-pointer [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2 text-sm font-black text-slate-100">{group.icon}{group.title}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ul className="px-4 pb-3 divide-y divide-dashed divide-slate-700/60">
                  {group.items.map((item, i) => (
                    <li key={item} className="py-2.5 text-xs text-slate-300 leading-6">{item}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'APPROVALS' && <EcosystemApprovals />}

      {activeTab === 'COMPLIANCE' && (
        <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold-300" />
            <h2 className="text-lg font-black">المنشآت الحاضنة وسجل الامتثال</h2>
          </div>
          <div className="space-y-3">
            {store.hosts.map(host => (
              <div key={host.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-100">{host.commercialName}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs border ${host.verificationStatus === 'VERIFIED' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : host.verificationStatus === 'SUSPENDED' || host.verificationStatus === 'EXPIRED_DOCS' ? 'bg-rose-500/10 border-rose-400/20 text-rose-300' : 'bg-amber-500/10 border-amber-400/20 text-amber-300'}`}>
                      {({ VERIFIED: 'مرخّص ومتحقق', PENDING: 'قيد التحقق', NEEDS_ACTION: 'يحتاج إجراء', UNVERIFIED: 'غير متحقق', SUSPENDED: 'موقوف', EXPIRED_DOCS: 'مستندات منتهية' } as Record<string, string>)[host.verificationStatus] ?? host.verificationStatus}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-6">
                    السجل التجاري: {host.commercialRegistrationNo} — الفروع: {host.branches.length} — النطاق السعري: {arabicTerms(host.capabilities.priceBand)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  {host.capabilities.equipment.slice(0, 3).map((item, i) => (
                    <span key={`${item}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5"><Wrench className="w-3 h-3" aria-hidden="true" />{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-5 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-300" /><h3 className="font-black text-slate-100">التحكّم الطارئ بالمنتجات</h3></div>
            <p className="text-xs text-slate-400">إيقاف أو إعادة منتج مباشر عند وجود مشكلة جودة، امتثال أو سلامة. كل إجراء يسجل في سجل التدقيق.</p>
            {store.products.filter(p => p.status === 'LIVE_DROP' || p.status === 'LIVE_TRIAL' || p.status === 'LIVE_PERMANENT' || p.status === 'PAUSED').map(product => (
              <div key={product.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div><div className="font-bold text-slate-100">{product.publicName}</div><div className="mt-1.5"><StatusPill status={product.status} prefix="الحالة" /></div></div>
                {product.status === 'PAUSED' ? (
                  <button
                    onClick={() => { if (window.confirm(`إعادة تشغيل «${product.publicName}» وإتاحته للبيع مجددًا؟`)) store.resumeProduct(product.id); }}
                    className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black">إعادة التشغيل</button>
                ) : (
                  <button
                    onClick={() => {
                      // Emergency stop on a LIVE product: confirm and capture a real reason
                      // (recorded in the audit trail) instead of a hardcoded string.
                      const reason = window.prompt(`سبب الإيقاف الاحترازي لـ«${product.publicName}» (يُسجَّل في التدقيق):`, '');
                      if (reason === null) return;
                      const trimmed = reason.trim();
                      if (trimmed.length < 4) { window.alert('يرجى إدخال سبب واضح (4 أحرف على الأقل).'); return; }
                      store.pauseProduct(product.id, trimmed);
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-400/20 text-xs font-black">إيقاف احترازي</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'ACCESS' && (
        <section className="grid xl:grid-cols-[1fr_1fr] gap-6">
          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-gold-300" />
              <h2 className="text-lg font-black">سجل أذونات خزنة الوصفات</h2>
            </div>
            {store.recipeGrants.slice(0, GRANTS_VISIBLE).map(renderGrant)}
            {store.recipeGrants.length > GRANTS_VISIBLE && (
              <details className="group rounded-2xl border border-white/10 bg-white/[0.03]">
                <summary className="flex items-center gap-2 min-h-11 px-4 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-bold text-slate-200">
                  <Lock className="w-4 h-4 text-gold-300" aria-hidden="true" />
                  <span className="flex-1">عرض المزيد ({store.recipeGrants.length - GRANTS_VISIBLE})</span>
                  <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="space-y-4 p-3 pt-1">{store.recipeGrants.slice(GRANTS_VISIBLE).map(renderGrant)}</div>
              </details>
            )}
          </div>

          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-black">العقود والتعاونات</h2>
            </div>
            {store.contracts.slice(0, 6).map(contract => (
              <div key={contract.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-slate-100"><span title={contract.id}>{(() => { const col = store.collaborations.find(c => c.id === contract.collaborationId); const prod = store.products.find(p => p.id === col?.productId); const host = store.hosts.find(h => h.id === col?.hostBusinessId); return `عقد ${prod?.publicName || 'شراكة'}${host ? ` × ${host.commercialName}` : ''}`; })()} — {contract.versionNumber}</span></div>
                  <div className="mt-1.5"><StatusPill status={contract.status} prefix="الحالة" /></div>
                </div>
                <div className="text-xs text-slate-400">{new Date(contract.createdAt).toLocaleDateString('ar-KW-u-nu-latn')}</div>
              </div>
            ))}
          </div>
        </section>
      )}


      {activeTab === 'SETTLEMENTS' && (
        <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Wallet className="w-5 h-5 text-gold-300" /><h2 className="text-lg font-black">دورة المستحقات</h2></div>
              <p className="text-xs text-slate-400 mt-2 leading-6">الاعتماد الداخلي لا يعني أن التحويل تم. التأكيد مقفول حتى وصول مرجع دفع موثّق إلى الخادم.</p>
            </div>
            <div className="text-xs text-slate-400">{store.settlements.length} دفعات مسجلة</div>
          </div>
          {store.settlements.length > 0 && (() => {
            const total = store.settlements.reduce((a, b) => a + b.totalAmountKwd, 0);
            const paid = store.settlements.filter(b => b.status === 'PAID').reduce((a, b) => a + b.totalAmountKwd, 0);
            return (
              <div className="flex items-center gap-4 rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                <MiniRing value={total ? paid / total : 0} size={64} stroke={7} className="shrink-0 text-emerald-400">{total ? Math.round((paid / total) * 100) : 0}%</MiniRing>
                <div className="flex flex-wrap gap-2 text-xs min-w-0 flex-1">
                  <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 font-bold">مدفوع {paid.toFixed(3)} د.ك</span>
                  <span className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/20 text-amber-300 font-bold">بانتظار الدفع {(total - paid).toFixed(3)} د.ك</span>
                  <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 font-bold">الإجمالي {total.toFixed(3)} د.ك</span>
                </div>
              </div>
            );
          })()}
          <div className="space-y-3">
            {store.settlements.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={<Banknote className="w-6 h-6" />}
                title="ما فيه دفعات تسوية"
                body="الدفعات تظهر هنا بعد احتساب أول دورة مستحقات مؤهلة."
              />
            ) : store.settlements.map(batch => {
              const paidBatch = batch.status === 'PAID';
              const steps = [{ label: 'معتمد', done: true }, { label: 'مدفوع', done: paidBatch }, { label: 'مؤكد', done: paidBatch }];
              return (
              <div key={batch.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-black text-slate-100">{batch.creatorName}</div>
                    <details className="group mt-1 text-xs text-slate-400">
                      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1 max-sm:min-h-11 text-slate-400 hover:text-slate-200">تفاصيل<ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" aria-hidden="true" /></summary>
                      <div className="mt-1.5"><span title={batch.id}>دفعة {shortRef(batch.id, 'ت')}</span> — {new Date(batch.periodStart).toLocaleDateString('ar-KW-u-nu-latn')} إلى {new Date(batch.periodEnd).toLocaleDateString('ar-KW-u-nu-latn')}</div>
                    </details>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-lg font-black text-gold-300 font-mono">{batch.totalAmountKwd.toFixed(3)} د.ك</div>
                    <span className={`px-3 py-1.5 rounded-full text-xs font-black border ${paidBatch ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-amber-500/10 text-amber-300 border-amber-400/20'}`}>{paidBatch ? 'مدفوع ومؤكد' : 'معتمد — بانتظار الدفع'}</span>
                    {batch.status === 'APPROVED' && <button disabled title="يُفعّل بعد ربط مزود الدفع" className="px-3 py-2 rounded-xl bg-slate-700 text-slate-400 text-xs font-black cursor-not-allowed">بانتظار ربط الدفع</button>}
                  </div>
                </div>
                <div aria-hidden="true" className="max-w-sm">
                  <SegBar height={4} segs={steps.map(st => ({ value: 1, className: st.done ? (paidBatch ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-white/10' }))} />
                  <div className="mt-1 grid grid-cols-3 text-xs text-slate-500">{steps.map(st => <span key={st.label} className={st.done ? 'text-slate-300' : ''}>{st.label}</span>)}</div>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === 'RISK' && <TrustEngine />}

      {activeTab === 'AUDIT' && <AdminAuditLogs />}
    </div>
  );
};
