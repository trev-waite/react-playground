import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/** Marks the page for public/theme.js, which runs before the bundle and cannot read the flag itself. */
export function markThemeToggle(html: string, enabled: boolean): string {
  return enabled ? html.replace(/<html\b/, "<html data-theme-toggle") : html;
}

/**
 * With `VITE_THEME_TOGGLE=on`, the pre-paint script honors the visitor's stored
 * theme, as the app does. The 404 page is copied from public/ untouched, so it
 * is marked once the build is written.
 */
export function themeTogglePlugin(env: Record<string, string | undefined>): Plugin {
  const enabled = env.VITE_THEME_TOGGLE === "on";
  let outDir: string | null = null;
  return {
    name: "theme-toggle",
    configResolved(config) {
      if (config.command === "build") outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "pre",
      handler: html => markThemeToggle(html, enabled),
    },
    async closeBundle() {
      if (!enabled || !outDir) return;
      const notFound = path.join(outDir, "404.html");
      const html = await readFile(notFound, "utf8").catch(() => null);
      if (html !== null) await writeFile(notFound, markThemeToggle(html, enabled));
    },
  };
}
