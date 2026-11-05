import type { CardSize } from "../../lib/types";

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where a card sits and how it is drawn. `rect` is real layout (the card's
 * content reflows to it); `x`, `y`, and `scale` are a transform on top.
 * `chrome` runs 0 → 1 from grid tile to full page (padding, footer).
 */
export type CardPose = {
  rect: Rect;
  x: number;
  y: number;
  scale: number;
  radius: number;
  chrome: number;
};

/** Keep in sync with the `--page-*` and `--grid-*` tokens in app.css. */
export const PAGE_INSET = 16;
export const PAGE_RADIUS = 32;
export const GRID_RADIUS = 24;
export const GRID_GAP = 16;
export const GRID_TOP = 96;
export const GRID_BOTTOM = 48;
export const GRID_MAX_WIDTH = 1200;
/**
 * Neighbors follow the full camera path but stop growing past this scale.
 * They are off screen either way, and a 4× layer costs a huge raster on the
 * first frame of the zoom.
 */
export const CAMERA_MAX_SCALE = 1.6;

const SPANS: Record<CardSize, { columns: number; rows: number }> = {
  small: { columns: 1, rows: 1 },
  wide: { columns: 2, rows: 1 },
  tall: { columns: 1, rows: 2 },
  large: { columns: 2, rows: 2 },
};

export function gridGutter(viewportWidth: number): number {
  if (viewportWidth >= 1040) return 48;
  if (viewportWidth >= 720) return 32;
  return 16;
}

export function gridColumns(availableWidth: number): number {
  if (availableWidth >= 960) return 4;
  if (availableWidth >= 600) return 3;
  return 2;
}

/**
 * Packs cards into square cells, row by row, each in the first slot it fits
 * (CSS `grid-auto-flow: dense`). Computed here because cards animate between
 * this layout and the full page, so their rects must be known up front.
 */
export function gridLayout(
  sizes: readonly CardSize[],
  viewport: Size,
): { rects: Rect[]; height: number } {
  const gutter = gridGutter(viewport.width);
  const width = Math.min(GRID_MAX_WIDTH, Math.max(0, viewport.width - gutter * 2));
  const columns = gridColumns(width);
  const cell = (width - GRID_GAP * (columns - 1)) / columns;
  const left = (viewport.width - width) / 2;
  const taken: boolean[][] = [];

  const isFree = (row: number, column: number, span: { columns: number; rows: number }) => {
    for (let r = row; r < row + span.rows; r++) {
      for (let c = column; c < column + span.columns; c++) {
        if (taken[r]?.[c]) return false;
      }
    }
    return true;
  };

  let rows = 0;
  const rects = sizes.map(size => {
    const span = {
      columns: Math.min(SPANS[size].columns, columns),
      rows: SPANS[size].rows,
    };
    for (let row = 0; ; row++) {
      for (let column = 0; column + span.columns <= columns; column++) {
        if (!isFree(row, column, span)) continue;
        for (let r = row; r < row + span.rows; r++) {
          taken[r] ??= [];
          for (let c = column; c < column + span.columns; c++) taken[r]![c] = true;
        }
        rows = Math.max(rows, row + span.rows);
        return {
          x: left + column * (cell + GRID_GAP),
          y: GRID_TOP + row * (cell + GRID_GAP),
          width: span.columns * cell + (span.columns - 1) * GRID_GAP,
          height: span.rows * cell + (span.rows - 1) * GRID_GAP,
        };
      }
    }
  });

  const height = rows === 0 ? 0 : GRID_TOP + rows * cell + (rows - 1) * GRID_GAP + GRID_BOTTOM;
  return { rects, height };
}

/** The full-page card, in viewport coordinates. */
export function pageFrame(viewport: Size): Rect {
  return {
    x: PAGE_INSET,
    y: PAGE_INSET,
    width: Math.max(0, viewport.width - PAGE_INSET * 2),
    height: Math.max(0, viewport.height - PAGE_INSET * 2),
  };
}

export function offsetRect(rect: Rect, dy: number): Rect {
  return { ...rect, y: rect.y + dy };
}

/** Scroll that brings `rect` to the middle of the viewport, within the content. */
export function centeredScrollTop(rect: Rect, viewport: Size, contentHeight: number): number {
  const max = Math.max(0, contentHeight - viewport.height);
  const target = rect.y + rect.height / 2 - viewport.height / 2;
  return Math.min(max, Math.max(0, target));
}

export function gridPose(rect: Rect): CardPose {
  return { rect, x: 0, y: 0, scale: 1, radius: GRID_RADIUS, chrome: 0 };
}

export function pagePose(rect: Rect): CardPose {
  return { rect, x: 0, y: 0, scale: 1, radius: PAGE_RADIUS, chrome: 1 };
}

/**
 * A grid tile as seen by a camera zoomed in on `focus` until it covers
 * `frame`. Neighbors scale up with it and land past the viewport edge, so
 * zooming back out reads as the grid flying in from outside the page.
 */
export function cameraPose(rect: Rect, focus: Rect, frame: Rect): CardPose {
  const zoom = Math.max(frame.width / focus.width, frame.height / focus.height);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const focusX = focus.x + focus.width / 2;
  const focusY = focus.y + focus.height / 2;
  const frameX = frame.x + frame.width / 2;
  const frameY = frame.y + frame.height / 2;
  return {
    rect,
    x: frameX + (centerX - focusX) * zoom - centerX,
    y: frameY + (centerY - focusY) * zoom - centerY,
    scale: Math.min(zoom, CAMERA_MAX_SCALE),
    radius: GRID_RADIUS,
    chrome: 0,
  };
}
