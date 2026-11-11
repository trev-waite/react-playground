import { describe, expect, test } from "bun:test";
import type { Rolldown } from "vite";
import { liveRoutes } from "./liveRoutesPlugin";

function chunk(moduleIds: string[]): Rolldown.OutputChunk {
  return { type: "chunk", moduleIds } as unknown as Rolldown.OutputChunk;
}

describe("liveRoutes", () => {
  test("lists every bundled preview and family, once, and nothing else", () => {
    const bundle = {
      "assets/index.js": chunk([
        "/repo/apps/web/src/main.tsx",
        "/repo/apps/web/src/live/controls/family.ts",
        "/repo/apps/web/src/live/navigation/MenuPill/preview.tsx?meta",
      ]),
      "assets/a.js": chunk(["/repo/apps/web/src/live/controls/Switch/preview.tsx"]),
      "assets/b.js": chunk(["/repo/apps/web/src/live/navigation/MenuPill/preview.tsx"]),
      "assets/style.css": { type: "asset" } as Rolldown.OutputAsset,
    } as Rolldown.OutputBundle;
    expect(liveRoutes(bundle)).toEqual(["controls", "controls/Switch", "navigation/MenuPill"]);
  });
});
