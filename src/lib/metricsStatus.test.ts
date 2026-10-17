import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MetricsStatus } from '../components/admin/MetricsStatus';
import type { AdminMetrics } from './adminMetrics';

const metrics = (paidOrders: number): AdminMetrics => ({
  generatedAt: '2026-10-18T11:05:09Z',
  sales: { paidOrders, grossFils: 0, platformFeeFils: 0, pendingPaymentOrders: 0 }, contracts: { fullySigned: 0 }, disputes: { open: 0 },
  hosts: { total: 0, verified: 0 }, launches: { live: 0 }, settlements: { eligibleCreators: 0, batchesTotal: 0, paidFils: 0, approvedFils: 0 },
});
const html = (m: AdminMetrics | null, error: string, real: boolean) => renderToStaticMarkup(createElement(MetricsStatus, { metrics: m, error, real }));

test('real mode explains a zero instead of passing it off as data, and says when it last updated', () => {
  assert.match(html(metrics(0), '', true), /لا توجد طلبات مدفوعة بعد/);
  assert.match(html(metrics(0), '', true), /14:05:09/);
  assert.doesNotMatch(html(metrics(3), '', true), /لا توجد طلبات مدفوعة بعد/);
  assert.match(html(metrics(3), '', true), /من الخادم/);
});

test('before the first answer or on failure the card line says so, and the demo labels its numbers', () => {
  assert.match(html(null, '', true), /جارٍ تحميل/);
  assert.match(html(null, 'x', true), /تعذّر تحميل أرقام المنصة/);
  assert.match(html(metrics(0), '', false), /أرقام تجريبية/);
  assert.doesNotMatch(html(metrics(0), '', false), /من الخادم/);
});
