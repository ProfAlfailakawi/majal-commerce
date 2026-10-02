import React, { useState } from 'react';
import { X, Calculator, DollarSign, TrendingUp, PieChart, ShieldAlert } from 'lucide-react';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface UnitEconomicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTargetPrice?: number;
  initialUnitCost?: number;
  initialRoyaltyRate?: number;
}

export const UnitEconomicsModal: React.FC<UnitEconomicsModalProps> = ({
  isOpen,
  onClose,
  initialTargetPrice = 8.500,
  initialUnitCost = 2.800,
  initialRoyaltyRate = 13.0
}) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [sellingPrice, setSellingPrice] = useState<number>(initialTargetPrice);
  const [ingredientCost, setIngredientCost] = useState<number>(initialUnitCost * 0.7);
  const [packagingCost, setPackagingCost] = useState<number>(initialUnitCost * 0.2);
  const [laborCost, setLaborCost] = useState<number>(initialUnitCost * 0.1);
  const [royaltyRate, setRoyaltyRate] = useState<number>(initialRoyaltyRate);
  const [platformFeeRate] = useState<number>(5.0);

  if (!isOpen) return null;

  const totalCOGS = ingredientCost + packagingCost + laborCost;
  const creatorRoyaltyKwd = (sellingPrice * (royaltyRate / 100));
  const platformFeeKwd = (sellingPrice * (platformFeeRate / 100));
  const hostNetContribution = sellingPrice - totalCOGS - creatorRoyaltyKwd - platformFeeKwd;
  const grossMarginPercent = sellingPrice > 0 ? ((sellingPrice - totalCOGS) / sellingPrice) * 100 : 0;
  const hostNetMarginPercent = sellingPrice > 0 ? (hostNetContribution / sellingPrice) * 100 : 0;

  // Display only: the four bar widths (with their minimum widths) are scaled so the bar always
  // fills exactly 100%. The formulas above and every displayed value are untouched.
  const rawBar = [Math.max(5, (totalCOGS / sellingPrice) * 100), royaltyRate, 5, Math.max(5, hostNetMarginPercent)];
  const barSum = rawBar.reduce((a, b) => a + b, 0);
  const barOk = rawBar.every(Number.isFinite) && barSum > 0;
  const [barCogs, barRoyalty, barPlatform, barHost] = barOk ? rawBar.map(w => (w / barSum) * 100) : rawBar;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="unit-economics-title" className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[90dvh]">
        
        {/* Header */}
        <div className="p-5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gold-500/20 text-gold-400 rounded-lg">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 id="unit-economics-title" className="font-bold text-base text-slate-100">
                حاسبة الجدوى والاقتصاديات التجارية
              </h3>
              <p className="text-xs text-slate-400">
                حساب تكلفة البضاعة المباشرة، نسبة المبدع، عمولة المنصة، وصافي هامش المنشأة (د.ك)
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق حاسبة الاقتصاديات" className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          
          {/* Inputs Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="block text-slate-300 font-bold mb-1">
                سعر البيع الافتراضي للجمهور (د.ك)
              </label>
              <input
                type="number"
                step="0.250"
                value={Number(sellingPrice.toFixed(3))}
                onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-gold-400 font-bold text-sm focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                نسبة حقوق المبدع (٪)
              </label>
              <input
                type="number"
                step="0.5"
                value={Number(royaltyRate.toFixed(2))}
                onChange={(e) => setRoyaltyRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-gold-400 font-bold text-sm focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                تكلفة المكونات الأولية (د.ك)
              </label>
              <input
                type="number"
                step="0.100"
                value={Number(ingredientCost.toFixed(3))}
                onChange={(e) => setIngredientCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                تكلفة التغليف والعلبة (د.ك)
              </label>
              <input
                type="number"
                step="0.050"
                value={Number(packagingCost.toFixed(3))}
                onChange={(e) => setPackagingCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                تقدير العمالة المباشرة (د.ك)
              </label>
              <input
                type="number"
                step="0.050"
                value={Number(laborCost.toFixed(3))}
                onChange={(e) => setLaborCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                عمولة التشغيل والمنصة (ثابتة 5٪)
              </label>
              <div className="w-full bg-slate-800/50 border border-slate-800 rounded-lg p-2 text-slate-400 font-mono">
                {platformFeeKwd.toFixed(3)} د.ك (5.0%)
              </div>
            </div>
          </div>

          {/* Breakdown Results Visual Card */}
          <div className="bg-slate-800/80 p-5 rounded-xl border border-slate-700 space-y-4">
            <h4 className="font-bold text-slate-200 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-gold-400" />
              <span>توزيع القيمة للقطعة الواحدة</span>
            </h4>

            {/* Visual Bar */}
            <div className="w-full h-5 rounded-full overflow-hidden flex bg-slate-900 border border-slate-700">
              <div
                style={{ width: `${barCogs}%` }}
                className="bg-slate-600 h-full flex items-center justify-center text-xs font-bold text-slate-100"
                title="إجمالي التكلفة"
              >
                التكلفة
              </div>
              <div
                style={{ width: `${barRoyalty}%` }}
                className="bg-gold-500 h-full flex items-center justify-center text-xs font-bold text-slate-950"
                title="حقوق المبدع"
              >
                {royaltyRate}%
              </div>
              <div
                style={{ width: `${barPlatform}%` }}
                className="bg-slate-500 h-full"
                title="عمولة المنصة"
              />
              <div
                style={{ width: `${barHost}%` }}
                className="bg-emerald-600 h-full flex items-center justify-center text-xs font-bold text-slate-100"
                title="صافي المنشأة"
              >
                المنشأة
              </div>
            </div>

            {/* Detailed KPI Table */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-2">
              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-700/60">
                <span className="block text-slate-400 text-xs">إجمالي التكلفة</span>
                <span className="block font-bold text-slate-200 text-sm">{totalCOGS.toFixed(3)} د.ك</span>
              </div>
              <div className="p-3 bg-gold-500/10 rounded-lg border border-gold-500/30">
                <span className="block text-gold-400 text-xs">مستحق المبدع للقطعة</span>
                <span className="block font-bold text-gold-300 text-sm">{creatorRoyaltyKwd.toFixed(3)} د.ك</span>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                <span className="block text-emerald-400 text-xs">صافي المنشأة</span>
                <span className="block font-bold text-emerald-300 text-sm">{hostNetContribution.toFixed(3)} د.ك</span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-700/60">
                <span className="block text-slate-400 text-xs">نسبة هامش المنشأة</span>
                <span className="block font-bold text-slate-200 text-sm">{hostNetMarginPercent.toFixed(1)}٪</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gold-500/10 border border-gold-500/20 text-xs text-gold-300 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
            <p>
              هذه الحسبة تقديرية محاكية لمرحلة التفاوض والتشغيل التجاري، وتستخدم لاحقاً كأساس محدد بدقة داخل عقد الشراكة النهائي.
            </p>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold rounded-xl transition-colors"
          >
            اعتماد الحسبة المبدئية
          </button>
        </div>

      </div>
    </div>
  );
};
