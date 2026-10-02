import React, { useState } from 'react';
import { X, FileText, CheckCircle2, ShieldCheck, PenTool, PenLine, Lock } from 'lucide-react';
import { DnaStatusHeader, DnaStepper, DnaStep, DnaStepState } from '../dna/DnaKit';
import { Contract } from '../../types/majal';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { paciClient } from '../../lib/paciClient';
import { statusLabel } from '../../lib/statusLabels';
import { MajalLoader } from '../brand/MajalLoader';

/** Two-letter signature stamp from a legal name (first letter of the first two words). */
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word.charAt(0)).join(' ');

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
  const showSignForm = canCurrentUserSign && !hasUserSigned && contract.status !== 'FULLY_SIGNED';
  const signLabel = isSigning ? 'جارٍ التحقق…' : IS_DEMO_MODE ? 'محاكاة الموافقة على المسودة' : paciRequestId ? 'تحقق من هويتي وثبّت التوقيع' : 'ابدأ طلب التوقيع عبر هويتي';

  const fullySigned = contract.status === 'FULLY_SIGNED';
  // Who has signed: server signature records first (production), then the local timestamps
  // (demo). FULLY_SIGNED means both sides signed, even if an older payload omits the rows.
  const creatorRecord = contract.signatures?.find(sig => sig.signerSide === 'CREATOR');
  const hostRecord = contract.signatures?.find(sig => sig.signerSide === 'HOST');
  const creatorSignedAt = creatorRecord?.signedAt || contract.creatorSignedAt;
  const hostSignedAt = hostRecord?.signedAt || contract.hostSignedAt;
  const creatorSigned = fullySigned || !!creatorRecord || !!contract.creatorSignedAt;
  const hostSigned = fullySigned || !!hostRecord || !!contract.hostSignedAt;
  const creatorAuditRef = creatorRecord ? creatorRecord.signatureEvidenceSha256 : contract.creatorSignedAt ? contract.creatorSignerIp : undefined;
  const hostAuditRef = hostRecord ? hostRecord.signatureEvidenceSha256 : contract.hostSignedAt ? contract.hostSignerIp : undefined;
  const signedTitle = (name: string, at?: string) => (at ? `${name} — ${new Date(at).toLocaleString('ar-KW-u-nu-latn')}` : name);

  const paciBadge = paciStatus ? statusLabel(paciStatus) : undefined;
  const pathDone = [true, creatorSigned, hostSigned, fullySigned];
  const firstOpen = pathDone.indexOf(false);
  const stepState = (i: number): DnaStepState => (pathDone[i] ? 'done' : i === firstOpen ? 'current' : 'pending');
  const signingSteps: DnaStep[] = [
    { key: 'draft', label: 'مسودة', state: stepState(0), icon: <FileText /> },
    {
      key: 'creator',
      label: 'المبدع',
      state: stepState(1),
      stamp: creatorSigned ? initials(contract.creatorLegalName) : undefined,
      badge: canSignAsCreator ? paciBadge : undefined,
      title: creatorSigned ? signedTitle(contract.creatorLegalName, creatorSignedAt) : 'في انتظار التوقيع'
    },
    {
      key: 'host',
      label: 'المنشأة',
      state: stepState(2),
      stamp: hostSigned ? initials(contract.hostCommercialName) : undefined,
      badge: canSignAsHost ? paciBadge : undefined,
      title: hostSigned ? signedTitle(contract.hostCommercialName, hostSignedAt) : 'في انتظار التوقيع'
    },
    { key: 'signed', label: 'موقّع', state: stepState(3), icon: <ShieldCheck /> }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="contract-modal-title" className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[92dvh]">
        
        {/* Header: status tile + status + the sign action, then the signing path. */}
        <div className="p-5 border-b border-slate-700/70 bg-slate-900">
          <DnaStatusHeader
            as="div"
            icon={<FileText />}
            tone={contract.status === 'FULLY_SIGNED' ? 'accent' : 'neutral'}
            divider="dashed"
            title={statusLabel(contract.status)}
            subtitle={
              <>
                <span id="contract-modal-title">مسودة شراكة تجريبية — غير ملزمة</span>
                {' · '}
                {contract.status === 'FULLY_SIGNED' ? 'اكتملت المحاكاة' : 'محاكاة موافقات'}
                {' · '}
                نسخة العقد التشغيلية رقم: <span className="font-mono font-bold">{contract.versionNumber}</span>
              </>
            }
            actions={
              <>
                {showSignForm && (
                  <button
                    type="button"
                    onClick={handleSign}
                    disabled={!agreedTerms || isSigning}
                    aria-busy={isSigning}
                    aria-label={signLabel}
                    title={signLabel}
                    className="dna-btnp disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {isSigning ? <MajalLoader size={16} label="جارٍ التحقق من التوقيع…" /> : <PenLine />}
                    <span>توقيع</span>
                  </button>
                )}
                <button type="button" onClick={onClose} aria-label="إغلاق مسودة العقد" className="dna-ibtn">
                  <X />
                </button>
              </>
            }
          >
            <DnaStepper
              size="md"
              ariaLabel="مسار توقيع العقد"
              steps={signingSteps}
            />
          </DnaStatusHeader>
        </div>

        {/* Contract Legal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed text-slate-300">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 leading-6 flex gap-2"><Lock className="w-4 h-4 shrink-0 mt-1" />هذه شاشة عرض للعقد فقط. لا تصبح التواقيع ملزمة حتى ربط هوية موثقة، تجميد نسخة المستند، واعتماد المسار القانوني.</div>
          
          {/* Parties block */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-gold-300 text-sm">أطراف الاتفاقية التجارية:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">الطرف الأول (المبدع وصاحب الحق):</span>
                <span className="font-bold text-slate-100 block">{contract.creatorLegalName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">الطرف الثاني (المنشأة الحاضنة المرخّصة):</span>
                <span className="font-bold text-slate-100 block">{contract.hostCommercialName}</span>
              </div>
            </div>
          </div>

          {/* Terms summary box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="font-bold text-slate-200 text-sm">شروط الشراكة التجارية والمالية:</h4>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs block">سعر البيع المعتمد</span>
                <span className="font-bold text-gold-300 text-sm">{contract.terms.sellingPriceKwd.toFixed(3)} د.ك</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs block">نسبة حقوق المبدع</span>
                <span className="font-bold text-gold-300 text-sm">{contract.terms.creatorRoyaltyRatePercent}٪ من المبيعات</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs block">عمولة تشغيل المنصة</span>
                <span className="font-bold text-slate-300 text-sm">{contract.terms.platformFeePercent}٪</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs block">مدة العقد الحصري</span>
                <span className="font-bold text-slate-200 text-sm">{contract.terms.termMonths} شهراً</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs block">نطاق الحصرية</span>
                <span className="font-bold text-slate-200 text-sm">{contract.terms.exclusivityType === 'EXCLUSIVE' ? 'حصري لدولة الكويت' : 'غير حصري'}</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-xs block">الحد الأدنى للإنتاج</span>
                <span className="font-bold text-slate-200 text-sm">{contract.terms.minimumCommitmentUnits} قطعة</span>
              </div>
            </div>
          </div>

          {/* Legal Clauses */}
          <div className="space-y-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
            <p><strong>بند السرية والملكية الفكرية:</strong> تظل جميع الحقوق السرية الخاصة بالوصفة والخلطة مملوكة حصرياً للطرف الأول. يلتزم الطرف الثاني بعدم تسريب الوصفة أو استخدامها بعد انتهاء مدة العقد.</p>
            <p><strong>بند الجودة والرقابة:</strong> يلتزم الطرف الثاني بالنسخة التشغيلية المتفق عليها وبالمتطلبات النظامية التي تنطبق على نشاطه وقت التنفيذ؛ يجب اعتماد الصياغة النهائية من المستشار القانوني قبل الاستخدام التجاري.</p>
            <p><strong>بند المستحقات:</strong> تحتسب مجال الاستحقاقات وفق شروط العرض المسجلة، بينما يظل تنفيذ الدفع وتأكيده خطوة منفصلة عبر قناة الدفع أو التسوية المعتمدة خارجيًا.</p>
          </div>

          {/* Signatures status block */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            
            {/* Creator signature box */}
            <div className={`p-4 rounded-xl border ${creatorSigned ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs">توقيع الطرف الأول (المبدع)</span>
                {creatorSigned && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              {creatorSigned ? (
                <div className="text-xs">
                  <p className="font-bold text-slate-100">{contract.creatorLegalName}</p>
                  {creatorSignedAt && <p className="text-slate-400 text-xs">تاريخ التوقيع: {new Date(creatorSignedAt).toLocaleString('ar-KW-u-nu-latn')}</p>}
                  {creatorAuditRef && <p className="text-slate-400 text-xs font-mono break-all">Session Audit Ref: {creatorAuditRef}</p>}
                </div>
              ) : (
                <span className="text-amber-400 font-semibold text-xs">في انتظار التوقيع...</span>
              )}
            </div>

            {/* Host signature box */}
            <div className={`p-4 rounded-xl border ${hostSigned ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs">توقيع الطرف الثاني (المنشأة)</span>
                {hostSigned && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              {hostSigned ? (
                <div className="text-xs">
                  <p className="font-bold text-slate-100">{contract.hostCommercialName}</p>
                  {hostSignedAt && <p className="text-slate-400 text-xs">تاريخ التوقيع: {new Date(hostSignedAt).toLocaleString('ar-KW-u-nu-latn')}</p>}
                  {hostAuditRef && <p className="text-slate-400 text-xs font-mono break-all">Session Audit Ref: {hostAuditRef}</p>}
                </div>
              ) : (
                <span className="text-amber-400 font-semibold text-xs">في انتظار التوقيع...</span>
              )}
            </div>

          </div>

          {/* Signature box is shown only to an authorized contractual party. */}
          {showSignForm && (
            <div className="p-4 bg-gold-500/5 border border-gold-500/25 rounded-xl space-y-3">
              <h5 className="font-bold text-gold-300 flex items-center gap-2">
                <PenTool className="w-4 h-4 text-gold-300" />
                <span>{IS_DEMO_MODE ? `محاكاة موافقتك المحلية بصفتك (${store.activeUser.name})` : `التوقيع الموثق بصفتك (${store.activeUser.name})`}</span>
              </h5>

              <div>
                <label className="block text-slate-300 mb-1">الاسم القانوني الكامل للتوقيع:</label>
                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-bold focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
                />
              </div>

              {!IS_DEMO_MODE && (
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 space-y-2">
                  <label className="block text-xs font-bold text-slate-200">الرقم المدني لطلب هويتي</label>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={civilId}
                    onChange={e => setCivilId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12 رقمًا"
                    aria-label="الرقم المدني لطلب هويتي"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono"
                  />
                  {paciRequestId && <p className="text-xs text-slate-400">طلب PACI: <span className="font-mono text-gold-300">{paciRequestId}</span> — {paciStatus || 'PENDING'}</p>}
                  {paciDeepLink && <a href={paciDeepLink} rel="noreferrer" className="inline-flex text-xs font-bold text-gold-300 underline">فتح الطلب في تطبيق هويتي</a>}
                  {signError && <p role="alert" className="text-xs text-rose-300">{signError}</p>}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="agree_terms"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-gold-500 focus:ring-gold-500"
                />
                <label htmlFor="agree_terms" className="text-slate-300 cursor-pointer">
                  أقر بقراءة وتدقيق كافة بنود العقد وشروط الحقوق والتسويات وأوافق على تسجيل هذه الموافقة. في الإنتاج لا يثبت التوقيع إلا بعد تحقق PACI الموثق على نسخة العقد الحالية.
                </label>
              </div>

              <p className="flex items-center gap-2 text-xs text-slate-400">
                <PenLine className="w-4 h-4 text-gold-300 shrink-0" aria-hidden="true" />
                <span>{signLabel} — زر «توقيع» أعلى العقد.</span>
              </p>
            </div>
          )}

          {!canCurrentUserSign && contract.status !== 'FULLY_SIGNED' && (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-700/60 text-xs text-slate-400 leading-6">
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
