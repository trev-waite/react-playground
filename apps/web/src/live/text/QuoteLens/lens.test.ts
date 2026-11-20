import { describe, expect, test } from "bun:test";
import { approach, clampCenter, cloneTransform, driftAt, follow } from "./lens";

function parse(transform: string) {
  const [, x, y, scale] = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(transform)!;
  return { x: Number(x), y: Number(y), scale: Number(scale) };
}

describe("Quote Lens", () => {
  test("the page point under the lens's center stays at the center, magnified around it", () => {
    for (const center of [{ x: 0, y: 0 }, { x: 120, y: 80 }, { x: 512.5, y: 301.25 }]) {
      const radius = 70;
      const { x, y, scale } = parse(cloneTransform(center, radius, 1.6));
      expect(center.x * scale + x).toBeCloseTo(radius, 1);
      expect(center.y * scale + y).toBeCloseTo(radius, 1);
      const beside = { x: center.x + 10, y: center.y };
      expect(beside.x * scale + x - radius).toBeCloseTo(16, 1);
    }
  });

  test("the lens never leaves the page, and its drift stays over the middle of it", () => {
    const page = { width: 600, height: 300 };
    expect(clampCenter({ x: -40, y: 900 }, page)).toEqual({ x: 0, y: 300 });
    for (let seconds = 0; seconds < 90; seconds += 0.5) {
      const { x, y } = driftAt(seconds, page);
      expect(x).toBeGreaterThanOrEqual(page.width * 0.2);
      expect(x).toBeLessThanOrEqual(page.width * 0.8);
      expect(y).toBeGreaterThanOrEqual(page.height * 0.32);
      expect(y).toBeLessThanOrEqual(page.height * 0.6);
    }
  });

  test("following closes the same gap whatever the frame rate", () => {
    let fast = { x: 0, y: 0 };
    for (let frame = 0; frame < 8; frame++) fast = follow(fast, { x: 10, y: 0 }, 1 / 120, 14);
    let slow = { x: 0, y: 0 };
    for (let frame = 0; frame < 4; frame++) slow = follow(slow, { x: 10, y: 0 }, 1 / 60, 14);
    expect(fast.x).toBeCloseTo(slow.x, 6);
  });

  test("zooming eases the strength toward its target and never overshoots", () => {
    let scale = 1.6;
    for (let frame = 0; frame < 120; frame++) {
      const next = approach(scale, 2.4, 1 / 60, 12);
      expect(next).toBeGreaterThanOrEqual(scale);
      expect(next).toBeLessThanOrEqual(2.4);
      scale = next;
    }
    expect(scale).toBeCloseTo(2.4, 3);
  });
});
