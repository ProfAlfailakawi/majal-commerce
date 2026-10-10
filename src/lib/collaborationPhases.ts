import type { Collaboration } from '../types/majal';

type Stage = Collaboration['stage'];

/** Happy-path order of the collaboration stages (DISPUTED is a branch, not a position). */
export const STAGE_ORDER: Stage[] = ['INTEREST', 'ACCESS_REQUESTED', 'ACCESS_GRANTED', 'TASTING_PLANNED', 'TASTING_COMPLETED', 'LAB_ACTIVE', 'OFFER_SENT', 'COUNTERED', 'COMMERCIAL_AGREED', 'CONTRACT_DRAFTED', 'SIGNED', 'PRE_LAUNCH', 'LIVE', 'REVIEW', 'RENEWED', 'ENDED'];

/** The sixteen stages grouped into six phases for the compact ribbon. */
export const STAGE_PHASES: { key: string; label: string; stages: Stage[] }[] = [
  { key: 'access', label: 'الوصول', stages: ['INTEREST', 'ACCESS_REQUESTED', 'ACCESS_GRANTED'] },
  { key: 'lab', label: 'التذوق والمختبر', stages: ['TASTING_PLANNED', 'TASTING_COMPLETED', 'LAB_ACTIVE'] },
  { key: 'offer', label: 'العرض', stages: ['OFFER_SENT', 'COUNTERED', 'COMMERCIAL_AGREED'] },
  { key: 'contract', label: 'العقد', stages: ['CONTRACT_DRAFTED', 'SIGNED'] },
  { key: 'launch', label: 'الإطلاق', stages: ['PRE_LAUNCH', 'LIVE'] },
  { key: 'review', label: 'المراجعة', stages: ['REVIEW', 'RENEWED', 'ENDED'] },
];

export type PhaseState = 'done' | 'current' | 'pending';

/**
 * Phase states for a stage, or null when the position is unknown (DISPUTED can happen
 * anywhere, so the ribbon is not drawn rather than guessing a phase). A closed
 * collaboration (renewed / ended) has completed every phase.
 */
export function phaseStates(stage: Stage): PhaseState[] | null {
  const at = STAGE_PHASES.findIndex(p => p.stages.includes(stage));
  if (at < 0) return null;
  const closed = stage === 'RENEWED' || stage === 'ENDED';
  return STAGE_PHASES.map((_, i) => (closed || i < at ? 'done' : i === at ? 'current' : 'pending'));
}

/** Visible name of the phase the collaboration is in; a closed one (renewed / ended) reports its last phase. */
export function currentPhaseLabel(stage: Stage): string | null {
  const at = STAGE_PHASES.findIndex(p => p.stages.includes(stage));
  return at < 0 ? null : STAGE_PHASES[at].label;
}
