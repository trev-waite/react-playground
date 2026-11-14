import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";

const src = path.join(import.meta.dir, "..");
const LIVE_APP_DIRS = ["app", "live", "gpu", "lib"];
const STUDIO_DIRS = ["studio", "experimental"].map(dir => path.join(src, dir));
const IMPORT_RE = /(?:from|import|glob(?:<[^>]*>)?)\s*\(?\s*["']([^"']+)["']/g;

function resolveImport(file: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return path.join(src, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
  return null;
}

describe("Live app boundary", () => {
  test("the deployable Live app never imports the studio, and leaves the router to it", async () => {
    const violations: string[] = [];
    for (const dir of LIVE_APP_DIRS) {
      for await (const relative of new Glob("**/*.{ts,tsx}").scan({ cwd: path.join(src, dir) })) {
        if (relative.includes(".test.")) continue;
        const file = path.join(src, dir, relative);
        const text = await Bun.file(file).text();
        if (/["']react-router["']/.test(text)) violations.push(`${path.relative(src, file)} → react-router`);
        for (const [, specifier] of text.matchAll(IMPORT_RE)) {
          const target = resolveImport(file, specifier!);
          if (target && STUDIO_DIRS.some(studio => target === studio || target.startsWith(studio + path.sep))) {
            violations.push(`${path.relative(src, file)} → ${specifier}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("Top bar", () => {
  test("the deployed app and the studio both lead the bar with one back pill, home to trevorwaite.com first, in the same tab", async () => {
    const read = (file: string) => Bun.file(path.join(src, file)).text();
    const chrome = await read("app/deck/DeckChrome.tsx");
    expect(chrome).toMatch(/<HomeLink \/>\s*\{children\}\s*<\/div>/);
    expect(chrome).toContain('"https://trevorwaite.com"');
    expect(await read("app/LivePage.tsx")).toMatch(/<ChromeBar>\s*<BackPill>\{viewButton\}<\/BackPill>/);
    expect(await read("studio/StudioApp.tsx")).toMatch(/<ChromeBar>\s*<BackPill>\s*<DeckSlot/);
    const homeLink = chrome.match(/<a\s[^>]*href=\{HOME_URL\}[^>]*>/)?.[0];
    expect(homeLink).toBeDefined();
    expect(homeLink).not.toMatch(/target=/);
  });
});
