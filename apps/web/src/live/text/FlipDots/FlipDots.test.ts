import { describe, expect, test } from "bun:test";
import { COLUMNS, ROWS, clockMessage, layoutMessage } from "./FlipDots";

function litRows(discs: Uint8Array): number[] {
  const rows = new Set<number>();
  discs.forEach((lit, index) => {
    if (lit) rows.add(Math.floor(index / COLUMNS));
  });
  return [...rows].sort((a, b) => a - b);
}

function litColumns(discs: Uint8Array): number[] {
  const columns = new Set<number>();
  discs.forEach((lit, index) => {
    if (lit) columns.add(index % COLUMNS);
  });
  return [...columns].sort((a, b) => a - b);
}

const count = (discs: Uint8Array) => discs.reduce((sum, lit) => sum + lit, 0);

describe("Flip Dots layout", () => {
  test("a single line sits in the middle of the board", () => {
    const discs = layoutMessage("I");
    expect(discs.length).toBe(COLUMNS * ROWS);
    expect(count(discs)).toBe(11);
    expect(litRows(discs)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(litColumns(discs)).toEqual([14, 15, 16]);
  });

  test("two lines leave a dark row above, between, and below", () => {
    const rows = litRows(layoutMessage("HELLO\nTHERE"));
    expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  });

  test("a full line leaves a dark column at each edge and between letters", () => {
    const columns = litColumns(layoutMessage("HHHHH"));
    expect(columns[0]).toBe(1);
    expect(columns.at(-1)).toBe(COLUMNS - 2);
    expect(columns).not.toContain(6);
  });

  test("lowercase reads the same, and letters past the fifth are dropped", () => {
    expect(layoutMessage("hello")).toEqual(layoutMessage("HELLO"));
    expect(layoutMessage("HELLOWORLD")).toEqual(layoutMessage("HELLO"));
  });

  test("a character the sign has no glyph for leaves its cell dark", () => {
    expect(count(layoutMessage("~"))).toBe(0);
  });
});

describe("Flip Dots clock", () => {
  test("shows the time over the date, padded to the board's five characters", () => {
    expect(clockMessage(new Date(2026, 10, 13, 9, 5))).toBe("09:05\n13NOV");
    expect(clockMessage(new Date(2027, 0, 2, 23, 59))).toBe("23:59\n02JAN");
  });

  test("every character of the clock has a glyph", () => {
    for (let month = 0; month < 12; month++) {
      const [time, date] = clockMessage(new Date(2026, month, 28, 14, 36)).split("\n");
      for (const character of `${time}${date}`) {
        expect(count(layoutMessage(character)), character).toBeGreaterThan(0);
      }
    }
  });
});
