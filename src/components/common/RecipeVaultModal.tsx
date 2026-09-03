import React, { useEffect, useState } from 'react';
import {
  X,
  Lock,
  Eye,
  ShieldCheck,
  Download,
  AlertTriangle,
  History,
  FileCheck,
  Award
} from 'lucide-react';
import { CreatorProduct, RecipeVersion, DisclosureLevel } from '../../types/majal';
import { store } from '../../lib/store';
import { hasPermission } from '../../lib/permissions';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface RecipeVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: CreatorProduct;
  userDisclosureLevel: DisclosureLevel;
}

export const RecipeVaultModal: React.FC<RecipeVaultModalProps> = ({
  isOpen,
  onClose,
  product,
  userDisclosureLevel = 1
}) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [selectedVersionNum, setSelectedVersionNum] = useState<string>(product.currentRecipeVersion || 'V1.0');
  const [showWatermarkNotice, setShowWatermarkNotice] = useState(false);

  const approvedGrant = store.recipeGrants.find(g =>
    g.productId === product.id &&
    g.hostBusinessId === store.activeUser.hostBusinessId &&
    g.status === 'APPROVED' &&
    (!g.expiresAt || new Date(g.expiresAt).getTime() > Date.now())
  );
  const roleMaxLevel: DisclosureLevel = hasPermission(store.activeUser, 'VIEW_RECIPE_L3') ? 3 : hasPermission(store.activeUser, 'VIEW_RECIPE_L2') ? 2 : hasPermission(store.activeUser, 'VIEW_RECIPE_L1') ? 1 : 0;
  const creatorOwnsProduct = store.activeUser.role === 'CREATOR' && store.activeUser.creatorId === product.creatorId;
  const grantLevel: DisclosureLevel = creatorOwnsProduct ? 3 : approvedGrant ? approvedGrant.disclosureLevel : 0;
  const effectiveDisclosureLevel = Math.min(userDisclosureLevel, roleMaxLevel, grantLevel || (creatorOwnsProduct ? 3 : 0)) as DisclosureLevel;

  useEffect(() => {
    if (!isOpen || effectiveDisclosureLevel < 2) return;
    store.addAuditLog(
      'RECIPE_VIEWED',
      'PRODUCT',
      product.id,
      `فتح خزنة الوصفة بمستوى إفصاح ${effectiveDisclosureLevel}`
    );
  }, [isOpen, product.id, effectiveDisclosureLevel]);

  if (!isOpen) return null;

  const productRecipes = store.recipeVersions.filter(r => r.productId === product.id);
  const currentRecipe = productRecipes.find(r => r.versionNumber === selectedVersionNum) || productRecipes[0];

  const handleExportControlledCopy = () => {
    if (!currentRecipe || effectiveDisclosureLevel < 3) return;
    const trackingId = `MAJAL-${Date.now()}-${store.activeUser.id}`;
    const lines = [
      'MAJAL — CONTROLLED RECIPE COPY',
      `Tracking ID: ${trackingId}`,
      `Exported for: ${store.activeUser.name}`,
      `Product: ${product.publicName}`,
      `Recipe version: ${currentRecipe.versionNumber}`,
      `Exported at: ${new Date().toISOString()}`,
      '',
      'INGREDIENTS',
      ...currentRecipe.ingredients.map(i => `${i.name}: ${i.quantity} ${i.unit}`),
      '',
      'PREPARATION',
      ...currentRecipe.preparationSteps.map((step, index) => `${index + 1}. ${step}`),
      '',
      'CRITICAL SECRETS',
      currentRecipe.criticalSecrets,
      '',
      'CONFIDENTIAL — access and redistribution are governed by the applicable Majal collaboration agreement.'
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${product.id}-${currentRecipe.versionNumber}-${trackingId}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    store.addAuditLog(
      'RECIPE_EXPORTED',
      'RECIPE_VERSION',
      currentRecipe.id,
      `تصدير نسخة مراقبة ${currentRecipe.versionNumber} — Tracking ${trackingId}`
    );
    setShowWatermarkNotice(true);
    setTimeout(() => setShowWatermarkNotice(false), 4000);
  };

  const watermarkText = `نسخة حساسة من مجال — مشاهدة بواسطة: ${store.activeUser.name} — ${product.id} — ${currentRecipe?.versionNumber || 'NO-VERSION'} — ${new Date().toLocaleDateString('ar-KW')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="recipe-vault-title" className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[92vh] relative">
        
        {/* Dynamic Security Watermark Overlay for Confidential Levels */}
        {effectiveDisclosureLevel >= 2 && (
          <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-10 flex items-center justify-center opacity-[0.06] rotate-[-25deg]">
            <p className="text-3xl font-black text-amber-300 text-center uppercase tracking-widest whitespace-nowrap leading-relaxed">
              {watermarkText}
            </p>
          </div>
        )}

        {/* Header */}
        <div className="p-5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="recipe-vault-title" className="font-black text-lg text-slate-100">
                  خزنة الوصفة السرية Recipe Vault
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  مستوى الإفصاح الفعلي: {effectiveDisclosureLevel}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                المنتج: <span className="text-amber-300 font-semibold">{product.publicName}</span> ({product.internalName})
              </p>
            </div>
          </div>

          <button onClick={onClose} aria-label="إغلاق خزنة الوصفة" className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Versions selector bar */}
        <div className="px-6 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs z-20">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 font-medium">سجل النسخ والاعتمادات:</span>
            {productRecipes.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedVersionNum(r.versionNumber)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  selectedVersionNum === r.versionNumber
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {r.versionNumber} {r.versionNumber === product.currentRecipeVersion && '(الحالية)'}
              </button>
            ))}
          </div>

          {effectiveDisclosureLevel >= 3 && (
            <button
              onClick={handleExportControlledCopy}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg border border-slate-700 font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير نسخة مراقبة</span>
            </button>
          )}
        </div>

        {/* Export Notification Toast */}
        {showWatermarkNotice && (
          <div className="bg-emerald-600 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between z-30 animate-in slide-in-from-top">
            <span>تم إنشاء نسخة مراقبة فعلية وتسجيل حدث التصدير ومعرف التتبع في سجل التدقيق.</span>
            <X className="w-4 h-4 cursor-pointer" onClick={() => setShowWatermarkNotice(false)} />
          </div>
        )}

        {/* Vault Content Area Based on Disclosure Level */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs z-20">

          {/* Level 0 / Level 1: Basic View */}
          {effectiveDisclosureLevel < 2 ? (
            <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-200">
                  الوصفة التشغيلية السرية محمية
                </h4>
                <p className="text-slate-400 text-xs max-w-md mx-auto mt-1">
                  أنت تطالع الآن البيانات العامة للمنتج. لاستعراض المكونات التشغيلية الدقيقة، خطوات التحضير والسر التجاري، يلزم تقديم طلب وصول مسجل والموافقة عليه من صاحب المنتج.
                </p>
              </div>

              <div className="p-4 bg-slate-900 rounded-xl text-right max-w-lg mx-auto space-y-2 border border-slate-800">
                <p className="font-bold text-amber-400">المكونات العامة الظاهرة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {product.generalIngredients.map((ing, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Level 2 & Level 3 Full Unlocked Recipe View */
            <div className="space-y-6">

              {/* Version Banner */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-amber-300">
                <div>
                  <span className="font-bold text-sm block">نسخة الوصفة التشغيلية الحالية — {currentRecipe?.versionNumber}</span>
                  <span className="text-[11px] text-amber-400/80">تاريخ الإنشاء: {new Date(currentRecipe?.createdAt || '').toLocaleDateString('ar-KW')} | الكمية المعيارية للدفعة: {currentRecipe?.batchSize}</span>
                </div>
                <Award className="w-8 h-8 text-amber-400 opacity-80" />
              </div>

              {/* Ingredients List */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-amber-400" />
                  <span>المكونات والنسب الدقيقة (تكفي لـ {currentRecipe?.yield} حصص)</span>
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 px-3 font-semibold">المكون</th>
                        <th className="py-2 px-3 font-semibold">الكمية</th>
                        <th className="py-2 px-3 font-semibold">الوحدة</th>
                        <th className="py-2 px-3 font-semibold">التكلفة التقديرية</th>
                        <th className="py-2 px-3 font-semibold">خاصية السرية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {currentRecipe?.ingredients.map((ing, idx) => (
                        <tr key={idx} className={ing.isSecretPart ? 'bg-amber-500/5' : ''}>
                          <td className="py-2 px-3 font-medium text-slate-200">{effectiveDisclosureLevel === 2 && ing.isSecretPart ? 'مكوّن سري محجوب' : ing.name}</td>
                          <td className="py-2 px-3 text-slate-300 font-bold">{effectiveDisclosureLevel === 2 && ing.isSecretPart ? '•••' : ing.quantity}</td>
                          <td className="py-2 px-3 text-slate-400">{effectiveDisclosureLevel === 2 && ing.isSecretPart ? 'L3' : ing.unit}</td>
                          <td className="py-2 px-3 text-amber-400 font-mono">{effectiveDisclosureLevel === 2 && ing.isSecretPart ? 'محجوب' : `${ing.estimatedCostKwd.toFixed(3)} د.ك`}</td>
                          <td className="py-2 px-3">
                            {ing.isSecretPart ? (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                عنصر سري
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">قياسي</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Critical Secret & Steps (Level 3 only or Level 2 unlocked) */}
              {effectiveDisclosureLevel === 3 && currentRecipe?.criticalSecrets && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/40 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>السر التجاري المعياري (الخاصية السحرية)</span>
                  </div>
                  <p className="text-slate-200 text-xs leading-relaxed pl-2 font-medium">
                    {currentRecipe.criticalSecrets}
                  </p>
                </div>
              )}

              {/* Preparation Steps */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-slate-200 text-sm">خطوات التحضير والطهي التشغيلي</h4>
                <ol className="space-y-2 list-decimal list-inside text-slate-300 leading-relaxed">
                  {currentRecipe?.preparationSteps.map((step, idx) => (
                    <li key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex justify-between items-center text-xs z-20">
          <span className="text-slate-400 font-mono">
            ID: {currentRecipe?.id || product.id}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold rounded-xl transition-colors"
          >
            إغلاق الخزنة
          </button>
        </div>

      </div>
    </div>
  );
};
