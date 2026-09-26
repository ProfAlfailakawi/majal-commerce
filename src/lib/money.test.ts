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
