import test from 'node:test';
import assert from 'node:assert/strict';
import { AR, arCount } from './arPlural';

test('Arabic counts agree with the number, including zero', () => {
  assert.equal(arCount(0, AR.launch), '0 إطلاقات');
  assert.equal(arCount(1, AR.launch), 'إطلاق واحد');
  assert.equal(arCount(2, AR.launch), 'إطلاقان');
  assert.equal(arCount(5, AR.launch), '5 إطلاقات');
  assert.equal(arCount(11, AR.launch), '11 إطلاقًا');
  assert.equal(arCount(0, AR.review), '0 تقييمات');
  assert.equal(arCount(1, AR.year), 'سنة واحدة');
  assert.equal(arCount(2, AR.year), 'سنتان');
  assert.equal(arCount(15, AR.year), '15 سنة');
});
