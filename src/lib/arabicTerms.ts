/**
 * Display-only Arabic wording for English technical terms that appear inside stored or
 * generated free text (for example the audit-log detail written by the state layer).
 * The stored value is never changed: callers pass the raw text through `arabicTerms()`
 * at render time, and anything not listed here is returned untouched.
 */
const TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/العودة LIVE/g, 'العودة إلى الإطلاق الحي'],
  [/Launch Gate/g, 'بوابة الإطلاق'],
  [/\bLIVE\b/g, 'الإطلاق الحي'],
  [/\broyalties\b/g, 'حقوق المبدع'],
  [/\bTracking\b/g, 'تتبع'],
  [/\bAudit\b/g, 'سجل التدقيق'],
  [/\bPAID\b/g, 'مدفوع'],
  [/\bKWD\b/g, 'د.ك']
];

export const arabicTerms = (text: string): string => TERMS.reduce((out, [pattern, label]) => out.replace(pattern, label), text);
