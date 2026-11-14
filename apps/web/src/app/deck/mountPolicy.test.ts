import { describe, expect, test } from "bun:test";
import { gridLayout } from "./deckLayout";
import { nearCards, nextToWarm, type GridWindow } from "./mountPolicy";

const SCREEN = { width: 1440, height: 900 };
const { rects } = gridLayout(Array.from({ length: 40 }, () => "small" as const), SCREEN);
const top: GridWindow = { rects, top: 0, height: SCREEN.height };
const at = (index: number): GridWindow => ({ ...top, top: rects[index]!.y });
const page = (index: number) => ({ layout: "pages" as const, index });
const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe("nearCards", () => {
  test("a page renders itself and the pages either side of it", () => {
    expect(sorted(nearCards(page(5), 40))).toEqual([4, 5, 6]);
    expect(sorted(nearCards(page(0), 40))).toEqual([0, 1]);
    expect(sorted(nearCards(page(39), 40))).toEqual([38, 39]);
  });

  test("the grid renders the cards on screen and half a screen past it, not the rest", () => {
    const near = nearCards({ layout: "grid", grid: top }, 40);
    for (const index of near) expect(rects[index]!.y).toBeLessThan(SCREEN.height * 1.5);
    expect(near.has(0)).toBe(true);
    expect(near.has(39)).toBe(false);
  });

  test("a scrolled grid renders the cards around where it is scrolled", () => {
    const near = nearCards({ layout: "grid", grid: at(24) }, 40);
    expect(near.has(24)).toBe(true);
    expect(near.has(0)).toBe(false);
  });

  test("a flight mounts nothing new, so no first render stalls the camera", () => {
    expect(nearCards({ layout: "flight" }, 40).size).toBe(0);
  });
});

describe("nextToWarm", () => {
  test("warms the nearest page first, then works outward", () => {
    const warm = new Set([5]);
    expect([4, 6]).toContain(nextToWarm(page(5), 40, index => warm.has(index))!);
  });

  test("warms the grid card closest to the middle of the screen", () => {
    const next = nextToWarm({ layout: "grid", grid: at(24) }, 40, () => false)!;
    expect(Math.abs(rects[next]!.y - rects[24]!.y)).toBeLessThan(SCREEN.height);
  });

  test("works through every card in the end, wherever the reader is", () => {
    const warm = new Set<number>();
    for (let step = 0; step < 40; step++) warm.add(nextToWarm(page(20), 40, index => warm.has(index))!);
    expect(warm.size).toBe(40);
    expect(nextToWarm(page(20), 40, index => warm.has(index))).toBeNull();
  });

  test("waits out a flight", () => {
    expect(nextToWarm({ layout: "flight" }, 40, () => false)).toBeNull();
  });
});
