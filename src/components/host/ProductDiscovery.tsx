import React, { useState } from 'react';
import { Search, Filter, Sparkles, SlidersHorizontal, CheckCircle2, Lock, ArrowUpRight, Award, ChevronDown } from 'lucide-react';
import { store } from '../../lib/store';
import { CreatorProduct, HostBusiness, DisclosureLevel } from '../../types/majal';
import { RecipeVaultModal } from '../common/RecipeVaultModal';
import { hasPermission } from '../../lib/permissions';
import { PRODUCT_CATEGORIES } from '../../data/catalog';

export const ProductDiscovery: React.FC = () => {
  const currentHostId = store.activeUser.hostBusinessId || '';
  const host = store.hosts.find(h => h.id === currentHostId);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [minMatchScore, setMinMatchScore] = useState<number>(75);
  const [selectedProductForVault, setSelectedProductForVault] = useState<{ product: CreatorProduct; level: DisclosureLevel } | null>(null);
  const [requestSentNotice, setRequestSentNotice] = useState<string | null>(null);

  const matchableStatuses = ['APPROVED_FOR_MARKETPLACE', 'AVAILABLE_FOR_MATCHING', 'IN_DISCUSSION', 'TESTING', 'COMMERCIAL_NEGOTIATION', 'CONTRACTING'] as const;
  const availableProducts = store.products.filter(p => matchableStatuses.includes(p.status as any));

  const handleRequestAccess = async (product: CreatorProduct, level: 2 | 3 = 2) => {
    const result = await Promise.resolve(store.requestRecipeAccess(product.id, currentHostId, level, level === 3 ? 'طلب وصول تشغيلي كامل للشيف المخول أثناء تطوير المنتج' : 'طلب وصول لمعاينة إمكانية التشغيل في المطبخ التجاري'));
    setRequestSentNotice(result ? `تم تسجيل طلب وصول للمستوى ${level} وإرساله للمبدع للموافقة: ${product.publicName}` : 'تعذر تسجيل طلب الوصول وفق صلاحيات الحساب الحالية.');
    setTimeout(() => setRequestSentNotice(null), 4000);
  };

  if (!host) return <div className="glass-panel rounded-2xl p-6 text-center text-slate-500">لا توجد منشأة صالحة لهذا الحساب.</div>;

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Header */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>محرك الاكتشاف والمطابقة المفسرة Matching & Discovery Engine</span>
          </h2>
          <p className="text-xs text-slate-400">
            اكتشاف المنتجات والوصفات المبتكرة المتوافقة مع تجهيزات ومعدات وشريحة عملاء منشأتك ({host.commercialName})
          </p>
        </div>

        {/* Filters & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث باسم المنتج، المكونات، أو المبدع..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">جميع الفئات</option>
              {PRODUCT_CATEGORIES.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs text-slate-300">
            <span>حد أدنى للمطابقة:</span>
            <input
              type="range"
              min="50"
              max="95"
              value={minMatchScore}
              onChange={(e) => setMinMatchScore(parseInt(e.target.value))}
              className="accent-amber-500 flex-1"
            />
            <span className="font-bold text-amber-400 font-mono">{minMatchScore}٪</span>
          </div>
        </div>
      </div>

      {requestSentNotice && (
        <div className="p-3 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold animate-in fade-in">
          {requestSentNotice}
        </div>
      )}

      {/* Product Match Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {availableProducts.map(p => {
          const creator = store.creators.find(cr => cr.id === p.creatorId);
          const haystack = [p.publicName, p.internalName, p.shortDescription, p.story, p.category, creator?.displayName, ...p.generalIngredients].filter(Boolean).join(' ').toLowerCase();
          if (searchTerm.trim() && !haystack.includes(searchTerm.trim().toLowerCase())) return null;
          const matchCalc = store.calculateMatchScore(p, host);
          if (matchCalc.overallScore < minMatchScore) return null;
          if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return null;
          const grant = store.recipeGrants.find(g => g.productId === p.id && g.hostBusinessId === currentHostId && (g.status === 'REQUESTED' || g.status === 'APPROVED'));
          const hasApprovedGrant = grant?.status === 'APPROVED';
          const maxRoleLevel: DisclosureLevel = hasPermission(store.activeUser, 'VIEW_RECIPE_L3') ? 3 : hasPermission(store.activeUser, 'VIEW_RECIPE_L2') ? 2 : 1;
          const effectiveLevel: DisclosureLevel = hasApprovedGrant ? Math.min(grant!.disclosureLevel, maxRoleLevel) as DisclosureLevel : 1;

          return (
            <div key={p.id} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-xl flex flex-col justify-between">
              
              <div className="space-y-3">
                
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <img src={p.mediaUrls[0]} alt={p.publicName} loading="lazy" decoding="async" className="w-14 h-14 rounded-xl object-cover ring-1 ring-slate-700" />
                    <div>
                      <h3 className="font-black text-slate-100 text-base">{p.publicName}</h3>
                      <span className="text-xs text-slate-400 block">بواسطة: <strong className="text-amber-400">{creator?.displayName}</strong></span>
                    </div>
                  </div>

                  {/* Match Score Badge */}
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-center">
                    <span className="text-[10px] text-slate-400 block">نسبة المطابقة</span>
                    <span className="text-lg font-black font-mono">{matchCalc.overallScore}٪</span>
                  </div>
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">{p.shortDescription}</p>

                {/* Match Score Breakdown */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300 font-bold">
                    <span>تحليل التوافق التشغيلي المفسَّر:</span>
                    <span className="text-amber-400 text-[11px]">معدات + هامش + شريحة</span>
                  </div>

                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    {matchCalc.explanationAr}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1">
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block">توافق المعدات</span>
                      <span className="font-bold text-slate-200">{matchCalc.equipmentFit}٪</span>
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block">ملاءمة الهامش</span>
                      <span className="font-bold text-amber-400">{matchCalc.marginFit}٪</span>
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block">مطابقة الجمهور</span>
                      <span className="font-bold text-slate-200">{matchCalc.brandFit}٪</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs mt-4">
                <div className="text-slate-400">
                  سعر البيع المستهدف: <strong className="text-amber-400 font-mono">{p.targetSellingPriceKwd.toFixed(3)} د.ك</strong>
                </div>

                {hasApprovedGrant ? (
                  <button
                    onClick={() => setSelectedProductForVault({ product: p, level: effectiveLevel })}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>فتح الخزنة — مستوى {effectiveLevel}</span>
                  </button>
                ) : grant?.status === 'REQUESTED' ? (
                  <span className="px-4 py-2 bg-sky-500/10 text-sky-300 border border-sky-400/20 font-bold rounded-xl flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> بانتظار موافقة المبدع
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => handleRequestAccess(p, 2)}
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-colors flex items-center gap-1.5 shadow-md"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>طلب L2</span>
                    </button>
                    {['HOST_OWNER', 'HOST_CHEF'].includes(store.activeUser.role) && (
                      <button
                        onClick={() => handleRequestAccess(p, 3)}
                        className="px-3 py-2 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/20 font-black rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>طلب L3</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {selectedProductForVault && (
        <RecipeVaultModal
          isOpen={!!selectedProductForVault}
          onClose={() => setSelectedProductForVault(null)}
          product={selectedProductForVault.product}
          userDisclosureLevel={selectedProductForVault.level}
        />
      )}

    </div>
  );
};
