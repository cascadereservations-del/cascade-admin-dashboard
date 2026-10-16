import { DEMO } from '@/lib/demo';
import { isEmbed } from '@/lib/fold';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'cascade-admin-theme';

type Ctx = { theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void };
const ThemeContext = createContext<Ctx | null>(null);

/** The staff shell's theme (data-theme on its root, same origin), or null when it has none or is not reachable. */
function shellTheme(): { el: HTMLElement; theme: 'light' | 'dark' | null } | null {
  try {
    const el = window.parent?.document.documentElement;
    if (!el) return null;
    const t = el.getAttribute('data-theme');
    return { el, theme: t === 'light' || t === 'dark' ? t : null };
  } catch { return null; /* cross-origin parent */ }
}

function read(): Theme {
  if (DEMO) return 'system'; // D_ demo reads and writes no storage
  // D_ embedded in the staff shell: follow the shell's own theme, else the phone's. The shell owns the toggle.
  if (isEmbed()) return shellTheme()?.theme ?? 'system';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'light'; // PRD: light by default
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);

  // D_ embedded: follow a LATER change of the shell's theme too, and stop when this unmounts.
  useEffect(() => {
    if (DEMO || !isEmbed()) return;
    const shell = shellTheme();
    if (!shell) return;
    const mo = new MutationObserver(() => setThemeState(shellTheme()?.theme ?? 'system'));
    mo.observe(shell.el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
    // Both metas get the same value so the browser bar follows the in-app toggle, not just the OS setting.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', resolved === 'dark' ? '#0E1621' : '#F6F3EE'));
  }, [resolved]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (DEMO) return;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: 'light', resolved: 'light', setTheme: () => undefined };
  return ctx;
}
