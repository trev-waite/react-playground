import { describe, expect, test } from "bun:test";
import { advanceTrack, mulberry32, type Track } from "./BubbleChamber";

function track(overrides: Partial<Track> = {}): Track {
  return { x: 0, y: 0, heading: 0, momentum: 100, charge: 1, range: Infinity, stopBelow: 0, ...overrides };
}

function travel(particle: Track, distance: number, field: number, step = 0.05) {
  for (let moved = 0; moved < distance - 1e-9; moved += step) advanceTrack(particle, step, field);
}

describe("Bubble Chamber tracks", () => {
  test("the field bends a track into a circle of radius momentum over field", () => {
    const particle = track({ momentum: 100 });
    travel(particle, (Math.PI * 50) / 2, 2);
    expect(particle.heading).toBeCloseTo(Math.PI / 2, 2);
    expect(particle.x).toBeCloseTo(50, 0);
    expect(particle.y).toBeCloseTo(50, 0);
  });

  test("opposite charges curl opposite ways", () => {
    const positive = track({ charge: 1 });
    const negative = track({ charge: -1 });
    travel(positive, 40, 1);
    travel(negative, 40, 1);
    expect(positive.y).toBeGreaterThan(0);
    expect(negative.y).toBeCloseTo(-positive.y, 6);
    expect(negative.x).toBeCloseTo(positive.x, 6);
  });

  test("with no field a track runs straight", () => {
    const particle = track({ heading: 0.3 });
    travel(particle, 80, 0);
    expect(particle.heading).toBe(0.3);
    expect(Math.hypot(particle.x, particle.y)).toBeCloseTo(80, 3);
  });

  test("a track sheds momentum over its range", () => {
    const particle = track({ range: 200 });
    travel(particle, 200, 1);
    expect(particle.momentum).toBeCloseTo(100 / Math.E, 1);
  });

  test("a slowing track winds inward as a spiral instead of closing its circle", () => {
    const particle = track({ momentum: 60, range: 300 });
    let widest = 0;
    let turnsBy300 = 0;
    for (let moved = 0; moved < 900; moved += 0.5) {
      advanceTrack(particle, 0.5, 1);
      widest = Math.max(widest, Math.hypot(particle.x, particle.y));
      if (moved === 300) turnsBy300 = particle.heading;
    }
    expect(widest).toBeLessThan(2 * 60);
    expect(particle.heading - turnsBy300).toBeGreaterThan(turnsBy300 * 2);
  });
});

describe("Bubble Chamber generator", () => {
  test("the same seed gives the same picture", () => {
    const first = mulberry32(7);
    const second = mulberry32(7);
    const other = mulberry32(8);
    const draws = Array.from({ length: 50 }, () => first());
    expect(Array.from({ length: 50 }, () => second())).toEqual(draws);
    expect(Array.from({ length: 50 }, () => other())).not.toEqual(draws);
    expect(draws.every(value => value >= 0 && value < 1)).toBe(true);
  });
});
