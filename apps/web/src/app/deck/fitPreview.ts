import { frame } from "../motion/frameLoop";
import type { MotionValue } from "../motion/motionValue";
import type { Size } from "./deckLayout";

/** Previews lay out in at least this square, then scale down to fit a small tile. */
export const PREVIEW_MIN_SIZE = 320;

/** Scale for a preview area before any overflow correction. Never enlarges. */
export function previewScale(width: number, height: number): number {
  return Math.min(1, Math.max(width, 1) / PREVIEW_MIN_SIZE, Math.max(height, 1) / PREVIEW_MIN_SIZE);
}

/**
 * The one width a family lays out at, as a tile and as a page, so its members
 * never rewrap in the flight between. A narrower stage in flight scales it down.
 */
export function familyLayoutWidth(tileArea: Size, pageAreaWidth: number): number {
  return Math.min(pageAreaWidth, Math.max(tileArea.width, 1) / previewScale(tileArea.width, tileArea.height));
}

/** The size a preview lays out at, and the scale that draws that layout in its area. */
export type FitLayout = Size & { scale: number };

/** A preview at rest: laid out at the area, or at least `PREVIEW_MIN_SIZE`, and scaled down to fit. */
export function restLayout(area: Size): FitLayout {
  const scale = previewScale(area.width, area.height);
  return { width: area.width / scale, height: area.height / scale, scale };
}

/**
 * A preview in flight lays out partway between its tile and page layouts, by
 * the card's own progress, and scales to fit the area it has. Fitting each
 * frame on its own instead lets content that gives way to a short stage
 * squeeze in flight, then pop back once its scale drops below 1.
 */
export function flightLayout(area: Size, tile: Size, page: Size, progress: number): FitLayout {
  const t = Math.min(1, Math.max(0, progress));
  // Weighted, not `tile + (page - tile) * t`: each end comes out exact, so landing lays nothing out again.
  const width = tile.width * (1 - t) + page.width * t;
  const height = tile.height * (1 - t) + page.height * t;
  return { width, height, scale: Math.min(area.width / width, area.height / height) };
}

/** The most either side of a stepped preview's layout changes from one stop to the next. */
export const FLIGHT_STEP = 1.2;

/**
 * The progress values a stepped preview lays out at: its two rest layouts and
 * stops between them, each as far from the last as either side may change.
 * The step is evened out for the side that changes most, so the stops are
 * equal for it and no closer than they need be. Between stops only the scale
 * changes, which the compositor draws, so a canvas that redraws on resize
 * does so a handful of times per flight, not every frame, and its last
 * relayout is the layout it lands on.
 */
export function flightStops(tile: Size, page: Size): number[] {
  const change = (a: number, b: number) => Math.max(a / b, b / a);
  const most = Math.max(change(tile.width, page.width), change(tile.height, page.height));
  const step = most ** (1 / Math.ceil(Math.log(most) / Math.log(FLIGHT_STEP)));
  /** The progress at which a side has changed by one step from where it is at `from`. */
  const reach = (tileSide: number, pageSide: number, from: number) => {
    if (tileSide === pageSide) return Infinity;
    const side = tileSide * (1 - from) + pageSide * from;
    return ((pageSide > tileSide ? side * step : side / step) - tileSide) / (pageSide - tileSide);
  };
  const stops = [0];
  for (let stop = 0; ; ) {
    const next = Math.min(reach(tile.width, page.width, stop), reach(tile.height, page.height, stop));
    // The last even step lands on the page, give or take rounding.
    if (!(next > stop) || next > 1 - 1e-9) break;
    stops.push((stop = next));
  }
  return [...stops, 1];
}

/**
 * The stop a stepped preview lays out at when its card is at `progress`: the
 * nearest, except within a step of either end, where the end's own layout is
 * in place. So nothing is laid out as the card takes off, and the layout it
 * lands on goes in a whole step before it arrives, while it is still moving.
 * A flight with a single stop between its ends has no room for that without
 * passing the stop over, and no need: its steps are long, so the nearest
 * stop changes well short of either end.
 */
export function stopAt(stops: readonly number[], progress: number): number {
  if (stops.length > 3) {
    if (progress <= stops[1]!) return 0;
    if (progress >= stops.at(-2)!) return 1;
  }
  return stops.reduce((nearest, stop) => (Math.abs(stop - progress) < Math.abs(nearest - progress) ? stop : nearest));
}

/** A layout scaled to fit `area`: the same layout drawn larger or smaller, never laid out again. */
export function heldLayout(layout: Size, area: Size): FitLayout {
  return { width: layout.width, height: layout.height, scale: Math.min(area.width / layout.width, area.height / layout.height) };
}

type End = "tile" | "page";

/** The card's morph, as its preview follows it. */
export type FitFlight = {
  /** From tile (0) to page (1). The stage's padding moves with it, by the same share of the way. */
  progress: MotionValue;
  /** The card's width and height, which go on springing to rest after `progress` lands. */
  box: readonly [width: MotionValue, height: MotionValue];
  /** The card's size at rest as a tile and as a page, as the deck lays them out now. */
  ends: () => Record<End, Size>;
};

/**
 * How a preview rested at one end: how much smaller than its card the stage
 * was, and how far the content overflowed it. Kept against the card, not as a
 * size, so it still holds once the deck lays the card out for a new viewport.
 */
type Rest = { pad: Size; spill: number };

type Fit = {
  area: HTMLElement;
  content: HTMLElement;
  width: number;
  height: number;
  /** The layout in place, before any overflow correction. A fit to the same size only rescales it. */
  layout: FitLayout;
  /** How far the content overflowed `layout`, which is laid out that much larger and drawn that much smaller. */
  spill: number;
  flight: FitFlight | undefined;
  rest: Partial<Record<End, Rest>>;
  /** The pixel sizes of its canvases at the last fit of a flight; null at rest. */
  canvases: string | null;
  /** A canvas was seen to resize with the layout in flight, so the layout moves in steps from then on. */
  stepped: boolean;
  /** The end the card is coming to rest at, once the layout to land on there has gone in; null otherwise. */
  landing: End | null;
};

const fits = new Map<Element, Fit>();
let observer: ResizeObserver | null = null;
/** Previews whose cards moved this frame, fitted together once they are found at rest. */
const settling = new Set<Fit>();

function spilled({ width, height, scale }: FitLayout, spill: number): FitLayout {
  return spill === 1 ? { width, height, scale } : { width: width * spill, height: height * spill, scale: scale / spill };
}

function inset(card: Size, pad: Size): Size {
  return { width: Math.max(card.width - pad.width, 1), height: Math.max(card.height - pad.height, 1) };
}

/** Whether two sizes are the same to within what a settling spring and rounding leave between them. */
function near(a: Size, b: Size, within = 0.5): boolean {
  return Math.abs(a.width - b.width) < within && Math.abs(a.height - b.height) < within;
}

/** Less than a browser can lay out apart. */
const HAIR = 0.05;

/**
 * The layout a preview has where its card rests. A layout worked out from the
 * card on the way in can sit a hair off the one measured here: too little to
 * see, so it stays rather than be laid out once more.
 */
function settledLayout(fit: Fit, area: Size): FitLayout {
  const rest = restLayout(area);
  return near(rest, fit.layout, HAIR) ? { width: fit.layout.width, height: fit.layout.height, scale: rest.scale } : rest;
}

function place(fit: Fit) {
  const { width, height, scale } = spilled(fit.layout, fit.spill);
  fit.content.style.width = `${width}px`;
  fit.content.style.height = `${height}px`;
  // A held layout can be a little off the area's shape; it stays centered in it.
  const x = (fit.width - width * scale) / 2;
  const y = (fit.height - height * scale) / 2;
  const offset = Math.abs(x) > 0.5 || Math.abs(y) > 0.5 ? `translate(${x}px, ${y}px) ` : "";
  fit.content.style.transform = scale === 1 && !offset ? "" : `${offset}scale(${scale})`;
}

/** Where the card is between tile (0) and page (1), or the end it has landed at. */
type Progress = number | End | undefined;

function progressOf(fit: Fit): Progress {
  const at = fit.flight?.progress.get();
  if (at === undefined) return undefined;
  // At an end or sprung past it, the morph has landed, though it may still be easing back to rest there.
  return at <= 0 ? "tile" : at >= 1 ? "page" : at;
}

/** The card has yet to come to rest: its morph or its box is still animating. */
function moving(fit: Fit): boolean {
  const { flight } = fit;
  return flight ? Boolean(flight.progress.animation) || flight.box.some(value => value.animation) : false;
}

/** The layout the preview rests at on `end`, worked out for the card's size there now. */
function restAt(flight: FitFlight, rest: Rest, end: End): FitLayout {
  return spilled(restLayout(inset(flight.ends()[end], rest.pad)), rest.spill);
}

/**
 * The padding the stage will have once the morph rests at `end`, read from
 * the padding it has now. The deck moves the padding in step with the morph,
 * so one measurement, and how the preview rested at the other end, give where
 * it is heading, even while the morph is sprung past its end and the padding
 * with it. It is close, not exact: the footer's height is part of the padding
 * and changes with the card's width. With no other end to go by, the padding
 * now is the best there is.
 */
function padAt(fit: Fit, flight: FitFlight, end: End, area: Size): Size {
  const now = { width: flight.box[0].get() - area.width, height: flight.box[1].get() - area.height };
  const [here, there, from] = end === "page" ? [1, 0, fit.rest.tile] : [0, 1, fit.rest.page];
  const at = flight.progress.get();
  if (!from || at === there) return now;
  const share = (here - there) / (at - there);
  return {
    width: from.pad.width + (now.width - from.pad.width) * share,
    height: from.pad.height + (now.height - from.pad.height) * share,
  };
}

/** Less than a line of footer text, the least a footer that wraps moves the padding by, and more than a sprung morph does. */
const UNDER_A_LINE = 8;

/**
 * The layout to land on, as the morph reaches `end`: where the card will rest
 * gives it. A rest kept from last time serves while its padding still holds;
 * one that does not (a footer that has since wrapped onto another line) is
 * not trusted, and the layout is worked out from the padding instead.
 */
function landingLayout(fit: Fit, flight: FitFlight, end: End, area: Size): FitLayout {
  const pad = padAt(fit, flight, end, area);
  const rest = fit.rest[end];
  const landing = rest && near(rest.pad, pad, UNDER_A_LINE) ? restAt(flight, rest, end) : restLayout(inset(flight.ends()[end], pad));
  return near(landing, fit.layout) ? fit.layout : landing;
}

function layoutFor(fit: Fit, progress: Progress): FitLayout {
  const area = { width: fit.width, height: fit.height };
  const { flight, rest } = fit;
  // The morph has landed, and it and the box spring on for a moment: the layout to land on goes in once, and only its scale follows.
  const landing = flight && (progress === "tile" || progress === "page") && moving(fit) ? progress : null;
  const arrived = landing !== null && landing !== fit.landing;
  fit.landing = landing;
  if (flight && landing) return heldLayout(arrived ? landingLayout(fit, flight, landing, area) : fit.layout, area);
  if (!flight || typeof progress !== "number") return settledLayout(fit, area);
  // An end the preview has not rested at yet gives nothing to blend toward: it fits each frame on its own.
  if (!rest.tile || !rest.page) return restLayout(area);
  const tile = restAt(flight, rest.tile, "tile");
  const page = restAt(flight, rest.page, "page");
  return flightLayout(area, tile, page, fit.stepped ? stopAt(flightStops(tile, page), progress) : progress);
}

/** Each canvas's pixel size: an attribute, so reading it costs no layout. */
function canvasSizes(content: HTMLElement): string {
  return Array.from(content.querySelectorAll("canvas"), canvas => `${canvas.width}x${canvas.height}`).join();
}

/**
 * A preview lays out every frame of a flight, so its content never jumps in
 * size, unless that makes a canvas redraw every frame. A canvas whose pixel
 * size changed between two fits of one flight does: its preview steps.
 */
function watchCanvases(fit: Fit, flying: boolean) {
  if (fit.stepped) return;
  const sizes = flying ? canvasSizes(fit.content) : null;
  if (sizes !== null && fit.canvases !== null && sizes !== fit.canvases) fit.stepped = true;
  fit.canvases = sizes;
}

/**
 * Fits every changed preview in three passes (write sizes, read overflow once,
 * correct), so opening the grid costs one forced layout, not one per card.
 * `measured` says the areas are as the browser last laid them out, which makes
 * them fit to keep as how a preview rests.
 */
function refit(batch: Fit[], { measured = true, newContent = false } = {}) {
  const progress = batch.map(progressOf);
  const relaid = batch.map((fit, index) => {
    const next = layoutFor(fit, progress[index]);
    const changed = newContent || next.width !== fit.layout.width || next.height !== fit.layout.height;
    fit.layout = next;
    if (changed) fit.spill = 1;
    place(fit);
    return changed;
  });
  const spills = batch.map((fit, index) => {
    const overflow = fit.content.firstElementChild;
    // A layout that has not changed overflows as it did.
    if (!overflow || !relaid[index]) return 1;
    return Math.max(
      overflow.scrollWidth / fit.content.clientWidth,
      overflow.scrollHeight / fit.content.clientHeight,
    );
  });
  batch.forEach((fit, index) => {
    const spill = spills[index]!;
    if (spill > 1.01) {
      fit.spill = spill;
      place(fit);
    }
    const end = progress[index];
    watchCanvases(fit, typeof end === "number");
    if (!measured || !fit.flight || (end !== "tile" && end !== "page")) return;
    // Kept once the morph is all but at its end, where the padding read from it is exact; the box may still spring on.
    if (Math.abs(fit.flight.progress.get() - (end === "page" ? 1 : 0)) > 0.001) return;
    fit.rest[end] = { pad: padAt(fit, fit.flight, end, { width: fit.width, height: fit.height }), spill: fit.spill };
  });
}

function sharedObserver(): ResizeObserver {
  observer ??= new ResizeObserver(entries => {
    const batch: Fit[] = [];
    for (const entry of entries) {
      const fit = fits.get(entry.target);
      if (!fit) continue;
      fit.width = Math.max(entry.contentRect.width, 1);
      fit.height = Math.max(entry.contentRect.height, 1);
      batch.push(fit);
    }
    refit(batch);
  });
  return observer;
}

/**
 * Coming to rest may leave an area's size as it was a frame before, so no
 * resize reports it. Every card that stopped this frame is fitted in one pass.
 * The areas are as last reported, and may be about to change: a card the deck
 * has just placed has not been laid out there yet, and one placed off screen
 * is not laid out at all until it nears the screen. So nothing here is kept as
 * how a preview rests; only a resize report is.
 */
function fitSettled() {
  const batch = [...settling].filter(fit => fits.get(fit.area) === fit && !moving(fit));
  settling.clear();
  if (batch.length > 0) refit(batch, { measured: false });
}

/** Fits `area` again after its content changed but the area did not resize, such as a preview finishing loading. */
export function refitArea(area: Element) {
  const fit = fits.get(area);
  if (fit) refit([fit], { newContent: true });
}

/**
 * Keeps `content` laid out at a readable size and scaled into `area`. Sizes come
 * from layout boxes, never transformed rects, because cards zoom in flight.
 * With `flight`, a preview blends between the layouts it rests at as its card
 * morphs: every frame, or in steps once a canvas is seen to redraw for it.
 */
export function observeFit(area: HTMLElement, content: HTMLElement, flight?: FitFlight): () => void {
  const width = Math.max(area.clientWidth, 1);
  const height = Math.max(area.clientHeight, 1);
  const fit: Fit = { area, content, width, height, layout: { width: 0, height: 0, scale: 1 }, spill: 1, flight, rest: {}, canvases: null, stepped: false, landing: null };
  fits.set(area, fit);
  refit([fit]);
  sharedObserver().observe(area);
  const moved = () => {
    settling.add(fit);
    frame.render(fitSettled);
  };
  const unsubscribes = flight ? [flight.progress, ...flight.box].map(value => value.on(moved)) : [];
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    settling.delete(fit);
    fits.delete(area);
    observer?.unobserve(area);
  };
}
