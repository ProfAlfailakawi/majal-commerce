import { useEffect, useRef } from 'react';

export const REFRESH_MS = 60_000;

/** Pure rule so it can be tested: refresh only while the tab is visible and a full interval has passed. */
export const refreshDue = (lastMs: number, nowMs: number, hidden: boolean, intervalMs = REFRESH_MS) =>
  !hidden && nowMs - lastMs >= intervalMs;

/**
 * Calls `load` every minute while the page is visible, and once more as soon as a tab that was
 * hidden for longer than a minute comes back, so numbers on screen are never older than about
 * a minute and a forgotten background tab does not keep hitting the server.
 */
export function useAutoRefresh(load: () => void, intervalMs = REFRESH_MS, enabled = true) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const run = () => { last = Date.now(); latest.current(); };
    const timer = window.setInterval(() => { if (refreshDue(last, Date.now(), document.hidden, intervalMs - 1_000)) run(); }, Math.min(intervalMs, 15_000));
    const onVisible = () => { if (refreshDue(last, Date.now(), document.hidden, intervalMs)) run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [intervalMs, enabled]);
}

/** «14:05:09» in Kuwait time with Latin digits, for «last updated» labels. */
export const clockLabel = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(at);
