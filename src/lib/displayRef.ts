/**
 * Short, stable, human-friendly reference for an internal id (e.g. «D-7K2M»).
 * Display only: the full id stays available in a tooltip and in exports.
 */
export function shortRef(id: string, prefix = ''): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const code = (h >>> 0).toString(36).toUpperCase().padStart(4, '0').slice(-4);
  return prefix ? `${prefix}-${code}` : code;
}
