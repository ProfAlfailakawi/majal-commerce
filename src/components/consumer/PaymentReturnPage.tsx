import React, { useEffect, useState } from 'react';
import { BadgeCheck, Clock, XCircle } from 'lucide-react';
import { MajalMark } from '../brand/MajalMark';
import { usePrivatePage } from '../../lib/privatePage';
import { request } from '../../lib/domainClient';

type Phase = 'CHECKING' | 'PAID' | 'PENDING' | 'FAILED' | 'UNKNOWN';

const POLL_MS = 3000;
const MAX_POLLS = 10;

/** Where the payment gateway sends the buyer back: `/payment/return?order=<id>`. The webhook, not this page, marks the order paid. */
export const PaymentReturnPage: React.FC<{ orderId: string | null; onDone: () => void }> = ({ orderId, onDone }) => {
  const [phase, setPhase] = useState<Phase>(orderId ? 'CHECKING' : 'UNKNOWN');
  usePrivatePage();

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      polls += 1;
      try {
        const { order } = await request<{ order: { status: string } }>(`/api/v1/orders/${encodeURIComponent(orderId)}`);
        if (!active) return;
        if (order.status === 'PAID' || order.status === 'FULFILLED') return setPhase('PAID');
        if (order.status === 'CANCELLED' || order.status === 'EXPIRED' || order.status === 'FAILED') return setPhase('FAILED');
      } catch {
        if (!active) return;
        return setPhase('UNKNOWN');
      }
      if (polls >= MAX_POLLS) return setPhase('PENDING');
      timer = setTimeout(check, POLL_MS);
    };
    check();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [orderId]);

  const view = {
    CHECKING: { icon: <Clock className="w-12 h-12 mx-auto text-gold-300" aria-hidden="true" />, text: 'جارٍ تأكيد الدفع مع المزوّد… لا تغلق هذه الصفحة.' },
    PAID: { icon: <BadgeCheck className="w-12 h-12 mx-auto text-emerald-300" aria-hidden="true" />, text: 'تم استلام دفعتك وتأكيد طلبك. ستجده في لوحتك، وستصلك تحديثات التجهيز.' },
    PENDING: { icon: <Clock className="w-12 h-12 mx-auto text-amber-300" aria-hidden="true" />, text: 'لم يصلنا تأكيد الدفع بعد. إن خُصم المبلغ فسيُحدَّث طلبك تلقائيًا خلال دقائق، ولا حاجة لإعادة الدفع.' },
    FAILED: { icon: <XCircle className="w-12 h-12 mx-auto text-rose-300" aria-hidden="true" />, text: 'لم تكتمل عملية الدفع وأُلغي الطلب. يمكنك المحاولة من جديد من صفحة الإطلاق.' },
    UNKNOWN: { icon: <XCircle className="w-12 h-12 mx-auto text-slate-300" aria-hidden="true" />, text: 'تعذّر عرض حالة الطلب. سجّل الدخول بنفس الحساب الذي أجريت به الطلب وافتح لوحتك.' }
  }[phase];

  return (
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
      <div className="flex items-center gap-3"><MajalMark size={36} tone="ink" /><h1 className="text-xl font-black">حالة الدفع</h1></div>
      <div className="glass-panel rounded-3xl border border-white/10 p-6 text-center space-y-4">
        {view.icon}
        <p role="status" className="text-sm leading-7">{view.text}</p>
        <button type="button" onClick={onDone} className="px-6 py-3 rounded-xl bg-gold-500 text-slate-950 text-sm font-black">العودة إلى مجال</button>
      </div>
    </div>
  );
};
