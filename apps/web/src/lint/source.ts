import { expect } from "bun:test";
import path from "node:path";

/** Shared scanning helpers for the lint suites, which run as part of `bun run test`. */

export const SRC = path.join(import.meta.dir, "..");
export const ALLOW = "perf-allow:";

export type SourceFile = { file: string; text: string };

/** Files under `src/<dir>` matching `pattern`, skipping tests and Experimental's WIP ideas. */
export async function sources(dirs: string[], pattern: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for (const dir of dirs) {
    for await (const relative of new Bun.Glob(pattern).scan({ cwd: path.join(SRC, dir) })) {
      if (relative.includes(".test.") || relative.startsWith("ideas/")) continue;
      const file = path.join(dir, relative);
      files.push({ file, text: await Bun.file(path.join(SRC, file)).text() });
    }
  }
  return files;
}

export async function readSource(file: string): Promise<string> {
  return Bun.file(path.join(SRC, file)).text();
}

export function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** True when `marker` sits on the line at `index` or one of the two above it. */
export function allowedNear(text: string, index: number, marker = ALLOW): boolean {
  const lines = text.split("\n");
  const line = lineOf(text, index) - 1;
  return lines.slice(Math.max(0, line - 2), line + 1).some(l => l.includes(marker));
}

export function stripCssComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

export type CssRule = { selector: string; body: string; line: number; allowed: boolean };

/** Innermost `selector { body }` blocks, which covers rules inside @media and keyframe steps. */
export function cssRules(text: string): CssRule[] {
  return [...text.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(match => ({
    selector: stripCssComments(match[1]!).trim(),
    body: match[2]!,
    line: lineOf(text, match.index! + match[1]!.length),
    allowed: match[0].includes(ALLOW),
  }));
}

export function declarations(body: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "g");
  return [...stripCssComments(body).matchAll(pattern)].map(m => m[1]!.trim());
}

/** Splits a comma list without breaking `cubic-bezier(0.2, 1, …)` apart. */
export function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") depth--;
    else if (value[i] === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

export function transitionedProperties(rule: CssRule): string[] {
  return [
    ...declarations(rule.body, "transition").flatMap(value =>
      splitTopLevel(value).map(part => part.split(/\s+/)[0]!),
    ),
    ...declarations(rule.body, "transition-property").flatMap(splitTopLevel),
  ];
}

/** The rule whose selector is exactly `selector`, for component contract tests. */
export function ruleFor(text: string, selector: string): CssRule {
  const rule = cssRules(text).find(candidate => candidate.selector === selector);
  if (!rule) throw new Error(`No CSS rule for "${selector}"`);
  return rule;
}

export function report(violations: string[]) {
  expect(violations, violations.join("\n")).toEqual([]);
}
