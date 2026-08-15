import { describe, expect, test } from "bun:test";
import {
  applyStep,
  logScale,
  proximityGain,
  resolvePosition,
  resolveValue,
} from "./scales";

describe("applyStep", () => {
  test("clamps without a step", () => {
    expect(applyStep(150, 0, 100)).toBe(100);
    expect(applyStep(-4, 0, 100)).toBe(0);
  });

  test("snaps to the nearest step", () => {
    expect(applyStep(43, 0, 100, 5)).toBe(45);
    expect(applyStep(42, 0, 100, 5)).toBe(40);
  });
});

describe("logScale", () => {
  test("round-trips position and value", () => {
    const scale = logScale(20, 2000);
    const value = resolveValue(0.5, { ...scale, min: 20, max: 2000 });
    const t = resolvePosition(value, { ...scale, min: 20, max: 2000 });
    expect(t).toBeCloseTo(0.5, 8);
  });

  test("rejects non-positive bounds", () => {
    expect(() => logScale(0, 10)).toThrow();
  });
});

describe("proximityGain", () => {
  test("peaks at the pointer and falls off", () => {
    expect(proximityGain(0, 5)).toBe(1);
    expect(proximityGain(5, 5)).toBeLessThan(0.7);
    expect(proximityGain(20, 5)).toBeLessThan(0.01);
  });
});
