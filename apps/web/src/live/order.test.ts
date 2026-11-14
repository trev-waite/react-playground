import { describe, expect, test } from "bun:test";
import { GRID_GAP, GRID_MAX_WIDTH, GRID_TOP, gridColumns, gridGutter, gridLayout } from "../app/deck/deckLayout";
import { readLiveCards } from "../../vite/liveCards";

const VIEWPORT_WIDTHS = [402, 800, 1280];

/** Every empty cell a later card could have filled: any above the last row, and any in it with a card to its right. */
async function holes(viewportWidth: number): Promise<{ columns: number; holes: string[] }> {
  const cards = await readLiveCards(import.meta.dir);
  const gutter = gridGutter(viewportWidth);
  const room = viewportWidth - gutter * 2;
  const width = Math.min(GRID_MAX_WIDTH, room);
  const columns = gridColumns(width);
  const step = (width - GRID_GAP * (columns - 1)) / columns + GRID_GAP;
  const left = gutter + (room - width) / 2;

  const grid: (string | undefined)[][] = [];
  gridLayout(
    cards.map(card => card.size),
    { width: viewportWidth, height: 800 },
  ).rects.forEach((rect, index) => {
    const column = Math.round((rect.x - left) / step);
    const row = Math.round((rect.y - GRID_TOP) / step);
    for (let r = row; r < row + Math.round((rect.height + GRID_GAP) / step); r++) {
      grid[r] ??= [];
      for (let c = column; c < column + Math.round((rect.width + GRID_GAP) / step); c++) grid[r]![c] = cards[index]!.slug;
    }
  });

  const found = grid.flatMap((row, index) =>
    Array.from({ length: columns }, (_, column) => column)
      .filter(column => !row[column] && (index < grid.length - 1 || row.slice(column + 1).some(Boolean)))
      .map(column => `row ${index + 1}, column ${column + 1} is empty (row holds ${[...new Set(row.filter(Boolean))].join(", ")})`),
  );
  return { columns, holes: found };
}

describe("Live card order", () => {
  test.each(VIEWPORT_WIDTHS)("packs the grid without a hole at a %ipx viewport", async viewportWidth => {
    const { columns, holes: found } = await holes(viewportWidth);
    expect(found.map(hole => `${columns} columns: ${hole}`)).toEqual([]);
  });

  test("covers every column count the grid uses", () => {
    const counts = VIEWPORT_WIDTHS.map(width => gridColumns(Math.min(GRID_MAX_WIDTH, width - gridGutter(width) * 2)));
    expect(counts.toSorted()).toEqual([2, 3, 4]);
  });
});
