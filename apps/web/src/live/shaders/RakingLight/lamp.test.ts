import { describe, expect, test } from "bun:test";
import { approach, idleLamp, LAMP_RISE_MS, presenceAt } from "./lamp";

describe("Raking Light lamp", () => {
  test("the light rises from nothing to full and holds there", () => {
    expect(presenceAt(-10)).toBe(0);
    expect(presenceAt(0)).toBe(0);
    expect(presenceAt(LAMP_RISE_MS)).toBe(1);
    expect(presenceAt(LAMP_RISE_MS * 3)).toBe(1);
    let previous = 0;
    for (let ms = 0; ms <= LAMP_RISE_MS; ms += 20) {
      expect(presenceAt(ms)).toBeGreaterThanOrEqual(previous);
      previous = presenceAt(ms);
    }
  });

  test("left alone, the lamp stays over the page and keeps low across the word", () => {
    for (let seconds = 0; seconds < 120; seconds += 0.25) {
      const { x, y } = idleLamp(seconds);
      expect(x).toBeGreaterThan(0.05);
      expect(x).toBeLessThan(0.95);
      expect(y).toBeGreaterThan(0.15);
      expect(y).toBeLessThan(0.65);
    }
  });

  test("following the hand closes the gap at the same pace whatever the frame rate", () => {
    const target = { x: 1, y: 1 };
    let fast = { x: 0, y: 0 };
    for (let frame = 0; frame < 12; frame++) fast = approach(fast, target, 1 / 120);
    let slow = { x: 0, y: 0 };
    for (let frame = 0; frame < 6; frame++) slow = approach(slow, target, 1 / 60);
    expect(fast.x).toBeCloseTo(slow.x, 6);
    expect(approach({ x: 0, y: 0 }, target, 0).x).toBe(0);
  });
});
