/**
 * MAJAL Intelligence Layer — server orchestration.
 *
 * This module sits ON TOP of the deterministic intelligence (src/lib/intelligence.ts).
 * It never decides: it enriches an already permission-filtered, deterministic
 * context with Gemini structured outputs and Google-Search-grounded signals, then
 * enforces three hard invariants before returning anything to a caller:
 *
 *   1. No invented numbers   — every numeric token in generated prose must exist
 *                              verbatim in the caller-supplied context, else the
 *                              line is dropped (never shown).
 *   2. Grounded-or-absent    — external market claims carry citations or are
 *                              reported as unavailable; they are never fabricated.
 *   3. Audited               — every AI action is recorded with tenant, actor,
 *                              disclosure level, model and what was blocked.
 *
 * Money, legal and permission-grant decisions stay with the existing system and
 * human approval; nothing here can execute a contract, move funds or raise a grant.
 */
import {
  GroundedResult,
  INTELLIGENCE_SYSTEM_INSTRUCTION,
  generateStructured,
  groundedSearch
} from '../src/lib/gemini';

export interface AiAuditEvent {
  action: 'SEMANTIC_MATCH' | 'OPPORTUNITY_RADAR' | 'DEAL_ROOM' | 'LAUNCH_READOUT';
  tenantId: string;
  actorUserId: string;
  disclosureLevel?: number;
  model: string;
  citations?: number;
  blockedNumericClaims: number;
  outcome: 'OK' | 'DEGRADED' | 'ERROR';
}

export interface AiIntelligenceDeps {
  generateStructured: typeof generateStructured;
  groundedSearch: typeof groundedSearch;
  audit: (event: AiAuditEvent) => void;
}

export interface GroundedMarketSignal {
  title: string;
  summary: string;
  query: string;
  citations: { title: string; uri: string }[];
}

// ---- numeric-integrity guard -------------------------------------------------

// Matches western and Arabic-Indic digit runs, optionally with separators/percent.
const NUMERIC = /[0-9٠-٩]+(?:[.,٫٬][0-9٠-٩]+)*\s*[%٪]?/g;

const normalizeDigits = (value: string) =>
  value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫]/g, '.')
    .replace(/[\s,٪%٬]/g, '');

/**
 * True when every number that appears in `line` also appears in `allowedText`.
 * A line that introduces an unverifiable number is rejected wholesale.
 */
export function numbersAreGrounded(line: string, allowedText: string): boolean {
  const allowed = normalizeDigits(allowedText);
  const tokens = line.match(NUMERIC);
  if (!tokens) return true;
  return tokens.every(token => {
    const normalized = normalizeDigits(token);
    return normalized.length === 0 || allowed.includes(normalized);
  });
}

/** Keep only lines whose numbers are all traceable to the context. Returns the
 * survivors plus a count of what was blocked (for auditing). */
export function filterGroundedLines(lines: string[], allowedText: string): { kept: string[]; blocked: number } {
  const kept: string[] = [];
  let blocked = 0;
  for (const raw of lines) {
    const line = typeof raw === 'string' ? raw.trim() : '';
    if (!line) continue;
    if (numbersAreGrounded(line, allowedText)) kept.push(line);
    else blocked++;
  }
  return { kept, blocked };
}

const activeModel = () => process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export const defaultAiDeps: AiIntelligenceDeps = {
  generateStructured,
  groundedSearch,
  // Default sink logs a structured, PII-free audit line. Callers may swap this
  // for a durable ledger write.
  audit: (event) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ severity: 'INFO', event: 'ai_action', ...event, at: new Date().toISOString() }));
  }
};

// ---- 1. Semantic match reasons ----------------------------------------------

export interface SemanticMatchContext {
  tenantId: string;
  actorUserId: string;
  productName: string;
  category: string;
  hostName: string;
  deterministicReasons: string[];
  evidenceText: string; // caller-built, permission-filtered "label: value" lines
}

export interface SemanticMatchEnrichment {
  reasons: string[];
  risks: string[];
  degraded: boolean;
}

const SEMANTIC_SCHEMA = {
  type: 'object',
  properties: {
    reasons: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    risks: { type: 'array', items: { type: 'string' }, maxItems: 5 }
  },
  required: ['reasons', 'risks']
};

export async function enrichSemanticMatch(ctx: SemanticMatchContext, deps: AiIntelligenceDeps = defaultAiDeps): Promise<SemanticMatchEnrichment> {
  const allowedText = [ctx.evidenceText, ctx.deterministicReasons.join('\n')].join('\n');
  try {
    const out = await deps.generateStructured<{ reasons: string[]; risks: string[] }>({
      contents:
        `رتّب وفسّر توافق المطابقة بالاعتماد الحرفي على الأدلة الحتمية التالية فقط.\n` +
        `<product>${ctx.productName}</product>\n<category>${ctx.category}</category>\n<host>${ctx.hostName}</host>\n` +
        `<deterministicReasons>${ctx.deterministicReasons.join(' | ')}</deterministicReasons>\n` +
        `<evidence>${ctx.evidenceText}</evidence>`,
      schema: SEMANTIC_SCHEMA,
      systemInstruction: INTELLIGENCE_SYSTEM_INSTRUCTION
    });
    const reasons = filterGroundedLines(Array.isArray(out.reasons) ? out.reasons : [], allowedText);
    const risks = filterGroundedLines(Array.isArray(out.risks) ? out.risks : [], allowedText);
    const blocked = reasons.blocked + risks.blocked;
    deps.audit({ action: 'SEMANTIC_MATCH', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), blockedNumericClaims: blocked, outcome: blocked ? 'DEGRADED' : 'OK' });
    return { reasons: reasons.kept, risks: risks.kept, degraded: blocked > 0 };
  } catch {
    deps.audit({ action: 'SEMANTIC_MATCH', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), blockedNumericClaims: 0, outcome: 'ERROR' });
    // Fail closed to the deterministic layer — never surface a partial guess.
    return { reasons: [], risks: [], degraded: true };
  }
}

// ---- 2. Opportunity Radar (Google Search grounded) --------------------------

export interface RadarContext {
  tenantId: string;
  actorUserId: string;
  query: string;
}

export interface RadarEnrichment {
  groundedSignals: GroundedMarketSignal[];
  degraded: boolean;
  note?: string;
}

export async function groundOpportunityRadar(ctx: RadarContext, deps: AiIntelligenceDeps = defaultAiDeps): Promise<RadarEnrichment> {
  try {
    const result: GroundedResult = await deps.groundedSearch(ctx.query);
    // Grounded-or-absent: prose with zero citations is treated as unavailable.
    if (!result.citations.length || !result.text.trim()) {
      deps.audit({ action: 'OPPORTUNITY_RADAR', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), citations: 0, blockedNumericClaims: 0, outcome: 'DEGRADED' });
      return { groundedSignals: [], degraded: true, note: 'لا توجد إشارة سوق خارجية مرفقة بمصدر، لذلك لا تُعرض أرقام سوقية.' };
    }
    const signal: GroundedMarketSignal = {
      title: 'إشارة سوق مرتبطة بمصدر',
      summary: result.text.trim(),
      query: ctx.query,
      citations: result.citations.slice(0, 6)
    };
    deps.audit({ action: 'OPPORTUNITY_RADAR', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), citations: signal.citations.length, blockedNumericClaims: 0, outcome: 'OK' });
    return { groundedSignals: [signal], degraded: false };
  } catch {
    deps.audit({ action: 'OPPORTUNITY_RADAR', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), citations: 0, blockedNumericClaims: 0, outcome: 'ERROR' });
    return { groundedSignals: [], degraded: true, note: 'تعذّر جلب إشارات السوق الخارجية.' };
  }
}

// ---- 3. Deal Room copilot (summarize, never execute) ------------------------

export interface DealRoomContext {
  tenantId: string;
  actorUserId: string;
  stage: string;
  optionSummaries: string[]; // deterministic, numbers already present
  contractStatus: string;
  gatePassed: boolean;
}

export interface DealRoomEnrichment {
  narrative: string;
  watchouts: string[];
  openQuestions: string[];
  degraded: boolean;
}

const DEAL_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string' },
    watchouts: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    openQuestions: { type: 'array', items: { type: 'string' }, maxItems: 5 }
  },
  required: ['narrative', 'watchouts', 'openQuestions']
};

export async function dealRoomCopilot(ctx: DealRoomContext, deps: AiIntelligenceDeps = defaultAiDeps): Promise<DealRoomEnrichment> {
  const allowedText = [ctx.stage, ctx.contractStatus, ctx.optionSummaries.join('\n'), String(ctx.gatePassed)].join('\n');
  try {
    const out = await deps.generateStructured<{ narrative: string; watchouts: string[]; openQuestions: string[] }>({
      contents:
        `لخّص وضع الصفقة وخياراتها ومخاطرها للطرفين. أنت تلخّص ولا تقرر ولا تنفّذ عقدًا.\n` +
        `<stage>${ctx.stage}</stage>\n<contractStatus>${ctx.contractStatus}</contractStatus>\n` +
        `<launchGatePassed>${ctx.gatePassed}</launchGatePassed>\n` +
        `<options>${ctx.optionSummaries.join(' | ')}</options>`,
      schema: DEAL_SCHEMA
    });
    const narrativeOk = typeof out.narrative === 'string' && numbersAreGrounded(out.narrative, allowedText);
    const watchouts = filterGroundedLines(Array.isArray(out.watchouts) ? out.watchouts : [], allowedText);
    const questions = filterGroundedLines(Array.isArray(out.openQuestions) ? out.openQuestions : [], allowedText);
    const blocked = watchouts.blocked + questions.blocked + (narrativeOk ? 0 : 1);
    deps.audit({ action: 'DEAL_ROOM', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), blockedNumericClaims: blocked, outcome: blocked ? 'DEGRADED' : 'OK' });
    return {
      narrative: narrativeOk ? out.narrative.trim() : '',
      watchouts: watchouts.kept,
      openQuestions: questions.kept,
      degraded: blocked > 0
    };
  } catch {
    deps.audit({ action: 'DEAL_ROOM', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), blockedNumericClaims: 0, outcome: 'ERROR' });
    return { narrative: '', watchouts: [], openQuestions: [], degraded: true };
  }
}

// ---- 4. Launch market readout (internal numbers stay internal) --------------

export interface LaunchContext {
  tenantId: string;
  actorUserId: string;
  query: string;
}

export interface LaunchEnrichment {
  marketReadout: string[];
  citations: { title: string; uri: string }[];
  degraded: boolean;
}

export async function launchMarketReadout(ctx: LaunchContext, deps: AiIntelligenceDeps = defaultAiDeps): Promise<LaunchEnrichment> {
  try {
    const result = await deps.groundedSearch(ctx.query);
    if (!result.citations.length || !result.text.trim()) {
      deps.audit({ action: 'LAUNCH_READOUT', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), citations: 0, blockedNumericClaims: 0, outcome: 'DEGRADED' });
      return { marketReadout: [], citations: [], degraded: true };
    }
    // External market prose is not cross-checked against internal numbers (it is a
    // different corpus); it is instead anchored by citations and kept separate
    // from the internal financial readout, which the deterministic layer owns.
    const lines = result.text.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 6);
    deps.audit({ action: 'LAUNCH_READOUT', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), citations: result.citations.length, blockedNumericClaims: 0, outcome: 'OK' });
    return { marketReadout: lines, citations: result.citations.slice(0, 6), degraded: false };
  } catch {
    deps.audit({ action: 'LAUNCH_READOUT', tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, model: activeModel(), citations: 0, blockedNumericClaims: 0, outcome: 'ERROR' });
    return { marketReadout: [], citations: [], degraded: true };
  }
}
