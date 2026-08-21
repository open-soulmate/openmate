import i18n from "./i18n";

export type ThemeId = "dark" | "light" | "purple";

const STORAGE_KEY = "openmate-theme";

export const themes: { id: ThemeId; labelKey: string; color: string }[] = [
  { id: "dark", labelKey: "theme.dark", color: "#6366f1" },
  { id: "light", labelKey: "theme.light", color: "#818cf8" },
  { id: "purple", labelKey: "theme.purple", color: "#a855f7" },
];

/** Get themes with translated labels. */
export function getThemes() {
  return themes.map((t) => ({ ...t, label: i18n.t(t.labelKey) }));
}

export function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "purple") return stored;
  return "dark";
}

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark", "theme-purple");
  root.setAttribute("data-theme", theme);

  if (theme === "light") {
    root.classList.add("light");
  } else if (theme === "purple") {
    root.classList.add("dark", "theme-purple");
  } else {
    root.classList.add("dark");
  }
}

export function persistTheme(theme: ThemeId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
