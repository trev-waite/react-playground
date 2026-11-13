import { describe, expect, test } from "bun:test";
import { SYNODIC_MONTH, bayerThreshold, illumination, moonAge, phaseName } from "./MoonPhase";

/** Days between two ages on the lunar cycle, the short way round. */
function apart(a: number, b: number): number {
  const gap = Math.abs(a - b) % SYNODIC_MONTH;
  return Math.min(gap, SYNODIC_MONTH - gap);
}

describe("Moon Phase ephemeris", () => {
  test("eclipses fall on the new and full moons it predicts", () => {
    const solarEclipse = moonAge(new Date("2024-04-08T18:21:00Z"));
    const lunarEclipse = moonAge(new Date("2025-03-14T06:55:00Z"));
    const earlierSolarEclipse = moonAge(new Date("2017-08-21T18:30:00Z"));
    expect(apart(solarEclipse, 0)).toBeLessThan(0.75);
    expect(apart(earlierSolarEclipse, 0)).toBeLessThan(0.75);
    expect(apart(lunarEclipse, SYNODIC_MONTH / 2)).toBeLessThan(0.75);
  });

  test("the age climbs a day per day and wraps after a lunation", () => {
    const start = new Date("2026-11-13T12:00:00Z");
    const nextDay = new Date(start.getTime() + 86_400_000);
    const nextMonth = new Date(start.getTime() + SYNODIC_MONTH * 86_400_000);
    expect(apart(moonAge(nextDay), moonAge(start) + 1)).toBeLessThan(1e-6);
    expect(apart(moonAge(nextMonth), moonAge(start))).toBeLessThan(1e-6);
  });

  test("the lit share runs from none at new to all at full and back", () => {
    expect(illumination(0)).toBeCloseTo(0);
    expect(illumination(SYNODIC_MONTH / 4)).toBeCloseTo(0.5);
    expect(illumination(SYNODIC_MONTH / 2)).toBeCloseTo(1);
    expect(illumination((SYNODIC_MONTH * 3) / 4)).toBeCloseTo(0.5);
  });

  test("names the eight phases in order through the month", () => {
    const names = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 0.995].map(turn => phaseName(turn * SYNODIC_MONTH));
    expect(names).toEqual([
      "New Moon",
      "Waxing Crescent",
      "First Quarter",
      "Waxing Gibbous",
      "Full Moon",
      "Waning Gibbous",
      "Last Quarter",
      "Waning Crescent",
      "New Moon",
    ]);
  });
});

describe("Moon Phase dither", () => {
  const tile = Array.from({ length: 64 }, (_, index) => bayerThreshold(index % 8, Math.floor(index / 8)));

  test("the 8×8 tile holds 64 evenly spaced thresholds", () => {
    const sorted = [...tile].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 64 }, (_, rank) => (rank + 0.5) / 64));
  });

  test("the tile repeats every eight pixels", () => {
    expect(bayerThreshold(11, 21)).toBe(bayerThreshold(3, 5));
  });

  test("a brightness lights that share of the pixels", () => {
    for (const brightness of [0.125, 0.25, 0.5, 0.875]) {
      const lit = tile.filter(threshold => brightness > threshold).length;
      expect(lit).toBe(brightness * 64);
    }
  });

  test("neighbors differ at half brightness, the checkerboard a dither is known by", () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 7; x++) {
        expect(0.5 > bayerThreshold(x, y)).not.toBe(0.5 > bayerThreshold(x + 1, y));
      }
    }
  });
});
