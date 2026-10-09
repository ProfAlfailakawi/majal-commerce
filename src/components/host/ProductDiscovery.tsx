import React, { useState } from 'react';
import { Search, Filter, Sparkles, SlidersHorizontal, CheckCircle2, Lock, ArrowUpRight, Award, ChevronDown } from 'lucide-react';
import { store } from '../../lib/store';
import { CreatorProduct, HostBusiness, DisclosureLevel } from '../../types/majal';
import { RecipeVaultModal } from '../common/RecipeVaultModal';
import { hasPermission } from '../../lib/permissions';
import { PRODUCT_CATEGORIES } from '../../data/catalog';
import { ScoreRing, MicroBars, FoldedNote } from '../common/MatchMeter';
import { CapGrid } from '../common/CapGrid';
import { EmptyState } from '../common/EmptyState';
import { Building2 } from 'lucide-react';
import { ProductImage } from '../common/ProductImage';

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

  if (!host) return (
    <EmptyState
      icon={<Building2 className="w-6 h-6" />}
      title="ما فيه منشأة مرتبطة بحسابك"
      body="الاكتشاف يعتمد على قدرة منشأتك التشغيلية وهامشها، فيحتاج حساب مربوط بمنشأة أول. أعد تحميل الحساب، ولن يتم ربطك تلقائيًا بمنشأة أخرى."
    />
  );

  const visibleProducts = availableProducts.filter(p => {
    const creator = store.creators.find(cr => cr.id === p.creatorId);
    const haystack = [p.publicName, p.internalName, p.shortDescription, p.story, p.category, creator?.displayName, ...p.generalIngredients].filter(Boolean).join(' ').toLowerCase();
    if (searchTerm.trim() && !haystack.includes(searchTerm.trim().toLowerCase())) return false;
    if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
    return store.calculateMatchScore(p, host).overallScore >= minMatchScore;
  });

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold-400" />
            <span>محرك الاكتشاف والمطابقة المفسرة</span>
          </h2>
          <p className="text-xs text-slate-400">
            اكتشاف المنتجات والوصفات المبتكرة المتوافقة مع تجهيزات ومعدات وشريحة عملاء منشأتك ({host.commercialName})
          </p>
        </div>

        {/* Filters & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث باسم المنتج، المكونات، أو المبدع..."
              className="w-full glass-input rounded-xl ps-9 pe-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full glass-input rounded-xl p-2 text-xs text-slate-200 focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
            >
              <option value="ALL">جميع الفئات</option>
              {PRODUCT_CATEGORIES.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 glass-input p-2 rounded-xl text-xs text-slate-300">
            <span className="shrink-0 whitespace-nowrap">حد أدنى للمطابقة:</span>
            <input
              type="range"
              min="50"
              max="95"
              value={minMatchScore}
              onChange={(e) => setMinMatchScore(parseInt(e.target.value))}
              className="accent-gold-500 flex-1 min-w-0"
            />
            <span className="shrink-0 font-bold text-gold-400 font-mono">{minMatchScore}٪</span>
          </div>
        </div>
      </div>

      {requestSentNotice && (
        <div className="p-3 bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-xl text-xs font-bold animate-in fade-in">
          {requestSentNotice}
        </div>
      )}

      {/* Product Match Cards */}
      <CapGrid className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleProducts.map(p => {
          const creator = store.creators.find(cr => cr.id === p.creatorId);
          const matchCalc = store.calculateMatchScore(p, host);
          const grant = store.recipeGrants.find(g => g.productId === p.id && g.hostBusinessId === currentHostId && (g.status === 'REQUESTED' || g.status === 'APPROVED'));
          const hasApprovedGrant = grant?.status === 'APPROVED';
          const maxRoleLevel: DisclosureLevel = hasPermission(store.activeUser, 'VIEW_RECIPE_L3') ? 3 : hasPermission(store.activeUser, 'VIEW_RECIPE_L2') ? 2 : 1;
          const effectiveLevel: DisclosureLevel = hasApprovedGrant ? Math.min(grant!.disclosureLevel, maxRoleLevel) as DisclosureLevel : 1;

          return (
            <div key={p.id} className="glass-panel rounded-2xl border border-white/10 p-6 space-y-4 shadow-xl flex flex-col justify-between">
              
              <div className="space-y-3">
                
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductImage src={p.mediaUrls[0]} alt={p.publicName} loading="lazy" markSize={28} className="w-14 h-14 rounded-xl object-cover ring-1 ring-slate-700 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-100 text-base line-clamp-2 sm:line-clamp-none sm:truncate" title={p.publicName}>{p.publicName}</h3>
                      <span className="text-xs text-slate-400 block break-words sm:truncate" title={creator?.displayName}>بواسطة: <strong className="text-gold-400">{creator?.displayName}</strong></span>
                    </div>
                  </div>

                  {/* Match score: ring with the number kept inside */}
                  <ScoreRing value={matchCalc.overallScore} suffix="٪" caption="نسبة المطابقة" size={60} />
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">{p.shortDescription}</p>

                {/* Match Score Breakdown: three thin bars, the explanation folded */}
                <details className="group bg-slate-950/40 rounded-xl border border-white/10 text-xs">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-2 max-sm:min-h-11 px-3.5 py-2.5 text-slate-300 hover:text-slate-100 [&::-webkit-details-marker]:hidden">
                    <span className="font-bold">عرض التفاصيل</span>
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="px-3.5 pb-3.5 space-y-3">
                    <MicroBars suffix="٪" bars={[
                      { label: 'توافق المعدات', value: matchCalc.equipmentFit },
                      { label: 'ملاءمة الهامش', value: matchCalc.marginFit },
                      { label: 'مطابقة الجمهور', value: matchCalc.brandFit }
                    ]} />
                    <FoldedNote summary="تحليل التوافق التشغيلي المفسَّر">{matchCalc.explanationAr}</FoldedNote>
                  </div>
                </details>
              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-slate-950/40 rounded-xl border border-white/10 flex items-center justify-between max-sm:flex-col max-sm:items-stretch max-sm:gap-3 text-xs mt-4">
                <div className="text-slate-400">
                  سعر البيع المستهدف: <strong className="text-gold-400 font-mono">{p.targetSellingPriceKwd.toFixed(3)} د.ك</strong>
                </div>

                {hasApprovedGrant ? (
                  <button
                    onClick={() => setSelectedProductForVault({ product: p, level: effectiveLevel })}
                    className="px-4 py-2 max-sm:min-h-11 max-sm:justify-center bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-colors flex items-center gap-1.5"
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
                      className="px-3 py-2 max-sm:min-h-11 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black rounded-xl transition-colors flex items-center gap-1.5 shadow-md"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>طلب المستوى 2</span>
                    </button>
                    {['HOST_OWNER', 'HOST_CHEF'].includes(store.activeUser.role) && (
                      <button
                        onClick={() => handleRequestAccess(p, 3)}
                        className="px-3 py-2 max-sm:min-h-11 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/20 font-black rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>طلب المستوى 3</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          );
        })}
        {visibleProducts.length === 0 && (
          <div className="md:col-span-2">
            <EmptyState
              icon={<Search className="w-6 h-6" />}
              title={availableProducts.length === 0 ? 'لا توجد منتجات متاحة للمطابقة حاليًا' : 'لا توجد نتائج بهذه الفلاتر'}
              body={availableProducts.length === 0
                ? 'حساب منشأتك يعمل بصورة صحيحة. ستظهر هنا المنتجات التي يعتمدها المبدعون للمطابقة، من دون استخدام أي بيانات تجريبية أو بيانات منشأة أخرى.'
                : 'خفّض حد المطابقة أو غيّر الفئة أو عبارة البحث لرؤية منتجات أخرى.'}
            />
          </div>
        )}
      </CapGrid>

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
