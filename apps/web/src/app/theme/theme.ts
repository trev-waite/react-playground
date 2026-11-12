import { useSyncExternalStore } from "react";
import type { SiteTheme } from "../../lib/types";

/** Also read by public/theme.js, which applies the theme before first paint. */
export const THEME_STORAGE_KEY = "theme";

/** The light/dark button is built but not live yet: until then the site follows the system. */
export const THEME_TOGGLE = import.meta.env.VITE_THEME_TOGGLE === "on";

const SYSTEM_DARK = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

export function parseTheme(value: unknown): SiteTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The visitor's stored choice counts only while they have the button to change it. */
export function siteTheme(stored: SiteTheme | null, system: SiteTheme, toggle: boolean): SiteTheme {
  return (toggle && stored) || system;
}

/**
 * The choice to remember after flipping `current`: none when the new theme is
 * already the system's, so the site goes back to following the system.
 */
export function storedThemeAfterToggle(current: SiteTheme, system: SiteTheme): SiteTheme | null {
  const next = current === "dark" ? "light" : "dark";
  return next === system ? null : next;
}

function systemTheme(): SiteTheme {
  return window.matchMedia(SYSTEM_DARK).matches ? "dark" : "light";
}

function storedTheme(): SiteTheme | null {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeTheme(theme: SiteTheme | null) {
  try {
    if (theme) localStorage.setItem(THEME_STORAGE_KEY, theme);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be off (private mode); the choice still holds for this page.
  }
}

function currentTheme(): SiteTheme {
  return parseTheme(document.documentElement.dataset.theme) ?? "light";
}

function applyTheme(theme: SiteTheme = siteTheme(storedTheme(), systemTheme(), THEME_TOGGLE)) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const canvas = getComputedStyle(root).getPropertyValue("--shell-bg").trim();
  if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas);
  for (const listener of listeners) listener();
}

/** Keeps the site theme on the system's until the visitor picks one, here or in another tab. */
export function installTheme() {
  applyTheme();
  window.matchMedia(SYSTEM_DARK).addEventListener("change", () => applyTheme());
  if (!THEME_TOGGLE) return;
  window.addEventListener("storage", event => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme();
  });
}

export function toggleTheme() {
  const current = currentTheme();
  storeTheme(storedThemeAfterToggle(current, systemTheme()));
  applyTheme(current === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): SiteTheme {
  return useSyncExternalStore(subscribe, currentTheme);
}
