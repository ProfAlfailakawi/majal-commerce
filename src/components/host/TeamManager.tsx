import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, MessageCircle, Pause, Play, Trash2, UserPlus, X } from 'lucide-react';
import { roleLabel } from '../../lib/permissions';
import { changeTeamMember, fetchTeam, inviteTeamMember, removeTeamMember, revokeTeamInvite, TEAM_ROLES, type TeamOverview, type TeamRole } from '../../lib/teamClient';
import type { UserRole } from '../../types/majal';
import { store } from '../../lib/store';
import { Avatar } from '../common/Avatar';

const field = 'w-full glass-input rounded-xl px-3 py-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';

/** Owner-only: invite colleagues by private link, change their role, suspend or remove them. */
export const TeamManager: React.FC = () => {
  const [team, setTeam] = useState<TeamOverview>({ members: [], invites: [] });
  const [email, setEmail] = useState(''), [role, setRole] = useState<TeamRole>('HOST_OPERATIONS');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [link, setLink] = useState(''), [copied, setCopied] = useState(false);
  const load = useCallback(() => { fetchTeam().then(setTeam).catch(e => setError(e instanceof Error ? e.message : 'تعذّر تحميل الفريق.')); }, []);
  useEffect(load, [load]);
  if (store.activeUser.role !== 'HOST_OWNER') return null;

  const act = async (job: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await job(); load(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تنفيذ العملية.'); } finally { setBusy(false); }
  };
  const invite = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => { const r = await inviteTeamMember(email.trim(), role); setLink(`${window.location.origin}${r.link}`); setCopied(false); setEmail(''); });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } };

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5" aria-labelledby="team-manager-title">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gold-500/10 border border-gold-300/20 grid place-items-center text-gold-300"><UserPlus className="w-5 h-5" aria-hidden="true" /></span>
        <div><h3 id="team-manager-title" className="font-black text-lg">أضف أعضاء فريقك</h3><p className="text-xs text-slate-400 mt-1">ادعُ زميلك واختر دوره. يفعّل حسابه بنفسه من رابط خاص صالح 7 أيام.</p></div>
      </div>

      <form onSubmit={invite} className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <label className="text-xs font-black space-y-1.5 block"><span>بريد الزميل</span><input required type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} className={field} placeholder="name@company.com" /></label>
        <label className="text-xs font-black space-y-1.5 block"><span>الدور</span><select value={role} onChange={e => setRole(e.target.value as TeamRole)} className={field}>{TEAM_ROLES.map(r => <option key={r} value={r}>{roleLabel(r as UserRole)}</option>)}</select></label>
        <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-gold-500 text-slate-950 text-xs font-black disabled:opacity-50">إنشاء الدعوة</button>
      </form>

      {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-400/20 text-xs text-rose-200">{error}</div>}
      {link && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 space-y-2">
          <div className="text-xs font-black text-emerald-200 flex items-center gap-1.5"><Link2 className="w-4 h-4" aria-hidden="true" />رابط الدعوة — يظهر مرة واحدة، أرسله لزميلك (واتساب مثلًا)</div>
          <div dir="ltr" className="text-xs break-all text-slate-200 select-all">{link}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="px-3 py-2 rounded-lg bg-white/10 text-xs font-black inline-flex items-center gap-1.5">{copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}{copied ? 'نُسخ' : 'نسخ الرابط'}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`دعوة للانضمام إلى فريقنا في مجال. فعّل حسابك من هنا (الرابط لمرة واحدة وصالح 7 أيام): ${link}`)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg bg-emerald-400 text-slate-950 text-xs font-black inline-flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />إرسال عبر واتساب</a>
          </div>
        </div>
      )}

      {team.invites.length > 0 && (
        <div className="space-y-2"><h4 className="text-xs font-black text-slate-300">دعوات معلّقة</h4>
          {team.invites.map(i => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5 text-xs">
              <span className="min-w-0 truncate"><span dir="ltr">{i.email}</span> · {roleLabel(i.role as UserRole)}</span>
              <button type="button" disabled={busy} onClick={() => act(() => revokeTeamInvite(i.id))} className="shrink-0 text-rose-300 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" aria-hidden="true" />إلغاء</button>
            </div>
          ))}
        </div>
      )}

      {team.members.length > 0 && (
        <div className="space-y-2"><h4 className="text-xs font-black text-slate-300">الأعضاء</h4>
          {team.members.map(m => (
            <div key={m.userId} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
              <Avatar name={m.name} size={34} shape="squircle" />
              <div className="min-w-0 flex-1"><div className="text-sm font-black truncate">{m.name}{m.self ? ' (أنت)' : ''}</div><div dir="ltr" className="text-xs text-slate-400 truncate text-start">{m.email}</div></div>
              {m.role === 'HOST_OWNER' || m.self ? <span className="text-xs text-gold-300 font-black">{roleLabel(m.role as UserRole)}</span> : (
                <>
                  <select aria-label={`دور ${m.name}`} value={m.role} disabled={busy} onChange={e => act(() => changeTeamMember(m.userId, { role: e.target.value as TeamRole }))} className={`${field} !w-auto`}>{TEAM_ROLES.map(r => <option key={r} value={r}>{roleLabel(r as UserRole)}</option>)}</select>
                  <button type="button" disabled={busy} onClick={() => act(() => changeTeamMember(m.userId, { status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }))} aria-label={m.status === 'ACTIVE' ? `إيقاف ${m.name}` : `تفعيل ${m.name}`} className="p-2 rounded-lg bg-white/5 border border-white/10">{m.status === 'ACTIVE' ? <Pause className="w-4 h-4 text-amber-300" aria-hidden="true" /> : <Play className="w-4 h-4 text-emerald-300" aria-hidden="true" />}</button>
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm(`إزالة ${m.name} من المنشأة؟`)) void act(() => removeTeamMember(m.userId)); }} aria-label={`إزالة ${m.name}`} className="p-2 rounded-lg bg-rose-500/10 border border-rose-400/20"><Trash2 className="w-4 h-4 text-rose-300" aria-hidden="true" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
