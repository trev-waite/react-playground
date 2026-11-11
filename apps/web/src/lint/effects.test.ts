import { describe, expect, test } from "bun:test";
import path from "node:path";
import { lineOf, report, sources, SRC } from "./source";

/**
 * Effects synchronize with things outside React: listeners, timers, observers,
 * animation loops, the network. Everything else (derived values, resets on a
 * prop change, telling a parent what changed) belongs in render or in the
 * event that caused it. oxlint checks most of this; these tests cover what it
 * cannot, and keep anyone from switching it off.
 */

const ROOT = path.join(SRC, "../../..");
const OWNED_DIRS = ["app", "studio", "experimental", "live", "lib", "gpu"];
const SUPPRESSION = /\b(?:eslint-disable|oxlint-disable)|@ts-(?:ignore|nocheck|expect-error)\b/;

/** React's rules for Effects, refs, and render purity; each must stay an error. */
const REACT_RULES = [
  "react/rules-of-hooks",
  "react-hooks/exhaustive-deps",
  "react/no-deriving-state-in-effects",
  "react/set-state-in-effect",
  "react/set-state-in-render",
  "react/refs",
  "react/immutability",
  "react/purity",
  "react/globals",
  "react/static-components",
  "react/use-memo",
  "react/preserve-manual-memoization",
  "react/unsupported-syntax",
];

type Effect = { file: string; line: number; body: string; deps: string[] | null };

/** Every `useEffect` and `useLayoutEffect` call: its callback source and its dependency list. */
function effects(file: string, text: string): Effect[] {
  const found: Effect[] = [];
  for (const match of text.matchAll(/\buse(?:Layout)?Effect\(/g)) {
    let depth = 1;
    let end = match.index! + match[0].length;
    while (depth > 0 && end < text.length) {
      const char = text[end++];
      if (char === "(") depth++;
      else if (char === ")") depth--;
    }
    const call = text.slice(match.index! + match[0].length, end - 1);
    const deps = call.match(/,\s*\[([^\]]*)\]\s*,?\s*$/);
    found.push({
      file,
      line: lineOf(text, match.index!),
      body: deps ? call.slice(0, deps.index) : call,
      deps: deps ? deps[1]!.split(",").map(dep => dep.trim()).filter(Boolean) : null,
    });
  }
  return found;
}

/** Whether `name` is a function declared in `text`, rather than a value. */
function declaresFunction(text: string, name: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
  return new RegExp(`function ${escaped}\\(|const ${escaped} = (?:async )?(?:\\([^)]*\\)|\\w+) =>|const ${escaped} = useCallback\\(`).test(text);
}

describe("standards lint: Effects", () => {
  test("no lint or type-check suppressions; fix what the checks flag", async () => {
    const violations: string[] = [];
    const roots = ["apps/web/src", "apps/web/vite", "apps/web/scripts", "apps/api/src", "packages"];
    for (const root of roots) {
      for await (const relative of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: path.join(ROOT, root) })) {
        if (relative.includes("node_modules/") || relative.endsWith("lint/effects.test.ts")) continue;
        const text = await Bun.file(path.join(ROOT, root, relative)).text();
        const match = SUPPRESSION.exec(text);
        if (match) {
          violations.push(`${root}/${relative}:${lineOf(text, match.index)} suppresses a check (${match[0]}). Fix the code instead.`);
        }
      }
    }
    report(violations);
  });

  test("the lint config keeps React's rules on, everywhere", async () => {
    const config = (await Bun.file(path.join(ROOT, ".oxlintrc.json")).json()) as {
      rules: Record<string, unknown>;
      overrides?: { files: string[]; rules: Record<string, unknown> }[];
    };
    const violations = REACT_RULES.filter(rule => config.rules[rule] !== "error").map(
      rule => `.oxlintrc.json must set "${rule}" to "error".`,
    );
    for (const override of config.overrides ?? []) {
      for (const rule of Object.keys(override.rules)) {
        if (/^(?:react|react-hooks|jsx-a11y)\//.test(rule)) {
          violations.push(`.oxlintrc.json turns "${rule}" off for ${override.files.join(", ")}. Fix those files instead.`);
        }
      }
    }
    report(violations);
  });

  test("Effects read the latest callback with useEffectEvent, not a ref copied each render", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(OWNED_DIRS, "**/*.{ts,tsx}")) {
      for (const effect of effects(file, text)) {
        for (const match of effect.body.matchAll(/(\w+)\.current = (\w+);/g)) {
          const [, ref, value] = match;
          if (/^on[A-Z]/.test(value!) || declaresFunction(text, value!)) {
            violations.push(
              `${file}:${effect.line} copies the function "${value}" into ${ref} so another Effect can call its latest version. ` +
                `Use \`const ${value}Latest = useEffectEvent(${value})\` and call that from the Effect.`,
            );
          }
        }
      }
    }
    report(violations);
  });

  test("Effects never relay state to a parent; call the parent's callback in the event that changed it", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(OWNED_DIRS, "**/*.{ts,tsx}")) {
      for (const effect of effects(file, text)) {
        for (const match of effect.body.matchAll(/(?<![\w.])(on[A-Z]\w*)\??\.?\(/g)) {
          const callback = match[1]!;
          if (new RegExp(`(?:function|const|let) ${callback}\\b`).test(effect.body)) continue;
          // An Effect that only says "mounted" (its sole dependency is the callback) is synchronization, not a relay.
          const relays = effect.deps === null || effect.deps.some(dep => dep !== callback);
          if (relays) {
            violations.push(
              `${file}:${effect.line} calls ${callback} from an Effect that runs when ${effect.deps?.join(", ") || "anything"} changes. ` +
                "Call it in the event handler that made the change, so the parent updates in the same render.",
            );
          }
        }
      }
    }
    report(violations);
  });
});

describe("Effect scanner", () => {
  test("reads each Effect's body and dependencies", () => {
    const text = "useEffect(() => { onChange(value); }, [value, onChange]);\nuseLayoutEffect(() => draw());";
    expect(effects("x.tsx", text)).toEqual([
      { file: "x.tsx", line: 1, body: "() => { onChange(value); }", deps: ["value", "onChange"] },
      { file: "x.tsx", line: 2, body: "() => draw()", deps: null },
    ]);
  });
});
