/**
 * Theme preference: dark (identity default), light, or high-contrast. Stored per browser and
 * applied to <html data-theme>. public/boot.js applies the stored value before first paint so
 * there is no flash of the dark theme.
 */
export type MajalTheme = 'dark' | 'light' | 'contrast';
export const THEMES: { id: MajalTheme; label: string }[] = [
  { id: 'dark', label: 'داكن' },
  { id: 'light', label: 'فاتح' },
  { id: 'contrast', label: 'تباين عالٍ' }
];
const KEY = 'majal-theme';

export function isTheme(value: unknown): value is MajalTheme {
  return value === 'dark' || value === 'light' || value === 'contrast';
}

export function readTheme(): MajalTheme {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isTheme(stored) ? stored : 'dark';
  } catch { return 'dark'; }
}

export function applyTheme(theme: MajalTheme) {
  const root = document.documentElement;
  if (theme === 'dark') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f7f4ec' : theme === 'contrast' ? '#000000' : '#0b1220');
  try { window.localStorage.setItem(KEY, theme); } catch { /* private mode: session-only */ }
}

export function nextTheme(current: MajalTheme): MajalTheme {
  const order: MajalTheme[] = ['dark', 'light', 'contrast'];
  return order[(order.indexOf(current) + 1) % order.length];
}
