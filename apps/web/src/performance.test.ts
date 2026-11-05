import { describe, expect, test } from "bun:test";
import path from "node:path";

/**
 * Performance lint. Each rule guards a fix that took a transition from
 * dropped frames to a steady 60 fps (see docs/BEST_PRACTICES.md#motion).
 * A justified exception carries `perf-allow: <reason>` in a comment on the
 * flagged CSS rule, or on or just above the flagged line of code.
 */

const src = import.meta.dir;
/** UI we own. Experimental ideas are WIP sketches and stay unlinted. */
const CHROME_DIRS = ["app", "studio", "experimental"];
const ALLOW = "perf-allow:";

type SourceFile = { file: string; text: string };

async function sources(dirs: string[], pattern: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for (const dir of dirs) {
    for await (const relative of new Bun.Glob(pattern).scan({ cwd: path.join(src, dir) })) {
      if (relative.includes(".test.") || relative.startsWith("ideas/")) continue;
      const file = path.join(dir, relative);
      files.push({ file, text: await Bun.file(path.join(src, file)).text() });
    }
  }
  return files;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** True when `perf-allow:` sits on the line at `index` or one of the two above it. */
function allowedNear(text: string, index: number): boolean {
  const lines = text.split("\n");
  const line = lineOf(text, index) - 1;
  return lines.slice(Math.max(0, line - 2), line + 1).some(l => l.includes(ALLOW));
}

type CssRule = { selector: string; body: string; line: number; allowed: boolean };

/** Innermost `selector { body }` blocks, which covers rules inside @media and keyframe steps. */
function cssRules(text: string): CssRule[] {
  return [...text.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(match => ({
    selector: match[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    body: match[2]!,
    line: lineOf(text, match.index! + match[1]!.length),
    allowed: match[0].includes(ALLOW),
  }));
}

function declarations(body: string, property: string): string[] {
  const pattern = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "g");
  return [...body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(pattern)].map(m => m[1]!.trim());
}

/** Splits a comma list without breaking `cubic-bezier(0.2, 1, …)` apart. */
function splitTopLevel(value: string): string[] {
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

const LAYOUT_PROPERTY =
  /^(all|width|height|(min|max)-(width|height)|top|right|bottom|left|inset(-\w+)?|(margin|padding)(-\w+)?|gap|flex(-basis)?|grid-template-\w+)$/;

function transitionedProperties(rule: CssRule): string[] {
  return [
    ...declarations(rule.body, "transition").flatMap(value =>
      splitTopLevel(value).map(part => part.split(/\s+/)[0]!),
    ),
    ...declarations(rule.body, "transition-property").flatMap(splitTopLevel),
  ];
}

/** Bodies of the functions handed to requestAnimationFrame, by name or inline. */
function frameCallbacks(text: string): { body: string; index: number }[] {
  const callbacks: { body: string; index: number }[] = [];
  const names = new Set(
    [...text.matchAll(/requestAnimationFrame\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map(call => call[1]!),
  );
  for (const name of names) {
    const declaration = new RegExp(
      `(?:const|let)\\s+${name}\\s*=\\s*(?:\\([^)]*\\)|\\w+)\\s*=>\\s*\\{|function\\s+${name}\\s*\\(`,
    ).exec(text);
    if (!declaration) continue;
    const open = text.indexOf("{", declaration.index + declaration[0].length - 1);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        callbacks.push({ body: text.slice(open, i + 1), index: declaration.index });
        break;
      }
    }
  }
  return callbacks;
}

function report(violations: string[]) {
  expect(violations, violations.join("\n")).toEqual([]);
}

describe("performance lint: CSS", () => {
  test("transitions and keyframes skip layout properties", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(CHROME_DIRS, "**/*.css")) {
      for (const rule of cssRules(text)) {
        if (rule.allowed) continue;
        const animated = /^(from|to|[\d.]+%)/.test(rule.selector)
          ? [...rule.body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]!)
          : transitionedProperties(rule);
        for (const property of animated.filter(p => LAYOUT_PROPERTY.test(p))) {
          violations.push(
            `${file}:${rule.line} animates "${property}", which re-lays out every frame. ` +
              "Animate transform/opacity, or add `perf-allow: <reason>`.",
          );
        }
      }
    }
    report(violations);
  });

  test("backdrop blurs never animate", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(CHROME_DIRS, "**/*.css")) {
      for (const rule of cssRules(text)) {
        if (transitionedProperties(rule).some(p => p.endsWith("backdrop-filter"))) {
          violations.push(`${file}:${rule.line} transitions backdrop-filter; keep the blur fixed and fade opacity.`);
        }
      }
    }
    report(violations);
  });

  test("will-change is only held while the deck camera flies", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(CHROME_DIRS, "**/*.css")) {
      for (const rule of cssRules(text)) {
        if (rule.allowed || rule.selector.includes("[data-flying]")) continue;
        if (declarations(rule.body, "will-change").length > 0) {
          violations.push(
            `${file}:${rule.line} keeps will-change on "${rule.selector}". Permanent layers cost memory ` +
              "and raster; scope it to [data-flying] or add `perf-allow: <reason>`.",
          );
        }
      }
    }
    report(violations);
  });

  test("deck cards carry no backdrop blur, since they move", async () => {
    const text = await Bun.file(path.join(src, "app/deck/DeckCard.module.css")).text();
    expect(text.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("backdrop-filter");
  });
});

describe("performance lint: code", () => {
  test("app and studio chrome animate through Motion, not their own frame loops", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["app", "studio"], "**/*.{ts,tsx}")) {
      for (const match of text.matchAll(/requestAnimationFrame\(/g)) {
        if (allowedNear(text, match.index!)) continue;
        violations.push(`${file}:${lineOf(text, match.index!)} runs requestAnimationFrame; drive a motion value instead.`);
      }
    }
    report(violations);
  });

  test("frame loops never set React state", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(CHROME_DIRS, "**/*.{ts,tsx}")) {
      for (const { body, index } of frameCallbacks(text)) {
        if (body.includes(ALLOW) || allowedNear(text, index)) continue;
        const setter = /(?<![.\w])set[A-Z]\w*\(/.exec(body);
        if (setter) {
          violations.push(
            `${file}:${lineOf(text, index)} calls ${setter[0]}) every frame, re-rendering React 60 times a second. ` +
              "Write to a motion value or the DOM instead.",
          );
        }
      }
    }
    report(violations);
  });

  test("motion values are not mirrored into React state", async () => {
    const violations: string[] = [];
    const mirrors = [
      /onUpdate\s*:\s*(?:\([^)]*\)|\w+)\s*=>\s*\{?\s*set[A-Z]/g,
      /useMotionValueEvent\([^)]*,\s*["']change["']\s*,\s*(?:\([^)]*\)|\w+)\s*=>\s*\{?\s*set[A-Z]/g,
      /\.on\(\s*["']change["']\s*,\s*(?:\([^)]*\)|\w+)\s*=>\s*\{?\s*set[A-Z]/g,
    ];
    for (const { file, text } of await sources(CHROME_DIRS, "**/*.{ts,tsx}")) {
      for (const pattern of mirrors) {
        for (const match of text.matchAll(pattern)) {
          if (allowedNear(text, match.index!)) continue;
          violations.push(`${file}:${lineOf(text, match.index!)} copies a motion value into state every frame.`);
        }
      }
    }
    report(violations);
  });

  test("blur radii are never set from script", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(CHROME_DIRS, "**/*.tsx")) {
      for (const match of text.matchAll(/\b(Webkit)?[bB]ackdropFilter\s*:/g)) {
        violations.push(`${file}:${lineOf(text, match.index!)} sets backdrop-filter inline; keep blurs fixed in CSS.`);
      }
    }
    report(violations);
  });
});

describe("performance lint: Live components", () => {
  test("frame loops pause while off screen, since the deck keeps every card mounted", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "**/*.{ts,tsx}")) {
      const loop = /requestAnimationFrame\(|\bframeLoop\(/.exec(text);
      if (!loop || allowedNear(text, loop.index)) continue;
      if (!/IntersectionObserver|pausableLoop/.test(text)) {
        violations.push(
          `${file}:${lineOf(text, loop.index)} animates without pausing off screen. ` +
            "Gate the loop on an IntersectionObserver.",
        );
      }
    }
    report(violations);
  });

  test("GPU components loop through pausableLoop, which pauses off screen and primes pipelines", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "**/*.{ts,tsx}")) {
      for (const match of text.matchAll(/\bframeLoop\(/g)) {
        violations.push(`${file}:${lineOf(text, match.index!)} calls vgpu frameLoop directly; use pausableLoop from @/gpu.`);
      }
    }
    report(violations);
  });
});
