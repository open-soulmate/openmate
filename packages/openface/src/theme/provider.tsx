'use client';

import { createContext, useState, useEffect, type ReactNode } from 'react';
import type { ThemeName, ThemeTokens } from './types';
import { darkTheme } from './dark';
import { lightTheme } from './light';
import { purpleTheme } from './purple';

const themes: Record<ThemeName, ThemeTokens> = {
  dark: darkTheme,
  light: lightTheme,
  purple: purpleTheme,
};

const STORAGE_KEY = 'openface-theme';

export interface ThemeContextValue {
  theme: ThemeName;
  tokens: ThemeTokens;
  setTheme: (theme: ThemeName) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeName) {
  const tokens = themes[theme];
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  for (const [key, value] of Object.entries(tokens)) {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVar, value);
  }
}

export function ThemeProvider({
  theme: initialTheme,
  children,
}: {
  theme?: ThemeName;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (initialTheme) return initialTheme;
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(STORAGE_KEY) as ThemeName) || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, tokens: themes[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
