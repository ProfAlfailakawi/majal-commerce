import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, Lock, FileText, CheckCircle2 } from 'lucide-react';
import { store } from '../../lib/store';

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

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4 text-slate-100 text-xs">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-gold-300"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
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
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                <td data-label="التاريخ والوقت" className="py-2.5 px-3 text-slate-400">{new Date(log.timestamp).toLocaleString('ar-KW')}</td>
                <td data-label="نوع الحدث" className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <span title={log.action}>{ACTION_LABELS[log.action] || log.action}</span>
                  </span>
                </td>
                <td data-label="نوع الكيان" className="py-2.5 px-3 text-slate-300 font-bold">{ENTITY_LABELS[log.entityType] || log.entityType}</td>
                <td data-label="التفاصيل والوصف" className="py-2.5 px-3 text-slate-200 font-sans">{log.details}</td>
                <td data-label="عنوان IP والمدينة" className="py-2.5 px-3 text-slate-400 text-xs">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
