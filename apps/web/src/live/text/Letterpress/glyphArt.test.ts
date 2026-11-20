import { expect, test } from "bun:test";
import { outlineFromAlpha } from "./glyphArt";

test("glyph contours join solid rows, leave holes open and separate diagonal islands", () => {
  const rows = ["###.", "#.#.", "###.", "...#"];
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (const [y, row] of rows.entries()) {
    for (const [x, pixel] of Array.from(row).entries()) {
      if (pixel === "#") data[(y * 4 + x) * 4 + 3] = 255;
    }
  }
  expect(outlineFromAlpha({ data, width: 4, height: 4 })).toBe(
    "M0 0L3 0L3 3L0 3ZM2 1L1 1L1 2L2 2ZM3 3L4 3L4 4L3 4Z",
  );
});
