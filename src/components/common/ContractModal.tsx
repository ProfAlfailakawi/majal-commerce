import React, { useState } from 'react';
import { X, FileText, CheckCircle2, ShieldCheck, PenTool, Lock } from 'lucide-react';
import { Contract } from '../../types/majal';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { paciClient } from '../../lib/paciClient';
import { statusLabel } from '../../lib/statusLabels';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  isOpen,
  onClose,
  contract
}) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [signatureName, setSignatureName] = useState(store.activeUser.name);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [civilId, setCivilId] = useState('');
  const [paciRequestId, setPaciRequestId] = useState<string | null>(null);
  const [paciStatus, setPaciStatus] = useState<string | null>(null);
  const [paciDeepLink, setPaciDeepLink] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  if (!isOpen) return null;

  const collaboration = store.collaborations.find(c => c.id === contract.collaborationId);
  const canSignAsCreator = store.activeUser.role === 'CREATOR' && store.activeUser.creatorId === collaboration?.creatorId;
  const canSignAsHost = store.activeUser.role === 'HOST_OWNER' && store.activeUser.hostBusinessId === collaboration?.hostBusinessId;
  const canCurrentUserSign = canSignAsCreator || canSignAsHost;

  const handleSign = async () => {
    if (!agreedTerms || !canCurrentUserSign || !signatureName.trim()) return;
    setIsSigning(true);
    setSignError(null);
    try {
      if (IS_DEMO_MODE) {
        await Promise.resolve(store.signContract(contract.id, signatureName));
        onClose();
        return;
      }
      if (!/^\d{12}$/.test(civilId)) {
        setSignError('أدخل الرقم المدني المكوّن من 12 رقمًا لبدء طلب هويتي.');
        return;
      }
      if (!paciRequestId) {
        const request = await paciClient.requestAuth(civilId, 'CONTRACT_SIGNATURE');
        setPaciRequestId(request.requestId);
        setPaciStatus(request.status);
        setPaciDeepLink(request.deepLink || null);
        return;
      }
      const status = await paciClient.verifyStatus(paciRequestId);
      setPaciStatus(status.status);
      if (!status.verified) {
        setSignError(`طلب هويتي لم يُعتمد بعد (الحالة: ${statusLabel(status.status)}).`);
        return;
      }
      const signed = await Promise.resolve(store.signContractWithPaci(contract.id, paciRequestId));
      if (!signed) {
        setSignError(store.guardNotice?.message || 'تعذّر تثبيت التوقيع على الخادم.');
        return;
      }
      onClose();
    } catch (error) {
      setSignError(error instanceof Error ? error.message : 'تعذّر إكمال التوقيع.');
    } finally {
      setIsSigning(false);
    }
  };

  const hasUserSigned = canSignAsCreator ? !!contract.creatorSignedAt : canSignAsHost ? !!contract.hostSignedAt : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="contract-modal-title" className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[92dvh]">
        
        {/* Header */}
        <div className="p-5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="contract-modal-title" className="font-black text-lg text-slate-100">
                  مسودة شراكة تجريبية — غير ملزمة
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  contract.status === 'FULLY_SIGNED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}>
                  {contract.status === 'FULLY_SIGNED' ? 'اكتملت المحاكاة' : 'محاكاة موافقات'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                نسخة العقد التشغيلية رقم: <span className="text-amber-300 font-mono font-bold">{contract.versionNumber}</span>
              </p>
            </div>
          </div>

          <button onClick={onClose} aria-label="إغلاق مسودة العقد" className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contract Legal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed text-slate-300">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 leading-6 flex gap-2"><Lock className="w-4 h-4 shrink-0 mt-1" />هذه شاشة عرض للعقد فقط. لا تصبح التواقيع ملزمة حتى ربط هوية موثقة، تجميد نسخة المستند، واعتماد المسار القانوني.</div>
          
          {/* Parties block */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-amber-400 text-sm">أطراف الاتفاقية التجارية:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">الطرف الأول (المبدع وصاحب الحق):</span>
                <span className="font-bold text-slate-100 block">{contract.creatorLegalName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">الطرف الثاني (المنشأة الحاضنة المرخّصة):</span>
                <span className="font-bold text-slate-100 block">{contract.hostCommercialName}</span>
              </div>
            </div>
          </div>

          {/* Terms summary box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="font-bold text-slate-200 text-sm">شروط الشراكة التجارية والمالية:</h4>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">سعر البيع المعتمد</span>
                <span className="font-bold text-amber-400 text-sm">{contract.terms.sellingPriceKwd.toFixed(3)} د.ك</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">نسبة حقوق المبدع</span>
                <span className="font-bold text-amber-400 text-sm">{contract.terms.creatorRoyaltyRatePercent}٪ من المبيعات</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">عمولة تشغيل المنصة</span>
                <span className="font-bold text-slate-300 text-sm">{contract.terms.platformFeePercent}٪</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">مدة العقد الحصري</span>
                <span className="font-bold text-slate-200 text-sm">{contract.terms.termMonths} شهراً</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">نطاق الحصرية</span>
                <span className="font-bold text-slate-200 text-sm">{contract.terms.exclusivityType === 'EXCLUSIVE' ? 'حصري لدولة الكويت' : 'غير حصري'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">الحد الأدنى للإنتاج</span>
                <span className="font-bold text-slate-200 text-sm">{contract.terms.minimumCommitmentUnits} قطعة</span>
              </div>
            </div>
          </div>

          {/* Legal Clauses */}
          <div className="space-y-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-2">
            <p><strong>بند السرية والملكية الفكرية:</strong> تظل جميع الحقوق السرية الخاصة بالوصفة والخلطة مملوكة حصرياً للطرف الأول. يلتزم الطرف الثاني بعدم تسريب الوصفة أو استخدامها بعد انتهاء مدة العقد.</p>
            <p><strong>بند الجودة والرقابة:</strong> يلتزم الطرف الثاني بالنسخة التشغيلية المتفق عليها وبالمتطلبات النظامية التي تنطبق على نشاطه وقت التنفيذ؛ يجب اعتماد الصياغة النهائية من المستشار القانوني قبل الاستخدام التجاري.</p>
            <p><strong>بند المستحقات:</strong> تحتسب مجال الاستحقاقات وفق شروط العرض المسجلة، بينما يظل تنفيذ الدفع وتأكيده خطوة منفصلة عبر قناة الدفع أو التسوية المعتمدة خارجيًا.</p>
          </div>

          {/* Signatures status block */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            
            {/* Creator signature box */}
            <div className={`p-4 rounded-xl border ${contract.creatorSignedAt ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs">توقيع الطرف الأول (المبدع)</span>
                {contract.creatorSignedAt && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              {contract.creatorSignedAt ? (
                <div className="text-[11px]">
                  <p className="font-bold text-slate-100">{contract.creatorLegalName}</p>
                  <p className="text-slate-400 text-[10px]">تاريخ التوقيع: {new Date(contract.creatorSignedAt).toLocaleString('ar-KW')}</p>
                  <p className="text-slate-500 text-[9px] font-mono">Session Audit Ref: {contract.creatorSignerIp}</p>
                </div>
              ) : (
                <span className="text-amber-400 font-semibold text-[11px]">في انتظار التوقيع...</span>
              )}
            </div>

            {/* Host signature box */}
            <div className={`p-4 rounded-xl border ${contract.hostSignedAt ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs">توقيع الطرف الثاني (المنشأة)</span>
                {contract.hostSignedAt && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              {contract.hostSignedAt ? (
                <div className="text-[11px]">
                  <p className="font-bold text-slate-100">{contract.hostCommercialName}</p>
                  <p className="text-slate-400 text-[10px]">تاريخ التوقيع: {new Date(contract.hostSignedAt).toLocaleString('ar-KW')}</p>
                  <p className="text-slate-500 text-[9px] font-mono">Session Audit Ref: {contract.hostSignerIp}</p>
                </div>
              ) : (
                <span className="text-amber-400 font-semibold text-[11px]">في انتظار التوقيع...</span>
              )}
            </div>

          </div>

          {/* Signature box is shown only to an authorized contractual party. */}
          {canCurrentUserSign && !hasUserSigned && contract.status !== 'FULLY_SIGNED' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <h5 className="font-bold text-amber-300 flex items-center gap-2">
                <PenTool className="w-4 h-4 text-amber-400" />
                <span>{IS_DEMO_MODE ? `محاكاة موافقتك المحلية بصفتك (${store.activeUser.name})` : `التوقيع الموثق بصفتك (${store.activeUser.name})`}</span>
              </h5>

              <div>
                <label className="block text-slate-300 mb-1">الاسم القانوني الكامل للتوقيع:</label>
                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              {!IS_DEMO_MODE && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                  <label className="block text-xs font-bold text-blue-200">الرقم المدني لطلب هويتي</label>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={civilId}
                    onChange={e => setCivilId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12 رقمًا"
                    aria-label="الرقم المدني لطلب هويتي"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono"
                  />
                  {paciRequestId && <p className="text-[10px] text-slate-400">طلب PACI: <span className="font-mono text-blue-300">{paciRequestId}</span> — {paciStatus || 'PENDING'}</p>}
                  {paciDeepLink && <a href={paciDeepLink} rel="noreferrer" className="inline-flex text-[11px] font-bold text-blue-300 underline">فتح الطلب في تطبيق هويتي</a>}
                  {signError && <p role="alert" className="text-xs text-rose-300">{signError}</p>}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="agree_terms"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="agree_terms" className="text-slate-300 cursor-pointer">
                  أقر بقراءة وتدقيق كافة بنود العقد وشروط الحقوق والتسويات وأوافق على تسجيل هذه الموافقة. في الإنتاج لا يثبت التوقيع إلا بعد تحقق PACI الموثق على نسخة العقد الحالية.
                </label>
              </div>

              <button
                onClick={handleSign}
                disabled={!agreedTerms || isSigning}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSigning ? 'جارٍ التحقق…' : IS_DEMO_MODE ? 'محاكاة الموافقة على المسودة' : paciRequestId ? 'تحقق من هويتي وثبّت التوقيع' : 'ابدأ طلب التوقيع عبر هويتي'}</span>
              </button>
            </div>
          )}

          {!canCurrentUserSign && contract.status !== 'FULLY_SIGNED' && (
            <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-400/15 text-xs text-slate-400 leading-6">
              وضع مشاهدة فقط: التوقيع متاح للمبدع صاحب التعاون أو مالك المنشأة المرتبطة بالعقد فقط.
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold rounded-xl transition-colors"
          >
            إغلاق العقد
          </button>
        </div>

      </div>
    </div>
  );
};
