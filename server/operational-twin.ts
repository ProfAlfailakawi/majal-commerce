import { randomUUID } from 'node:crypto';
import { MajalDatabase } from './database';

/**
 * Operational Twin
 * ----------------
 * A living model of a kitchen that learns from real launches: it stores predicted-vs-actual
 * throughput and prep time, derives calibration factors, and recalibrates the next forecast
 * so Shadow-Launch predictions converge toward reality launch after launch. Pure math over
 * recorded samples; every forecast carries a confidence derived from sample count and spread.
 */

export interface TwinSample {
  predictedUnits: number;
  actualUnits: number;
  predictedPrepMinutes: number;
  actualPrepMinutes: number;
}

export interface Calibration {
  sampleCount: number;
  unitsBias: number;        // mean(actual/predicted) — >1 means we under-predict demand
  prepBias: number;         // mean(actualPrep/predictedPrep) — >1 means we under-estimate prep time
  unitsConfidence: number;  // 0..1
  prepConfidence: number;   // 0..1
}

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const coefficientOfVariation = (xs: number[]) => {
  if (xs.length < 2) return 1;
  const m = mean(xs);
  if (m === 0) return 1;
  const variance = mean(xs.map(x => (x - m) ** 2));
  return Math.sqrt(variance) / Math.abs(m);
};
const confidence = (ratios: number[]) => {
  if (!ratios.length) return 0;
  const sampleWeight = Math.min(1, ratios.length / 10);          // saturates at 10 samples
  const stability = 1 / (1 + coefficientOfVariation(ratios));    // lower spread → higher confidence
  return Number((sampleWeight * stability).toFixed(3));
};

/** Derives calibration from historical samples. Ratios ignore zero-predicted rows. */
export function computeCalibration(samples: TwinSample[]): Calibration {
  const unitRatios = samples.filter(s => s.predictedUnits > 0).map(s => s.actualUnits / s.predictedUnits);
  const prepRatios = samples.filter(s => s.predictedPrepMinutes > 0).map(s => s.actualPrepMinutes / s.predictedPrepMinutes);
  return {
    sampleCount: samples.length,
    unitsBias: unitRatios.length ? Number(mean(unitRatios).toFixed(4)) : 1,
    prepBias: prepRatios.length ? Number(mean(prepRatios).toFixed(4)) : 1,
    unitsConfidence: confidence(unitRatios),
    prepConfidence: confidence(prepRatios)
  };
}

export interface TwinForecast {
  baselineUnits: number;
  baselinePrepMinutes: number;
  calibratedUnits: number;
  calibratedPrepMinutes: number;
  calibration: Calibration;
}

/** Applies calibration to a fresh baseline prediction, blended by confidence. */
export function forecastWithTwin(baselineUnits: number, baselinePrepMinutes: number, calibration: Calibration): TwinForecast {
  // Blend baseline with the learned bias, weighted by how much we trust the calibration.
  const blend = (baseline: number, bias: number, conf: number) => Math.round(baseline * (1 + (bias - 1) * conf));
  return {
    baselineUnits, baselinePrepMinutes,
    calibratedUnits: blend(baselineUnits, calibration.unitsBias, calibration.unitsConfidence),
    calibratedPrepMinutes: blend(baselinePrepMinutes, calibration.prepBias, calibration.prepConfidence),
    calibration
  };
}

export async function recordTwinSample(db: MajalDatabase, input: TwinSample & { organizationId: string; collaborationId: string | null; createdByUserId: string }) {
  const id = `twn_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.prepare('INSERT INTO operational_twin_samples(id, organization_id, collaboration_id, predicted_units, actual_units, predicted_prep_minutes, actual_prep_minutes, created_by_user_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, input.organizationId, input.collaborationId, input.predictedUnits, input.actualUnits, input.predictedPrepMinutes, input.actualPrepMinutes, input.createdByUserId, createdAt);
  return { id, createdAt };
}

export async function loadCalibration(db: MajalDatabase, organizationId: string, limit = 50): Promise<Calibration> {
  const rows = await db.prepare('SELECT predicted_units, actual_units, predicted_prep_minutes, actual_prep_minutes FROM operational_twin_samples WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all<{ predicted_units: number|string; actual_units: number|string; predicted_prep_minutes: number|string; actual_prep_minutes: number|string }>(organizationId, limit);
  return computeCalibration(rows.map(r => ({
    predictedUnits: Number(r.predicted_units), actualUnits: Number(r.actual_units),
    predictedPrepMinutes: Number(r.predicted_prep_minutes), actualPrepMinutes: Number(r.actual_prep_minutes)
  })));
}
