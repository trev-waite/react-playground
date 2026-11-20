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

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const PARAMS_AND_TYPE = "(?:\\([^)]*\\)|\\w+)(?:\\s*:\\s*[\\w<>|\\s]+?)?\\s*=>\\s*\\{";

/** The `{ … }` block that opens at or after `from`. */
function blockFrom(text: string, from: number): { body: string; start: number } | null {
  const open = text.indexOf("{", from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return { body: text.slice(open, i + 1), start: open };
  }
  return null;
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "function", "typeof", "new", "super"]);

/** The body of the function, arrow, or method named `name` in `text`: a function, a const, a class field, or a method. */
function functionBody(text: string, name: string): { body: string; start: number } | null {
  if (KEYWORDS.has(name)) return null;
  const declaration = new RegExp(
    `(?:(?:const|let)\\s+|(?:private|public|protected|readonly)\\s+(?:readonly\\s+)?)${name}\\s*=\\s*${PARAMS_AND_TYPE}|function\\s+${name}\\s*\\(` +
      `|^[ \\t]*(?:(?:private|public|protected|static|async|override)\\s+)*${name}\\s*\\([^)]*\\)\\s*(?::\\s*[^{=;]+)?\\{`,
    "m",
  ).exec(text);
  return declaration ? blockFrom(text, declaration.index + declaration[0].length - 1) : null;
}

/** Local functions and `this.` methods a block calls, except calls marked `perf-allow: <reason>` on their line or the one above. */
function callees(source: string, { body, start }: { body: string; start: number }): string[] {
  return [...body.matchAll(new RegExp(`(?:(?<=\\bthis\\.)|(?<![.\\w$]))(${IDENTIFIER})\\(`, "g"))]
    .filter(call => !allowedNear(source, start + call.index, ALLOW, 1))
    .map(call => call[1]!);
}

/**
 * The code that runs every frame, comments blanked: functions handed to requestAnimationFrame or
 * visibleLoop, by name or inline, and the local functions and methods they call, two calls deep. A
 * call marked `perf-allow: <reason>` (one that runs only when something changed, or at most every so
 * often) is not followed.
 */
function frameCallbacks(source: string): { body: string; start: number }[] {
  const text = blankComments(source);
  const named = [
    ...text.matchAll(new RegExp(`requestAnimationFrame\\(\\s*(?:this\\.)?(${IDENTIFIER})\\s*\\)`, "g")),
    ...text.matchAll(new RegExp(`visibleLoop\\([^,()]+,\\s*(?:this\\.)?(${IDENTIFIER})\\s*[,)]`, "g")),
  ].map(match => match[1]!);
  const blocks = new Map<number, { body: string; start: number }>();
  for (const block of [...new Set(named)].flatMap(name => functionBody(text, name) ?? [])) blocks.set(block.start, block);
  for (const match of text.matchAll(new RegExp(`visibleLoop\\([^,()]+,\\s*${PARAMS_AND_TYPE}`, "g"))) {
    const block = blockFrom(text, match.index! + match[0].length - 1);
    if (block) blocks.set(block.start, block);
  }
  let frontier = [...blocks.values()];
  for (let hop = 0; hop < 2; hop++) {
    const names = new Set(frontier.flatMap(block => callees(source, block)));
    frontier = [...names].flatMap(name => functionBody(text, name) ?? []).filter(block => !blocks.has(block.start));
    for (const block of frontier) blocks.set(block.start, block);
  }
  return [...blocks.values()];
}

/** `// …` and `/* … *\/` comments blanked to spaces, so offsets still line up. */
function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, comment => comment.replace(/[^\n]/g, " "));
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
    for (const { file, text } of await sources([...CHROME_DIRS, "live"], "**/*.{ts,tsx}")) {
      const ownFunctions = new Set(
        [...text.matchAll(/\bfunction\s+(set[A-Z]\w*)\s*\(|\b(?:const|let)\s+(set[A-Z]\w*)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/g)].map(
          match => match[1] ?? match[2]!,
        ),
      );
      for (const { body, start } of frameCallbacks(text)) {
        const setter = [...body.matchAll(/(?<![.\w])(set(?!Timeout\b|Interval\b)[A-Z]\w*)\(/g)].find(call => !ownFunctions.has(call[1]!));
        if (!setter || allowedNear(text, start) || allowedNear(text, start + setter.index)) continue;
        violations.push(
          `${file}:${lineOf(text, start + setter.index)} calls ${setter[0]}) every frame, re-rendering React 60 times a second. ` +
            "Write to a motion value, a ref, or the DOM instead.",
        );
      }
    }
    report(violations);
  });

  test("frame loops read no layout and set no font, which would restyle the page after the deck moves a card", async () => {
    const violations: string[] = [];
    const read = /\.(?:getBoundingClientRect|getClientRects)\(|\.(?:client|offset|scroll)(?:Width|Height|Left|Top)\b(?!\s*=(?!=))|\bgetComputedStyle\(|\.font\s*=(?!=)/g;
    for (const { file, text } of await sources([...CHROME_DIRS, "live"], "**/*.{ts,tsx}")) {
      for (const { body, start } of frameCallbacks(text)) {
        for (const match of body.matchAll(read)) {
          const index = start + match.index;
          if (allowedNear(text, index)) continue;
          violations.push(
            `${file}:${lineOf(text, index)} runs \`${match[0]}\` every frame. Read sizes in a ResizeObserver callback and keep them, ` +
              "and set the font when the canvas resizes; or add `perf-allow: <reason>`.",
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
  test("frame loops run on visibleLoop, which sleeps while the card is off screen, since the deck keeps every card mounted", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "**/*.{ts,tsx}")) {
      if (file.startsWith("live/kit/")) continue;
      for (const match of blankComments(text).matchAll(/requestAnimationFrame\(/g)) {
        if (allowedNear(text, match.index)) continue;
        violations.push(
          `${file}:${lineOf(text, match.index)} runs requestAnimationFrame itself. Run frames on visibleLoop from ` +
            "@/live/kit/visibleLoop, or say why a short, input-driven animation needs its own with `perf-allow: <reason>`.",
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

describe("performance lint: GPU host", () => {
  test("GPU sessions ask for the fast GPU and keep it awake while they live, so a card coming back on screen never waits for it to wake", async () => {
    const host = await readSource("gpu/useGpu.ts");
    expect(host).toContain('powerPreference: "high-performance"');
    expect(host).toContain("session.rest = keepGpuAwake(gpu.gpu);");
    // Released with the session it was taken for, so a machine with no GPU in use is let sleep.
    expect(host).toMatch(/const disposeSession = \(\) => \{(?:(?!\n {2}\};)[\s\S])*session\.rest\(\);/);
  });

  test("vgpu is reached only through the gate, so a browser without WebGPU never downloads it", async () => {
    expect(await readSource("../vite.config.ts")).toContain("vgpuGatePlugin()");
    const violations: string[] = [];
    for (const { file, text } of await sources(["."], "**/*.{ts,tsx}")) {
      if (file.endsWith("gpu/vgpuGate.ts")) continue;
      for (const match of text.matchAll(/from\s+["'][^"']*vgpuLibrary(\.ts)?["']|import\(\s*["'][^"']*vgpuLibrary(\.ts)?["']\s*\)/g)) {
        violations.push(`${file}:${lineOf(text, match.index!)} imports the vgpu library module directly; import from "vgpu" and let the gate load it.`);
      }
    }
    report(violations);
  });
});
