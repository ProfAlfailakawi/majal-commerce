import React, { FormEvent, useState } from 'react';
import { Building2, Crown, Eye, EyeOff, KeyRound, LogIn, RefreshCcw, ShieldCheck, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { AuthApiError, AuthSession, login, register, resetPassword } from '../../lib/authClient';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';
import { UserRole } from '../../types/majal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (session: AuthSession) => void;
}

const DEMO_PRESETS = [
  { role: 'SUPER_ADMIN', label: '👑 سوبر أدمن المنصة', email: 'ah_f@hotmail.com', pass: 'Admin123456!' },
  { role: 'CREATOR', label: '✨ حساب مبدع', email: 'creator@example.test', pass: 'Creator123456!' },
  { role: 'HOST_OWNER', label: '🏢 منشأة حاضنة', email: 'host@example.test', pass: 'Host123456!' },
  { role: 'CONSUMER', label: '🛍️ حساب عميل', email: 'consumer@example.test', pass: 'Consumer123456!' }
];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'RESET'>('LOGIN');
  const [role, setRole] = useState<UserRole>('CREATOR');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const resetMode = (nextMode: 'LOGIN' | 'REGISTER' | 'RESET') => {
    setMode(nextMode);
    setNeedsMfa(false);
    setMfaCode('');
    setError('');
  };

  const handleQuickFill = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let session: AuthSession;
      if (mode === 'LOGIN') {
        session = await login(email, password, needsMfa ? mfaCode : undefined);
      } else if (mode === 'RESET') {
        session = await resetPassword(email, password);
      } else {
        session = await register({ name, email, phone, password, role });
      }
      onAuthenticated(session);
      onClose();
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
            <span className="w-10 h-10 rounded-2xl bg-[#c7a55b]/15 border border-[#e8c880]/20 grid place-items-center text-[#e8c880]">
              {needsMfa ? <KeyRound className="w-5 h-5" /> : mode === 'RESET' ? <RefreshCcw className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </span>
            <div>
              <h2 id="auth-dialog-title" className="font-black text-slate-100 text-base">
                {needsMfa ? 'التحقق بخطوتين' : mode === 'LOGIN' ? 'دخول إلى منصة مجال' : mode === 'RESET' ? 'إعادة تعيين كلمة المرور' : 'إنشاء حساب جديد في مجال'}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">جلسة خادمية مشفّرة — بيانات وتحليلات فورية</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer" aria-label="إغلاق نافذة الدخول"><X className="w-5 h-5" /></button>
        </div>

        {!needsMfa && (
          <div className="grid grid-cols-3 gap-1 p-1.5 mx-5 mt-4 rounded-2xl bg-slate-950/50 border border-white/10" role="tablist" aria-label="نوع الحساب">
            <button type="button" role="tab" aria-selected={mode === 'LOGIN'} onClick={() => resetMode('LOGIN')} className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${mode === 'LOGIN' ? 'bg-[#c7a55b] text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>تسجيل الدخول</button>
            <button type="button" role="tab" aria-selected={mode === 'RESET'} onClick={() => resetMode('RESET')} className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${mode === 'RESET' ? 'bg-[#c7a55b] text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>نسيت كلمة المرور</button>
            <button type="button" role="tab" aria-selected={mode === 'REGISTER'} onClick={() => resetMode('REGISTER')} className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${mode === 'REGISTER' ? 'bg-[#c7a55b] text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>إنشاء حساب</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {mode === 'LOGIN' && !needsMfa && (
            <div className="rounded-2xl p-3.5 bg-white/5 border border-white/10 space-y-2">
              <span className="text-[11px] font-bold text-[#e8c880] block">⚡ تعبئة سريعة لحسابات المنظومة:</span>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_PRESETS.map((item) => (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => handleQuickFill(item.email, item.pass)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/5 hover:bg-[#c7a55b]/20 hover:text-[#e8c880] text-slate-300 border border-white/10 transition cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'REGISTER' && !needsMfa && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-200 block">اختر نوع الحساب في المنصة:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'CREATOR', label: '✨ مبدع وصفات', desc: 'ابتكار وحفظ أسرار الأطباق' },
                  { id: 'HOST_OWNER', label: '🏢 منشأة حاضنة', desc: 'تشغيل وإنتاج المطابخ' },
                  { id: 'CONSUMER', label: '🛍️ متذوق / عميل', desc: 'تصفح وتجربة وشراء الأطباق' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRole(item.id as UserRole)}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      role === item.id
                        ? 'bg-[#c7a55b]/15 border-[#e8c880] text-slate-100 shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-100">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'REGISTER' && !needsMfa && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">الاسم الكامل</span>
              <input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={120} placeholder="مثال: محمد عبدالله" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50" />
            </label>
          )}

          {!needsMfa && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">البريد الإلكتروني</span>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required maxLength={254} dir="ltr" placeholder="name@domain.com" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50 text-left" />
            </label>
          )}

          {mode === 'REGISTER' && !needsMfa && (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">رقم الهاتف</span>
              <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" required minLength={7} maxLength={24} dir="ltr" placeholder="+965 99999999" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50 text-left" />
            </label>
          )}

          {!needsMfa ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{mode === 'RESET' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</span>
                {(mode === 'REGISTER' || mode === 'RESET') && (
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
                  minLength={6}
                  maxLength={128}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-2.5 pl-11 text-sm text-slate-100 outline-none focus:border-[#e8c880]/50 text-left"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'LOGIN' && (
                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => resetMode('RESET')} className="text-[11px] text-[#e8c880] hover:underline cursor-pointer">
                    نسيت كلمة المرور؟ (إعادة تعيين فورية)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-200">رمز المصادقة (MFA)</span>
              <input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" required maxLength={6} dir="ltr" className="w-full rounded-xl bg-slate-950/55 border border-white/10 px-4 py-3 text-xl tracking-[0.4em] text-center text-slate-100 outline-none focus:border-[#e8c880]/50" />
            </label>
          )}

          {error && <div role="alert" aria-live="assertive" className="rounded-xl bg-rose-500/10 border border-rose-400/20 px-4 py-2.5 text-xs text-rose-200 leading-5">{error}</div>}

          <button disabled={submitting || (needsMfa && mfaCode.length !== 6)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#c7a55b] to-[#e0c57d] text-slate-950 font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:brightness-105 transition">
            {mode === 'LOGIN' ? <LogIn className="w-4 h-4" /> : mode === 'RESET' ? <RefreshCcw className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {submitting ? 'جارٍ المعالجة…' : needsMfa ? 'تحقق وادخل' : mode === 'LOGIN' ? 'دخول فوري' : mode === 'RESET' ? 'إعادة تعيين ودخول فوري' : `إنشاء حساب (${role === 'SUPER_ADMIN' ? 'سوبر أدمن' : role === 'ADMIN' ? 'أدمن' : role === 'CREATOR' ? 'مبدع' : role === 'HOST_OWNER' ? 'منشأة' : 'عميل'})`}
          </button>
        </form>
      </div>
    </div>
  );
};
