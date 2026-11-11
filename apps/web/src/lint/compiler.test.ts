import { describe, test } from "bun:test";
import path from "node:path";
import { transformAsync } from "@babel/core";
import { report, SRC } from "./source";

const COMPILED_DIRS = ["app", "studio", "experimental", "live", "lib", "gpu"];
const LAYOUT_SHEET = path.join(SRC, "../../../packages/layout-sheet/src");

type CompilerEvent = { kind: string; detail?: { reason?: string; options?: { reason?: string }; loc?: { start?: { line?: number } } } };

/** Why the React Compiler skipped functions in `file`, if it did. */
async function skipped(file: string, label: string): Promise<string[]> {
  const reasons: string[] = [];
  await transformAsync(await Bun.file(file).text(), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [
      [
        "babel-plugin-react-compiler",
        {
          panicThreshold: "none",
          logger: {
            logEvent(_file: string, event: CompilerEvent) {
              if (event.kind !== "CompileError" && event.kind !== "PipelineError") return;
              const reason = event.detail?.reason ?? event.detail?.options?.reason ?? event.kind;
              reasons.push(`${label}:${event.detail?.loc?.start?.line ?? "?"} ${reason}`);
            },
          },
        },
      ],
    ],
  });
  return reasons;
}

describe("React Compiler", () => {
  test("compiles every component and hook, so none falls back to re-rendering unmemoized", async () => {
    const violations: string[] = [];
    const roots = [
      ...COMPILED_DIRS.map(dir => ({ cwd: path.join(SRC, dir), label: dir })),
      { cwd: LAYOUT_SHEET, label: "packages/layout-sheet/src" },
    ];
    for (const { cwd, label } of roots) {
      for await (const relative of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd })) {
        if (relative.includes(".test.") || relative.endsWith(".d.ts")) continue;
        violations.push(...(await skipped(path.join(cwd, relative), `${label}/${relative}`)));
      }
    }
    report(violations);
  }, 30_000);
});
