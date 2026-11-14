import { describe, expect, test } from "bun:test";
import { drawStill } from "./still";

const WIDTH = 160;
const HEIGHT = 120;
const pixels = drawStill(WIDTH, HEIGHT);

function pixel(x: number, y: number) {
  const at = (y * WIDTH + x) * 4;
  return [pixels[at]!, pixels[at + 1]!, pixels[at + 2]!, pixels[at + 3]!];
}

describe("Topography's still map", () => {
  test("fills every pixel, opaque", () => {
    expect(pixels.length).toBe(WIDTH * HEIGHT * 4);
    for (let at = 3; at < pixels.length; at += 4) expect(pixels[at]).toBe(255);
  });

  test("draws the same map every time", () => {
    expect(drawStill(WIDTH, HEIGHT)).toEqual(pixels);
  });

  test("stacks terraces: many tones, from paper-white faces to grey walls", () => {
    const tones = new Set<number>();
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) tones.add(pixel(x, y)[1]! >> 3);
    expect(tones.size).toBeGreaterThan(8);
  });

  test("rings every third terrace in the accent, and the rest in ink", () => {
    let accent = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const [r, g, b] = pixel(x, y);
        if (b! - r! > 40 && b! - g! > 25) accent++;
      }
    }
    expect(accent).toBeGreaterThan(0);
    expect(accent).toBeLessThan(WIDTH * HEIGHT * 0.2);
  });

  test("fades into mist toward the horizon at the top", () => {
    const contrast = (y: number) => {
      const row = Array.from({ length: WIDTH }, (_, x) => pixel(x, y)[1]!);
      return Math.max(...row) - Math.min(...row);
    };
    expect(contrast(1)).toBeLessThan(contrast(HEIGHT - 2));
  });
});
