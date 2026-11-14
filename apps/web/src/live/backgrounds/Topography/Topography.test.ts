import { describe, expect, test } from "bun:test";
import { BASE_LEVEL, EXTENT, LAYERS, LIFT, levelOf, nearness } from "./terraces";

describe("Topography relief", () => {
  test("terraces climb evenly and the highest stays below the tallest ground, so peaks keep their rings", () => {
    expect(levelOf(0)).toBe(BASE_LEVEL);
    for (let layer = 1; layer < LAYERS; layer++) expect(levelOf(layer)).toBeGreaterThan(levelOf(layer - 1));
    expect(levelOf(LAYERS - 1)).toBeLessThan(1);
  });

  test("far ground is smaller than near ground, as seen from a tilted camera", () => {
    expect(nearness(1)).toBe(1);
    expect(nearness(0)).toBeLessThan(0.5);
    for (let y = 0.1; y <= 1; y += 0.1) expect(nearness(y)).toBeGreaterThan(nearness(y - 0.1));
  });

  test("the heightmap reaches past the bottom edge by more than the tallest lift", () => {
    expect(EXTENT).toBeGreaterThan(1 + LIFT * (LAYERS - 1) * nearness(1));
  });

});
