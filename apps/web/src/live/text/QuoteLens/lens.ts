export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type LensPart = "glass" | "rim" | "handle";

/**
 * The glass's shape in multiples of its radius, as the frame draws it: the rim
 * reaches 1.1 radii out, and the handle runs from the rim to 2.62 radii at 45°,
 * down and to the right, about 0.13 radii either side of its axis.
 */
export const LENS_SHAPE = { rim: 1.1, handle: { angle: Math.PI / 4, from: 1.04, to: 2.62, halfWidth: 0.13 } };
/** However thin the handle is drawn, a finger can take it within this many pixels across. */
export const MIN_GRIP = 44;

/** Which part of the glass centered at `center` is at `point`, if any. `grip` is the handle's least width across, in the same units. */
export function lensPart(point: Point, center: Point, radius: number, grip = MIN_GRIP): LensPart | null {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return "glass";
  if (distance <= radius * LENS_SHAPE.rim) return "rim";
  const { angle, from, to, halfWidth } = LENS_SHAPE.handle;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const along = clamp(dx * ux + dy * uy, radius * from, radius * to);
  const across = Math.hypot(dx - along * ux, dy - along * uy);
  return across <= Math.max(radius * halfWidth, grip / 2) ? "handle" : null;
}

/** Where the glass sits relative to the hand that takes it, so it moves with the hand rather than jumping to it. */
export function grabOffset(center: Point, hand: Point): Point {
  return { x: center.x - hand.x, y: center.y - hand.y };
}

/** Where a held glass goes as the hand moves: kept at its grab offset, and on the page. */
export function heldAt(hand: Point, offset: Point, page: Size): Point {
  return clampCenter({ x: hand.x + offset.x, y: hand.y + offset.y }, page);
}

/**
 * Where the magnified copy sits inside the lens window, so the page point
 * under the lens's center stays under it, `scale` times larger.
 */
export function cloneTransform(center: Point, radius: number, scale: number): string {
  return `translate(${round(radius - scale * center.x)}px, ${round(radius - scale * center.y)}px) scale(${scale})`;
}

/** Keeps the lens's center on the page. */
export function clampCenter(center: Point, page: Size): Point {
  return { x: clamp(center.x, 0, page.width), y: clamp(center.y, 0, page.height) };
}

/** A slow figure-eight over the middle of the page, for when nobody holds the glass. */
export function driftAt(seconds: number, page: Size): Point {
  return {
    x: page.width * (0.5 + 0.3 * Math.sin(seconds * 0.31)),
    y: page.height * (0.46 + 0.14 * Math.sin(seconds * 0.53 + 1)),
  };
}

/** Frame-rate independent ease toward a target: `rate` is how quickly the gap closes, per second. */
export function follow(current: Point, target: Point, seconds: number, rate: number): Point {
  const keep = Math.exp(-rate * seconds);
  return { x: target.x + (current.x - target.x) * keep, y: target.y + (current.y - target.y) * keep };
}

/** The same ease for a single value, such as the glass's strength while it zooms. */
export function approach(current: number, target: number, seconds: number, rate: number): number {
  return target + (current - target) * Math.exp(-rate * seconds);
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
