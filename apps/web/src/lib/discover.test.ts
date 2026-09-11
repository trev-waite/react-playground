import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import {
  buildTree,
  catalogEntriesFromLoaders,
  livePreviewLoader,
  slugFromPreviewPath,
  titleFromSlug,
} from "./catalog";

const liveRoot = path.join(import.meta.dir, "../live");

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
  test("maps Vite glob paths to Live slugs", () => {
    const entries = catalogEntriesFromLoaders({
      "../live/shaders/LightDispersion/preview.tsx": async () => ({ default: () => null }),
    });
    expect(entries).toEqual([
      {
        slug: "shaders/LightDispersion",
        title: "Light Dispersion",
        load: expect.any(Function),
      },
    ]);
    expect(slugFromPreviewPath("../live/buttons/PrimaryButton/preview.tsx")).toBe(
      "buttons/PrimaryButton",
    );
    expect(titleFromSlug("buttons/PrimaryButton")).toBe("Primary Button");
  });

  test("puts GPU ideas under their Live folder in the tree", () => {
    const shaders = buildTree([
      {
        slug: "shaders/LightDispersion",
        title: "Light Dispersion",
        load: async () => ({ default: () => null }),
      },
    ]).find(node => node.type === "folder" && node.name === "shaders");
    expect(shaders?.type).toBe("folder");
    if (shaders?.type !== "folder") return;
    expect(shaders.children).toContainEqual({
      type: "leaf",
      name: "LightDispersion",
      title: "Light Dispersion",
      slug: "shaders/LightDispersion",
    });
  });

  test("keeps a Light Dispersion preview on disk for the Vite glob", async () => {
    const slugs: string[] = [];
    for await (const file of new Glob("**/preview.tsx").scan({
      cwd: liveRoot,
      onlyFiles: true,
    })) {
      slugs.push(file.replace(/\/preview\.tsx$/, "").replace(/\\/g, "/"));
    }
    expect(slugs).toContain("shaders/LightDispersion");
  });
});
