import React, { useMemo, useState } from 'react';
import {
  Boxes,
  GitCompareArrows,
  History,
  LockKeyhole,
  PackageCheck,
  ScrollText,
  Store,
  Wallet,
  ShieldCheck,
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { store } from '../../lib/store';
import { CreatorProduct } from '../../types/majal';
import { hasPermission } from '../../lib/permissions';

interface DigitalTwinPanelProps {
  product: CreatorProduct;
  hostBusinessId?: string;
  collaborationId?: string;
}

export const DigitalTwinPanel: React.FC<DigitalTwinPanelProps> = ({ product, hostBusinessId, collaborationId }) => {
  const [expanded, setExpanded] = useState(true);
  const [compareMode, setCompareMode] = useState(false);

  const twin = useMemo(() => {
    const collaboration = store.collaborations.find(c =>
      c.productId === product.id &&
      (!collaborationId || c.id === collaborationId) &&
      (!hostBusinessId || c.hostBusinessId === hostBusinessId)
    );
    const launch = store.launches.find(l =>
      l.productId === product.id &&
      (!hostBusinessId || l.hostBusinessId === hostBusinessId) &&
      (!collaboration || l.collaborationId === collaboration.id)
    );
    const contract = collaboration?.contract;
    const recipeVersions = store.recipeVersions.filter(v => v.productId === product.id);
    const grants = store.recipeGrants.filter(g => g.productId === product.id && (!hostBusinessId || g.hostBusinessId === hostBusinessId));
    const orders = store.orders.filter(o =>
      o.productId === product.id &&
      o.status === 'COMPLETED' &&
      (!hostBusinessId || o.hostBusinessId === hostBusinessId) &&
      (!launch || o.launchId === launch.id)
    );
    const reviews = store.reviews.filter(r => r.productId === product.id && (!launch || r.launchId === launch.id));
    const revenue = orders.reduce((s, o) => s + o.grossAmountKwd, 0);
    const creatorRoyalty = orders.reduce((s, o) => s + o.creatorRoyaltyKwd, 0);
    const keepVotes = reviews.length ? Math.round((reviews.filter(r => r.keepItVote).length / reviews.length) * 100) : 0;
    return { collaboration, launch, contract, recipeVersions, grants, orders, reviews, revenue, creatorRoyalty, keepVotes };
  }, [product.id, hostBusinessId, collaborationId]);

  const approvedGrant = hostBusinessId
    ? twin.grants.find(grant =>
        grant.hostBusinessId === hostBusinessId &&
        grant.status === 'APPROVED' &&
        (!grant.expiresAt || new Date(grant.expiresAt).getTime() > Date.now())
      )
    : undefined;
  const isCreatorOwner = store.activeUser.role === 'CREATOR' && store.activeUser.creatorId === product.creatorId;
  const canSeeRecipeDerived = isCreatorOwner || Boolean(hostBusinessId && approvedGrant && approvedGrant.disclosureLevel >= 2);

  const sortedRecipes = canSeeRecipeDerived
    ? [...twin.recipeVersions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const currentRecipe = sortedRecipes.find(r => r.versionNumber === product.currentRecipeVersion) || sortedRecipes[0];
  const previousRecipe = sortedRecipes.find(r => r.id !== currentRecipe?.id);
  const recipeUnitCost = (recipe: typeof currentRecipe) => recipe && recipe.yield > 0 ? recipe.ingredients.reduce((sum, item) => sum + item.estimatedCostKwd, 0) / recipe.yield : undefined;
  const currentRecipeUnitCost = recipeUnitCost(currentRecipe);
  const previousRecipeUnitCost = recipeUnitCost(previousRecipe);
  const canSeeFinancials = isCreatorOwner || Boolean(
    hostBusinessId &&
    store.activeUser.hostBusinessId === hostBusinessId &&
    hasPermission(store.activeUser, 'VIEW_HOST_FINANCE')
  );

  return (
    <section className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-5 md:p-6 text-right hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#c7a55b]/10 border border-[#e8c880]/20 flex items-center justify-center text-[#e8c880]">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-lg text-stone-100">Digital Twin — التوأم الرقمي للمنتج</h3>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-400/20 text-emerald-300">LIVE RECORD</span>
            </div>
            <p className="text-xs text-stone-400 mt-1">كل حياة المنتج في سجل واحد: الوصفة، العقد، الإطلاق، المبيعات، الأذونات والتاريخ.</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
      </button>

      {expanded && (
        <div className="p-5 md:p-6 pt-0 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'نسخة الوصفة', value: product.currentRecipeVersion, icon: <History className="w-4 h-4" /> },
              { label: 'حالة العقد', value: twin.contract?.status || 'لا يوجد', icon: <ScrollText className="w-4 h-4" /> },
              { label: 'المبيعات المسجلة', value: canSeeFinancials ? `${twin.revenue.toFixed(3)} د.ك` : 'محجوب حسب الدور', icon: <Store className="w-4 h-4" /> },
              { label: 'مستحقات المبدع', value: canSeeFinancials ? `${twin.creatorRoyalty.toFixed(3)} د.ك` : 'محجوب حسب الدور', icon: <Wallet className="w-4 h-4" /> }
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="flex items-center gap-2 text-[#e8c880]">{item.icon}<span className="text-[11px] text-stone-400">{item.label}</span></div>
                <div className="mt-2 font-black text-stone-100 text-sm font-mono">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-4">
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-bold text-stone-100">
                  <GitCompareArrows className="w-5 h-5 text-sky-300" />
                  <span>Time Travel Compare</span>
                </div>
                <button
                  onClick={() => setCompareMode(v => !v)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold ${compareMode ? 'bg-sky-400 text-slate-950' : 'bg-white/5 text-stone-300 border border-white/10'}`}
                >
                  {compareMode ? 'إغلاق المقارنة' : 'قارن نسختين'}
                </button>
              </div>

              {!canSeeRecipeDerived ? (
                <div className="rounded-xl p-4 bg-fuchsia-500/5 border border-fuchsia-400/15 text-xs text-stone-300 leading-6 flex gap-2">
                  <LockKeyhole className="w-4 h-4 text-fuchsia-300 shrink-0 mt-1" />
                  تفاصيل التكلفة والعائد وسجل تغييرات الوصفة محجوبة حتى يمنح المبدع إذن L2 صالحًا لهذه المنشأة.
                </div>
              ) : compareMode ? (
                <div className="grid md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl p-4 bg-slate-950/60 border border-white/10">
                    <div className="font-black text-sky-300">الحالية — {currentRecipe?.versionNumber || product.currentRecipeVersion}</div>
                    <div className="mt-3 space-y-2 text-stone-400">
                      <div>تكلفة المكونات/حصة من هذه النسخة: <strong className="text-stone-100">{currentRecipeUnitCost !== undefined ? `${currentRecipeUnitCost.toFixed(3)} د.ك` : 'غير مسجل'}</strong></div>
                      <div>حجم الدفعة: <strong className="text-stone-100">{currentRecipe?.batchSize || 'غير مسجل'}</strong></div>
                      <div>العائد المعياري: <strong className="text-stone-100">{currentRecipe?.yield ?? 'غير مسجل'} حصة</strong></div>
                      <div>ملاحظة النسخة: <strong className="text-stone-100">{currentRecipe?.changeLogNote || 'لا توجد ملاحظة'}</strong></div>
                    </div>
                  </div>
                  <div className="rounded-xl p-4 bg-slate-950/60 border border-white/10">
                    <div className="font-black text-stone-300">السابقة — {previousRecipe?.versionNumber || 'V0.9'}</div>
                    <div className="mt-3 space-y-2 text-stone-400">
                      <div>تكلفة المكونات/حصة: <strong className="text-stone-100">{previousRecipeUnitCost !== undefined ? `${previousRecipeUnitCost.toFixed(3)} د.ك` : 'غير مسجل'}</strong></div>
                      <div>حجم الدفعة: <strong className="text-stone-100">{previousRecipe?.batchSize || 'غير مسجل'}</strong></div>
                      <div>العائد المعياري: <strong className="text-stone-100">{previousRecipe?.yield ?? 'غير مسجل'} حصة</strong></div>
                      <div>ملاحظة النسخة: <strong className="text-stone-100">{previousRecipe?.changeLogNote || 'لا توجد نسخة سابقة قابلة للمقارنة'}</strong></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-stone-400 leading-6">
                  فعّل المقارنة لترى كيف تطورت تكلفة المنتج، نسخة الوصفة، وقت التحضير والسعر التجاري من إصدار سابق إلى الإصدار الحالي.
                </div>
              )}
            </div>

            <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3 text-xs">
              <div className="font-bold text-stone-100 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-300" /> صحة التوأم الرقمي</div>
              {[
                [<LockKeyhole className="w-4 h-4 text-fuchsia-300" />, 'أذونات الوصفة', `${twin.grants.length} Grant`],
                [<PackageCheck className="w-4 h-4 text-sky-300" />, 'الإطلاق', twin.launch?.status || 'غير مباشر'],
                [<ShieldCheck className="w-4 h-4 text-emerald-300" />, 'Launch Gate', twin.launch?.gateChecklist.allRequirementsPassed ? 'مكتمل' : 'يحتاج مراجعة'],
                [<Store className="w-4 h-4 text-[#e8c880]" />, 'Keep It', `${twin.keepVotes}%`]
              ].map(([icon, label, value], idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-white/10">
                  <div className="flex items-center gap-2">{icon as React.ReactNode}<span className="text-stone-400">{label as string}</span></div>
                  <strong className="text-stone-100">{value as string}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
