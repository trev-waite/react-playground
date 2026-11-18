import type { Rect } from "./deckLayout";

/** How far past the screen's top and bottom edges, in screens, a grid card still counts as near. */
const GRID_REACH = 0.5;

/** The grid's visible band: where it is scrolled to and how tall the screen is. */
export type GridWindow = { rects: readonly Rect[]; top: number; height: number };

/** Where the reader is: on a page, in the grid, or watching the camera fly between them. */
export type DeckPlace =
  | { layout: "pages"; index: number }
  | { layout: "grid"; grid: GridWindow }
  | { layout: "flight" };

function inWindow({ rects, top, height }: GridWindow, index: number): boolean {
  const rect = rects[index];
  if (!rect) return false;
  const margin = height * GRID_REACH;
  return rect.y + rect.height > top - margin && rect.y < top + height + margin;
}

/**
 * The cards to render at once: the page in view and those either side of it,
 * or the grid cards on or near the screen. A flight mounts nothing: a first
 * render there would stall the camera, so a card not yet warm flies as its
 * tile and fills in once the camera lands.
 */
export function nearCards(place: DeckPlace, count: number): Set<number> {
  if (place.layout === "flight") return new Set();
  if (place.layout === "pages") {
    return new Set([place.index - 1, place.index, place.index + 1].filter(index => index >= 0 && index < count));
  }
  return new Set(Array.from({ length: count }, (_, index) => index).filter(index => inWindow(place.grid, index)));
}

/** How far a card is from the reader: in pages, or from the middle of the grid's screen. */
function distance(place: Exclude<DeckPlace, { layout: "flight" }>, index: number): number {
  if (place.layout === "pages") return Math.abs(index - place.index);
  const rect = place.grid.rects[index];
  if (!rect) return Infinity;
  return Math.abs(rect.y + rect.height / 2 - (place.grid.top + place.grid.height / 2));
}

export function nextToWarm(place: DeckPlace, count: number, isWarm: (index: number) => boolean): number | null {
  if (place.layout === "flight") return null;
  const reach = place.layout === "pages" ? 2 : place.grid.height * 1.5;
  let best: number | null = null;
  let closest = Infinity;
  for (let index = 0; index < count; index++) {
    if (isWarm(index)) continue;
    const away = distance(place, index);
    if (away <= reach && away < closest) {
      closest = away;
      best = index;
    }
  }
  return best;
}
