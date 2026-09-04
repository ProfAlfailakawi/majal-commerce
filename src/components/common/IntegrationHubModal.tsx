import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  X,
  Zap
} from 'lucide-react';
import { store } from '../../lib/store';
import { PaymentGatewayProvider, PosSystemProvider } from '../../types/majal';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { authCsrfToken } from '../../lib/authClient';
import { paciClient } from '../../lib/paciClient';
import { IS_DEMO_MODE } from '../../lib/runtime';
import { StatusPill } from './StatusPill';

export const IntegrationHubModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'PACI' | 'POS'>('PAYMENTS');
  
  // Payment Simulator State
  const [paymentAmount, setPaymentAmount] = useState('15.500');
  const [selectedProvider, setSelectedProvider] = useState<PaymentGatewayProvider>('KNET');
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // PACI Mobile ID State
  const [civilId, setCivilId] = useState('');
  const [docType, setDocType] = useState<'CONTRACT' | 'NDA'>('CONTRACT');
  const [paciRequest, setPaciRequest] = useState<any>(null);
  const [paciVerified, setPaciVerified] = useState<boolean>(false);
  const [isRequestingPaci, setIsRequestingPaci] = useState(false);

  // POS State
  const [posProvider, setPosProvider] = useState<PosSystemProvider>('FOODICS');
  const [posConnected, setPosConnected] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleTestPayment = async () => {
    setIsProcessingPayment(true);
    try {
      const orderPublicId = `hub_${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const idem = `hub-pay-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const res = await fetch('/api/v1/payments/create-charge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': authCsrfToken(), 'Idempotency-Key': idem },
        body: JSON.stringify({ amountKwd: parseFloat(paymentAmount), orderPublicId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر إنشاء عملية الدفع');
      setPaymentResult({ ...data, requestedProviderLabel: selectedProvider });
      if (data.checkoutUrl) window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      alert('خطأ في إطلاق بوابة الدفع: ' + e.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePaciRequest = async () => {
    setIsRequestingPaci(true);
    try {
      if (!/^\d{12}$/.test(civilId)) throw new Error('الرقم المدني يجب أن يتكون من 12 رقمًا.');
      const data = await paciClient.requestAuth(civilId, docType === 'CONTRACT' ? 'CONTRACT_SIGNATURE' : 'AUTHENTICATION');
      setPaciRequest(data);
      setPaciVerified(false);
    } catch (e: any) {
      alert('خطأ في الاتصال بهويتي: ' + e.message);
    } finally {
      setIsRequestingPaci(false);
    }
  };

  const handleConfirmPaciAuth = async () => {
    if (!paciRequest?.requestId) return;
    try {
      const data = await paciClient.verifyStatus(paciRequest.requestId);
      setPaciVerified(data.verified === true);
      setPaciRequest({ ...paciRequest, lastStatus: data.status });
    } catch (e: any) {
      alert('خطأ في فحص حالة هويتي: ' + e.message);
    }
  };

  const handleConnectPos = async () => {
    const hostId = store.activeUser.hostBusinessId || 'hst_demo_kw';
    try {
      const res = await fetch('/api/v1/pos/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': authCsrfToken() },
        body: JSON.stringify({
          hostBusinessId: hostId,
          provider: posProvider
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذرت محاكاة POS');
      if (data.success && data.simulated) {
        setPosConnected(true);
        setSyncLog(prev => [
          `[${new Date().toLocaleTimeString('ar-KW')}] اكتملت محاكاة اتصال ${posProvider} محلياً`,
          `[${new Date().toLocaleTimeString('ar-KW')}] لا توجد مزامنة أو مستحقات أو Webhook حقيقي في هذا الوضع`
        ]);
      }
    } catch (e: any) {
      // A failed fetch must surface to the user, not become an unhandled rejection.
      setSyncLog(prev => [
        `[${new Date().toLocaleTimeString('ar-KW')}] تعذّر اتصال ${posProvider}: ${e?.message || 'خطأ غير معروف'}`,
        ...prev
      ]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="integration-hub-title" className="bg-neutral-900 border border-neutral-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden text-neutral-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 id="integration-hub-title" className="font-bold text-lg text-white">مختبر محاكاة التكاملات — محلي فقط</h3>
              <p className="text-xs text-amber-300">لا دفع، لا توقيع قانوني، ولا مزامنة POS حقيقية في هذه الشاشة.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            aria-label="إغلاق مختبر التكاملات"
            className="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-900/50 p-2 gap-2">
          <button
            onClick={() => setActiveTab('PAYMENTS')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'PAYMENTS' 
                ? 'bg-amber-500 text-neutral-950 shadow-md' 
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            بوابات الدفع (KNET / Tap / MyFatoorah)
          </button>

          <button
            onClick={() => setActiveTab('PACI')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'PACI' 
                ? 'bg-amber-500 text-neutral-950 shadow-md' 
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            التوقيع الرقمي (هويتي - PACI)
          </button>

          <button
            onClick={() => setActiveTab('POS')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'POS' 
                ? 'bg-amber-500 text-neutral-950 shadow-md' 
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Server className="w-4 h-4" />
            أنظمة نقاط البيع (Foodics / POS)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          
          {/* TAB 1: PAYMENTS */}
          {activeTab === 'PAYMENTS' && (
            <div className="space-y-4">
              <div className="bg-neutral-800/40 border border-neutral-700/60 rounded-xl p-4">
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  محاكاة واختبار بوابة الدفع الإلكتروني
                </h4>
                <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                  المنظومة مهيأة للتكامل مع بوابات الدفع الكويتية لدفع عوائد الطهاة، سداد ودائع تجارب المختبر، وتحصيل رسوم التراخيص.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">مزود الدفع المعتمد:</label>
                    <select 
                      value={selectedProvider} 
                      onChange={(e) => setSelectedProvider(e.target.value as PaymentGatewayProvider)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-amber-500"
                    >
                      <option value="KNET">محاكاة كي نت (KNET)</option>
                      <option value="TAP_PAYMENTS">تاب للمدفوعات (Tap Payments)</option>
                      <option value="MY_FATOORAH">ماي فاتورة (MyFatoorah)</option>
                      <option value="HESABE">حسابي (Hesabe)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">المبلغ المطلوب (د.ك):</label>
                    <input 
                      type="number" 
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-amber-500"
                      step="0.5"
                    />
                  </div>
                </div>

                <button
                  onClick={handleTestPayment}
                  disabled={isProcessingPayment}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {isProcessingPayment ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  تشغيل محاكاة دفع غير مالية عبر {selectedProvider}
                </button>
              </div>

              {paymentResult && (
                <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 text-emerald-300 animate-in fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      تم إنشاء سجل محاكاة فقط
                    </span>
                    <span className="text-xs bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200 font-mono">
                      {paymentResult.trackId}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 text-emerald-200/80 font-mono">
                    <p>المبلغ: {paymentResult.amountKwd} د.ك | المزود: {paymentResult.provider}</p>
                    <p className="flex items-center gap-2"><StatusPill status={paymentResult.status} prefix="الحالة" /><span>الوقت: {new Date(paymentResult.createdAt).toLocaleTimeString('ar-KW')}</span></p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PACI MOBILE ID */}
          {activeTab === 'PACI' && (
            <div className="space-y-4">
              <div className="bg-neutral-800/40 border border-neutral-700/60 rounded-xl p-4">
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  المصادقة والتوقيع الإلكتروني عبر تطبيق «هويتي» (PACI)
                </h4>
                <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                  المسار التقني يسجل دليل PACI عند اكتمال الربط الرسمي. الأثر القانوني النهائي يعتمد على اعتماد مزود الخدمة وصياغة العقد والامتثال للقانون الكويتي.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">الرقم المدني (Civil ID):</label>
                    <input 
                      type="text" 
                      value={civilId}
                      onChange={(e) => setCivilId(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">نوع المستند المراد توقيعه:</label>
                    <select 
                      value={docType} 
                      onChange={(e) => setDocType(e.target.value as any)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-amber-500"
                    >
                      <option value="CONTRACT">عقد ترخيص حقوق الطهي التجاري</option>
                      <option value="NDA">اتفاقية عدم إفصاح وحماية أسرار الخلطة (L3)</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handlePaciRequest}
                  disabled={isRequestingPaci}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {isRequestingPaci ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {IS_DEMO_MODE ? 'بدء اختبار هويتي' : 'إنشاء طلب هويتي الرسمي'}
                </button>
              </div>

              {paciRequest && (
                <div className="bg-neutral-800/80 border border-neutral-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-300">رمز المطابقة في تطبيق هويتي:</span>
                    <span className="text-lg font-bold text-amber-400 font-mono tracking-widest bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                      {paciRequest.requestId || '—'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    هذا معرف الطلب. لا تعتبر الهوية أو التوقيع موثقين إلا عندما تعود الحالة VERIFIED من مسار PACI المربوط.
                  </p>

                  {paciRequest.lastStatus ? (
                    <div role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-200 text-xs">
                      النتيجة: {paciRequest.lastStatus}
                    </div>
                  ) : !paciVerified ? (
                    <button
                      onClick={handleConfirmPaciAuth}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      فحص حالة الطلب لدى الخادم
                    </button>
                  ) : (
                    <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-3 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="font-bold">تم تسجيل تحقق PACI على الخادم؛ تثبيت التوقيع على العقد يتم من شاشة العقد نفسها.</p>
                        <p className="text-[11px] text-emerald-400/80 font-mono mt-0.5">PACI_STATUS: VERIFIED</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: POS INTEGRATION */}
          {activeTab === 'POS' && (
            <div className="space-y-4">
              <div className="bg-neutral-800/40 border border-neutral-700/60 rounded-xl p-4">
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <Server className="w-4 h-4 text-amber-400" />
                  ربط أنظمة نقاط البيع للمطاعم (POS Integration)
                </h4>
                <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                  اختبار واجهة الربط بصريًا قبل تهيئة مفاتيح المزود والتوقيع والتحقق من Webhooks.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">نظام نقاط البيع المستخدم:</label>
                    <select 
                      value={posProvider} 
                      onChange={(e) => setPosProvider(e.target.value as any)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-amber-500"
                    >
                      <option value="FOODICS">فودكس (Foodics Cloud POS)</option>
                      <option value="DELIVERECT">دليفريكت (Deliverect)</option>
                      <option value="URBAN_PIPER">أوربان بايبر (UrbanPiper)</option>
                      <option value="SYRVE">سيرفي (Syrve POS)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">حالة الاتصال:</label>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${posConnected ? 'bg-emerald-500' : 'bg-neutral-500'}`} />
                      <span className="text-xs font-semibold text-neutral-200">
                        {posConnected ? 'محاكاة اتصال محلية' : 'غير متصل — المحاكاة جاهزة'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleConnectPos}
                  disabled={posConnected}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  {posConnected ? 'اكتملت المحاكاة' : `محاكاة الاتصال مع ${posProvider}`}
                </button>
              </div>

              {syncLog.length > 0 && (
                <div className="bg-black/60 border border-neutral-800 rounded-xl p-3 font-mono text-xs text-neutral-300 space-y-1.5">
                  <p className="text-amber-400 font-bold mb-1">سجل المحاكاة المحلية:</p>
                  {syncLog.map((log, idx) => (
                    <p key={idx} className="text-emerald-400/90">{log}</p>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs text-neutral-400">
          <span>حالة البنية التحتية: <strong className="text-emerald-400">Firestore وواجهات الخادم تعمل</strong></span>
          <button
            onClick={onClose}
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2.5 rounded-xl font-medium transition cursor-pointer"
          >
            إغلاق المركز
          </button>
        </div>

      </div>
    </div>
  );
};
