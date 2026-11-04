import { describe, expect, test } from "bun:test";
import { snapLineHeight, snapSpacing, typicalGap } from "./scale";

describe("snapSpacing", () => {
  test("rounds to the 8px scale", () => {
    expect(snapSpacing(21.6)).toBe(24);
    expect(snapSpacing(34)).toBe(32);
    expect(snapSpacing(37)).toBe(40);
    expect(snapSpacing(6)).toBe(8);
  });

  test("keeps small gaps at 2 or 4", () => {
    expect(snapSpacing(2.4)).toBe(2);
    expect(snapSpacing(3)).toBe(4);
    expect(snapSpacing(5)).toBe(4);
    expect(snapSpacing(0.4)).toBe(0);
  });
});

describe("snapLineHeight", () => {
  test("lands on a 4px baseline", () => {
    expect(snapLineHeight(22, 1.38)).toBe(32);
    expect(snapLineHeight(16, 1.5)).toBe(24);
  });

  test("never sets solid type tighter than its size", () => {
    expect(snapLineHeight(22, 0.8)).toBe(24);
  });
});

describe("typicalGap", () => {
  test("averages gaps that are close together", () => {
    expect(typicalGap([20, 22, 24])).toBe(22);
  });

  test("ignores an item dragged far aside or into an overlap", () => {
    expect(typicalGap([21, 22, 23, 54, 0])).toBe(22);
  });
});
