import React, { FormEvent, useState } from 'react';
import { Building2, Crown, Eye, EyeOff, KeyRound, LogIn, RefreshCcw, ShieldCheck, Sparkles, Store, UserPlus, Users, X } from 'lucide-react';
import { AuthApiError, AuthSession, login, register } from '../../lib/authClient';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { UserRole } from '../../types/majal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (session: AuthSession) => void;
}



export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'RESET_REQUEST' | 'RESET_VERIFY'>('LOGIN');
  const [role, setRole] = useState<UserRole>('CREATOR');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const resetMode = (nextMode: 'LOGIN' | 'REGISTER' | 'RESET_REQUEST') => {
    setMode(nextMode);
    setNeedsMfa(false);
    setMfaCode('');
    setResetCode('');
    setError('');
    setSuccessMsg('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      if (mode === 'LOGIN') {
        const session = await login(email, password, needsMfa ? mfaCode : undefined);
        onAuthenticated(session);
        onClose();
      } else if (mode === 'RESET_REQUEST') {
        const { requestPasswordReset } = await import('../../lib/authClient');
        const res = await requestPasswordReset(email);
        setSuccessMsg(res.message);
        setMode('RESET_VERIFY');
      } else if (mode === 'RESET_VERIFY') {
        const { verifyPasswordReset } = await import('../../lib/authClient');
        const session = await verifyPasswordReset(email, resetCode, password);
        onAuthenticated(session);
        onClose();
      } else {
        const session = await register({ name, email, phone, password, role });
        onAuthenticated(session);
        onClose();
      }
    } catch (caught) {
      if (caught instanceof AuthApiError && caught.code === 'MFA_REQUIRED') {
        setNeedsMfa(true);
        setError('أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.');
      } else {
        setError(caught instanceof Error ? caught.message : 'تعذّر إكمال العملية.');
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
        className="w-full max-w-lg glass-panel rounded-[28px] border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-gold-500/15 border border-gold-300/20 grid place-items-center text-gold-300">
              {needsMfa ? <KeyRound className="w-5 h-5" /> : (mode === 'RESET_REQUEST' || mode === 'RESET_VERIFY') ? <RefreshCcw className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </span>
            <div>
              <h2 id="auth-dialog-title" className="font-black text-slate-100 text-base">
                {needsMfa ? 'التحقق بخطوتين' : mode === 'LOGIN' ? 'دخول إلى منصة مجال' : (mode === 'RESET_REQUEST' || mode === 'RESET_VERIFY') ? 'إعادة تعيين كلمة المرور' : 'إنشاء حساب جديد في مجال'}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">جلسة خادمية مشفّرة — بيانات وتحليلات فورية</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer" aria-label="إغلاق نافذة الدخول"><X className="w-5 h-5" /></button>
        </div>

        {!needsMfa && mode !== 'RESET_VERIFY' && (
          <div className="grid grid-cols-3 gap-1 p-1.5 mx-5 mt-4 rounded-2xl bg-slate-950/50 border border-white/10" role="tablist" aria-label="نوع الحساب">
            <button type="button" role="tab" aria-selected={mode === 'LOGIN'} onClick={() => resetMode('LOGIN')} className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${mode === 'LOGIN' ? 'bg-gold-500 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>تسجيل الدخول</button>
            <button type="button" role="tab" aria-selected={mode === 'RESET_REQUEST'} onClick={() => resetMode('RESET_REQUEST')} className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${mode === 'RESET_REQUEST' ? 'bg-gold-500 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>نسيت كلمة المرور</button>
            <button type="button" role="tab" aria-selected={mode === 'REGISTER'} onClick={() => resetMode('REGISTER')} className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${mode === 'REGISTER' ? 'bg-gold-500 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>إنشاء حساب</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">

          {mode === 'REGISTER' && !needsMfa && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-200 block">اختر نوع الحساب في المنصة:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'CREATOR', label: 'مبدع وصفات', icon: <Sparkles className="w-4 h-4" />, desc: 'ابتكار وحفظ أسرار الأطباق' },
                  { id: 'HOST_OWNER', label: 'منشأة حاضنة', icon: <Building2 className="w-4 h-4" />, desc: 'يبدأ الحساب كعميل ويُرقّى بعد تأهيل المنشأة' },
                  { id: 'CONSUMER', label: 'متذوق / عميل', icon: <Store className="w-4 h-4" />, desc: 'تصفح وتجربة وشراء الأطباق' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRole(item.id as UserRole)}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      role === item.id
                        ? 'bg-gold-500/15 border-gold-300 text-slate-100 shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">{item.icon}<span>{item.label}</span></div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'REGISTER' && !needsMfa && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">الاسم الكامل</span>
              <input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={120} placeholder="مثال: محمد عبدالله" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-300/50" />
            </label>
          )}

          {!needsMfa && mode !== 'RESET_VERIFY' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">البريد الإلكتروني</span>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={254} dir="ltr" placeholder="name@domain.com" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-300/50 text-left" />
            </label>
          )}

          {mode === 'REGISTER' && !needsMfa && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">رقم الهاتف</span>
              <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" required minLength={7} maxLength={24} dir="ltr" placeholder="+965 99999999" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-gold-300/50 text-left" />
            </label>
          )}

          {mode === 'RESET_VERIFY' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">رمز التوثيق (المرسل للبريد)</span>
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" value={resetCode} onChange={event => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required maxLength={6} dir="ltr" placeholder="123456" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-xl tracking-[0.4em] text-center text-slate-100 outline-none focus:border-gold-300/50" />
            </label>
          )}

          {!needsMfa && mode !== 'RESET_REQUEST' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{mode === 'RESET_VERIFY' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</span>
                {(mode === 'REGISTER' || mode === 'RESET_VERIFY') && (
                  <span className="text-[10px] text-slate-400">6 محارف على الأقل</span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete={mode === 'LOGIN' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'LOGIN' ? 1 : 12}
                  maxLength={128}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 pl-11 text-sm text-slate-100 outline-none focus:border-gold-300/50 text-left"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'LOGIN' && (
                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => resetMode('RESET_REQUEST')} className="text-[11px] text-gold-300 hover:underline cursor-pointer">
                    نسيت كلمة المرور؟
                  </button>
                </div>
              )}
            </div>
          ) : needsMfa ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">رمز المصادقة (MFA)</span>
              <input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" required maxLength={6} dir="ltr" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-xl tracking-[0.4em] text-center text-slate-100 outline-none focus:border-gold-300/50" />
            </label>
          ) : null}

          {error && <div role="alert" aria-live="assertive" className="rounded-xl bg-rose-500/10 border border-rose-400/20 px-4 py-2.5 text-xs text-rose-200 leading-5">{error}</div>}
          {successMsg && <div role="alert" aria-live="polite" className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-2.5 text-xs text-emerald-200 leading-5">{successMsg}</div>}

          <button disabled={submitting || (needsMfa && mfaCode.length !== 6) || (mode === 'RESET_VERIFY' && resetCode.length !== 6)} className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-gold-500 to-gold-300 text-slate-950 font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:brightness-105 transition">
            {mode === 'LOGIN' ? <LogIn className="w-4 h-4" /> : (mode === 'RESET_REQUEST' || mode === 'RESET_VERIFY') ? <RefreshCcw className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'جارٍ المعالجة…' : needsMfa ? 'تحقق وادخل' : mode === 'LOGIN' ? 'دخول فوري' : mode === 'RESET_REQUEST' ? 'إرسال رمز التوثيق للبريد' : mode === 'RESET_VERIFY' ? 'توثيق الرمز وتعيين كلمة المرور' : `إنشاء حساب (${role === 'SUPER_ADMIN' ? 'سوبر أدمن' : role === 'ADMIN' ? 'أدمن' : role === 'CREATOR' ? 'مبدع' : role === 'HOST_OWNER' ? 'منشأة' : 'عميل'})`}
          </button>
        </form>
      </div>
    </div>
  );
};
