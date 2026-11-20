import { describe, expect, test } from "bun:test";
import { keptPoem, moveFocus, toggle } from "./poem";

describe("Found Poem", () => {
  const words = "I went to the woods because I wished".split(" ");

  test("the poem keeps the passage's order, however the words were chosen", () => {
    expect(keptPoem(words, new Set([4, 0, 1]))).toEqual([
      { index: 0, text: "I" },
      { index: 1, text: "went" },
      { index: 4, text: "woods" },
    ]);
    expect(keptPoem(words, new Set([99, -1]))).toEqual([]);
  });

  test("a word toggles in and out without touching the set it came from", () => {
    const kept = new Set([1]);
    expect([...toggle(kept, 2)]).toEqual([1, 2]);
    expect([...toggle(kept, 1)]).toEqual([]);
    expect([...kept]).toEqual([1]);
  });

  test("arrow keys walk one word at a time and stop at the ends", () => {
    expect(moveFocus("ArrowRight", 3, 8)).toBe(4);
    expect(moveFocus("ArrowUp", 0, 8)).toBe(0);
    expect(moveFocus("End", 2, 8)).toBe(7);
    expect(moveFocus("Enter", 2, 8)).toBeNull();
  });
});
