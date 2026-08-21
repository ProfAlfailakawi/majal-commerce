import React, { useState } from 'react';
import { X, Sparkles, Check, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface ProductSubmissionWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProductSubmissionWizard: React.FC<ProductSubmissionWizardProps> = ({ isOpen, onClose }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [step, setStep] = useState<number>(1);
  const [formError, setFormError] = useState('');

  // Form state
  const [publicName, setPublicName] = useState('');
  const [category, setCategory] = useState('حلويات');
  const [shortDescription, setShortDescription] = useState('');
  const [story, setStory] = useState('');
  const [generalIngredientsStr, setGeneralIngredientsStr] = useState('');
  const [allergensStr, setAllergensStr] = useState('');
  const [estimatedUnitCostKwd, setEstimatedUnitCostKwd] = useState<number>(2.500);
  const [targetSellingPriceKwd, setTargetSellingPriceKwd] = useState<number>(8.000);
  const [isSecretRecipe, setIsSecretRecipe] = useState(true);
  const [criticalSecrets, setCriticalSecrets] = useState('');
  const [preparationStepsStr, setPreparationStepsStr] = useState('');

  if (!isOpen) return null;

  const ingredients = generalIngredientsStr.split(/[,،]/).map(s => s.trim()).filter(Boolean);
  const allergens = allergensStr.split(/[,،]/).map(s => s.trim()).filter(Boolean);
  const preparationSteps = preparationStepsStr.split('\n').map(s => s.trim()).filter(Boolean);

  const validateStep = (targetStep: number) => {
    if (targetStep === 1) {
      if (publicName.trim().length < 3) return 'اكتب اسمًا تجاريًا واضحًا من 3 أحرف على الأقل.';
      if (shortDescription.trim().length < 20) return 'الوصف المختصر يحتاج 20 حرفًا على الأقل.';
      if (story.trim().length < 20) return 'قصة المنتج تحتاج 20 حرفًا على الأقل.';
    }
    if (targetStep === 2) {
      if (ingredients.length < 2) return 'أضف مكوّنين عامّين على الأقل، وافصل بينهما بفاصلة.';
      if (!allergensStr.trim()) return 'صرّح بمسببات الحساسية أو اكتب «لا يوجد».';
      if (estimatedUnitCostKwd <= 0 || targetSellingPriceKwd <= estimatedUnitCostKwd) return 'يجب أن تكون التكلفة موجبة وأقل من سعر البيع.';
    }
    if (targetStep === 3) {
      if (preparationSteps.length < 2) return 'أضف خطوتين تشغيليتين على الأقل، كل خطوة في سطر.';
      if (isSecretRecipe && criticalSecrets.trim().length < 5) return 'اكتب وصفًا مختصرًا للجزء السري أو ألغِ خيار الوصفة السرية.';
    }
    return '';
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError('');
    setStep(current => Math.min(3, current + 1));
  };

  const handleSubmit = async () => {
    const error = validateStep(3);
    if (error) {
      setFormError(error);
      return;
    }

    const product = await Promise.resolve(store.submitNewProduct(
      {
        creatorId: store.activeUser.creatorId || '',
        internalName: publicName.trim(),
        publicName: publicName.trim(),
        category,
        shortDescription,
        story,
        mediaUrls: ['https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&q=80&w=600'],
        generalIngredients: ingredients,
        allergens,
        dietaryTags: ['حلال', 'طازج'],
        servingSize: '٨-١٠ أشخاص',
        shelfLife: '٣ أيام تبريد',
        estimatedPrepTimeMinutes: 40,
        estimatedUnitCostKwd,
        targetSellingPriceKwd,
        expectedEquipment: ['فرن دوار', 'عجانة'],
        isSecretRecipe,
        acceptsExclusivity: true,
        desiredPartnershipType: 'PERCENTAGE_ROYALTY'
      },
      {
        yield: 8,
        batchSize: 'دفعة تجريبية أصلية',
        ingredients: ingredients.map(ing => ({
          name: ing,
          quantity: 100,
          unit: 'جرام',
          estimatedCostKwd: 0.300
        })),
        preparationSteps,
        criticalSecrets,
        equipmentNeeded: ['عجانة', 'فرن'],
        qualityCheckpoints: ['قوام ممتاز ورائحة طازجة'],
        allergenNotes: allergensStr,
        changeLogNote: 'تقديم النسخة الأولى للوصفة عبر المعالج الرقمي'
      }
    ));

    if (!product) {
      setFormError('تعذر حفظ المنتج. راجع البيانات والصلاحية ثم حاول مرة أخرى.');
      return;
    }
    setFormError('');
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/85 backdrop-blur-md animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="product-wizard-title" className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl text-stone-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-stone-800/90 border-b border-stone-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="product-wizard-title" className="font-black text-base text-stone-100">
                تسجيل منتج ووصفة جديدة في منصة مجال
              </h3>
              <p className="text-xs text-stone-400">
                الخطوة {step} من ٣ — إضافة البيانات التجريبية وخزنة الوصفة
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق معالج المنتج" className="p-1.5 text-stone-400 hover:text-stone-100 rounded-lg hover:bg-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper progress bar */}
        <div className="w-full h-1 bg-stone-800">
          <div
            className="h-full bg-amber-500 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {formError && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/25 text-rose-200 font-bold leading-6 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-1" />{formError}</div>}
          
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <h4 className="font-bold text-amber-400 text-sm">١. معلومات المنتج والقصة التسويقية</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">اسم المنتج للجمهور (الاسم التجاري):</label>
                  <input
                    id="product-public-name"
                    aria-label="اسم المنتج للجمهور"
                    type="text"
                    value={publicName}
                    onChange={(e) => setPublicName(e.target.value)}
                    placeholder="مثال: قرص عقيلي فاخر بالزعفران"
                    maxLength={80}
                    required
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-bold mb-1">فئة المنتج:</label>
                  <select
                    aria-label="فئة المنتج"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="حلويات">حلويات وكيك</option>
                    <option value="صلصات">صلصات ومخللات</option>
                    <option value="مخبوزات">مخبوزات وفطائر</option>
                    <option value="وجبات">وجبات سريعة ومقبلات</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">وصف قصير للعميل والمنشأة:</label>
                <textarea
                  rows={2}
                  aria-label="وصف قصير للعميل والمنشأة"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  placeholder="وصف مشوق يوضح ما يجعل هذا المنتج استثنائياً..."
                  maxLength={240}
                  required
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">قصة ابتكار المنتج:</label>
                <textarea
                  rows={2}
                  aria-label="قصة ابتكار المنتج"
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="كيف بدأت شغفك بهذه الوصفة وما سر تميزها التراثي أو العصري..."
                  maxLength={800}
                  required
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <h4 className="font-bold text-amber-400 text-sm">٢. المكونات، مسببات الحساسية والأسعار التقديرية</h4>

              <div>
                <label className="block text-stone-300 font-bold mb-1">المكونات العامة (مفصولة بفواصل):</label>
                <input
                  type="text"
                  aria-label="المكونات العامة"
                  value={generalIngredientsStr}
                  onChange={(e) => setGeneralIngredientsStr(e.target.value)}
                  placeholder="مثال: دقيق، بيض، هيل طازج، زعفران، كريمة"
                  maxLength={400}
                  required
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">مسببات الحساسية المعروفة (مفصولة بفواصل):</label>
                <input
                  type="text"
                  aria-label="مسببات الحساسية"
                  value={allergensStr}
                  onChange={(e) => setAllergensStr(e.target.value)}
                  placeholder="مثال: بيض، حليب، سمسم، جلوتين"
                  maxLength={300}
                  required
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-950/60 p-4 rounded-xl border border-stone-800">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">تكلفة التجهيز التقديرية للقطعة (د.ك):</label>
                  <input
                    type="number"
                    aria-label="تكلفة التجهيز التقديرية للقطعة"
                    step="0.25"
                    min="0.001"
                    value={estimatedUnitCostKwd}
                    onChange={(e) => setEstimatedUnitCostKwd(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-800 border border-stone-700 rounded-lg p-2 text-stone-100 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-bold mb-1">سعر البيع المقترح للجمهور (د.ك):</label>
                  <input
                    type="number"
                    aria-label="سعر البيع المقترح للجمهور"
                    step="0.5"
                    min="0.001"
                    value={targetSellingPriceKwd}
                    onChange={(e) => setTargetSellingPriceKwd(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-800 border border-stone-700 rounded-lg p-2 text-amber-400 font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <h4 className="font-bold text-amber-400 text-sm">٣. حماية الوصفة وخزنة الأسرار Recipe Vault</h4>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-amber-300">
                <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  هذه نسخة عرض محلية فقط. في الإنتاج سيبقى حفظ الوصفة مقفلاً حتى ربط خزنة خادمية مشفّرة ومصادقة المستخدم.
                </p>
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">خطوات التحضير والطهي التشغيلي (كل خطوة في سطر):</label>
                <textarea
                  rows={3}
                  aria-label="خطوات التحضير والطهي التشغيلي"
                  value={preparationStepsStr}
                  onChange={(e) => setPreparationStepsStr(e.target.value)}
                  placeholder="الخطوة ١: خفق الصفار مع الزعفران والنقع&#10;الخطوة ٢: الخبز بفرن حراري..."
                  maxLength={2000}
                  required
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-stone-100 focus:outline-none focus:border-amber-500 font-mono resize-none"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">السر التجاري / الملاحظة السرية الخاصة:</label>
                <textarea
                  rows={2}
                  aria-label="السر التجاري أو الملاحظة السرية"
                  value={criticalSecrets}
                  onChange={(e) => setCriticalSecrets(e.target.value)}
                  placeholder="إضافة زهرة معينة، توقيع حراري خاص..."
                  maxLength={1000}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-amber-300 focus:outline-none focus:border-amber-500 resize-none font-medium"
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-stone-800/90 border-t border-stone-700 flex justify-between items-center">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold rounded-xl transition-colors"
            >
              الخطوة السابقة
            </button>
          ) : <div />}

          {step < 3 ? (
            <button
              onClick={goNext}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-xl transition-colors flex items-center gap-1.5"
            >
              <span>متابعة المعالج</span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-xl transition-colors flex items-center gap-1.5 shadow-lg"
            >
              <Check className="w-4 h-4" />
              <span>تقديم المنتج للمراجعة والربط</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
