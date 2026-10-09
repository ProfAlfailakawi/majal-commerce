/**
 * Arabic number agreement: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular (tamyiz).
 * Returns the counted phrase, e.g. arCount(5, {one:'فرصة', two:'فرصتان', few:'فرص', many:'فرصة'}) → «5 فرص».
 */
export interface ArForms { one: string; two: string; few: string; many: string }
export function arCount(n: number, f: ArForms): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  return `${n} ${n >= 3 && n <= 10 ? f.few : f.many}`;
}
export const AR = {
  opportunity: { one: 'فرصة واحدة', two: 'فرصتان', few: 'فرص', many: 'فرصة' },
  review: { one: 'تقييم واحد', two: 'تقييمان', few: 'تقييمات', many: 'تقييمًا' },
  launch: { one: 'إطلاق واحد', two: 'إطلاقان', few: 'إطلاقات', many: 'إطلاقًا' },
  minute: { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' }
} satisfies Record<string, ArForms>;
