/*
 * العدّ التنازلي لفتح إطلاق مجدول.
 *
 * المرجع الزمني هو ساعة الخادم: الصفحة تأخذ `serverNow` مع وقت الفتح، وتحسب فرق ساعة الجهاز
 * عن ساعة الخادم مرة واحدة، فلا يفتح العدّاد مبكرًا ولا متأخرًا لمن ساعة جهازه خاطئة.
 * الخادم يرفض الطلب قبل الفتح على كل حال؛ هذا للعرض فقط.
 */

export interface CountdownParts { days: number; hours: number; minutes: number; seconds: number; done: boolean }

export function countdownParts(msLeft: number): CountdownParts {
  const total = Math.max(0, Math.floor((Number.isFinite(msLeft) ? msLeft : 0) / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    done: total === 0,
  };
}

/** server - device, so `Date.now() + offset` is the server's present. 0 when the server time is absent or unreadable. */
export function clockOffsetMs(serverNowIso: string | null | undefined, deviceNow = Date.now()): number {
  const server = serverNowIso ? Date.parse(serverNowIso) : NaN;
  return Number.isFinite(server) ? server - deviceNow : 0;
}

/** Spoken form, updated by the caller once a minute rather than every second. */
export function countdownLabelAr(p: CountdownParts): string {
  if (p.done) return 'فُتح الإطلاق الآن';
  const bits: string[] = [];
  if (p.days) bits.push(p.days === 1 ? 'يوم' : p.days === 2 ? 'يومان' : `${p.days} ${p.days <= 10 ? 'أيام' : 'يومًا'}`);
  if (p.hours) bits.push(p.hours === 1 ? 'ساعة' : p.hours === 2 ? 'ساعتان' : `${p.hours} ${p.hours <= 10 ? 'ساعات' : 'ساعة'}`);
  if (!p.days) bits.push(p.minutes === 1 ? 'دقيقة' : p.minutes === 2 ? 'دقيقتان' : `${p.minutes} ${p.minutes >= 3 && p.minutes <= 10 ? 'دقائق' : 'دقيقة'}`);
  return `يفتح بعد ${bits.join(' و')}`;
}
