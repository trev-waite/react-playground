import { describe, expect, test } from "bun:test";
import { backPillPath } from "./backPillShape";

/** The top neck's endpoints and the depth of its middle, read from the path's first curve. */
function topNeck(width: number, height = 44) {
  const numbers = backPillPath(width, height).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x0, y0, , y1, , y2, x3, y3] = numbers as [number, number, number, number, number, number, number, number];
  return { start: [x0, y0], end: [x3, y3], middle: (y0 + 3 * y1 + 3 * y2 + y3) / 8 };
}

describe("back pill shape", () => {
  test("two side-by-side circles dip in a little at the middle, like water holding them together", () => {
    const neck = topNeck(88);
    expect(neck.middle).toBeGreaterThan(4);
    expect(neck.middle).toBeLessThan(10);
    expect(neck.start[1]).toBe(neck.end[1]);
  });

  test("the neck leaves each circle on its outline", () => {
    const { start, end } = topNeck(88);
    expect(Math.hypot(start[0]! - 22, start[1]! - 22)).toBeCloseTo(22, 1);
    expect(Math.hypot(end[0]! - 66, end[1]! - 22)).toBeCloseTo(22, 1);
  });

  test("the dip flattens as the circles merge, until only one circle is left", () => {
    expect(topNeck(66).middle).toBeLessThan(topNeck(88).middle);
    const merged = topNeck(44);
    expect(merged.start).toEqual([22, 0]);
    expect(merged.end).toEqual([22, 0]);
    expect(merged.middle).toBe(0);
  });
});
