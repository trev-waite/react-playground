import { describe, expect, test } from "bun:test";
import { canScroll } from "./sheetTouch";

const box = (scrollTop: number, scrollLeft = 0) => ({
  scrollTop,
  scrollLeft,
  clientHeight: 400,
  scrollHeight: 1000,
  clientWidth: 300,
  scrollWidth: 300,
});

describe("canScroll", () => {
  test("a long file scrolls either way from the middle", () => {
    expect(canScroll(box(200), 0, -30)).toBe(true);
    expect(canScroll(box(200), 0, 30)).toBe(true);
  });

  test("at the top a pull down has nowhere to go, so the page must not take it", () => {
    expect(canScroll(box(0), 0, 30)).toBe(false);
    expect(canScroll(box(0), 0, -30)).toBe(true);
  });

  test("at the bottom a push up has nowhere to go", () => {
    expect(canScroll(box(600), 0, -30)).toBe(false);
    expect(canScroll(box(600), 0, 30)).toBe(true);
  });

  test("a file shorter than the pane never scrolls", () => {
    const short = { ...box(0), scrollHeight: 400 };
    expect(canScroll(short, 0, -30)).toBe(false);
    expect(canScroll(short, 0, 30)).toBe(false);
  });

  test("a mostly sideways move asks the sideways axis", () => {
    const wide = { ...box(0, 0), scrollWidth: 900 };
    expect(canScroll(wide, -40, 5)).toBe(true);
    expect(canScroll(wide, 40, 5)).toBe(false);
  });
});
