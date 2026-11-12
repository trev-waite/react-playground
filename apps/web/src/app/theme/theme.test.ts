import { describe, expect, test } from "bun:test";
import path from "node:path";
import { markThemeToggle } from "../../../vite/themeTogglePlugin";
import type { SiteTheme } from "../../lib/types";
import { parseTheme, siteTheme, storedThemeAfterToggle, THEME_STORAGE_KEY } from "./theme";

const web = path.join(import.meta.dir, "../../..");
const PAGES = ["index.html", "public/404.html"];

describe("site theme", () => {
  test("a toggle that lands on the system's theme forgets the choice, so the site follows the system again", () => {
    expect(storedThemeAfterToggle("light", "light")).toBe("dark");
    expect(storedThemeAfterToggle("dark", "light")).toBeNull();
    expect(storedThemeAfterToggle("dark", "dark")).toBe("light");
    expect(storedThemeAfterToggle("light", "dark")).toBeNull();
  });

  test("follows the system unless the button is live and the visitor picked a theme", () => {
    expect(siteTheme("dark", "light", false)).toBe("light");
    expect(siteTheme(null, "dark", false)).toBe("dark");
    expect(siteTheme("dark", "light", true)).toBe("dark");
    expect(siteTheme(null, "light", true)).toBe("light");
  });

  test("only a known theme is read back from storage", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });

  test("the pre-paint script and the page are wired to the same choice", async () => {
    for (const page of PAGES) {
      const html = await Bun.file(path.join(web, page)).text();
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head).toMatch(/<script src="\/theme\.js"><\/script>/);
    }
  });
});

/** Runs public/theme.js as the browser would, before first paint, on a built page. */
async function prePaint(html: string, page: { stored: string | null; system: SiteTheme }): Promise<SiteTheme> {
  const script = await Bun.file(path.join(web, "public/theme.js")).text();
  const marked = /<html\b[^>]*\sdata-theme-toggle[\s>=]/.test(html);
  const dataset: Record<string, string> = marked ? { themeToggle: "" } : {};
  const document = { documentElement: { dataset }, querySelector: () => null };
  const localStorage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? page.stored : null) };
  const matchMedia = () => ({ matches: page.system === "dark" });
  new Function("document", "localStorage", "matchMedia", script)(document, localStorage, matchMedia);
  return dataset.theme as SiteTheme;
}

describe("pre-paint theme", () => {
  test("every page paints the theme the app settles on, so nothing flashes", async () => {
    const visits = [
      { stored: "dark", system: "light" },
      { stored: "light", system: "dark" },
      { stored: "system", system: "dark" },
      { stored: null, system: "light" },
    ] as const;
    for (const file of PAGES) {
      const source = await Bun.file(path.join(web, file)).text();
      for (const toggle of [false, true]) {
        const built = markThemeToggle(source, toggle);
        for (const visit of visits) {
          expect({ file, toggle, ...visit, theme: await prePaint(built, visit) }).toEqual({
            file,
            toggle,
            ...visit,
            theme: siteTheme(parseTheme(visit.stored), visit.system, toggle),
          });
        }
      }
    }
  });

  test("the build marks the page for the script only while the button is live", () => {
    const html = '<!doctype html>\n<html lang="en">';
    expect(markThemeToggle(html, true)).toContain('<html data-theme-toggle lang="en">');
    expect(markThemeToggle(html, false)).toBe(html);
  });
});
