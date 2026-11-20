export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

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
