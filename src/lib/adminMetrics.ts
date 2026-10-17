import { useCallback, useEffect, useState } from 'react';
import { request } from './domainClient';
import { IS_DEMO_MODE } from './runtime';
import { store } from './store';
import { completedOrderTotals } from './money';
import { REFRESH_MS, useAutoRefresh } from './autoRefresh';

/** Platform figures for the admin dashboards. Real mode reads them from the server; demo derives them from its local data. */
export interface AdminMetrics {
  generatedAt: string;
  sales: { paidOrders: number; grossFils: number; platformFeeFils: number; pendingPaymentOrders: number };
  contracts: { fullySigned: number };
  disputes: { open: number };
  hosts: { total: number; verified: number };
  launches: { live: number };
  settlements: { eligibleCreators: number; batchesTotal: number; paidFils: number; approvedFils: number };
}

export const fetchAdminMetrics = () => request<{ metrics: AdminMetrics }>('/api/v1/admin/metrics').then(r => r.metrics);

const fils = (kwd: number) => Math.round(kwd * 1000);

/** The same shape from the demo's local store, so the cards render identically in both modes. */
export function demoAdminMetrics(): AdminMetrics {
  const totals = completedOrderTotals(store.orders);
  const eligible = new Set(store.accruals.filter(a => a.settlementStatus === 'SETTLEMENT_ELIGIBLE').map(a => a.creatorId));
  return {
    generatedAt: new Date().toISOString(),
    sales: { paidOrders: store.orders.filter(o => o.status === 'COMPLETED').length, grossFils: fils(totals.salesKwd), platformFeeFils: fils(totals.platformFeesKwd), pendingPaymentOrders: store.orders.filter(o => o.status === 'PENDING_PAYMENT').length },
    contracts: { fullySigned: store.contracts.filter(c => c.status === 'FULLY_SIGNED').length },
    disputes: { open: store.disputes.filter(d => !['RESOLVED', 'CLOSED'].includes(d.status)).length },
    hosts: { total: store.hosts.length, verified: store.hosts.filter(h => h.verificationStatus === 'VERIFIED').length },
    launches: { live: store.launches.filter(l => ['LIVE', 'PERMANENT'].includes(l.status)).length },
    settlements: {
      eligibleCreators: eligible.size, batchesTotal: store.settlements.length,
      paidFils: fils(store.settlements.filter(b => b.status === 'PAID').reduce((a, b) => a + b.totalAmountKwd, 0)),
      approvedFils: fils(store.settlements.filter(b => b.status === 'APPROVED').reduce((a, b) => a + b.totalAmountKwd, 0)),
    },
  };
}

/**
 * Real mode: fetched on mount and every minute while the tab is visible; until the first answer
 * `metrics` is null so cards show a dash instead of a zero that could be mistaken for "no sales".
 */
export function useAdminMetrics() {
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (IS_DEMO_MODE) return;
    fetchAdminMetrics().then(m => { setData(m); setError(''); }).catch(e => setError(e instanceof Error ? e.message : 'تعذّر تحميل أرقام المنصة.'));
  }, []);
  useEffect(load, [load]);
  useAutoRefresh(load, REFRESH_MS, !IS_DEMO_MODE);
  return { metrics: IS_DEMO_MODE ? demoAdminMetrics() : data, error, real: !IS_DEMO_MODE };
}

export const kwdFromFils = (value: number) => (value / 1000).toFixed(3);
