/*
 * عقد المنفذ مع Cloud Run: المنصّة تحدّد المنفذ عبر متغيّر البيئة PORT (افتراضيًا
 * 8080) وتفحص أن الحاوية تستمع عليه — وإلا قتلت المراجعة الجديدة قبل أن تخدم
 * طلبًا واحدًا. وقع هذا فعلًا: `const port = 3000` صلبةً أسقطت أول نشرٍ لمجال
 * بـ"failed to start and listen on the port". هذا الفحص يقرأ المصدر لأن تشغيل
 * الخادم كاملًا يتطلب قاعدة بيانات؛ يكفي أن يثبت أن PORT هي المرجع.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('الخادم يستمع حيث تطرق المنصّة: process.env.PORT لا رقمًا صلبًا', () => {
  const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /const port = Number\(process\.env\.PORT\) > 0 \? Number\(process\.env\.PORT\) : 3000;/,
    'server.ts لم يعد يقرأ PORT من البيئة — سيفشل النشر على Cloud Run (PORT=8080).',
  );
  assert.doesNotMatch(source, /const port = 3000;/, 'عاد المنفذ رقمًا صلبًا.');
});
