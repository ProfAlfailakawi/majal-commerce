import type { RequestHandler } from 'express';

/*
 * Everything the site publishes is shown with Latin digits (0-9). Text people type into public
 * forms (a business for sale, a supplier's minimum order, an ad, a job) can contain Arabic-Indic
 * digits, so it is converted once, at the server boundary, before it is stored and published.
 * Not mounted on routes that carry secrets or exact content (passwords, recipes), where changing
 * a character would change meaning.
 */

const ARABIC_INDIC = /[٠-٩۰-۹٪٫٬]/;

export function toLatinDigits(value: string): string {
  if (!ARABIC_INDIC.test(value)) return value;
  return value
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٪/g, '%').replace(/٫/g, '.').replace(/٬/g, ',');
}

/** Converts every string inside a JSON-like value (bounded depth, so a hostile body cannot recurse forever). */
export function deepLatinDigits(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return toLatinDigits(value);
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => deepLatinDigits(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = deepLatinDigits(item, depth + 1);
  return out;
}

export const latinDigitsBody: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = deepLatinDigits(req.body);
  next();
};
