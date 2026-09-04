import { describe, expect, test } from "bun:test";

describe("LiveStage frame", () => {
  test("stretches to the catalog canvas so GPU ideas get a real clientHeight", async () => {
    const css = await Bun.file(new URL("./LiveStage.module.css", import.meta.url)).text();
    const frame = css.match(/\.frame\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(frame).toContain("width: 100%");
    expect(frame).toContain("height: 100%");
    expect(frame).toContain("align-self: stretch");
    expect(frame).toContain("justify-self: stretch");
    expect(frame).toContain("min-height: 0");
  });
});
