import { describe, expect, test } from "bun:test";
import { CLOSE_EASE, OPEN_EASE, OPEN_MS, PILL_CLOSED_WIDTH, revealDelay, timeToReach } from "./revealTiming";

describe("MenuPill reveal timing", () => {
  test("a linear curve reaches each progress at the same fraction of time", () => {
    const linear = [0, 0, 1, 1] as const;
    expect(timeToReach(linear, 0.25)).toBeCloseTo(0.25, 3);
    expect(timeToReach(linear, 0.75)).toBeCloseTo(0.75, 3);
  });

  test("an overshooting curve counts its first crossing", () => {
    expect(timeToReach(OPEN_EASE, 1)).toBeLessThan(1);
    expect(timeToReach(OPEN_EASE, 0)).toBe(0);
    expect(timeToReach(CLOSE_EASE, 0.5)).toBeLessThan(0.2);
  });

  test("words farther from the center fade in later", () => {
    const half = 220;
    const inner = revealDelay(0, 30, half);
    const middle = revealDelay(80, 120, half);
    const outer = revealDelay(170, 200, half);
    expect(middle).toBeGreaterThanOrEqual(inner);
    expect(outer).toBeGreaterThan(middle);
    expect(outer).toBeLessThan(OPEN_MS);
  });

  test("words inside the closed pill share the shortest delay", () => {
    expect(revealDelay(0, PILL_CLOSED_WIDTH / 4, 200)).toBe(revealDelay(0, PILL_CLOSED_WIDTH / 2, 200));
  });
});
