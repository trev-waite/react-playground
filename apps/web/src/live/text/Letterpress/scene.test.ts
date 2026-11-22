import { describe, expect, test } from "bun:test";
import { flightOrder, flightPose, FLIGHT_SPAN, followScroll, letterDeparture, LETTERS, liftScale, SETTLE_MS, springOffset } from "./scene";

describe("Letterpress", () => {
  test("gives each letter one staggered entrance and lands the last before the end of the scroll", () => {
    const count = LETTERS.length;
    const first = flightOrder(count, () => 0);
    const second = flightOrder(count, () => 0.65);
    expect(first).not.toEqual(second);
    for (const order of [first, second]) {
      expect(order.toSorted((a, b) => a - b)).toEqual(LETTERS.map((_, index) => index));
      const departures = order.map(rank => letterDeparture(rank, count));
      for (let frame = 0; frame <= 1000; frame++) {
        const progress = frame / 1000;
        expect(departures.filter(at => at < progress && progress < at + FLIGHT_SPAN).length).toBeLessThanOrEqual(2);
        for (const [index, letter] of LETTERS.entries()) {
          const departure = departures[index]!;
          const pose = flightPose(letter, progress, departure);
          if (progress <= departure) expect(pose).toBe(letter.pile);
          else if (progress >= departure + FLIGHT_SPAN) expect(pose).toBe(letter.home);
          else expect(pose).not.toBe(letter.home);
        }
      }
    }
  });

  test("a fast scrub is immediate, bounded, and reversible from the current frame", () => {
    let progress = followScroll(0, 1, 16);
    expect(progress).toBeGreaterThan(0.025);
    expect(progress).toBeLessThan(0.05);
    for (let frame = 0; frame < 7; frame++) progress = followScroll(progress, 1, 16);
    const turn = progress;
    for (let frame = 0; frame < 65; frame++) {
      const next = followScroll(progress, 0, 16);
      expect(next).toBeLessThanOrEqual(progress);
      expect(progress - next).toBeLessThan(0.05);
      progress = next;
    }
    expect(turn).toBeGreaterThan(0.24);
    expect(progress).toBe(0);
  });

  test("re-grabbing starts from the painted scale and converges to the same lift every time", () => {
    for (const resting of [0.79, 1, 1.15]) {
      let scale = resting;
      for (let grab = 0; grab < 12; grab++) {
        expect(liftScale(scale, resting, -2)).toBeCloseTo(scale, 10);
        const lifted = liftScale(scale, resting, 350);
        expect(lifted).toBeCloseTo(resting * 1.32, 10);
        scale = resting + springOffset(lifted - resting, 0, 8);
      }
    }
  });

  test("a drop inherits release velocity, overshoots gently, and settles at the exact slot", () => {
    const distance = 1.4;
    const velocity = -3;
    expect(springOffset(distance, velocity, 0)).toBe(distance);
    expect((springOffset(distance, velocity, 0.01) - distance) / 0.00001).toBeCloseTo(velocity, 2);
    const samples = Array.from({ length: 72 }, (_, index) => springOffset(distance, velocity, index * 10));
    expect(Math.min(...samples)).toBeLessThan(-0.03);
    expect(Math.min(...samples)).toBeGreaterThan(-0.12);
    expect(Math.abs(springOffset(distance, velocity, SETTLE_MS - 1))).toBeLessThan(0.001);
    expect(springOffset(distance, velocity, SETTLE_MS)).toBe(0);
  });
});
