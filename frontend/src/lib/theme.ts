/**
 * theme.ts — theme preference + scroll-parallax drivers.
 *
 * - useTheme: persists "dark" | "light" to localStorage, reflects it onto
 *   <html data-theme="...">, and falls back to the OS preference on first run.
 * - useParallax: writes page scroll progress (0..1) to the --parallax-y custom
 *   property on <html>, which the aurora backdrop consumes to drift the
 *   nebulae and lattice at a different rate than the content (pure CSS var
 *   write — no React re-render per frame, rAF-throttled).
 */

import { useCallback, useEffect, useState } from "react";

export type ThemeName = "dark" | "light";

const STORAGE_KEY = "apix-theme";

function readInitialTheme(override?: ThemeName): ThemeName {
  // A permalink override (URL ?t=) beats the stored preference.
  if (override === "dark" || override === "light") return override;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable (private mode) — fall through to OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme(initialOverride?: ThemeName): {
  theme: ThemeName;
  toggleTheme: () => void;
  setTheme: (theme: ThemeName) => void;
} {
  const [theme, setThemeState] = useState<ThemeName>(() => readInitialTheme(initialOverride));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Non-fatal: theme still applies for this session.
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  return { theme, toggleTheme, setTheme };
}

/** Write scroll progress into the --parallax-y custom property (rAF-throttled). */
export function useParallax(): void {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      doc.style.setProperty("--parallax-y", progress.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
