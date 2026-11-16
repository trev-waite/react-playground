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

export const FLIGHT_STEP = 1.2;

/**
 * The progress values a stepped preview lays out at: both ends, and even stops
 * between them where neither side changes by more than `FLIGHT_STEP`. Between
 * stops only the scale changes, so a canvas redraws a few times per flight.
 */
export function flightStops(tile: Size, page: Size): number[] {
  const change = (a: number, b: number) => Math.max(a / b, b / a);
  const most = Math.max(change(tile.width, page.width), change(tile.height, page.height));
  const step = most ** (1 / Math.ceil(Math.log(most) / Math.log(FLIGHT_STEP)));
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
 * The nearest stop, except within a step of either end, where that end's layout
 * is used: the layout a card lands on goes in while it is still moving. A
 * flight with one stop between its ends would skip it, so it takes the nearest.
 */
export function stopAt(stops: readonly number[], progress: number): number {
  if (stops.length > 3) {
    if (progress <= stops[1]!) return 0;
    if (progress >= stops.at(-2)!) return 1;
  }
  return stops.reduce((nearest, stop) => (Math.abs(stop - progress) < Math.abs(nearest - progress) ? stop : nearest));
}

export function heldLayout(layout: Size, area: Size): FitLayout {
  return { width: layout.width, height: layout.height, scale: Math.min(area.width / layout.width, area.height / layout.height) };
}

type End = "tile" | "page";

type FitFlight = {
  /** From tile (0) to page (1). The stage's padding moves with it. */
  progress: MotionValue;
  /** The card's width and height, which go on springing to rest after `progress` lands. */
  box: readonly [width: MotionValue, height: MotionValue];
  /** The card's size at rest as a tile and as a page, for the current viewport. */
  ends: () => Record<End, Size>;
};

/** How a preview rested at one end, relative to its card so it still holds after a resize. */
type Rest = { pad: Size; spill: number };

type Fit = {
  area: HTMLElement;
  content: HTMLElement;
  width: number;
  height: number;
  /** The layout in place, before any overflow correction. */
  layout: FitLayout;
  spill: number;
  flight: FitFlight | undefined;
  rest: Partial<Record<End, Rest>>;
  canvases: string | null;
  /** A canvas resized with the layout in flight, so the layout moves in steps from then on. */
  stepped: boolean;
  /** The end whose landing layout has gone in while the card springs to rest there. */
  landing: End | null;
};

const fits = new Map<Element, Fit>();
let observer: ResizeObserver | null = null;
const settling = new Set<Fit>();

function spilled({ width, height, scale }: FitLayout, spill: number): FitLayout {
  return spill === 1 ? { width, height, scale } : { width: width * spill, height: height * spill, scale: scale / spill };
}

function inset(card: Size, pad: Size): Size {
  return { width: Math.max(card.width - pad.width, 1), height: Math.max(card.height - pad.height, 1) };
}

function near(a: Size, b: Size, within = 0.5): boolean {
  return Math.abs(a.width - b.width) < within && Math.abs(a.height - b.height) < within;
}

/** Less than a browser can lay out apart. */
const HAIR = 0.05;

/** A landing layout a hair off the measured rest layout stays, rather than be laid out again. */
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
  // Sprung past an end, the morph has still landed there.
  return at <= 0 ? "tile" : at >= 1 ? "page" : at;
}

function moving(fit: Fit): boolean {
  const { flight } = fit;
  return flight ? Boolean(flight.progress.animation) || flight.box.some(value => value.animation) : false;
}

function restAt(flight: FitFlight, rest: Rest, end: End): FitLayout {
  return spilled(restLayout(inset(flight.ends()[end], rest.pad)), rest.spill);
}

/**
 * The stage's padding once the morph rests at `end`, extrapolated from the
 * padding now and at the other end, since the deck moves it with the morph.
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

/** A kept rest is used only while its padding still holds; a footer may have wrapped since. */
function landingLayout(fit: Fit, flight: FitFlight, end: End, area: Size): FitLayout {
  const pad = padAt(fit, flight, end, area);
  const rest = fit.rest[end];
  const landing = rest && near(rest.pad, pad, UNDER_A_LINE) ? restAt(flight, rest, end) : restLayout(inset(flight.ends()[end], pad));
  return near(landing, fit.layout) ? fit.layout : landing;
}

function layoutFor(fit: Fit, progress: Progress): FitLayout {
  const area = { width: fit.width, height: fit.height };
  const { flight, rest } = fit;
  // Landed but still springing: the landing layout goes in once, then only its scale follows.
  const landing = flight && (progress === "tile" || progress === "page") && moving(fit) ? progress : null;
  const arrived = landing !== null && landing !== fit.landing;
  fit.landing = landing;
  if (flight && landing) return heldLayout(arrived ? landingLayout(fit, flight, landing, area) : fit.layout, area);
  if (!flight || typeof progress !== "number") return settledLayout(fit, area);
  // Nothing to blend toward until the preview has rested at both ends.
  if (!rest.tile || !rest.page) return restLayout(area);
  const tile = restAt(flight, rest.tile, "tile");
  const page = restAt(flight, rest.page, "page");
  return flightLayout(area, tile, page, fit.stepped ? stopAt(flightStops(tile, page), progress) : progress);
}

/** Each canvas's pixel size: an attribute, so reading it costs no layout. */
function canvasSizes(content: HTMLElement): string {
  return Array.from(content.querySelectorAll("canvas"), canvas => `${canvas.width}x${canvas.height}`).join();
}

/** A preview lays out every frame of a flight unless a canvas redraws with it; then it steps. */
function watchCanvases(fit: Fit, flying: boolean) {
  if (fit.stepped) return;
  const sizes = flying ? canvasSizes(fit.content) : null;
  if (sizes !== null && fit.canvases !== null && sizes !== fit.canvases) fit.stepped = true;
  fit.canvases = sizes;
}

/**
 * Fits every changed preview in three passes (write sizes, read overflow once,
 * correct), so opening the grid costs one forced layout, not one per card.
 * Rests are kept only from `measured` sizes.
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
 * Coming to rest may leave an area's size as it was, so no resize reports it.
 * These sizes may be stale (a card placed off screen is not laid out), so no
 * rest is kept from them.
 */
function fitSettled() {
  const batch: Fit[] = [];
  for (const fit of settling) {
    if (fits.get(fit.area) !== fit) settling.delete(fit);
    else if (!moving(fit)) {
      settling.delete(fit);
      batch.push(fit);
    }
  }
  // A spring can reach its target a frame before it ends, and ending notifies no listener.
  if (settling.size > 0) frame.render(fitSettled);
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
