import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronLeft, PackageCheck, Truck } from 'lucide-react';
import { fetchPublicEcosystem } from '../../lib/ecosystemClient';
import { SupplierOffering, SupplierProfile } from '../../types/majal';

/**
 * A quiet B2B surface: no new permanent navigation item. The section appears only
 * when verified suppliers exist, so an empty marketplace never creates visual noise.
 */
export const SupplierDirectory: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [offerings, setOfferings] = useState<SupplierOffering[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchPublicEcosystem()
      .then(data => {
        if (!alive) return;
        setSuppliers(data.suppliers);
        setOfferings(data.offerings);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const offeringCount = useMemo(() => offerings.filter(item => item.status === 'ACTIVE').length, [offerings]);
  if (suppliers.length === 0) return null;

  const visible = expanded ? suppliers : suppliers.slice(0, 3);
  return (
    <section className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="w-full p-5 flex items-center justify-between gap-4 text-right hover:bg-white/[0.025] transition"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-400/15 grid place-items-center shrink-0"><Truck className="w-5 h-5 text-sky-300" /></span>
          <span className="min-w-0">
            <strong className="block text-sm text-slate-100">دليل الموردين المعتمدين</strong>
            <span className="block text-xs text-slate-400 mt-1">{suppliers.length} مورد · {offeringCount} مادة/خدمة توريد نشطة</span>
          </span>
        </span>
        <span className="text-xs font-black text-sky-300 whitespace-nowrap flex items-center gap-1">{expanded ? 'إخفاء' : 'استعراض'} <ChevronLeft className={`w-4 h-4 transition ${expanded ? '-rotate-90' : ''}`} /></span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 grid md:grid-cols-2 xl:grid-cols-3 gap-3 border-t border-white/5 pt-4">
          {visible.map(supplier => {
            const supplierOfferings = offerings.filter(item => item.supplierId === supplier.id && item.status === 'ACTIVE').slice(0, 4);
            return (
              <article key={supplier.id} className="rounded-2xl p-4 bg-white/[0.025] border border-white/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h4 className="font-black text-sm text-slate-100 truncate">{supplier.commercialName}</h4><p className="text-[11px] text-slate-400 mt-1">{supplier.category} · {supplier.region}</p></div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300"><PackageCheck className="w-3.5 h-3.5" /> معتمد</span>
                </div>
                {supplier.description && <p className="text-xs text-slate-400 leading-6 line-clamp-2">{supplier.description}</p>}
                {supplierOfferings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {supplierOfferings.map(item => <span key={item.id} className="px-2.5 py-1 rounded-lg bg-sky-500/8 border border-sky-400/10 text-[11px] text-sky-200 inline-flex items-center gap-1"><Boxes className="w-3 h-3" />{item.name}</span>)}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
