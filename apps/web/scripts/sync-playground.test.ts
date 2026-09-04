import { describe, expect, test } from "bun:test";
import { syncIdeaRegistry, syncPlaygroundRegistry } from "./sync-playground";

describe("syncPlaygroundRegistry", () => {
  test("treats every preview under Live as a Live entry", async () => {
    const slugs = await syncPlaygroundRegistry();
    expect(slugs).toContain("buttons/PrimaryButton");
    expect(slugs).toContain("shaders/LightDispersion");
    const generated = await Bun.file(
      new URL("../src/lib/playground.gen.ts", import.meta.url),
    ).text();
    expect(generated).not.toContain("previewStatuses");
    expect(generated).not.toContain("PlaygroundStatus");
  });
});

describe("syncIdeaRegistry", () => {
  test("discovers idea source files as lazy imports", async () => {
    const names = await syncIdeaRegistry();
    expect(names).toContain("BirdTwo");
    const generated = await Bun.file(
      new URL("../src/experimental/ideas.gen.ts", import.meta.url),
    ).text();
    expect(generated).toContain(
      '"./ideas/BirdTwo/source.tsx"',
    );
    expect(generated).not.toContain("import.meta.glob");
  });
});
