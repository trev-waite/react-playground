import { describe, expect, test } from "bun:test";
import type { Rolldown } from "vite";
import { previewPreloads } from "./previewPreloadPlugin.ts";

function chunk(fileName: string, options: { entry?: boolean; facade?: string; imports?: string[] } = {}) {
  return {
    type: "chunk",
    fileName,
    isEntry: options.entry ?? false,
    facadeModuleId: options.facade ?? null,
    imports: options.imports ?? [],
  } as unknown as Rolldown.OutputChunk;
}

describe("previewPreloads", () => {
  test("preloads every Live preview and its imports, skipping what the entry loads and lazy chunks", () => {
    const files = [
      chunk("assets/index.js", { entry: true, imports: ["assets/vendor.js"] }),
      chunk("assets/vendor.js"),
      chunk("assets/preview-a.js", { facade: "/src/live/controls/Switch/preview.tsx", imports: ["assets/vendor.js", "assets/Switch.js"] }),
      chunk("assets/preview-b.js", { facade: "/src/live/controls/Stepper/preview.tsx", imports: ["assets/Switch.js"] }),
      chunk("assets/Switch.js"),
      chunk("assets/engine.js", { facade: "/src/live/shaders/Glow/Glow.tsx" }),
      { type: "asset", fileName: "assets/style.css" } as unknown as Rolldown.OutputAsset,
    ];
    const bundle = Object.fromEntries(files.map(file => [file.fileName, file])) as Rolldown.OutputBundle;
    expect(previewPreloads(bundle)).toEqual(["assets/preview-a.js", "assets/Switch.js", "assets/preview-b.js"]);
  });
});
