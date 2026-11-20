/**
 * The camera and the tilted page, shared by the shader (as uniforms) and the
 * pointer (to find the line under it). Screen space runs -1..1 with y up; the
 * camera looks down +z; the page leans back from its near edge.
 */
export const CAMERA = { tan: 0.5, distance: 2.4 } as const;
/** How far the page leans back, in radians: steep on a wide screen, flatter on a narrow one, so the poem stays readable on a phone. */
export function tiltFor(aspect: number): number {
  return Math.min(0.95, Math.max(0.3, 0.2 + 0.33 * aspect));
}

/** Blur at the page's far and near edges when the focus sits on the other. */
export const MAX_BLUR_LEVEL = 3;
/** Page rows (0 top, 1 bottom) of blur per level: focus falls off over about a fifth of the page. */
export const ROWS_PER_LEVEL = 0.09;
/** How far the page may reach toward the screen's edges. */
export const SCREEN_MARGIN = 0.8;

/**
 * The page's size on its plane, and the lens shift and zoom that center its
 * picture and fill the screen with it: a shifted, zoomed perspective is still a
 * true perspective, so the near edge no longer holds the far edge back.
 */
export type Page = { width: number; height: number; tilt: number; zoom: number; shift: number };

/** The page's width on its plane; its height follows its shape. */
const PAGE_WIDTH = 1.6;

type Vec3 = [number, number, number];

const up = (tilt: number): Vec3 => [0, Math.cos(tilt), Math.sin(tilt)];

/** Where a point on the page, at shares `u` across and `v` down, lands on the screen. */
export function projectPage(page: Page, aspect: number, u: number, v: number): { x: number; y: number } {
  const [, upY, upZ] = up(page.tilt);
  const along = (0.5 - v) * page.height;
  const point: Vec3 = [(u - 0.5) * page.width, along * upY, CAMERA.distance + along * upZ];
  return {
    x: (page.zoom * point[0]) / (point[2] * CAMERA.tan * aspect),
    y: (page.zoom * point[1]) / (point[2] * CAMERA.tan) + page.shift,
  };
}

/** The page share down (0 top, 1 bottom) under a screen point, or null off the page. */
export function pageRowAt(page: Page, aspect: number, screenX: number, screenY: number): number | null {
  const [, upY, upZ] = up(page.tilt);
  const x = screenX / page.zoom;
  const y = (screenY - page.shift) / page.zoom;
  const direction: Vec3 = [x * aspect * CAMERA.tan, y * CAMERA.tan, 1];
  const normal: Vec3 = [0, -upZ, upY];
  const denominator = direction[1] * normal[1] + direction[2] * normal[2];
  if (Math.abs(denominator) < 1e-6) return null;
  const t = (CAMERA.distance * normal[2]) / denominator;
  if (t <= 0) return null;
  const along = direction[1] * t * upY + (direction[2] * t - CAMERA.distance) * upZ;
  const u = (direction[0] * t) / page.width + 0.5;
  const v = 0.5 - along / page.height;
  if (u < -0.1 || u > 1.1 || v < -0.1 || v > 1.1) return null;
  return Math.min(1, Math.max(0, v));
}

/** The part of the page that must stay on screen, as shares of its width and height. */
export type Content = { left: number; right: number; top: number; bottom: number };

const WHOLE_PAGE: Content = { left: 0, right: 1, top: 0, bottom: 1 };

/**
 * The page of this shape (height over width), shifted and zoomed so the
 * picture of its content, not its empty margins, fills the screen inside the margin.
 */
export function fitPage(aspect: number, pageAspect: number, content: Content = WHOLE_PAGE): Page {
  const plain: Page = { width: PAGE_WIDTH, height: PAGE_WIDTH * pageAspect, tilt: tiltFor(aspect), zoom: 1, shift: 0 };
  const { left, right, top: first, bottom: last } = content;
  const corners = [[left, first], [right, first], [left, last], [right, last]].map(([u, v]) => projectPage(plain, aspect, u!, v!));
  const reach = Math.max(...corners.map(corner => Math.abs(corner.x)));
  const top = Math.max(...corners.map(corner => corner.y));
  const bottom = Math.min(...corners.map(corner => corner.y));
  const zoom = Math.min(SCREEN_MARGIN / reach, (2 * SCREEN_MARGIN) / (top - bottom));
  return { ...plain, zoom, shift: (-zoom * (top + bottom)) / 2 };
}

/** Blur level, 0 sharp to `MAX_BLUR_LEVEL`, for a line `rows` away from the focus. */
export function blurLevel(rows: number, presence = 1): number {
  const level = Math.abs(rows) / ROWS_PER_LEVEL;
  return Math.min(MAX_BLUR_LEVEL, Math.max(level, (1 - presence) * MAX_BLUR_LEVEL));
}

/** Where the focus rests when no one pulls it: drifting slowly down the poem and back. */
export function idleFocus(seconds: number): number {
  return 0.5 - 0.36 * Math.cos(seconds * 0.32);
}
