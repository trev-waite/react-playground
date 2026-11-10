import { describe, test } from "bun:test";
import path from "node:path";
import { allowedNear, cssRules, declarations, lineOf, report, sources, stripCssComments } from "./source";

/**
 * Standards lint for the rules in AGENTS.md and docs/standards that no
 * off-the-shelf linter knows. Each failure names the file and line and says
 * how to fix it. Live is where new components land, so most rules aim there.
 */

const OWNED_DIRS = ["app", "studio", "experimental", "live", "lib", "gpu", "lint"];
const STYLED_DIRS = ["app", "studio", "experimental", "live"];

const LIVE_IMPORTS = [
  /^\.\.?\//,
  /^react(-dom)?(\/|$)/,
  /^@react-playground\//,
  /^@\/live\//,
  /^@\/gpu$/,
  /^vgpu$/,
];

describe("standards lint: Live components", () => {
  test("Live components stay portable and never reach into the app, studio, or Experimental", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "**/*.{ts,tsx}")) {
      const previewLike = /(^|\/)(preview\.tsx|family\.ts)$/.test(file);
      for (const match of text.matchAll(/^\s*import\s+(type\s+)?[^"']*?["']([^"']+)["']/gm)) {
        const [, typeOnly, specifier] = match;
        if (LIVE_IMPORTS.some(allowed => allowed.test(specifier!))) {
          if (specifier!.startsWith(".")) {
            const target = path.normalize(path.join(path.dirname(file), specifier!));
            if (target.startsWith("live/")) continue;
          } else {
            continue;
          }
        }
        if (specifier === "@/lib/types" && typeOnly && previewLike) continue;
        violations.push(
          `${file}:${lineOf(text, match.index!)} imports "${specifier}". Live components ship on their own: ` +
            "use React, @react-playground packages, @/gpu, or other Live code. Previews may `import type` from @/lib/types.",
        );
      }
    }
    report(violations);
  });

  test("Live components that move honor prefers-reduced-motion", async () => {
    const files = await sources(["live"], "**/*.{ts,tsx,css}");
    const folders = new Map<string, typeof files>();
    for (const source of files) {
      const folder = path.dirname(source.file);
      folders.set(folder, [...(folders.get(folder) ?? []), source]);
    }
    const violations: string[] = [];
    for (const [folder, folderFiles] of folders) {
      const moving = folderFiles.find(({ text }) =>
        /\btransition\s*:|\banimation\s*:|requestAnimationFrame\(|\.animate\(/.test(stripCssComments(text)),
      );
      if (!moving) continue;
      if (folderFiles.some(({ text }) => /prefers-reduced-motion|useReducedMotion/.test(text))) continue;
      violations.push(
        `${folder} animates (${moving.file}) but never checks prefers-reduced-motion. ` +
          "Turn transitions off in a `@media (prefers-reduced-motion: reduce)` block, or skip the effect in code.",
      );
    }
    report(violations);
  });

  test("Live hover styles only apply on devices that can hover, so taps never stick", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "**/*.css")) {
      for (const { selector, line } of ungatedHoverRules(text)) {
        violations.push(
          `${file}:${line} styles "${selector}" outside \`@media (hover: hover)\`; on touch screens the hover state sticks after a tap.`,
        );
      }
    }
    report(violations);
  });
});

describe("standards lint: CSS", () => {
  test("animated filters settle on `filter: none`, never `blur(0)`", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(STYLED_DIRS, "**/*.css")) {
      for (const rule of cssRules(text)) {
        if (/\bblur\(\s*0(px)?\s*\)/.test(stripCssComments(rule.body))) {
          violations.push(
            `${file}:${rule.line} ends a filter on blur(0). Safari keeps that layer blurred after the animation, ` +
              "so text stays soft; use `filter: none`, which animates the same.",
          );
        }
      }
    }
    report(violations);
  });

  test("animations that end unblurred hold no fill, so no filter outlives them", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(STYLED_DIRS, "**/*.css")) {
      const clean = stripCssComments(text);
      const endsUnblurred = new Set<string>();
      for (const match of clean.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
        const last = cssRules(match[2]!).filter(step => /^(to|100%)$/.test(step.selector)).at(-1);
        if (last && /\bfilter\s*:\s*(none|blur\(\s*0(px)?\s*\))/.test(last.body)) endsUnblurred.add(match[1]!);
      }
      for (const rule of cssRules(text)) {
        for (const animation of declarations(rule.body, "animation(?:-name)?")) {
          const name = animation.split(/[\s,]+/).find(word => endsUnblurred.has(word));
          const fill = declarations(rule.body, "animation-fill-mode")[0] ?? animation;
          if (name && /\b(both|forwards)\b/.test(fill)) {
            violations.push(
              `${file}:${rule.line} holds the end of "${name}", whose filter ends unblurred. Safari can keep that ` +
                "layer blurred; use `backwards` fill, or drop the filter from the last keyframe.",
            );
          }
        }
      }
    }
    report(violations);
  });
});

describe("standards lint: code", () => {
  test("no commented-out code; delete it, git keeps the history", async () => {
    const violations: string[] = [];
    const code = /^\s*\/\/\s*(import\s|export\s|const\s|let\s|var\s|return\b|await\s|if\s*\(|for\s*\(|[\w$.]+\s*=\s|[\w$.]+\(.*\);\s*$)/;
    for (const { file, text } of await sources(OWNED_DIRS, "**/*.{ts,tsx}")) {
      text.split("\n").forEach((line, index) => {
        if (code.test(line)) violations.push(`${file}:${index + 1} is commented-out code: ${line.trim()}`);
      });
    }
    report(violations);
  });

  test("no debugging leftovers in shipped code", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(OWNED_DIRS, "**/*.{ts,tsx}")) {
      for (const match of text.matchAll(/\bconsole\.(log|debug)\(|\bdebugger\b/g)) {
        if (allowedNear(text, match.index!, "lint-allow:")) continue;
        violations.push(`${file}:${lineOf(text, match.index!)} leaves \`${match[0]}\` in; remove it before finishing.`);
      }
    }
    report(violations);
  });
});

/** Rules whose selector uses :hover without an enclosing `@media (hover: hover)`. */
function ungatedHoverRules(text: string): { selector: string; line: number }[] {
  const clean = stripCssComments(text);
  const found: { selector: string; line: number }[] = [];
  const gated: boolean[] = [];
  let prelude = "";
  let preludeStart = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (ch === "{") {
      const head = prelude.trim();
      const opensGate = /^@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(head);
      const inside = gated.at(-1) ?? false;
      if (!inside && !head.startsWith("@") && /:hover\b/.test(head)) {
        found.push({ selector: head.replace(/\s+/g, " "), line: lineOf(clean, preludeStart) });
      }
      gated.push(inside || opensGate);
      prelude = "";
    } else if (ch === "}" || ch === ";") {
      if (ch === "}") gated.pop();
      prelude = "";
    } else {
      if (!prelude.trim()) preludeStart = i;
      prelude += ch;
    }
  }
  return found;
}
