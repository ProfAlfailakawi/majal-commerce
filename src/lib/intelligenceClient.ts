/**
 * Client bridge to the MAJAL Intelligence Layer.
 *
 * Every call is optional enrichment on top of the deterministic intelligence in
 * intelligence.ts. When the AI assistant is disabled, the endpoint is off, or the
 * network fails, these helpers resolve to a null/empty result and the UI keeps
 * rendering the deterministic output. The AI never becomes a hard dependency.
 *
 * Only permission-filtered, deterministic context is ever sent to the server —
 * never raw recipe secrets or hidden financials.
 */
import { authCsrfToken } from './authClient';
import { AI_ASSISTANT_ENABLED } from './runtime';

async function post<T>(url: string, body: unknown): Promise<T | null> {
  if (!AI_ASSISTANT_ENABLED) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': authCsrfToken() },
      body: JSON.stringify(body)
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface SemanticMatchEnrichment { reasons: string[]; risks: string[]; degraded: boolean; }
export interface GroundedMarketSignal { title: string; summary: string; query: string; citations: { title: string; uri: string }[]; }
export interface RadarEnrichment { groundedSignals: GroundedMarketSignal[]; degraded: boolean; note?: string; }
export interface DealRoomEnrichment { narrative: string; watchouts: string[]; openQuestions: string[]; degraded: boolean; }
export interface LaunchEnrichment { marketReadout: string[]; citations: { title: string; uri: string }[]; degraded: boolean; }

export const intelligenceClient = {
  semanticMatch: (body: { productName: string; category: string; hostName: string; deterministicReasons: string[]; evidenceText: string }) =>
    post<SemanticMatchEnrichment>('/api/ai/semantic-match', body),
  opportunityRadar: (query: string) =>
    post<RadarEnrichment>('/api/ai/opportunity-radar', { query }),
  dealRoom: (body: { stage: string; contractStatus: string; optionSummaries: string[]; gatePassed: boolean }) =>
    post<DealRoomEnrichment>('/api/ai/deal-room', body),
  launchReadout: (query: string) =>
    post<LaunchEnrichment>('/api/ai/launch-readout', { query })
};
