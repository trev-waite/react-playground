import type { Plugin } from "vite";

/** Marks the page for public/theme.js, which runs before the bundle and cannot read the flag itself. */
export function markThemeToggle(html: string, enabled: boolean): string {
  return enabled ? html.replace(/<html\b/, "<html data-theme-toggle") : html;
}

/** With `VITE_THEME_TOGGLE=on`, the pre-paint script honors the visitor's stored theme, as the app does. */
export function themeTogglePlugin(env: Record<string, string | undefined>): Plugin {
  const enabled = env.VITE_THEME_TOGGLE === "on";
  return {
    name: "theme-toggle",
    transformIndexHtml: {
      order: "pre",
      handler: html => markThemeToggle(html, enabled),
    },
  };
}
