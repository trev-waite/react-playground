import { describe, expect, test } from "bun:test";
import path from "node:path";
import { componentSources } from "./liveSourcePlugin.ts";

const live = path.join(import.meta.dir, "../src/live");

describe("componentSources", () => {
  test("leads with the component, then the files it imports, styles last", async () => {
    const files = await componentSources(path.join(live, "inputs/StretchSlider"));
    expect(files.map(file => file.name)).toEqual(["StretchSlider.tsx", "stretch.ts", "StretchSlider.module.css"]);
    expect(files[0]!.code).toContain("export function StretchSlider");
  });

  test("leaves out the preview, its staging styles, and tests", async () => {
    const files = await componentSources(path.join(live, "loaders/RelayDots"));
    const names = files.map(file => file.name);
    expect(names).toContain("RelayDots.tsx");
    expect(names.some(name => name === "preview.tsx" || name.includes("Preview") || name.includes(".test."))).toBe(false);
  });

  test("finds helpers imported only by other helpers", async () => {
    const names = (await componentSources(path.join(live, "backgrounds/Topography"))).map(file => file.name);
    expect(names[0]).toBe("Topography.tsx");
    expect(names).toEqual(expect.arrayContaining(["relief.ts", "terraces.ts"]));
  });

  test("gives nothing for a folder without a component named after it", async () => {
    expect(await componentSources(path.join(live, "controls"))).toEqual([]);
  });
});
