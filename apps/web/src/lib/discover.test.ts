import { describe, expect, test } from "bun:test";
import { buildTree, liveEntries, livePreviewLoader } from "./discover";

describe("livePreviewLoader", () => {
  const entries = [
    {
      slug: "shaders/LightDispersion",
      title: "Light Dispersion",
      load: async () => ({ default: () => null }),
    },
  ];

  test("returns nothing until a known Live slug is selected", () => {
    expect(livePreviewLoader(null, entries)).toBeUndefined();
    expect(livePreviewLoader("missing/Component", entries)).toBeUndefined();
  });

  test("resolves a catalog slug to its preview loader", () => {
    expect(livePreviewLoader("shaders/LightDispersion", entries)).toBe(entries[0]?.load);
  });
});

describe("live catalog", () => {
  test("registers Light Dispersion so Make Live is not a sidebar-only entry", () => {
    expect(livePreviewLoader("shaders/LightDispersion")).toBeTypeOf("function");
    expect(liveEntries.some(entry => entry.slug === "shaders/LightDispersion")).toBe(true);
  });

  test("puts GPU ideas under their Live folder in the tree", () => {
    const shaders = buildTree().find(node => node.type === "folder" && node.name === "shaders");
    expect(shaders?.type).toBe("folder");
    if (shaders?.type !== "folder") return;
    expect(shaders.children).toContainEqual({
      type: "leaf",
      name: "LightDispersion",
      title: "Light Dispersion",
      slug: "shaders/LightDispersion",
    });
  });
});
