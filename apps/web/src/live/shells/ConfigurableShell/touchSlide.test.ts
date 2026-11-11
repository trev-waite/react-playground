import { describe, expect, test } from "bun:test";
import { isSlide, TAP_SLOP } from "./touchSlide";

describe("touch on a slider", () => {
  test("a sideways move past the tap slop slides", () => {
    expect(isSlide(TAP_SLOP, 0)).toBe(true);
    expect(isSlide(-20, 6)).toBe(true);
  });

  test("a jitter stays a tap, and a mostly vertical move stays a scroll", () => {
    expect(isSlide(TAP_SLOP - 1, 0)).toBe(false);
    expect(isSlide(12, 20)).toBe(false);
    expect(isSlide(10, 10)).toBe(false);
  });
});
