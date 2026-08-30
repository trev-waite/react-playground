import { describe, expect, test } from "bun:test";
import { EditSequence } from "./editSequence";

describe("EditSequence", () => {
  test("keeps the editor dirty when an edit occurs during a save", () => {
    const edits = new EditSequence();
    edits.mark();
    const captured = edits.capture();
    edits.mark();
    expect(edits.isCurrent(captured)).toBe(false);
  });

  test("accepts a saved snapshot when no newer edit exists", () => {
    const edits = new EditSequence();
    edits.mark();
    expect(edits.isCurrent(edits.capture())).toBe(true);
    edits.reset();
    expect(edits.capture()).toBe(0);
  });
});
