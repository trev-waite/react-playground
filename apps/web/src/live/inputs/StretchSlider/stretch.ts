/** The pill's shape at rest, and how a drag and a full fill bend it. */

export const MAX_VALUE = 100;
/** How far a fast drag can stretch the pill along its length, as a fraction of its width. */
export const MAX_STRETCH = 0.14;
/** Below this speed (track widths per second) the pill keeps its shape, so an ordinary drag never wobbles. */
export const CALM_SPEED = 1.1;
/** Stretch per track width per second past CALM_SPEED. A flick of about 4 widths a second reaches MAX_STRETCH. */
const STRETCH_PER_SPEED = 0.05;
/** How much the pill thins as it stretches, so it keeps its volume like rubber. */
export const THINNING = 0.45;
/** How much the pop squashes the pill's height for each unit it widens it. */
export const POP_SQUASH = 0.7;
/** The kick a full fill gives the pop spring, in scale per second. */
export const POP_KICK = 2.4;
/** A finger travels this far (px) before the slider decides between sliding and leaving the swipe to the page. */
export const TOUCH_SLOP = 6;

export type Spring = { stiffness: number; damping: number };
/** Follows the drag closely, then settles with a single small wobble on release. */
export const STRETCH_SPRING: Spring = { stiffness: 420, damping: 24 };
/**
 * Carries the fill to the pointer: critically damped and quick (about 30ms
 * behind at a steady drag), so it glides between pointer events instead of
 * stepping, and a press far away travels there rather than jumping.
 */
export const FOLLOW_SPRING: Spring = { stiffness: 4900, damping: 140 };

/** The grey fill never shrinks past this (px), so the number and the handle always sit on it. */
export const MIN_FILL = 84;
/** The handle line sits this far (px) inside the fill's right end. */
export const HANDLE_INSET = 14;
/** Underdamped, so a full fill rings like a plucked rubber band for a few cycles. */
export const POP_SPRING: Spring = { stiffness: 620, damping: 11 };

export function clampValue(value: number): number {
  return Math.min(MAX_VALUE, Math.max(0, Math.round(value)));
}

/**
 * How full (0 to 1) the slider is with its handle under a pointer at `x`, for
 * a fill channel starting at `left` that is `width` wide. The fill runs from
 * MIN_FILL wide at 0 to the whole channel at 1.
 */
/**
 * A viewport x as layout px from the left of an element drawn `renderedWidth`
 * wide on screen and `layoutWidth` wide in layout, so a scaled-down ancestor
 * does not shift where the pointer lands.
 */
export function layoutX(clientX: number, renderedLeft: number, renderedWidth: number, layoutWidth: number): number {
  const scale = layoutWidth > 0 && renderedWidth > 0 ? renderedWidth / layoutWidth : 1;
  return (clientX - renderedLeft) / scale;
}

export function fractionAt(x: number, left: number, width: number): number {
  const travel = width - MIN_FILL;
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, (x - left - (MIN_FILL - HANDLE_INSET)) / travel));
}

/** How far (px) the full-width fill slides left to show `fraction` of the travel. */
export function fillOffset(fraction: number, width: number): number {
  return -(1 - fraction) * Math.max(0, width - MIN_FILL);
}

/** The value a key moves to, or null for a key the slider leaves alone. */
export function keyValue(key: string, value: number, large: boolean): number | null {
  const step = large ? 10 : 1;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampValue(value + step);
    case "ArrowLeft":
    case "ArrowDown":
      return clampValue(value - step);
    case "PageUp":
      return clampValue(value + 10);
    case "PageDown":
      return clampValue(value - 10);
    case "Home":
      return 0;
    case "End":
      return MAX_VALUE;
    default:
      return null;
  }
}

/** True when a change fills the slider: the moment it pops. */
export function fills(previous: number, next: number): boolean {
  return previous < MAX_VALUE && next >= MAX_VALUE;
}

/** Signed stretch for a drag moving at `speed` track widths per second: positive pulls right. */
export function stretchFor(speed: number): number {
  const excess = Math.max(0, Math.abs(speed) - CALM_SPEED);
  if (excess === 0) return 0;
  return Math.sign(speed) * Math.min(MAX_STRETCH, excess * STRETCH_PER_SPEED);
}

/** A finger past the slop slides when it moved more across than down; otherwise the page scrolls. */
export function touchIntent(dx: number, dy: number): "slide" | "scroll" | null {
  if (Math.hypot(dx, dy) < TOUCH_SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? "slide" : "scroll";
}

export type PillShape = { scaleX: number; scaleY: number; shiftX: number };

/**
 * The pill's transform for a signed `stretch` and the `pop` spring's offset.
 * A stretch grows the pill toward the drag from its far edge, so the edge the
 * finger pulls leads and the other stays put; the pop swells it in place.
 */
export function pillShape(stretch: number, pop: number, width: number): PillShape {
  const reach = Math.abs(stretch);
  return {
    scaleX: 1 + reach + pop,
    scaleY: Math.max(0.5, 1 - reach * THINNING - pop * POP_SQUASH),
    shiftX: (stretch * width) / 2,
  };
}

/** Where a point `x` px from the pill's left edge lands once the pill takes `shape` about its center. */
export function shapedX(x: number, shape: PillShape, width: number): number {
  const center = width / 2;
  return center + shape.shiftX + (x - center) * shape.scaleX;
}

export type SpringState = { value: number; velocity: number };

/** Advances a spring pulling `state` toward `target` by `dt` seconds, in small fixed steps so a slow frame stays stable. */
export function stepSpring(state: SpringState, target: number, spring: Spring, dt: number): SpringState {
  let { value, velocity } = state;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += (-spring.stiffness * (value - target) - spring.damping * velocity) * h;
    value += velocity * h;
  }
  return { value, velocity };
}

export function atRest(state: SpringState, target: number): boolean {
  return Math.abs(state.value - target) < 0.0005 && Math.abs(state.velocity) < 0.005;
}
