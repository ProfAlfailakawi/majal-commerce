import React, { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';

/** Shown once after a submission: the private link where the submitter follows their own numbers. */
export const PrivateLinkNote: React.FC<{ token: string }> = ({ token }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/?my-report=${token}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="rounded-2xl border border-gold-300/20 bg-gold-500/[0.05] p-4 text-start space-y-2">
      <div className="text-xs font-black text-gold-200 flex items-center gap-1.5"><Link2 className="w-4 h-4" aria-hidden="true" />رابط متابعتك الخاص — يظهر مرة واحدة، احتفظ به</div>
      <p className="text-xs text-slate-300 leading-6">منه تعرف كم شخصًا فتح إعلانك وكم تواصل معك. لا أحد غيرك يملكه.</p>
      <div dir="ltr" className="text-xs break-all select-all text-slate-200">{url}</div>
      <button type="button" onClick={copy} className="px-3 py-2 rounded-lg bg-white/10 text-xs font-black inline-flex items-center gap-1.5">{copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}{copied ? 'نُسخ' : 'نسخ الرابط'}</button>
    </div>
  );
};
