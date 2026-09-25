import assert from 'node:assert/strict';
import test from 'node:test';
import { legalDocumentFromPath, legalPath } from './legalRoutes';

test('legal documents have stable public URLs', () => {
  assert.equal(legalPath('TERMS'), '/terms');
  assert.equal(legalPath('PRIVACY'), '/privacy');
  assert.equal(legalPath('REFUND'), '/refund');
  assert.equal(legalPath('COMPLIANCE'), '/compliance');
  assert.equal(legalDocumentFromPath('/privacy/'), 'PRIVACY');
  assert.equal(legalDocumentFromPath('/'), null);
  assert.equal(legalDocumentFromPath('/unknown'), null);
});
