import { describe, expect, test } from "bun:test";
import { tokenize } from "./tokenize";

const join = (lines: { content: string }[][]) => lines.map(line => line.map(run => run.content).join("")).join("\n");

describe("tokenize", () => {
  test("keeps every line of a component exactly as written", async () => {
    const code = 'import { useState } from "react";\n\nexport function A() {\n  return <b className="c">d</b>;\n}';
    expect(join(await tokenize(code, "tsx"))).toBe(code);
  });

  test("colors through the sheet's CSS variables, so one pass serves both site themes", async () => {
    const colors = (await tokenize('const a = "b";', "tsx")).flat().map(run => run.color);
    expect(colors.some(color => color === "var(--code-token-string-expression)" || color === "var(--code-token-string)")).toBe(true);
    expect(colors.every(color => color === undefined || color.startsWith("var(--code-"))).toBe(true);
  });

  test("reads stylesheets too", async () => {
    const lines = await tokenize(".a {\n  color: red;\n}", "css");
    expect(lines).toHaveLength(3);
    expect(lines.flat().some(run => run.color?.startsWith("var(--code-token-"))).toBe(true);
  });
});
