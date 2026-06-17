import { useCallback, useEffect, useState } from "react";

// Dark-first theme. The document starts dark (:root); adding the `.light` class
// to <html> switches to the light palette. Preference is persisted and applied
// pre-paint by an inline script in index.html (no flash of the wrong theme).

export type Theme = "dark" | "light";
const KEY = "jp_theme";

export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "dark";
  return localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("light", theme === "light");
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

/** Reactive theme state + toggle for UI controls. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      setTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle, setTheme: (t: Theme) => { setTheme(t); setThemeState(t); } };
}
