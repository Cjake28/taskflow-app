import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { THEME_STORAGE_KEY, ThemeContext, type ResolvedTheme, type Theme } from './theme-context';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
  }
  return 'system';
}

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const getSystemDark = () => window.matchMedia(DARK_QUERY).matches;

/** Light / dark / system with a class on <html> (the inline script in index.html avoids a flash). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, getSystemDark, () => false);
  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setThemeState(readStoredTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this tab.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
