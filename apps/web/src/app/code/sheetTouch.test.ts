import { describe, expect, test } from "bun:test";
import { sheetGesture } from "./sheetTouch";

/** A code pane 400px tall over 1000px of code, `scrollTop` down; `wide` overflows sideways too. */
const pane = (scrollTop: number, wide = false) => ({
  scrollTop,
  scrollLeft: 0,
  clientHeight: 400,
  scrollHeight: 1000,
  clientWidth: 300,
  scrollWidth: wide ? 900 : 300,
});

/** Runs a finger's moves through a fresh gesture; the result says which moves were let through. */
function swipe(moves: [number, number][], box: ReturnType<typeof pane> | null) {
  const gesture = sheetGesture();
  gesture.start();
  return moves.map(([dx, dy]) => gesture.move(dx, dy, box));
}

describe("a finger on the code sheet", () => {
  test("a sideways wobble at the start of a scroll down a long file is never cancelled", () => {
    expect(swipe([[1, 0], [1, -3], [0, -12], [0, -20]], pane(200))).toEqual([true, true, true, true]);
  });

  test("a diagonal drift mid-scroll keeps scrolling the axis the pane can scroll", () => {
    expect(swipe([[0, -12], [14, -10], [12, -6]], pane(200))).toEqual([true, true, true]);
  });

  test("at the top, a pull down is held so the page under the sheet stays put", () => {
    expect(swipe([[0, 12], [0, 20]], pane(0))).toEqual([false, false]);
  });

  test("at the bottom, a push up is held", () => {
    expect(swipe([[0, -12], [0, -20]], pane(600))).toEqual([false, false]);
  });

  test("a scroll that reaches the end mid-gesture is held from then on", () => {
    const gesture = sheetGesture();
    gesture.start();
    expect(gesture.move(0, -12, pane(580))).toBe(true);
    expect(gesture.move(0, -12, pane(600))).toBe(false);
  });

  test("a file shorter than the pane holds every move past the slop", () => {
    const short = { ...pane(0), scrollHeight: 400 };
    expect(swipe([[0, -12], [0, 12]], short)).toEqual([false, false]);
  });

  test("a row that scrolls only sideways takes a sideways swipe despite vertical drift", () => {
    const tabs = { scrollTop: 0, scrollLeft: 0, clientHeight: 52, scrollHeight: 52, clientWidth: 300, scrollWidth: 700 };
    expect(swipe([[0, 3], [-6, 2], [-12, 4], [-10, 6]], tabs)).toEqual([true, true, true, true]);
  });

  test("a pane that scrolls both ways follows the finger's main direction", () => {
    expect(swipe([[-12, -3], [-10, -2]], pane(200, true))).toEqual([true, true]);
  });

  test("a move with no scroll area under it is held, small or large", () => {
    expect(swipe([[0, 2], [0, 20]], null)).toEqual([false, false]);
  });
});
