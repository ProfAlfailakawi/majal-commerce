import React, { useState } from 'react';
import { CheckCircle2, Copy, KeyRound, ShieldCheck, X } from 'lucide-react';
import { beginMfaEnrollment, confirmMfaEnrollment } from '../../lib/authClient';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

export const AccountSecurityModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [enrollment, setEnrollment] = useState<{ manualKey: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'CONFIRMED'>('IDLE');
  const [notice, setNotice] = useState('');

  if (!isOpen) return null;

  const begin = async () => {
    setNotice('');
    setStatus('LOADING');
    try {
      setEnrollment(await beginMfaEnrollment());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذّر بدء إعداد MFA.');
    } finally {
      setStatus('IDLE');
    }
  };

  const confirm = async () => {
    setNotice('');
    setStatus('LOADING');
    try {
      const result = await confirmMfaEnrollment(code);
      if (result.enabled) {
        setStatus('CONFIRMED');
      } else {
        // A non-throwing failure must not leave the spinner stuck on "جارٍ التحقق…".
        setStatus('IDLE');
        setNotice('الرمز غير صحيح أو انتهت صلاحيته. حاول مرة أخرى.');
      }
    } catch (error) {
      setStatus('IDLE');
      setNotice(error instanceof Error ? error.message : 'تعذّر تفعيل MFA.');
    }
  };

  return <div className="fixed inset-0 z-[85] bg-slate-950/85 backdrop-blur-md grid place-items-center p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="security-title" className="w-full max-w-lg glass-panel rounded-[28px] border border-white/10 shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
      <div className="p-6 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 grid place-items-center text-emerald-300"><ShieldCheck className="w-5 h-5" /></span><div><h2 id="security-title" className="font-black text-slate-100">أمان الحساب</h2><p className="text-[11px] text-slate-400 mt-1">أضف طبقة تمنع الدخول حتى لو تسربت كلمة المرور</p></div></div>
        <button onClick={onClose} aria-label="إغلاق إعدادات الأمان" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5"><X className="w-5 h-5" /></button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto">
        {status === 'CONFIRMED' ? <div className="rounded-2xl p-5 bg-emerald-500/10 border border-emerald-400/20 text-center space-y-3"><CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto" /><h3 className="font-black text-emerald-200">تم تفعيل المصادقة الثنائية</h3><p className="text-xs text-slate-300 leading-6">سيطلب النظام رمزاً من تطبيق المصادقة عند تسجيل الدخول القادم.</p></div> : !enrollment ? <div className="space-y-4">
          <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 flex gap-3"><KeyRound className="w-5 h-5 text-gold-300 shrink-0 mt-0.5" /><p className="text-xs text-slate-300 leading-6">ستُنشأ لك هوية TOTP مشفّرة. افتح أي تطبيق مصادقة موثوق، ثم أدخل المفتاح مرة واحدة.</p></div>
          <button onClick={begin} disabled={status === 'LOADING'} className="w-full py-3.5 rounded-2xl bg-gold-500 text-slate-950 font-black text-sm disabled:opacity-50">{status === 'LOADING' ? 'جارٍ التجهيز…' : 'ابدأ التفعيل'}</button>
        </div> : <div className="space-y-4">
          <div className="space-y-2"><span className="text-xs font-bold text-slate-200">المفتاح اليدوي</span><div className="flex items-center gap-2"><code dir="ltr" className="flex-1 rounded-xl bg-slate-950/60 border border-white/10 p-3 text-center text-xs tracking-widest text-gold-300 break-all">{enrollment.manualKey}</code><button onClick={() => navigator.clipboard?.writeText(enrollment.manualKey)} className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white" aria-label="نسخ مفتاح المصادقة"><Copy className="w-4 h-4" /></button></div></div>
          <label className="block space-y-2"><span className="text-xs font-bold text-slate-200">أدخل الرمز الحالي للتأكيد</span><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl bg-slate-950/60 border border-white/10 p-3 text-center text-xl tracking-[0.4em] text-slate-100 outline-none focus:border-emerald-400/40" /></label>
          <button onClick={confirm} disabled={status === 'LOADING' || code.length !== 6} className="w-full py-3.5 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm disabled:opacity-50">{status === 'LOADING' ? 'جارٍ التحقق…' : 'فعّل المصادقة الثنائية'}</button>
        </div>}
        {notice && <div role="alert" className="rounded-xl bg-rose-500/10 border border-rose-400/20 px-4 py-3 text-xs text-rose-200 leading-6">{notice}</div>}
      </div>
    </div>
  </div>;
};
