import { describe, expect, test } from "bun:test";
import { maskFits, viewportMaskSize } from "./textMask";

describe("viewportMaskSize", () => {
  test("fits a wide canvas to the viewport width at the device pixel ratio", () => {
    expect(viewportMaskSize(5, [1280, 800], 2)).toEqual([2560, 512]);
  });

  test("fits a tall canvas to the viewport height", () => {
    expect(viewportMaskSize(0.5, [1280, 800], 1)).toEqual([400, 800]);
  });

  test("ignores the canvas size, so a canvas zooming at a fixed aspect keeps one mask", () => {
    const tile = viewportMaskSize(543 / 111, [1280, 800], 2);
    const page = viewportMaskSize(977 / 200, [1280, 800], 2);
    expect(maskFits(tile, page)).toBe(true);
  });

  test("caps the longest side for very large screens", () => {
    const [width, height] = viewportMaskSize(5, [5120, 2880], 2);
    expect(width).toBe(4096);
    expect(height).toBe(819);
  });
});

describe("maskFits", () => {
  test("absorbs pixel rounding but not a real change of size or aspect", () => {
    expect(maskFits([2560, 522], [2560, 524])).toBe(true);
    expect(maskFits([2560, 522], [2560, 568])).toBe(false);
    expect(maskFits([1956, 398], [2560, 522])).toBe(false);
  });
});
