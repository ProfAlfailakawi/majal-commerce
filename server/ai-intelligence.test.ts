import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numbersAreGrounded,
  filterGroundedLines,
  enrichSemanticMatch,
  groundOpportunityRadar,
  dealRoomCopilot,
  type AiAuditEvent,
  type AiIntelligenceDeps
} from './ai-intelligence';

// A recording mock: lets each test decide what Gemini "returns" and asserts on
// exactly what was audited. No network, no API key — runs fully offline.
function makeDeps(overrides: Partial<AiIntelligenceDeps> = {}) {
  const events: AiAuditEvent[] = [];
  const deps: AiIntelligenceDeps = {
    generateStructured: (async () => { throw new Error('not stubbed'); }) as AiIntelligenceDeps['generateStructured'],
    groundedSearch: async () => ({ text: '', citations: [] }),
    audit: (event) => { events.push(event); },
    ...overrides
  };
  return { deps, events };
}

test('numbersAreGrounded accepts numbers present in context, rejects invented ones', () => {
  assert.equal(numbersAreGrounded('الهامش 32% مقبول', 'margin is 32%'), true);
  assert.equal(numbersAreGrounded('نمو السوق 47%', 'no such figure here'), false);
  assert.equal(numbersAreGrounded('نص بدون أرقام', 'anything'), true);
  // Arabic-Indic digits normalize to the same value.
  assert.equal(numbersAreGrounded('القيمة ٣٢٪', 'value 32%'), true);
});

test('filterGroundedLines drops only the unverifiable lines and counts them', () => {
  const { kept, blocked } = filterGroundedLines(
    ['هامش 20% موثّق', 'مبيعات وهمية 999999', '   '],
    'margin 20% recorded'
  );
  assert.deepEqual(kept, ['هامش 20% موثّق']);
  assert.equal(blocked, 1);
});

test('enrichSemanticMatch strips fabricated numbers and audits DEGRADED', async () => {
  const { deps, events } = makeDeps({
    generateStructured: (async () => ({
      reasons: ['تطابق فئوي قوي', 'حصة سوقية 88%'],
      risks: ['هامش 15% ضمن السياق']
    })) as AiIntelligenceDeps['generateStructured']
  });
  const result = await enrichSemanticMatch({
    tenantId: 't1', actorUserId: 'u1', productName: 'p', category: 'c', hostName: 'h',
    deterministicReasons: ['الهامش المسجل 15%'], evidenceText: 'margin 15%'
  }, deps);

  assert.deepEqual(result.reasons, ['تطابق فئوي قوي']); // "88%" fabricated → dropped
  assert.deepEqual(result.risks, ['هامش 15% ضمن السياق']);
  assert.equal(result.degraded, true);
  assert.equal(events[0].action, 'SEMANTIC_MATCH');
  assert.equal(events[0].tenantId, 't1');
  assert.equal(events[0].blockedNumericClaims, 1);
  assert.equal(events[0].outcome, 'DEGRADED');
});

test('enrichSemanticMatch fails closed on model error (no partial guess)', async () => {
  const { deps, events } = makeDeps({
    generateStructured: async () => { throw new Error('gemini down'); }
  });
  const result = await enrichSemanticMatch({
    tenantId: 't1', actorUserId: 'u1', productName: 'p', category: 'c', hostName: 'h',
    deterministicReasons: ['x'], evidenceText: 'y'
  }, deps);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.degraded, true);
  assert.equal(events[0].outcome, 'ERROR');
});

test('groundOpportunityRadar returns a signal only when citations exist', async () => {
  const withCites = makeDeps({
    groundedSearch: async () => ({ text: 'طلب متزايد على الحلويات', citations: [{ title: 'Src', uri: 'https://example.com' }] })
  });
  const ok = await groundOpportunityRadar({ tenantId: 't', actorUserId: 'u', query: 'q' }, withCites.deps);
  assert.equal(ok.groundedSignals.length, 1);
  assert.equal(ok.groundedSignals[0].citations.length, 1);
  assert.equal(ok.degraded, false);
  assert.equal(withCites.events[0].citations, 1);

  const noCites = makeDeps({ groundedSearch: async () => ({ text: 'ادعاء بلا مصدر', citations: [] }) });
  const degraded = await groundOpportunityRadar({ tenantId: 't', actorUserId: 'u', query: 'q' }, noCites.deps);
  assert.equal(degraded.groundedSignals.length, 0); // grounded-or-absent
  assert.equal(degraded.degraded, true);
  assert.equal(noCites.events[0].outcome, 'DEGRADED');
});

test('dealRoomCopilot rejects a narrative that invents a number', async () => {
  const { deps } = makeDeps({
    generateStructured: (async () => ({
      narrative: 'الصفقة تحقق عائدًا 300% مؤكدًا', // fabricated
      watchouts: ['العقد غير موقّع'],
      openQuestions: ['هل روجعت الشروط ماليًا؟']
    })) as AiIntelligenceDeps['generateStructured']
  });
  const result = await dealRoomCopilot({
    tenantId: 't', actorUserId: 'u', stage: 'NEGOTIATION', contractStatus: 'DRAFT',
    optionSummaries: ['V1: royalty 12%'], gatePassed: false
  }, deps);
  assert.equal(result.narrative, ''); // ungrounded narrative suppressed
  assert.deepEqual(result.watchouts, ['العقد غير موقّع']);
  assert.equal(result.degraded, true);
});
