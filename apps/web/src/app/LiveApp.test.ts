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
  test("the deployable Live app never imports the studio", async () => {
    const violations: string[] = [];
    for (const dir of LIVE_APP_DIRS) {
      for await (const relative of new Glob("**/*.{ts,tsx}").scan({ cwd: path.join(src, dir) })) {
        if (relative.endsWith(".test.ts")) continue;
        const file = path.join(src, dir, relative);
        for (const [, specifier] of (await Bun.file(file).text()).matchAll(IMPORT_RE)) {
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

describe("Live bundle", () => {
  test("leaves the router to the studio; Live reads and replaces the URL itself", async () => {
    const violations: string[] = [];
    for (const dir of LIVE_APP_DIRS) {
      for await (const relative of new Glob("**/*.{ts,tsx}").scan({ cwd: path.join(src, dir) })) {
        if (relative.includes(".test.")) continue;
        if (/["']react-router["']/.test(await Bun.file(path.join(src, dir, relative)).text())) {
          violations.push(path.join(dir, relative));
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
