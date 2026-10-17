/**
 * Ready-made campaign windows for Kuwait. Hijri dates come from the Umm al-Qura calendar,
 * which can differ by a day from the local moon sighting, so the admin always sees (and can
 * edit) the dates before approving. No prices: the windows only fill the date fields.
 */
export interface AdSeason { key: string; label: string; startsOn: string; endsOn: string; active: boolean }

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const hijriParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { month: get('month'), day: get('day') };
};

/** First day of every Hijri month `month` whose day 1 falls in [from, from + spanDays]. */
function hijriMonthStarts(month: number, from: Date, spanDays: number) {
  const out: Date[] = [];
  for (let i = 0; i <= spanDays; i++) {
    const d = new Date(from.getTime() + i * DAY);
    const h = hijriParts(d);
    if (h.month === month && h.day === 1) out.push(d);
  }
  return out;
}

/** Seasons ending today or later, soonest first. `today` is a Kuwait calendar day (YYYY-MM-DD). */
export function upcomingSeasons(today: string): AdSeason[] {
  const t = new Date(`${today}T00:00:00Z`);
  const y = t.getUTCFullYear();
  const windows: { key: string; label: string; start: Date; end: Date }[] = [];
  for (const start of hijriMonthStarts(9, new Date(t.getTime() - 35 * DAY), 420)) windows.push({ key: `ramadan-${iso(start)}`, label: 'رمضان', start, end: new Date(start.getTime() + 29 * DAY) });
  for (const start of hijriMonthStarts(10, new Date(t.getTime() - 5 * DAY), 420)) windows.push({ key: `eid-${iso(start)}`, label: 'عيد الفطر', start, end: new Date(start.getTime() + 3 * DAY) });
  for (const yr of [y, y + 1]) {
    windows.push({ key: `national-${yr}`, label: 'الأعياد الوطنية', start: utc(yr, 2, 20), end: utc(yr, 2, 28) });
    windows.push({ key: `summer-${yr}`, label: 'الصيف', start: utc(yr, 6, 15), end: utc(yr, 8, 31) });
    windows.push({ key: `school-${yr}`, label: 'العودة للمدارس', start: utc(yr, 9, 1), end: utc(yr, 9, 30) });
  }
  return windows
    .filter(w => w.end.getTime() >= t.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 6)
    .map(w => {
      const active = w.start.getTime() <= t.getTime();
      return { key: w.key, label: w.label, startsOn: active ? today : iso(w.start), endsOn: iso(w.end), active };
    });
}
