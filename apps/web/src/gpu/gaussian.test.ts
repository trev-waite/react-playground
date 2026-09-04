import { describe, expect, test } from "bun:test";
import { bilinearGaussianTaps, gaussianKernel } from "./gaussian";

describe("gaussianKernel", () => {
  test("is normalised and symmetric", () => {
    const kernel = gaussianKernel(4);
    expect(kernel).toHaveLength(9);
    expect(kernel.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(kernel[0]).toBeCloseTo(kernel[8] ?? -1, 9);
    expect(kernel[4]).toBeGreaterThan(kernel[3] ?? Infinity);
  });

  test("rejects bad radii", () => {
    expect(() => gaussianKernel(-1)).toThrow(RangeError);
    expect(() => gaussianKernel(1.5)).toThrow(RangeError);
  });
});

describe("bilinearGaussianTaps", () => {
  test("keeps the total weight at one with half the reads", () => {
    const { center, taps } = bilinearGaussianTaps(4);
    expect(taps).toHaveLength(2);
    const total = center + 2 * taps.reduce((sum, tap) => sum + tap.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  test("offsets land between the two texels they merge and increase outward", () => {
    const { taps } = bilinearGaussianTaps(6);
    expect(taps).toHaveLength(3);
    taps.forEach((tap, index) => {
      const low = index * 2 + 1;
      expect(tap.offset).toBeGreaterThan(low);
      expect(tap.offset).toBeLessThan(low + 1);
    });
  });

  test("radius zero is a pass-through", () => {
    expect(bilinearGaussianTaps(0)).toEqual({ center: 1, taps: [] });
  });
});
