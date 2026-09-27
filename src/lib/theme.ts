/**
 * Theme preference: light (default for a first visit), dark, or high-contrast. Stored per browser and
 * applied to <html data-theme>. public/boot.js applies the stored value before first paint so
 * there is no flash of the wrong theme.
 */
export type MajalTheme = 'dark' | 'light' | 'contrast';
export const THEMES: { id: MajalTheme; label: string }[] = [
  { id: 'dark', label: 'داكن' },
  { id: 'light', label: 'فاتح' },
  { id: 'contrast', label: 'تباين عالٍ' }
];
const KEY = 'majal-theme';
export const DEFAULT_THEME: MajalTheme = 'light';
const THEME_COLOR: Record<MajalTheme, string> = { light: '#f7f4ec', dark: '#0b1220', contrast: '#000000' };

export function isTheme(value: unknown): value is MajalTheme {
  return value === 'dark' || value === 'light' || value === 'contrast';
}

export function readTheme(): MajalTheme {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
}

export function applyTheme(theme: MajalTheme) {
  const root = document.documentElement;
  if (theme === 'dark') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', theme === 'light' ? 'light' : 'dark');
  try { window.localStorage.setItem(KEY, theme); } catch { /* private mode: session-only */ }
}

export function nextTheme(current: MajalTheme): MajalTheme {
  const order: MajalTheme[] = ['dark', 'light', 'contrast'];
  return order[(order.indexOf(current) + 1) % order.length];
}
