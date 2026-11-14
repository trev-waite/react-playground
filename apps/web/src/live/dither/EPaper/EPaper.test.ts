import { describe, expect, test } from "bun:test";
import { atkinson, partialRefresh, refreshLevel } from "./EPaper";

const share = (bits: Uint8Array) => bits.reduce((sum, bit) => sum + bit, 0) / bits.length;

describe("E-Paper dither", () => {
  test("white stays white and black stays black", () => {
    expect(share(atkinson(new Float32Array(64 * 64), 64, 64))).toBe(0);
    expect(share(atkinson(new Float32Array(64 * 64).fill(1), 64, 64))).toBe(1);
  });

  test("a grey becomes a matching share of black pixels", () => {
    for (const grey of [0.25, 0.5, 0.75]) {
      const bits = atkinson(new Float32Array(64 * 64).fill(grey), 64, 64);
      expect(bits.every(bit => bit === 0 || bit === 1)).toBe(true);
      expect(Math.abs(share(bits) - grey)).toBeLessThan(0.08);
    }
  });

  test("a darker grey never yields fewer black pixels", () => {
    const shares = [0.1, 0.3, 0.5, 0.7, 0.9].map(grey => share(atkinson(new Float32Array(48 * 48).fill(grey), 48, 48)));
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });
});

describe("E-Paper refresh", () => {
  test("a quick refresh leaves a ghost of the old page", () => {
    const from = Float32Array.from([1, 0, 1, 0]);
    const target = Uint8Array.from([0, 1, 1, 0]);
    const rest = partialRefresh(from, target, 0.2);
    expect([...rest].map(level => Number(level.toFixed(3)))).toEqual([0.2, 0.8, 1, 0]);
  });

  test("ghosts fade with every further quick refresh", () => {
    const blank = Uint8Array.from([0]);
    const once = partialRefresh(Float32Array.from([1]), blank, 0.2);
    const twice = partialRefresh(once, blank, 0.2);
    expect(twice[0]!).toBeLessThan(once[0]!);
    expect(twice[0]!).toBeGreaterThan(0);
  });

  test("with no ghosting a quick refresh lands on the target", () => {
    expect([...partialRefresh(Float32Array.from([1, 0]), Uint8Array.from([0, 1]), 0)]).toEqual([0, 1]);
  });

  test("a quick refresh drives straight from the old level to the goal", () => {
    expect(refreshLevel("partial", 0.2, 0.8, 0)).toBeCloseTo(0.2);
    expect(refreshLevel("partial", 0.2, 0.8, 0.5)).toBeCloseTo(0.5);
    expect(refreshLevel("partial", 0.2, 0.8, 1)).toBeCloseTo(0.8);
  });

  test("a full refresh swings through black and white, wherever the pixel started", () => {
    for (const from of [0, 0.3, 1]) {
      expect(refreshLevel("full", from, 1, 0)).toBeCloseTo(from);
      expect(refreshLevel("full", from, 1, 1 / 3)).toBeCloseTo(1);
      expect(refreshLevel("full", from, 1, 2 / 3)).toBeCloseTo(0);
      expect(refreshLevel("full", from, 1, 1)).toBeCloseTo(1);
      expect(refreshLevel("full", from, 0, 1)).toBeCloseTo(0);
    }
  });
});
