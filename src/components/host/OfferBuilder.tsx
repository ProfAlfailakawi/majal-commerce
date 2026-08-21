import React, { useState } from 'react';
import { Send, FileText, CheckCircle2, DollarSign, Calculator } from 'lucide-react';
import { store } from '../../lib/store';
import { Collaboration } from '../../types/majal';

interface OfferBuilderProps {
  collaboration: Collaboration;
}

export const OfferBuilder: React.FC<OfferBuilderProps> = ({ collaboration }) => {
  const currentOffer = collaboration.currentOffer;

  const [sellingPriceKwd, setSellingPriceKwd] = useState<number>(currentOffer?.sellingPriceKwd || 8.500);
  const [royaltyRatePercent, setRoyaltyRatePercent] = useState<number>(currentOffer?.creatorRoyaltyRatePercent || 13.0);
  const [termMonths, setTermMonths] = useState<number>(currentOffer?.termMonths || 12);
  const [minUnits, setMinUnits] = useState<number>(currentOffer?.minimumCommitmentUnits || 500);
  const [notes, setNotes] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const platformFeePercent = store.policy.platformFeePercent;
  const hostSharePercent = 100 - royaltyRatePercent - platformFeePercent;
  const isValid = sellingPriceKwd > 0 && royaltyRatePercent >= 0 && royaltyRatePercent <= 80 && termMonths >= 1 && termMonths <= 60 && minUnits >= 0 && hostSharePercent > 0;

  const handleSendOffer = async () => {
    const result = await Promise.resolve(store.sendOffer(collaboration.id, 'HOST', {
      sellingPriceKwd,
      creatorRoyaltyModel: 'PERCENTAGE',
      creatorRoyaltyRatePercent: royaltyRatePercent,
      fixedAmountPerUnitKwd: 0,
      platformFeePercent,
      termMonths,
      exclusivityType: 'EXCLUSIVE',
      territory: 'دولة الكويت',
      channels: ['DINE_IN', 'PICKUP', 'DELIVERY', 'RETAIL'],
      minimumCommitmentUnits: minUnits,
      notes: notes || 'عرض شراكة تجارية مسجل داخل مجال مع التزام أدنى بحجم الإنتاج'
    }));
    setNotice(result ? 'تم إرسال العرض وتسجيل نسخة جديدة في سجل التفاوض.' : 'تعذر إرسال العرض. راجع القيم والصلاحيات.');
    if (result) setNotes('');
    setTimeout(() => setNotice(null), 3500);
  };

  return (
    <div className="bg-stone-900/90 rounded-2xl border border-stone-800 p-6 space-y-6 text-stone-100">
      
      <div className="border-b border-stone-800 pb-4">
        <h3 className="text-lg font-black text-stone-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-400" />
          <span>منشئ ومعد العروض التجارية الهيكلية Offer Builder</span>
        </h3>
        <p className="text-xs text-stone-400">
          تحديد بنود الشراكة المالية، السعر، النسبة، التزامات الإنتاج، والنطاق الحصري
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-stone-300 font-bold mb-1">سعر البيع الافتراضي للجمهور (د.ك):</label>
          <input
            type="number"
            step="0.25"
            min="0.25"
            value={sellingPriceKwd}
            onChange={(e) => setSellingPriceKwd(parseFloat(e.target.value) || 0)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-amber-400 font-bold"
          />
        </div>

        <div>
          <label className="block text-stone-300 font-bold mb-1">نسبة أرباح وحقوق المبدع Creator Royalty (٪):</label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="80"
            value={royaltyRatePercent}
            onChange={(e) => setRoyaltyRatePercent(parseFloat(e.target.value) || 0)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-amber-300 font-bold"
          />
        </div>

        <div>
          <label className="block text-stone-300 font-bold mb-1">مدة العقد الحصري (أشهر):</label>
          <input
            type="number"
            min="1"
            max="60"
            value={termMonths}
            onChange={(e) => setTermMonths(parseInt(e.target.value) || 12)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-stone-100 font-bold"
          />
        </div>

        <div>
          <label className="block text-stone-300 font-bold mb-1">الحد الأدنى الملتزم به للقطع (Units):</label>
          <input
            type="number"
            min="0"
            value={minUnits}
            onChange={(e) => setMinUnits(parseInt(e.target.value) || 500)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-stone-100 font-bold"
          />
        </div>
      </div>

      <div>
        <label className="block text-stone-300 font-bold mb-1 text-xs">ملاحظات وشروط إضافية للعرض:</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="شروط التسويق المشترك، التغطية الإعلامية، مواعيد التوريد..."
          className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-stone-100 text-xs resize-none"
        />
      </div>

      {notice && <div className={`rounded-xl px-4 py-3 text-xs font-bold border ${notice.startsWith('تم') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20' : 'bg-rose-500/10 text-rose-300 border-rose-400/20'}`}>{notice}</div>}

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-xl p-3 bg-white/5 border border-white/10"><span className="block text-stone-500">المبدع</span><strong className="text-[#e8c880]">{royaltyRatePercent.toFixed(1)}%</strong></div>
        <div className="rounded-xl p-3 bg-white/5 border border-white/10"><span className="block text-stone-500">مجال</span><strong className="text-sky-300">{platformFeePercent.toFixed(1)}%</strong></div>
        <div className="rounded-xl p-3 bg-white/5 border border-white/10"><span className="block text-stone-500">المنشأة قبل تكاليفها</span><strong className={hostSharePercent > 0 ? 'text-emerald-300' : 'text-rose-300'}>{hostSharePercent.toFixed(1)}%</strong></div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-stone-400 font-mono">
          مستحق المبدع للقطعة: <strong className="text-amber-400">{(sellingPriceKwd * (royaltyRatePercent / 100)).toFixed(3)} د.ك</strong>
        </div>

        <button
          onClick={handleSendOffer}
          disabled={!isValid}
          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-black rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg"
        >
          <Send className="w-4 h-4" />
          <span>إرسال العرض التجاري للمبدع</span>
        </button>
      </div>

    </div>
  );
};
