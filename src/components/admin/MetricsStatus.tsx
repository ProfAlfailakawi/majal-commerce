import React from 'react';
import { clockLabel } from '../../lib/autoRefresh';
import type { AdminMetrics } from '../../lib/adminMetrics';

/** One honest line under the platform cards: where the numbers come from, and why a zero is a zero. */
export const MetricsStatus: React.FC<{ metrics: AdminMetrics | null; error: string; real: boolean }> = ({ metrics, error, real }) => {
  let text: string;
  let tone = 'text-slate-400';
  if (!real) text = 'أرقام تجريبية من بيانات العرض.';
  else if (!metrics) { text = error ? 'تعذّر تحميل أرقام المنصة من الخادم. نعيد المحاولة تلقائيًا كل دقيقة.' : 'جارٍ تحميل أرقام المنصة…'; if (error) tone = 'text-amber-300'; }
  else if (metrics.sales.paidOrders === 0) text = 'لا توجد طلبات مدفوعة بعد، لذلك تبدأ المبيعات والرسوم من الصفر وتظهر مع أول طلب مدفوع.';
  else text = '';
  return (
    <p role="status" className={`text-xs leading-6 ${tone}`}>
      {text}{metrics && real && <span className="tabular-nums">{text ? ' · ' : ''}من الخادم · آخر تحديث <bdi dir="ltr">{clockLabel(new Date(metrics.generatedAt))}</bdi> · يتحدث تلقائيًا كل دقيقة</span>}
    </p>
  );
};
