import React, { useEffect, useState } from 'react';
import {
  BadgeDollarSign,
  Boxes,
  BriefcaseBusiness,
  ChevronLeft,
  FileSignature,
  Lock,
  Plus,
  Radar,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { store } from '../../lib/store';
import { CreatorProduct, CreatorProfile } from '../../types/majal';
import { ProductSubmissionWizard } from './ProductSubmissionWizard';
import { CreatorEarnings } from './CreatorEarnings';
import { RecipeVaultModal } from '../common/RecipeVaultModal';
import { ContractModal } from '../common/ContractModal';
import { UnitEconomicsModal } from '../common/UnitEconomicsModal';
import { OpportunityRadar } from './OpportunityRadar';
import { CreatorPassport } from './CreatorPassport';
import { DigitalTwinPanel } from '../common/DigitalTwinPanel';
import { DealRoom } from '../common/DealRoom';
import { RecipeAccessRequests } from './RecipeAccessRequests';
import { StatusPill } from '../common/StatusPill';
import { EmptyState } from '../common/EmptyState';
import { SurfaceTabs } from '../common/SurfaceTabs';
import { Avatar } from '../common/Avatar';

export const CreatorPortal: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick(t => t + 1)), []);

  const [activeTab, setActiveTab] = useState<'HOME' | 'RADAR' | 'PRODUCTS' | 'DEALS' | 'EARNINGS'>('HOME');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedProductForVault, setSelectedProductForVault] = useState<CreatorProduct | null>(null);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [counterRate, setCounterRate] = useState(14);
  const [counterNotes, setCounterNotes] = useState('');

  const currentCreatorId = store.activeUser.creatorId || '';
  const profile = store.creators.find(c => c.id === currentCreatorId);
  const myProducts = store.products.filter(p => p.creatorId === currentCreatorId);
  const myCollaborations = store.collaborations.filter(c => c.creatorId === currentCreatorId);
  const activeCol = myCollaborations[0];
  const activeOffer = activeCol?.currentOffer;

  const tabs = [
    { id: 'HOME', label: 'الرئيسية', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'RADAR', label: 'رادار الفرص', icon: <Radar className="w-4 h-4" /> },
    { id: 'PRODUCTS', label: 'منتجاتي', icon: <Boxes className="w-4 h-4" />, count: myProducts.length },
    { id: 'DEALS', label: 'تعاوناتي', icon: <BriefcaseBusiness className="w-4 h-4" />, count: myCollaborations.length },
    { id: 'EARNINGS', label: 'مستحقاتي', icon: <BadgeDollarSign className="w-4 h-4" /> }
  ] as const;

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-gold-500/15 text-gold-300 grid place-items-center mx-auto shadow-2xl">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-100">مرحباً بك في مساحة المبدعين منصة مجال</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-6">
            لم يتم تفعيل ملف المبدع الخاص بحسابك بعد. انقر على الزر أدناه لإنشاء ملف المبدع والبدء باكتشاف الفرص، تقديم المنتجات، وتوقيع العقود التجارية.
          </p>
        </div>
        <button
          onClick={() => {
            const newCreator: CreatorProfile = {
              id: 'cr_' + Math.random().toString(36).substr(2, 9),
              userId: store.activeUser.id,
              displayName: store.activeUser.name || 'المبدع المبتكر',
              legalName: store.activeUser.name || 'مبدع طهي معتمد',
              creatorType: 'CREATOR',
              specialty: 'ابتكار الأطباق والمأكولات العصرية',
              bio: 'صانع محتوى وطاهي مبتكر للمنتجات التجارية الحصرية.',
              region: 'العاصمة، الكويت',
              completionScore: 100,
              badges: ['SIGNATURE_CREATOR'],
              unitsSold: 0,
              repeatPurchaseRate: 0,
              story: 'شغف تحويل الوصفات المنزلية والسرية إلى خطوط إنتاج وتجارب ناجحة.',
              isAvailableForMatching: true,
              hasSecretRecipe: true,
              avatarUrl: store.activeUser.avatar || '',
              createdAt: new Date().toISOString()
            };
            store.creators = [...store.creators, newCreator];
            store.activeUser = { ...store.activeUser, creatorId: newCreator.id };
            store.setUser(store.activeUser);
            setTick(t => t + 1);
          }}
          className="px-6 py-3.5 rounded-2xl bg-gradient-to-l from-gold-500 to-gold-300 text-slate-950 text-sm font-black inline-flex items-center gap-2 shadow-xl hover:brightness-110 transition-transform cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>إنشاء وتفعيل ملف المبدع الآن</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-100">
      <section className="glass-panel rounded-[30px] p-6 md:p-8 border border-white/10 relative overflow-hidden">
        <div className="majal-glow -top-[19rem] -left-[17rem] w-[42rem] h-[42rem]" style={{ '--glow': 'rgba(199,165,91,0.10)' } as React.CSSProperties} />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={profile.displayName} src={profile.avatarUrl} size={80} shape="squircle" className="shadow-xl" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-400/20 text-[10px] font-black">CREATOR SPACE</span>
                <span className="text-xs text-slate-500">{profile.specialty}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black mt-2">أهلًا {profile.displayName}، هذا مجال نموّك</h1>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-7">كل ما تحتاجه من اكتشاف فرصة، حماية وصفة، تفاوض، عقد، إطلاق ومستحقات موجود في مسار واحد.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCalculator(true)} className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300 hover:bg-white/10">حاسبة الاقتصاديات</button>
            <button onClick={() => setShowWizard(true)} className="px-6 py-3.5 rounded-2xl bg-gradient-to-l from-gold-500 to-gold-300 text-slate-950 text-xs font-black flex items-center gap-2"><Plus className="w-4 h-4" /> تسجيل منتج جديد</button>
          </div>
        </div>
      </section>

      <SurfaceTabs tabs={[...tabs]} active={activeTab} onChange={setActiveTab} tone="gold" label="أقسام مساحة المبدع" />

      {activeTab === 'HOME' && (
        <div className="space-y-6">
          <CreatorPassport creatorId={currentCreatorId} />
          <RecipeAccessRequests creatorId={currentCreatorId} />
          <OpportunityRadar creatorId={currentCreatorId} />
          {myProducts[0] && <DigitalTwinPanel product={myProducts[0]} />}
        </div>
      )}

      {activeTab === 'RADAR' && <OpportunityRadar creatorId={currentCreatorId} />}

      {activeTab === 'PRODUCTS' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-5">
            {myProducts.map(product => (
              <article key={product.id} className="glass-card rounded-3xl border border-white/10 overflow-hidden">
                <img src={product.mediaUrls[0]} alt={product.publicName} loading="lazy" decoding="async" className="w-full h-48 object-cover" />
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500">{product.category}</div>
                      <h3 className="text-lg font-black text-slate-100 mt-1">{product.publicName}</h3>
                    </div>
                    <StatusPill status={product.status} />
                  </div>
                  <p className="text-xs text-slate-400 leading-6">{product.shortDescription}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl p-3 bg-white/5 border border-white/10"><div className="text-[10px] text-slate-500">التكلفة</div><div className="text-xs font-black mt-1">{product.estimatedUnitCostKwd.toFixed(3)}</div></div>
                    <div className="rounded-xl p-3 bg-white/5 border border-white/10"><div className="text-[10px] text-slate-500">السعر</div><div className="text-xs font-black mt-1">{product.targetSellingPriceKwd.toFixed(3)}</div></div>
                    <div className="rounded-xl p-3 bg-white/5 border border-white/10"><div className="text-[10px] text-slate-500">الوصفة</div><div className="text-xs font-black mt-1 text-gold-300">{product.currentRecipeVersion}</div></div>
                  </div>
                  <button onClick={() => setSelectedProductForVault(product)} className="w-full py-3 rounded-xl bg-slate-950/50 border border-white/10 text-xs font-black text-gold-300 flex items-center justify-center gap-2"><Lock className="w-4 h-4" /> فتح خزنة الوصفة</button>
                </div>
              </article>
            ))}
          </div>

          {myProducts.map(product => <DigitalTwinPanel key={product.id} product={product} />)}
        </div>
      )}

      {activeTab === 'DEALS' && (
        <div className="space-y-6">
          {myCollaborations.length === 0 ? (
            <EmptyState
              icon={<BriefcaseBusiness className="w-6 h-6" />}
              title="ما عندك تعاونات بعد"
              body="التعاون يبدأ من فرصة مطابقة: افتح الرادار، شوف المنشآت اللي تناسب منتجك، وابدأ من هناك."
              action={{ label: 'افتح رادار الفرص', onClick: () => setActiveTab('RADAR') }}
            />
          ) : myCollaborations.map(col => (
            <div key={col.id} className="space-y-5">
              <DealRoom collaboration={col} />

              {col.currentOffer && (
                <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-gold-300 font-bold"><FileSignature className="w-4 h-4" /> العرض التجاري الحالي</div>
                      <div className="mt-2 text-2xl font-black">{col.currentOffer.creatorRoyaltyRatePercent}% <span className="text-sm text-slate-500">حصة المبدع</span></div>
                    </div>
                    <div className="text-xs text-slate-400">سعر البيع: <strong className="text-slate-100">{col.currentOffer.sellingPriceKwd.toFixed(3)} د.ك</strong> — مدة الاتفاق: <strong className="text-slate-100">{col.currentOffer.termMonths} أشهر</strong></div>
                  </div>

                  {col.currentOffer.status === 'PENDING' && (
                    <div className="grid lg:grid-cols-[1fr_auto] gap-3">
                      <div className="grid sm:grid-cols-[150px_1fr] gap-3">
                        <input type="number" value={counterRate} onChange={e => setCounterRate(Number(e.target.value))} className="glass-input rounded-xl px-4 py-3 text-xs outline-none" />
                        <input value={counterNotes} onChange={e => setCounterNotes(e.target.value)} placeholder="سبب التعديل أو الملاحظة التجارية..." className="glass-input rounded-xl px-4 py-3 text-xs outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={async () => { await Promise.resolve(store.acceptOffer(col.id, col.currentOffer!.id)); }} className="px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black">قبول العرض</button>
                        <button
                          onClick={async () => { await Promise.resolve(store.sendOffer(col.id, 'CREATOR', {
                            sellingPriceKwd: col.currentOffer!.sellingPriceKwd,
                            creatorRoyaltyModel: 'PERCENTAGE',
                            creatorRoyaltyRatePercent: counterRate,
                            fixedAmountPerUnitKwd: 0,
                            platformFeePercent: col.currentOffer!.platformFeePercent,
                            termMonths: col.currentOffer!.termMonths,
                            exclusivityType: col.currentOffer!.exclusivityType,
                            territory: col.currentOffer!.territory,
                            channels: col.currentOffer!.channels,
                            minimumCommitmentUnits: col.currentOffer!.minimumCommitmentUnits,
                            notes: counterNotes || `مقترح تعديل النسبة إلى ${counterRate}%`
                          })); }}
                          className="px-4 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black"
                        >
                          إرسال عرض مقابل
                        </button>
                      </div>
                    </div>
                  )}

                  {col.contract && (
                    <button onClick={() => setSelectedContract(col.contract)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-slate-200">فتح العقد <ChevronLeft className="w-4 h-4" /></button>
                  )}
                </section>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'EARNINGS' && <CreatorEarnings />}

      <ProductSubmissionWizard isOpen={showWizard} onClose={() => setShowWizard(false)} />
      {selectedProductForVault && (
        <RecipeVaultModal
          isOpen={!!selectedProductForVault}
          onClose={() => setSelectedProductForVault(null)}
          product={selectedProductForVault}
          userDisclosureLevel={3}
        />
      )}
      {selectedContract && <ContractModal isOpen={!!selectedContract} onClose={() => setSelectedContract(null)} contract={selectedContract} />}
      <UnitEconomicsModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        initialTargetPrice={activeOffer?.sellingPriceKwd || myProducts[0]?.targetSellingPriceKwd}
        initialUnitCost={myProducts[0]?.estimatedUnitCostKwd}
        initialRoyaltyRate={activeOffer?.creatorRoyaltyRatePercent}
      />
    </div>
  );
};
