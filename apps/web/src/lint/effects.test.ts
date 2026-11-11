import { describe, expect, test } from "bun:test";
import path from "node:path";
import ts from "typescript";
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

type Effect = { file: string; line: number; callback: ts.Node; deps: string[] | null; source: ts.SourceFile };

/** Every `useEffect` and `useLayoutEffect` call in `text`, parsed, with its callback and dependency list. */
function effects(file: string, text: string): Effect[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Effect[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^use(?:Layout)?Effect$/.test(node.expression.text)) {
      const [callback, deps] = node.arguments;
      if (callback) {
        found.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          callback,
          deps: deps && ts.isArrayLiteralExpression(deps) ? deps.elements.map(element => element.getText(source)) : null,
          source,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every node under `root`, depth first. */
function descendants(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return nodes;
}

/** Names declared inside `root`: local functions and variables. */
function declaredNames(root: ts.Node): Set<string> {
  const names = new Set<string>();
  for (const node of descendants(root)) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
  }
  return names;
}

/** Whether `name` is a function declared in `source`, rather than a value. */
function declaresFunction(source: ts.SourceFile, name: string): boolean {
  return descendants(source).some(node => {
    if (ts.isFunctionDeclaration(node)) return node.name?.text === name;
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== name) return false;
    const value = node.initializer;
    return (
      !!value &&
      (ts.isArrowFunction(value) ||
        ts.isFunctionExpression(value) ||
        (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === "useCallback"))
    );
  });
}

/** Functions an Effect copies into a ref (`someRef.current = fn`), so another Effect can call the latest one. */
function latestCallbackRefs(effect: Effect): { ref: string; value: string }[] {
  return descendants(effect.callback).flatMap(node => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return [];
    const { left, right } = node;
    if (!ts.isPropertyAccessExpression(left) || left.name.text !== "current" || !ts.isIdentifier(right)) return [];
    const value = right.text;
    return /^on[A-Z]/.test(value) || declaresFunction(effect.source, value) ? [{ ref: left.expression.getText(effect.source), value }] : [];
  });
}

/** Parent callbacks (`onChange(…)`, `onChange?.(…)`, `props.onChange(…)`) an Effect calls while running for other reasons. */
function relayedCallbacks(effect: Effect): string[] {
  const local = declaredNames(effect.callback);
  const called = new Set<string>();
  for (const node of descendants(effect.callback)) {
    if (!ts.isCallExpression(node)) continue;
    const callee = node.expression;
    if (ts.isIdentifier(callee) && /^on[A-Z]/.test(callee.text) && !local.has(callee.text)) called.add(callee.text);
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "props" &&
      /^on[A-Z]/.test(callee.name.text)
    ) {
      called.add(callee.getText(effect.source));
    }
  }
  // An Effect that only says "mounted" (its sole dependency is the callback) is synchronization, not a relay.
  return [...called].filter(callback => effect.deps === null || effect.deps.some(dep => dep !== callback));
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
        for (const { ref, value } of latestCallbackRefs(effect)) {
          violations.push(
            `${file}:${effect.line} copies the function "${value}" into ${ref} so another Effect can call its latest version. ` +
              `Use \`const ${value}Latest = useEffectEvent(${value})\` and call that from the Effect.`,
          );
        }
      }
    }
    report(violations);
  });

  test("Effects never relay state to a parent; call the parent's callback in the event that changed it", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(OWNED_DIRS, "**/*.{ts,tsx}")) {
      for (const effect of effects(file, text)) {
        for (const callback of relayedCallbacks(effect)) {
          violations.push(
            `${file}:${effect.line} calls ${callback} from an Effect that runs when ${effect.deps?.join(", ") || "anything"} changes. ` +
              "Call it in the event handler that made the change, so the parent updates in the same render.",
          );
        }
      }
    }
    report(violations);
  });
});

describe("Effect scanner", () => {
  const scan = (text: string) => effects("x.tsx", text);

  test("reads each Effect's dependencies, whatever its callback contains", () => {
    const [first, second] = scan('useEffect(() => { console.warn(")"); /* ( */ draw(); }, [value, onChange]);\nuseLayoutEffect(() => draw());');
    expect([first?.line, first?.deps, second?.line, second?.deps]).toEqual([1, ["value", "onChange"], 2, null]);
  });

  test("finds a relay to the parent, even after a parenthesis in a string", () => {
    const [effect] = scan('useEffect(() => { console.warn(")"); onChange(value); props.onSave?.(value); }, [value]);');
    expect(relayedCallbacks(effect!)).toEqual(["onChange", "props.onSave"]);
  });

  test("allows a mount signal and the Effect's own listeners", () => {
    const [mounted, listening] = scan(
      "useEffect(() => { onReady(); }, [onReady]);\n" +
        'useEffect(() => { function onKeyDown() {} window.addEventListener("keydown", onKeyDown); onKeyDown(); }, [open]);',
    );
    expect([relayedCallbacks(mounted!), relayedCallbacks(listening!)]).toEqual([[], []]);
  });

  test("finds a function copied into a ref, and ignores a value", () => {
    const [copy, value] = scan(
      "function handle() {}\nuseLayoutEffect(() => { handleRef.current = handle; });\nuseLayoutEffect(() => { sizeRef.current = size; });",
    );
    expect([latestCallbackRefs(copy!), latestCallbackRefs(value!)]).toEqual([[{ ref: "handleRef", value: "handle" }], []]);
  });
});
