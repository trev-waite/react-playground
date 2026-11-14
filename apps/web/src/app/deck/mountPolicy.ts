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
function distance(place: DeckPlace, index: number): number {
  if (place.layout === "pages") return Math.abs(index - place.index);
  if (place.layout === "flight") return index;
  const rect = place.grid.rects[index];
  if (!rect) return Infinity;
  return Math.abs(rect.y + rect.height / 2 - (place.grid.top + place.grid.height / 2));
}

/**
 * The nearest card not mounted yet, to mount in the next quiet moment; null
 * in flight, or once every card is. Every card warms in the end, so later
 * swipes and flights never pay for a first render.
 */
export function nextToWarm(place: DeckPlace, count: number, isWarm: (index: number) => boolean): number | null {
  if (place.layout === "flight") return null;
  let best: number | null = null;
  for (let index = 0; index < count; index++) {
    if (isWarm(index)) continue;
    if (best === null || distance(place, index) < distance(place, best)) best = index;
  }
  return best;
}
