import { describe, expect, test } from "bun:test";
import { measureGaps } from "./analyze";
import type { SheetBox } from "./geometry";
import { snapSpacing } from "./scale";
import { tidy } from "./tidy";

const SIZE = 64;
const square = (id: string, x: number, y: number): SheetBox => ({
  id,
  group: "tiles",
  rect: { x, y, width: SIZE, height: SIZE },
});
const text = (id: string, x: number, y: number, height: number): SheetBox => ({
  id,
  group: "text",
  rect: { x, y, width: 248, height },
});

/** A hand-placed 3×2 grid with a quote and its credit to the right: every gap a little off. */
const messy: SheetBox[] = [
  square("a", 26, 27), square("b", 111, 25), square("c", 198, 29),
  square("d", 25, 113), square("e", 108, 112), square("f", 195, 115),
  text("quote", 297, 24, 128),
  text("credit", 298, 165, 20),
];

function applied(boxes: SheetBox[]): SheetBox[] {
  const { positions } = tidy(boxes);
  return boxes.map(box => ({ ...box, rect: { ...box.rect, ...positions[box.id]! } }));
}

describe("tidy", () => {
  const plan = tidy(messy);
  const after = applied(messy);
  const at = (id: string) => plan.positions[id]!;

  test("snaps each kind of gap from the user's own average", () => {
    expect(plan.spacing).toEqual({ inset: 24, between: 40, gutters: { tiles: 24, text: 16 } });
  });

  test("puts every gap on the spacing scale", () => {
    for (const gap of measureGaps(after)) expect(gap.value).toBe(snapSpacing(gap.value));
  });

  test("lays the squares on an even grid", () => {
    expect([at("a"), at("b"), at("c")].map(p => p.x)).toEqual([24, 112, 200]);
    expect([at("d"), at("e"), at("f")].map(p => p.x)).toEqual([24, 112, 200]);
    expect(new Set(["a", "b", "c"].map(id => at(id).y))).toEqual(new Set([24]));
    expect(new Set(["d", "e", "f"].map(id => at(id).y))).toEqual(new Set([112]));
  });

  test("keeps unrelated groups further apart than the gutter", () => {
    expect(at("quote").x - (at("c").x + SIZE)).toBe(40);
  });

  test("aligns related text to one edge, a gutter below", () => {
    expect(at("quote").y).toBe(at("a").y);
    expect(at("credit").x).toBe(at("quote").x);
    expect(at("credit").y).toBe(at("quote").y + 128 + 16);
  });

  test("aligns an item to its edge even with nothing beside it", () => {
    const below = messy.map(box => (box.id === "credit" ? text("credit", 301, 230, 20) : box));
    const positions = tidy(below).positions;
    expect(positions.credit!.x).toBe(positions.quote!.x);
  });

  test("brings a square dragged aside back onto the grid", () => {
    const aside = messy.map(box => (box.id === "b" ? square("b", 140, 25) : box));
    expect(tidy(aside).positions).toEqual(plan.positions);
  });

  test("keeps a gap between groups that is wide on purpose, only snapped", () => {
    const far = messy.map(box =>
      box.id === "quote" ? text("quote", 395, 24, 128) : box.id === "credit" ? text("credit", 396, 165, 20) : box,
    );
    const positions = tidy(far).positions;
    expect(positions.quote!.x - (positions.c!.x + SIZE)).toBe(snapSpacing(395 - 262));
  });

  test("pulls overlapping items apart to the gutter", () => {
    const overlapping = messy.map(box => (box.id === "b" ? square("b", 80, 25) : box));
    const positions = tidy(overlapping).positions;
    expect(positions.b!.x - (positions.a!.x + SIZE)).toBe(24);
  });

  test("is stable: a tidy layout stays put", () => {
    expect(tidy(after).positions).toEqual(plan.positions);
  });
});

test("plans finite positions when a row's gaps are far apart", () => {
  const row = [24, 72, 192].map((x, index): SheetBox => ({ id: `${index}`, rect: { x, y: 24, width: 40, height: 40 } }));
  for (const at of Object.values(tidy(row).positions)) {
    expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
  }
});

test("places an overlapping item from where the item it follows lands", () => {
  // `wide` starts first but is centered after `badge`, so it follows it.
  const boxes: SheetBox[] = [
    { id: "badge", group: "g", rect: { x: 50, y: 24, width: 32, height: 40 } },
    { id: "wide", group: "g", rect: { x: 20, y: 28, width: 120, height: 40 } },
    { id: "tail", group: "g", rect: { x: 164, y: 28, width: 40, height: 40 } },
  ];
  const plan = tidy(boxes);
  const badge = plan.positions.badge!;
  expect(plan.positions.wide!.x - (badge.x + 32)).toBe(plan.spacing.gutters.g!);
});
