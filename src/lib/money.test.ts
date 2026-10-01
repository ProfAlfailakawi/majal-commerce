import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFils, formatKwd, kwdToFils } from './money';

test('KWD is always shown with three decimals', () => {
  assert.equal(formatKwd(3.5), '3.500 د.ك');
  assert.equal(formatFils(1050), '1.050 د.ك');
  assert.equal(formatFils(1234567), '1,234.567 د.ك');
  assert.equal(formatKwd(Number.NaN), '0.000 د.ك');
  assert.equal(kwdToFils(2.3455), 2346);
});

test('sales totals count completed orders only, so every dashboard agrees', async () => {
  const { completedOrderTotals } = await import('./money');
  const t = completedOrderTotals([
    { status: 'COMPLETED', grossAmountKwd: 10, platformFeeKwd: 0.5 },
    { status: 'REFUNDED', grossAmountKwd: 7, platformFeeKwd: 0.35 },
    { status: 'PENDING_PAYMENT', grossAmountKwd: 5, platformFeeKwd: 0.25 },
    { status: 'COMPLETED', grossAmountKwd: 2, platformFeeKwd: 0.1 }
  ]);
  assert.equal(t.salesKwd, 12);
  assert.ok(Math.abs(t.platformFeesKwd - 0.6) < 1e-9);
});

test('demo assistant answers by topic and is offline', async () => {
  const { demoAiAnswer } = await import('./demoAi');
  assert.match(demoAiAnswer('POLISH', 'كيف أحمي وصفتي؟', { productNames: ['قرص عقيلي'] }), /قرص عقيلي/);
  assert.match(demoAiAnswer('POLISH', 'كيف أسعّر المنتج؟'), /عمولة المنصة/);
  assert.match(demoAiAnswer('POLISH', 'متى أوقّع العقد؟'), /الطرفين/);
  assert.match(demoAiAnswer('POLISH', 'كليجا بالهيل'), /الهيل/);
  assert.match(demoAiAnswer('EXPLAIN_MATCH', 'بسكويت'), /الملاءمة/);
});
