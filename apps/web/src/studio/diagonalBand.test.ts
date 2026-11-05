import { describe, expect, test } from "bun:test";
import {
  bandMaskGradient,
  frostStrength,
  isBandRevealed,
} from "./diagonalBand";

describe("isBandRevealed", () => {
  test("nothing revealed at progress 0", () => {
    for (let i = 0; i < 12; i++) {
      expect(isBandRevealed(i, 0, 12)).toBe(false);
    }
  });

  test("everything revealed at progress 1", () => {
    for (let i = 0; i < 12; i++) {
      expect(isBandRevealed(i, 1, 12)).toBe(true);
    }
  });

  test("opens bottom-left bands first (low indices)", () => {
    expect(isBandRevealed(0, 1 / 12, 12)).toBe(true);
    expect(isBandRevealed(1, 1 / 12, 12)).toBe(false);
    expect(isBandRevealed(0, 0.5, 12)).toBe(true);
    expect(isBandRevealed(5, 0.5, 12)).toBe(true);
    expect(isBandRevealed(6, 0.5, 12)).toBe(false);
  });
});

describe("bandMaskGradient", () => {
  test("uses geometric 45deg and alpha stops", () => {
    const g = bandMaskGradient(0, 4);
    expect(g.startsWith("linear-gradient(45deg,")).toBe(true);
    expect(g.includes("#fff")).toBe(true);
    expect(g.includes("transparent")).toBe(false);
  });

  test("progress 1 is fully transparent (Live hidden)", () => {
    const g = bandMaskGradient(1, 4);
    expect(g.includes("#fff")).toBe(false);
    expect(g.includes("transparent")).toBe(true);
  });

  test("mid progress mixes white and transparent hard stops", () => {
    const g = bandMaskGradient(0.5, 4);
    expect(g.includes("transparent")).toBe(true);
    expect(g.includes("#fff")).toBe(true);
  });
});

describe("frostStrength", () => {
  test("zero at endpoints, peaks mid-transition", () => {
    expect(frostStrength(0)).toBe(0);
    expect(frostStrength(1)).toBe(0);
    expect(frostStrength(0.5)).toBeCloseTo(1, 5);
    expect(frostStrength(0.25)).toBeGreaterThan(0.5);
  });
});
