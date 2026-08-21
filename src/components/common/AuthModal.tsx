import React, { FormEvent, useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { AuthApiError, AuthSession, login, register } from '../../lib/authClient';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (session: AuthSession) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const resetMode = (nextMode: 'LOGIN' | 'REGISTER') => {
    setMode(nextMode);
    setNeedsMfa(false);
    setMfaCode('');
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const session = mode === 'LOGIN'
        ? await login(email, password, needsMfa ? mfaCode : undefined)
        : await register({ name, email, phone, password });
      onAuthenticated(session);
      onClose();
    } catch (caught) {
      if (caught instanceof AuthApiError && caught.code === 'MFA_REQUIRED') {
        setNeedsMfa(true);
        setError('أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.');
      } else {
        setError(caught instanceof Error ? caught.message : 'تعذّر إكمال تسجيل الدخول.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="w-full max-w-md glass-panel rounded-[28px] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#c7a55b]/15 border border-[#e8c880]/20 grid place-items-center text-[#e8c880]">
              {needsMfa ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </span>
            <div>
              <h2 id="auth-dialog-title" className="font-black text-slate-100">{needsMfa ? 'التحقق بخطوتين' : mode === 'LOGIN' ? 'دخول آمن إلى مجال' : 'إنشاء حساب عميل'}</h2>
              <p className="text-[11px] text-slate-400 mt-1">جلسة خادمية مشفّرة — لا تُخزّن كلمة المرور في المتصفح</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5" aria-label="إغلاق نافذة الدخول"><X className="w-5 h-5" /></button>
        </div>

        {!needsMfa && <div className="grid grid-cols-2 gap-1 p-1.5 m-5 mb-0 rounded-2xl bg-slate-950/50 border border-white/10" role="tablist" aria-label="نوع الحساب">
          <button type="button" role="tab" aria-selected={mode === 'LOGIN'} onClick={() => resetMode('LOGIN')} className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'LOGIN' ? 'bg-[#c7a55b] text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>تسجيل الدخول</button>
          <button type="button" role="tab" aria-selected={mode === 'REGISTER'} onClick={() => resetMode('REGISTER')} className={`py-2.5 rounded-xl text-xs font-bold transition ${mode === 'REGISTER' ? 'bg-[#c7a55b] text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>حساب جديد</button>
        </div>}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'REGISTER' && !needsMfa && <label className="block space-y-2">
            <span className="text-xs font-bold text-slate-200">الاسم</span>
            <input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={120} className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50" />
          </label>}

          {!needsMfa && <label className="block space-y-2">
            <span className="text-xs font-bold text-slate-200">البريد الإلكتروني</span>
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={254} dir="ltr" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50 text-left" />
          </label>}

          {mode === 'REGISTER' && !needsMfa && <label className="block space-y-2">
            <span className="text-xs font-bold text-slate-200">رقم الهاتف</span>
            <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" required minLength={7} maxLength={24} dir="ltr" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50 text-left" />
          </label>}

          {!needsMfa ? <label className="block space-y-2">
            <span className="text-xs font-bold text-slate-200">كلمة المرور</span>
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'LOGIN' ? 'current-password' : 'new-password'} required minLength={12} maxLength={128} className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50" />
            {mode === 'REGISTER' && <span className="block text-[10px] text-slate-500 leading-5">12 محرفاً على الأقل، وثلاثة أنواع من الأحرف والأرقام والرموز.</span>}
          </label> : <label className="block space-y-2">
            <span className="text-xs font-bold text-slate-200">رمز المصادقة</span>
            <input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" required maxLength={6} dir="ltr" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-xl tracking-[0.4em] text-center text-slate-100 outline-none focus:border-[#e8c880]/50" />
          </label>}

          {error && <div role="alert" aria-live="assertive" className="rounded-xl bg-rose-500/10 border border-rose-400/20 px-4 py-3 text-xs text-rose-200 leading-6">{error}</div>}

          <button disabled={submitting || (needsMfa && mfaCode.length !== 6)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#c7a55b] to-[#e0c57d] text-slate-950 font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {mode === 'LOGIN' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'جارٍ التحقق…' : needsMfa ? 'تحقق وادخل' : mode === 'LOGIN' ? 'دخول' : 'إنشاء الحساب'}
          </button>
        </form>
      </div>
    </div>
  );
};
