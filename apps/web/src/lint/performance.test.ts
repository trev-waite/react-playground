import { describe, expect, test } from "bun:test";
import {
  ALLOW,
  allowedNear,
  cssRules,
  declarations,
  lineOf,
  readSource,
  report,
  sources,
  splitTopLevel,
  stripCssComments,
  transitionedProperties,
} from "./source";

/**
 * Performance lint. Each rule guards a fix that took a transition from
 * dropped frames to a steady 60 fps (see docs/BEST_PRACTICES.md#motion).
 * A justified exception carries `perf-allow: <reason>` in a comment on the
 * flagged CSS rule, or on or just above the flagged line of code.
 */

/** UI we own. Experimental ideas are WIP sketches and stay unlinted. */
const CHROME_DIRS = ["app", "studio", "experimental"];

const LAYOUT_PROPERTY =
  /^(all|width|height|(min|max)-(width|height)|top|right|bottom|left|inset(-\w+)?|(margin|padding)(-\w+)?|gap|flex(-basis)?|grid-template-\w+)$/;

/** The last compound selector, the element a rule styles: `:root:has(x) .bar` gives `.bar`. */
function lastCompound(selector: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1;
  }
  return selector.slice(start);
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

  test("custom properties never flip on :root through :has(), which restyles the whole document", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources([...CHROME_DIRS, "live"], "**/*.css")) {
      for (const rule of cssRules(text)) {
        if (rule.allowed || !/(^|[;\s])--[\w-]+\s*:/.test(stripCssComments(rule.body))) continue;
        const subject = splitTopLevel(rule.selector).find(part => /:root\b.*:has\(/.test(lastCompound(part)));
        if (subject) {
          violations.push(
            `${file}:${rule.line} sets custom properties on "${subject}". Every element inherits them, so each flip ` +
              "restyles the page (15 ms on an iPhone); set them on the elements that read them, under the same :has().",
          );
        }
      }
    }
    report(violations);
  });

  test("deck cards carry no backdrop blur, since they move", async () => {
    const text = await readSource("app/deck/DeckCard.module.css");
    expect(stripCssComments(text)).not.toContain("backdrop-filter");
  });
});

describe("performance lint: code", () => {
  test("app and studio chrome animate through the shared frame loop, not their own", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["app", "studio"], "**/*.{ts,tsx}")) {
      for (const match of text.matchAll(/requestAnimationFrame\(/g)) {
        if (allowedNear(text, match.index!)) continue;
        violations.push(`${file}:${lineOf(text, match.index!)} runs requestAnimationFrame; drive a motion value (app/motion) instead.`);
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
