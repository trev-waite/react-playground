import { describe, expect, test } from "bun:test";
import { maskSize, typeSize, wordPlacement } from "./word";

const RATIO = 2.4;

describe("placing the pressed word", () => {
  test("keeps the word's shape on any stage, so a card zooming open never stretches it", () => {
    const [, , w0, h0] = wordPlacement(320, 240, RATIO);
    const shape = (w0 * 320) / (h0 * 240);
    for (const [width, height] of [[1690, 650], [400, 700], [900, 900], [1280, 400]] as const) {
      const [, , w, h] = wordPlacement(width, height, RATIO);
      expect((w * width) / (h * height)).toBeCloseTo(shape, 10);
    }
  });

  test("centers it across the stage with its middle at 49% of the height, inside the stage's width", () => {
    for (const [width, height] of [[320, 240], [1690, 650], [400, 700]] as const) {
      const [x, y, w, h] = wordPlacement(width, height, RATIO);
      expect(x + w / 2).toBeCloseTo(0.5, 10);
      expect(y + h * 0.49).toBeCloseTo(0.49, 10);
      expect(RATIO * typeSize(width, height, RATIO)).toBeLessThanOrEqual(width * 0.78 + 1e-9);
    }
  });

  test("grows the word smoothly as the stage grows, with no step between sizes", () => {
    let last = typeSize(320, 240, RATIO);
    for (let t = 0.01; t <= 1; t += 0.01) {
      const size = typeSize(320 + 1370 * t, 240 + 410 * t, RATIO);
      expect(size).toBeGreaterThanOrEqual(last);
      expect(size - last).toBeLessThan(12);
      last = size;
    }
  });

  test("presses one texture for the largest the word gets on the screen, within WebGPU's limits", () => {
    const [width, height] = maskSize(RATIO, [1770, 960], 2);
    expect(height).toBeCloseTo(1.6 * typeSize(1770, 960, RATIO) * 2, -1);
    expect(width / height).toBeCloseTo((RATIO + 0.7) / 1.6, 2);
    expect(Math.max(...maskSize(RATIO, [8000, 6000], 3))).toBeLessThanOrEqual(4096);
  });
});
