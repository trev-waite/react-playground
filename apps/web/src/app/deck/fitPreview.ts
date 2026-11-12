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
  const width = tile.width + (page.width - tile.width) * t;
  const height = tile.height + (page.height - tile.height) * t;
  return { width, height, scale: Math.min(area.width / width, area.height / height) };
}

type Fit = {
  area: HTMLElement;
  content: HTMLElement;
  width: number;
  height: number;
  layout: FitLayout;
  /** The card's morph from tile (0) to page (1). */
  progress: MotionValue | undefined;
  /** The layouts the preview last rested at as a tile and as a page, at one viewport width. */
  rest: { tile?: FitLayout; page?: FitLayout; viewportWidth?: number };
};

const fits = new Map<Element, Fit>();
let observer: ResizeObserver | null = null;

function place(fit: Fit) {
  const { width, height, scale } = fit.layout;
  fit.content.style.width = `${width}px`;
  fit.content.style.height = `${height}px`;
  fit.content.style.transform = scale === 1 ? "" : `scale(${scale})`;
}

/** Where the card is between tile (0) and page (1), or the end it has landed at. */
type Progress = number | "tile" | "page" | undefined;

function progressOf(fit: Fit): Progress {
  const value = fit.progress;
  if (!value) return undefined;
  // A flight that has just started still reads its old end, though the card has begun to move.
  if (value.animation) return value.get();
  if (value.get() === 0) return "tile";
  if (value.get() === 1) return "page";
  return value.get();
}

function layoutFor(fit: Fit, progress: Progress): FitLayout {
  const area = { width: fit.width, height: fit.height };
  const { tile, page } = fit.rest;
  if (typeof progress !== "number" || !tile || !page) return restLayout(area);
  return flightLayout(area, tile, page, progress);
}

/**
 * Fits every changed preview in three passes (write sizes, read overflow once,
 * correct), so opening the grid costs one forced layout, not one per card.
 */
function refit(batch: Fit[]) {
  const progress = batch.map(progressOf);
  batch.forEach((fit, index) => {
    fit.layout = layoutFor(fit, progress[index]);
    place(fit);
  });
  const spills = batch.map(fit => {
    const overflow = fit.content.firstElementChild;
    if (!overflow) return 1;
    return Math.max(
      overflow.scrollWidth / fit.content.clientWidth,
      overflow.scrollHeight / fit.content.clientHeight,
    );
  });
  const viewportWidth = document.documentElement.clientWidth;
  batch.forEach((fit, index) => {
    const spill = spills[index]!;
    if (spill > 1.01) {
      const { width, height, scale } = fit.layout;
      fit.layout = { width: width * spill, height: height * spill, scale: scale / spill };
      place(fit);
    }
    const end = progress[index];
    if (end !== "tile" && end !== "page") return;
    // A resize changes the end not in view too, so a flight toward it falls back to fitting each frame.
    if (fit.rest.viewportWidth !== viewportWidth) fit.rest = { viewportWidth };
    fit.rest[end] = fit.layout;
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

/** Fits `area` again after its content changed but the area did not resize, such as a preview finishing loading. */
export function refitArea(area: Element) {
  const fit = fits.get(area);
  if (fit) refit([fit]);
}

/**
 * Keeps `content` laid out at a readable size and scaled into `area`. Sizes come
 * from layout boxes, never transformed rects, because cards zoom in flight.
 * `progress` is the card's morph from tile (0) to page (1); with it, a preview
 * in flight blends between the layouts it rests at.
 */
export function observeFit(area: HTMLElement, content: HTMLElement, progress?: MotionValue): () => void {
  const width = Math.max(area.clientWidth, 1);
  const height = Math.max(area.clientHeight, 1);
  const fit: Fit = { area, content, width, height, layout: restLayout({ width, height }), progress, rest: {} };
  fits.set(area, fit);
  refit([fit]);
  sharedObserver().observe(area);
  // Landing may leave the area's size as it was a frame before, so no resize reports the rest.
  const unsubscribe = progress?.on(value => {
    if (value !== 0 && value !== 1) return;
    frame.render(() => {
      if (fits.get(area) === fit) refit([fit]);
    });
  });
  return () => {
    unsubscribe?.();
    fits.delete(area);
    observer?.unobserve(area);
  };
}
