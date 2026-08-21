import React, { useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Lock,
  Building2,
  FileCheck2,
  AlertTriangle,
  ScrollText,
  Wallet,
  Gavel,
  Users,
  BadgeCheck
} from 'lucide-react';
import { store } from '../../lib/store';
import { AdminAuditLogs } from './AdminAuditLogs';
import { TrustEngine } from './TrustEngine';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'COMPLIANCE' | 'ACCESS' | 'SETTLEMENTS' | 'RISK' | 'AUDIT'>('OVERVIEW');
  const [notice, setNotice] = useState<string | null>(null);

  const totals = {
    totalGmv: store.accruals.reduce((sum, a) => sum + a.grossSaleKwd, 0),
    totalPlatformFees: store.orders.reduce((sum, o) => sum + o.platformFeeKwd, 0),
    signedContractsCount: store.contracts.filter(c => c.status === 'FULLY_SIGNED').length,
    openDisputes: store.disputes.filter(d => !['RESOLVED', 'CLOSED'].includes(d.status)).length,
    verifiedHosts: store.hosts.filter(h => h.verificationStatus === 'VERIFIED').length
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-stone-100">
      <section className="glass-panel rounded-[28px] p-6 md:p-8 border border-white/10 relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-[#c7a55b]/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#c7a55b]/10 border border-[#e8c880]/20 text-[#e8c880] text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Majal Admin Control Center</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">مركز التحكم التشغيلي والامتثال — مجال</h1>
            <p className="text-sm text-stone-300 leading-7">
              طبقة الأدمن مخصصة للتشغيل اليومي: مراجعة الامتثال، أذونات الوصفات، العقود، التسويات، الشكاوى، وسجل التدقيق. أما إدارة النظام الكاملة فتبقى للسوبر أدمن.
            </p>
          </div>

          <button
            onClick={handleRunMonthlySettlementEngine}
            className="px-5 py-3 bg-gradient-to-r from-[#c7a55b] to-[#e0c57d] hover:from-[#d5b66d] hover:to-[#ebd288] text-stone-950 font-black rounded-2xl text-xs flex items-center gap-2 shadow-lg transition-transform hover:scale-[1.02]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>تشغيل محرك التسويات الشهرية</span>
          </button>
        </div>
      </section>

      {notice && (
        <div className="p-4 bg-emerald-500 text-stone-950 rounded-2xl text-sm font-bold">
          ✓ {notice}
        </div>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          { label: 'GMV', value: `${totals.totalGmv.toFixed(3)} د.ك`, icon: <Wallet className="w-5 h-5 text-[#e8c880]" /> },
          { label: 'رسوم المنصة', value: `${totals.totalPlatformFees.toFixed(3)} د.ك`, icon: <BadgeCheck className="w-5 h-5 text-emerald-300" /> },
          { label: 'عقود موقعة', value: `${totals.signedContractsCount}`, icon: <FileCheck2 className="w-5 h-5 text-sky-300" /> },
          { label: 'منشآت مرخّصة', value: `${totals.verifiedHosts}`, icon: <Building2 className="w-5 h-5 text-fuchsia-300" /> },
          { label: 'نزاعات مفتوحة', value: `${totals.openDisputes}`, icon: <AlertTriangle className="w-5 h-5 text-rose-300" /> }
        ].map((card, idx) => (
          <div key={idx} className="glass-card rounded-2xl p-5 border border-white/10">
            <div>{card.icon}</div>
            <div className="mt-4 text-xs text-stone-400">{card.label}</div>
            <div className="mt-1 text-2xl font-black text-stone-100 font-mono">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {[
          ['OVERVIEW', 'نظرة تشغيلية'],
          ['COMPLIANCE', 'الامتثال والمنشآت'],
          ['ACCESS', 'أذونات الوصفات والعقود'],
          ['SETTLEMENTS', 'التسويات'],
          ['RISK', 'الثقة والمخاطر'],
          ['AUDIT', 'سجل التدقيق']
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              activeTab === id ? 'bg-[#c7a55b] text-stone-950' : 'bg-white/5 text-stone-300 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </section>

      {activeTab === 'OVERVIEW' && (
        <section className="grid xl:grid-cols-[1fr_1fr] gap-6">
          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#e8c880]" />
              <h2 className="text-lg font-black">أولويات الأدمن اليومية</h2>
            </div>
            {[
              'مراجعة الطلبات الجديدة للمبدعين والمنشآت قبل نشرها.',
              'متابعة أذونات الإفصاح للوصفات عالية الحساسية.',
              'حل التعارضات بين المبدع والمنشأة حول الشروط التجارية.',
              'تشغيل التسويات المالية وإصدار إشعارات الاستحقاق.',
              'التعامل مع الشكاوى الحرجة أو المخاطر المتعلقة بالجودة.'
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10 text-sm text-stone-300 leading-7">
                {item}
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2">
              <Gavel className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-black">حدود صلاحيات الأدمن</h2>
            </div>
            {[
              'يستطيع الأدمن إيقاف منتج مباشر عند الاشتباه في مشكلة امتثال أو سلامة.',
              'يستطيع اعتماد العقود النموذجية ومراجعة الأذونات والطلبات.',
              'لا يملك الأدمن تغيير سياسات النظام العليا أو منح نفسه صلاحيات السوبر أدمن.',
              'لا يستطيع الأدمن الاطلاع على كل الأسرار إلا وفق سياسة الوصول المعتمدة.',
              'كل إجراء حساس للأدمن يسجل في Audit Log.'
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10 text-sm text-stone-300 leading-7">
                {item}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'COMPLIANCE' && (
        <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#e8c880]" />
            <h2 className="text-lg font-black">المنشآت الحاضنة وسجل الامتثال</h2>
          </div>
          <div className="space-y-3">
            {store.hosts.map(host => (
              <div key={host.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-stone-100">{host.commercialName}</span>
                    <span className="px-2 py-1 rounded-full text-[11px] bg-emerald-500/10 border border-emerald-400/20 text-emerald-300">
                      {host.verificationStatus === 'VERIFIED' ? 'مرخّص ومتحقق' : host.verificationStatus}
                    </span>
                  </div>
                  <div className="text-xs text-stone-400 mt-1 leading-6">
                    السجل التجاري: {host.commercialRegistrationNo} — الفروع: {host.branches.length} — النطاق السعري: {host.capabilities.priceBand}
                  </div>
                </div>
                <div className="text-xs text-stone-400">
                  {host.capabilities.equipment.slice(0, 3).join(' • ')}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-5 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-300" /><h3 className="font-black text-stone-100">Emergency Product Control</h3></div>
            <p className="text-xs text-stone-400">إيقاف أو إعادة منتج مباشر عند وجود مشكلة جودة، امتثال أو سلامة. كل إجراء يسجل في Audit Log.</p>
            {store.products.filter(p => p.status === 'LIVE_DROP' || p.status === 'LIVE_TRIAL' || p.status === 'LIVE_PERMANENT' || p.status === 'PAUSED').map(product => (
              <div key={product.id} className="rounded-2xl p-4 bg-slate-950/40 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div><div className="font-bold text-stone-100">{product.publicName}</div><div className="text-[11px] text-stone-500 mt-1">الحالة الحالية: {product.status}</div></div>
                {product.status === 'PAUSED' ? (
                  <button onClick={() => store.resumeProduct(product.id)} className="px-3 py-2 rounded-xl bg-emerald-500 text-stone-950 text-xs font-black">إعادة التشغيل</button>
                ) : (
                  <button onClick={() => store.pauseProduct(product.id, 'إيقاف احترازي بواسطة الأدمن لمراجعة الجودة/الامتثال')} className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-400/20 text-xs font-black">إيقاف احترازي</button>
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
              <Lock className="w-5 h-5 text-[#e8c880]" />
              <h2 className="text-lg font-black">سجل أذونات خزنة الوصفات</h2>
            </div>
            {store.recipeGrants.map(grant => (
              <div key={grant.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-stone-100">{grant.id}</div>
                  <div className="text-xs text-stone-400 mt-1">{grant.purpose}</div>
                </div>
                <div className="text-left">
                  <div className="text-sm font-black text-[#e8c880]">L{grant.disclosureLevel}</div>
                  <div className="text-[11px] text-stone-500">{new Date(grant.grantedAt || grant.requestedAt).toLocaleDateString('ar-KW')} — {grant.status}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-black">العقود والتعاونات</h2>
            </div>
            {store.contracts.slice(0, 6).map(contract => (
              <div key={contract.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-stone-100">{contract.id} — {contract.versionNumber}</div>
                  <div className="text-xs text-stone-400 mt-1">الحالة: {contract.status}</div>
                </div>
                <div className="text-xs text-stone-500">{new Date(contract.createdAt).toLocaleDateString('ar-KW')}</div>
              </div>
            ))}
          </div>
        </section>
      )}


      {activeTab === 'SETTLEMENTS' && (
        <section className="glass-panel rounded-3xl p-6 border border-white/10 space-y-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Wallet className="w-5 h-5 text-[#e8c880]" /><h2 className="text-lg font-black">Settlement Control — دورة المستحقات</h2></div>
              <p className="text-xs text-stone-400 mt-2 leading-6">الاعتماد الداخلي لا يعني أن التحويل تم. التأكيد مقفول حتى وصول مرجع دفع موثّق إلى الخادم.</p>
            </div>
            <div className="text-xs text-stone-500">{store.settlements.length} دفعات مسجلة</div>
          </div>
          <div className="space-y-3">
            {store.settlements.length === 0 ? (
              <div className="rounded-2xl p-8 bg-white/5 border border-white/10 text-center text-sm text-stone-500">لا توجد دفعات تسوية بعد.</div>
            ) : store.settlements.map(batch => (
              <div key={batch.id} className="rounded-2xl p-4 bg-white/5 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="font-black text-stone-100">{batch.creatorName}</div>
                  <div className="text-[11px] text-stone-500 mt-1">{batch.id} — {new Date(batch.periodStart).toLocaleDateString('ar-KW')} إلى {new Date(batch.periodEnd).toLocaleDateString('ar-KW')}</div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-lg font-black text-[#e8c880] font-mono">{batch.totalAmountKwd.toFixed(3)} د.ك</div>
                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-black border ${batch.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-amber-500/10 text-amber-300 border-amber-400/20'}`}>{batch.status === 'PAID' ? 'مدفوع ومؤكد' : 'معتمد — بانتظار الدفع'}</span>
                  {batch.status === 'APPROVED' && <button disabled title="يُفعّل بعد ربط مزود الدفع" className="px-3 py-2 rounded-xl bg-stone-700 text-stone-400 text-xs font-black cursor-not-allowed">بانتظار ربط الدفع</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'RISK' && <TrustEngine />}

      {activeTab === 'AUDIT' && <AdminAuditLogs />}
    </div>
  );
};
