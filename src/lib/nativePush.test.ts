import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// غلاف iOS قد يعيد addListener مقبضاً لا وعداً. كان ربطُ ‎.catch‎ عليه مباشرةً يرمي فيتوقف
// تجديد توكن التنبيهات بصمت عند كل تشغيل. لا يجوز ربط ‎.then/.catch‎ على نتيجته مباشرةً.
const src = readFileSync(new URL('./nativePush.ts', import.meta.url), 'utf8');

test('addListener result is never chained directly', () => {
  let i = 0;
  while ((i = src.indexOf('.addListener(', i)) !== -1) {
    let j = i + '.addListener('.length, d = 1;
    while (j < src.length && d > 0) { if (src[j] === '(') d++; else if (src[j] === ')') d--; j++; }
    assert.doesNotMatch(src.slice(j).trimStart().slice(0, 10), /^\.(then|catch|finally)\(/);
    i = j;
  }
});

test('push-tap listener is wrapped so token refresh always runs', () => {
  assert.match(src, /Promise\.resolve\(plugin\.addListener\('pushNotificationActionPerformed'/);
});
