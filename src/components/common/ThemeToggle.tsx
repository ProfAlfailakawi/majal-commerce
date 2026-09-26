import React, { useEffect, useState } from 'react';
import { Contrast, Moon, Sun } from 'lucide-react';
import { applyTheme, MajalTheme, nextTheme, readTheme, THEMES } from '../../lib/theme';

const ICONS: Record<MajalTheme, React.ReactNode> = {
  dark: <Moon className="w-4 h-4" aria-hidden="true" />,
  light: <Sun className="w-4 h-4" aria-hidden="true" />,
  contrast: <Contrast className="w-4 h-4" aria-hidden="true" />
};

/** Cycles dark → light → high contrast; the choice persists per browser. */
export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<MajalTheme>(() => (typeof window === 'undefined' ? 'dark' : readTheme()));
  useEffect(() => { applyTheme(theme); }, [theme]);
  const current = THEMES.find(t => t.id === theme)!;
  const upcoming = THEMES.find(t => t.id === nextTheme(theme))!;
  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme(theme))}
      className="p-2.5 rounded-xl text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
      aria-label={`المظهر الحالي: ${current.label}. التبديل إلى ${upcoming.label}`}
      title={`المظهر: ${current.label}`}
    >
      {ICONS[theme]}
    </button>
  );
};
