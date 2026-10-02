import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, Lock, FileText, CheckCircle2, CalendarDays, ChevronDown, MapPin } from 'lucide-react';
import { store } from '../../lib/store';
import { arabicTerms } from '../../lib/arabicTerms';

const ACTION_LABELS: Record<string, string> = {
  RECIPE_VIEWED: 'فتح خزنة الوصفة', ACCESS_REQUESTED: 'طلب إذن وصفة', ACCESS_GRANTED: 'منح إذن وصفة', ACCESS_REVOKED: 'سحب إذن وصفة',
  OFFER_CHANGED: 'تعديل عرض تجاري', CONTRACT_SIGNED: 'توقيع عقد', LAUNCH_PREPARED: 'تجهيز إطلاق', LAUNCH_GATE_UPDATED: 'تحديث بوابة الإطلاق',
  LAUNCH_ACTIVATED: 'تفعيل إطلاق', REVIEW_SUBMITTED: 'تقييم عميل', SETTLEMENT_APPROVED: 'اعتماد تسوية', SETTLEMENT_PAID: 'تأكيد صرف تسوية',
  COMPLIANCE_STATUS_CHANGED: 'تغيّر حالة الامتثال', DISPUTE_UPDATED: 'تحديث نزاع', PRODUCT_PAUSED: 'إيقاف منتج مؤقتاً', RECIPE_EXPORTED: 'تصدير نسخة وصفة',
  PLATFORM_POLICY_CHANGED: 'تغيير سياسة المنصة',
  ORDER_PLACED: 'حجز طلب',
  ORDER_PAID_SIMULATED: 'دفع طلب (محاكاة)',
  ORDER_CANCELLED_SIMULATED: 'إلغاء طلب (محاكاة)',
  ORDER_REFUNDED_SIMULATED: 'استرجاع طلب (محاكاة)'
};

const ENTITY_LABELS: Record<string, string> = { RecipeVersion: 'نسخة وصفة', Launch: 'إطلاق', SettlementBatch: 'دفعة تسوية', Collaboration: 'تعاون', ORDER: 'طلب', PRODUCT: 'منتج', CONTRACT: 'عقد', LAUNCH: 'إطلاق', SETTLEMENT: 'تسوية', COLLABORATION: 'تعاون', REVIEW: 'تقييم', RECIPE_ACCESS_GRANT: 'إذن وصفة', RECIPE_ACCESS_REQUEST: 'طلب إذن وصفة', SETTLEMENT_BATCH: 'دفعة تسوية', CHALLENGE: 'تحدٍّ', DEAL_DECISION: 'قرار صفقة', LAB_BATCH: 'دفعة مختبر', OFFER: 'عرض تجاري', PLATFORM_POLICY: 'سياسة المنصة', USER: 'مستخدم', DATABASE: 'قاعدة البيانات' };

export const AdminAuditLogs: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const logs = store.auditLogs;

  const filteredLogs = logs.filter(l => {
    if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;
    if (searchTerm && !l.details.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const groups = Array.from(
    filteredLogs.reduce((map, l) => {
      const day = new Date(l.timestamp).toLocaleDateString('ar-KW-u-nu-latn');
      (map.get(day) ?? map.set(day, []).get(day)!).push(l);
      return map;
    }, new Map<string, typeof filteredLogs>())
  );
  const actionCounts = (rows: typeof filteredLogs) =>
    Array.from(rows.reduce((m, l) => m.set(l.action, (m.get(l.action) || 0) + 1), new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4 text-slate-100 text-xs">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gold-400" />
            <span>سجل التدقيق والأمان الرقمي</span>
          </h3>
          <p className="text-slate-400 text-xs">
            سجل حركة غير قابل للتعديل يوثق أحداث التوقيع، معاينة خزنة الوصفات، وتوليد التسويات المالية
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالوصف أو المعرف..."
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300"
          />
        </div>
      </div>

      <div className="space-y-3">
        {groups.map(([day, rows], index) => (
          <details key={day} open={index < 2} className="group rounded-2xl border border-slate-800 bg-slate-950/40">
            <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <CalendarDays className="w-4 h-4 text-gold-300 shrink-0" aria-hidden="true" />
              <span className="font-black text-slate-100 text-sm">{day}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-gold-500/15 text-gold-300 border border-gold-500/30 tabular-nums">{rows.length}</span>
              <span className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                {actionCounts(rows).slice(0, 4).map(([action, n]) => (
                  <span key={action} className="px-2 py-0.5 rounded-full text-xs text-slate-300 bg-white/5 border border-white/10 whitespace-nowrap">{ACTION_LABELS[action] || action} <b className="tabular-nums text-slate-100">{n}</b></span>
                ))}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="overflow-x-auto px-2 pb-2">
              <table className="mobile-cards w-full text-start">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3 font-semibold">التاريخ والوقت</th>
                    <th className="py-2.5 px-3 font-semibold">نوع الحدث</th>
                    <th className="py-2.5 px-3 font-semibold">نوع الكيان</th>
                    <th className="py-2.5 px-3 font-semibold">التفاصيل والوصف</th>
                    <th className="py-2.5 px-3 font-semibold">عنوان IP والمدينة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rows.map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td data-label="التاريخ والوقت" className="py-2.5 px-3 text-slate-400">{new Date(log.timestamp).toLocaleString('ar-KW-u-nu-latn')}</td>
                        <td data-label="نوع الحدث" className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-gold-500/20 text-gold-300 border border-gold-500/30">
                            <span title={log.action}>{ACTION_LABELS[log.action] || log.action}</span>
                          </span>
                        </td>
                        <td data-label="نوع الكيان" className="py-2.5 px-3 text-slate-300 font-bold">{ENTITY_LABELS[log.entityType] || log.entityType}</td>
                        <td data-label="التفاصيل والوصف" className="py-2.5 px-3 text-slate-200">{arabicTerms(log.details)}</td>
                        <td data-label="عنوان IP والمدينة" className="py-2.5 px-3 text-slate-400 text-xs"><details className="group"><summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1 max-sm:min-h-11 max-sm:min-w-11 text-slate-400 hover:text-slate-200" title="عنوان IP والمدينة"><MapPin className="w-3.5 h-3.5" aria-hidden="true" /><ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" aria-hidden="true" /></summary><span className="block mt-1">{log.ipAddress}</span></details></td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>

    </div>
  );
};
