import { describe, expect, test } from "bun:test";
import { numberColumns } from "./numberColumns";

describe("numberColumns", () => {
  test("moves only the rightmost digit between carry boundaries", () => {
    expect(numberColumns(10, 11).map(column => column.changed)).toEqual([
      false,
      true,
    ]);
    expect(numberColumns(100, 101).map(column => column.changed)).toEqual([
      false,
      false,
      true,
    ]);
  });

  test("moves every digit affected by a carry", () => {
    expect(numberColumns(19, 20).map(column => column.changed)).toEqual([
      true,
      true,
    ]);
    expect(numberColumns(99, 100).map(column => column.changed)).toEqual([
      true,
      true,
      true,
    ]);
  });

  test("adds a leading column when the number grows", () => {
    expect(numberColumns(9, 10)).toEqual([
      { from: null, to: "1", changed: true },
      { from: "9", to: "0", changed: true },
    ]);
  });
});
