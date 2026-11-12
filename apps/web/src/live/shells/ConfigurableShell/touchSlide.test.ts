import { describe, expect, test } from "bun:test";
import { TOUCH_SLOP, touchIntent } from "./touchSlide";

describe("touch on a slider", () => {
  test("waits until the finger passes the slop", () => {
    expect(touchIntent(TOUCH_SLOP - 1, 0)).toBeNull();
    expect(touchIntent(3, -3)).toBeNull();
  });

  test("a mostly sideways move slides, even with some drift down", () => {
    expect(touchIntent(TOUCH_SLOP, 0)).toBe("slide");
    expect(touchIntent(-20, 9)).toBe("slide");
  });

  test("a mostly vertical move, or an even diagonal, scrolls", () => {
    expect(touchIntent(4, 12)).toBe("scroll");
    expect(touchIntent(10, 10)).toBe("scroll");
  });
});
