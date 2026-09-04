import React, { useState } from 'react';
import { ShieldCheck, Search, Filter, Lock, FileText, CheckCircle2 } from 'lucide-react';
import { store } from '../../lib/store';

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
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right">
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
                <td className="py-2.5 px-3 text-slate-400">{new Date(log.timestamp).toLocaleString('ar-KW')}</td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {log.action}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-300 font-bold">{log.entityType}</td>
                <td className="py-2.5 px-3 text-slate-200 font-sans">{log.details}</td>
                <td className="py-2.5 px-3 text-slate-500 text-[10px]">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
