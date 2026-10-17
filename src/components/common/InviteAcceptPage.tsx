import React, { FormEvent, useEffect, useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { acceptInvite, previewInvite } from '../../lib/teamClient';
import { roleLabel } from '../../lib/permissions';
import type { UserRole } from '../../types/majal';
import { MajalMark } from '../brand/MajalMark';
import { usePrivatePage } from '../../lib/privatePage';

const field = 'w-full glass-input rounded-xl px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';

/** Landing page for `/?invite=<token>`: the colleague sets a name and password and joins the facility. */
export const InviteAcceptPage: React.FC<{ token: string; onDone: () => void }> = ({ token, onDone }) => {
  const [info, setInfo] = useState<{ organizationName: string; role: string; email: string } | null>(null);
  const [name, setName] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  usePrivatePage();
  useEffect(() => { previewInvite(token).then(setInfo).catch(e => setError(e instanceof Error ? e.message : 'الدعوة غير صالحة.')); }, [token]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await acceptInvite({ token, name, password }); setDone(true); } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تفعيل الحساب.'); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="flex items-center gap-3"><MajalMark size={36} tone="ink" /><h1 className="text-xl font-black">دعوة للانضمام</h1></div>
      {done ? (
        <div className="glass-panel rounded-3xl border border-white/10 p-6 text-center space-y-4"><BadgeCheck className="w-12 h-12 mx-auto text-emerald-300" aria-hidden="true" /><p role="status" className="text-sm leading-7">تم تفعيل حسابك. سجّل الدخول بالبريد {info?.email} وكلمة المرور التي اخترتها.</p><button type="button" onClick={onDone} className="px-6 py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black">متابعة</button></div>
      ) : !info ? (
        error ? <div role="alert" className="p-4 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-sm text-rose-200">{error}<button type="button" onClick={onDone} className="block mt-3 underline text-xs">العودة إلى مجال</button></div> : <div role="status" className="text-sm text-slate-300">جارٍ التحقق من الدعوة…</div>
      ) : (
        <form onSubmit={submit} className="glass-panel rounded-3xl border border-white/10 p-6 space-y-4">
          <p className="text-sm leading-7">دُعيت للانضمام إلى <strong className="text-gold-300">{info.organizationName}</strong> بدور <strong>{roleLabel(info.role as UserRole)}</strong>.</p>
          <div dir="ltr" className="text-xs text-slate-400 text-start">{info.email}</div>
          <label className="block text-xs font-black space-y-1.5"><span>اسمك</span><input required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} className={field} autoComplete="name" /></label>
          <label className="block text-xs font-black space-y-1.5"><span>كلمة المرور (12 حرفًا على الأقل)</span><input required type="password" minLength={12} value={password} onChange={e => setPassword(e.target.value)} className={field} autoComplete="new-password" dir="ltr" /></label>
          {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
          <button disabled={busy} className="w-full py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black disabled:opacity-50">{busy ? 'جارٍ التفعيل…' : 'فعّل حسابي'}</button>
          <p className="text-xs text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-300" aria-hidden="true" />صلاحياتك تتبع دورك فقط داخل هذه المنشأة.</p>
        </form>
      )}
    </div>
  );
};
