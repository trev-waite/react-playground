import { describe, expect, test } from "bun:test";
import {
  barTargets,
  capsule,
  isSettled,
  neck,
  neckWaist,
  overlapsZone,
  pill,
  spring,
  stepSpring,
  stillConnected,
  valuePillLayout,
  type Zone,
} from "./dockSliderGeometry";

const zone: Zone = { left: 0, right: 40, bottom: 7, top: 21 };

describe("contained value pill", () => {
  test("replaces the top of the bar without increasing the combined height", () => {
    for (const amount of [0, 0.2, 0.6, 1, 1.04]) {
      const layout = valuePillLayout(32, 1.5, amount, 16);
      expect(layout.center + layout.height / 2).toBeCloseTo(32);
      expect(layout.barTop + layout.gap + layout.height).toBeCloseTo(32);
      expect(layout.height).toBeLessThanOrEqual(16);
      expect(layout.barTop).toBeGreaterThanOrEqual(0);
    }
    expect(valuePillLayout(32, 1.5, 0, 16).barTop).toBe(32);
    expect(valuePillLayout(32, 1.5, 1, 16).barTop).toBe(12);
  });

  test("fits the value into the available space above the title", () => {
    const layout = valuePillLayout(32, 1.5, 1.04, 9);
    expect(layout.height).toBe(9);
    expect(layout.center - layout.height / 2).toBe(23);
    expect(layout.barTop).toBe(19);
  });
});

describe("dock slider label clearance", () => {
  test("keeps short bars whole below the label", () => {
    expect(barTargets(4, zone)).toEqual({ lower: 4, gapTop: 4, top: 4 });
    expect(barTargets(7, zone)).toEqual({ lower: 7, gapTop: 7, top: 7 });
  });

  test("drains bars that reach into the label down to a stub", () => {
    expect(barTargets(15, zone)).toEqual({ lower: 7, gapTop: 7, top: 7 });
    expect(barTargets(24, zone)).toEqual({ lower: 7, gapTop: 7, top: 7 });
  });

  test("splits tall bars into pieces below and above the label", () => {
    expect(barTargets(32, zone)).toEqual({ lower: 7, gapTop: 21, top: 32 });
  });

  test("checks the full bar width when clearing the label", () => {
    expect(overlapsZone(41, 1.5, zone)).toBe(true);
    expect(overlapsZone(41.5, 1.5, zone)).toBe(false);
  });
});

describe("liquid joins", () => {
  test("holds a neck while stretching and reconnects only near contact", () => {
    let connected = true;
    connected = stillConnected(connected, 5.9);
    expect(connected).toBe(true);
    connected = stillConnected(connected, 6);
    expect(connected).toBe(false);
    connected = stillConnected(connected, 2);
    expect(connected).toBe(false);
    connected = stillConnected(connected, 1.2);
    expect(connected).toBe(false);
    connected = stillConnected(connected, 1);
    expect(connected).toBe(true);
    expect(stillConnected(connected, 2)).toBe(true);
  });

  test("thins stretched necks and adds a bounded bulge on merging", () => {
    expect(neckWaist(0, 1.5)).toBe(1.5);
    expect(neckWaist(3, 1.5)).toBeGreaterThan(0);
    expect(neckWaist(3, 1.5)).toBeLessThan(1.5);
    expect(neckWaist(6, 1.5)).toBe(0);
    expect(neckWaist(-100, 1.5)).toBeCloseTo(1.5 * 1.45);
    expect(neckWaist(0, 0)).toBe(0);
  });

  test("draws curved bridges and removes them completely on pinch-off", () => {
    const from = { x: 20, y: 10, radius: 1.5 };
    const to = { x: 25, y: 16, radius: 2 };
    const path = neck(from, to, 1, 32);
    expect(path.match(/C/g)).toHaveLength(4);
    expect(path.endsWith("Z")).toBe(true);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(neck(from, to, 0, 32)).toBe("");
  });

  test("handles collapsed and reversed pieces without invalid paths", () => {
    expect(capsule(10, 5, 5, 1.5, 32)).toBe("");
    expect(capsule(10, 7, 5, 1.5, 32)).toBe("");
    expect(capsule(10, 0, 5, 0, 32)).toBe("");
    expect(capsule(10, 0, 1, 1.5, 32)).toContain("A0.50 0.50");
    expect(pill(10, 20, 0, 16, 32)).toBe("");
  });
});

describe("dock slider springs", () => {
  test("settles with only a small rebound even when frames are dropped", () => {
    const state = spring(0);
    let peak = 0;
    for (let i = 0; i < 100; i++) {
      stepSpring(state, 1, 380, 0.76, 0.048);
      peak = Math.max(peak, state.value);
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.04);
    expect(isSettled(state, 1)).toBe(true);
  });

  test("preserves continuity when motion reverses mid-split", () => {
    const state = spring(7);
    stepSpring(state, 21, 420, 0.76, 1 / 60);
    const before = state.value;
    stepSpring(state, 7, 520, 0.76, 1 / 60);
    expect(state.value).toBeGreaterThan(7);
    expect(Math.abs(state.value - before)).toBeLessThan(2);
    for (let i = 0; i < 120; i++) stepSpring(state, 7, 520, 0.76, 1 / 60);
    expect(isSettled(state, 7)).toBe(true);
  });
});
