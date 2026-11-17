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
/** Carries the handle between the fill's edge and its place at 0: critically damped, settled in about 0.45s, never overshooting. */
export const PARK_SPRING: Spring = { stiffness: 220, damping: 29.7 };
/** At 0 the handle stands this far (px) clear of the number, on the 8px scale. */
export const PARK_GAP = 8;
/** The handle's height, as a share of the channel's. */
export const HANDLE_HEIGHT = 0.44;
/** The handle's halves overlap by this much (px) when joined, so the line shows no seam. */
const HALF_OVERLAP = 3;
/** Split apart, each half shrinks by this share, so it clears the number and the pill's curve with room to spare. */
const SPLIT_SHRINK = 0.15;
/** How far (px) past the number each half's split eases open or closed. */
const SPLIT_EASE = 14;
/** Of the trip to 0, the share by which the grey has slid away, so the line arrives at a white pill. */
const FILL_GONE_BY = 0.7;

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

/**
 * The value a drag at `raw` (0 to 100, unrounded) shows, with `showing` on
 * screen now: it changes only once the drag is a whole step away, so a pointer
 * wavering between two values never flickers, and every value can be reached.
 */
export function settle(raw: number, showing: number): number {
  return Math.abs(raw - showing) >= 1 ? clampValue(raw) : showing;
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

/** Where the grey fill's leading edge has slid back to, as `park` (0 to 1) carries the slider to rest at 0. */
export function retracted(park: number): number {
  return Math.min(1, Math.max(0, park / FILL_GONE_BY));
}

/** The grey's opacity as it slides away: it fades over the last of its slide, so no sliver lingers in the pill's round end. */
export function fillOpacity(park: number): number {
  return 1 - smooth((retracted(park) - 0.6) / 0.4);
}

/** The number's left and right edges and half its height, in px from the channel's left edge and its middle. */
export type NumberBox = { left: number; right: number; half: number };

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * How far apart (0 to 1) the handle's halves stand with its center at `x`:
 * open while it crosses the number, eased shut on either side, and joined
 * where it rests at 0 and anywhere on the fill's edge.
 */
export function splitAt(x: number, parked: number, number: NumberBox, width: number): number {
  const clear = width / 2 + 1;
  const left = number.left - clear;
  const right = number.right + clear;
  if (x >= left && x <= right) return 1;
  if (x > right) return smooth(1 - (x - right) / SPLIT_EASE);
  return left > parked ? smooth((x - parked) / (left - parked)) : 0;
}

/**
 * How far (0 to 1) a drag has carried the handle from the fill's edge at its
 * emptiest toward its place at 0, with the handle at `x` (px into the channel).
 * Past that edge a drag moves the handle itself, over the number.
 */
export function scrubAt(x: number, parked: number): number {
  const edge = MIN_FILL - HANDLE_INSET;
  return edge > parked ? Math.min(1, Math.max(0, (edge - x) / (edge - parked))) : 0;
}

/** A drag reads 0 once it has carried the handle this far to its place at 0, and lets go of 0 only back below `ZERO_LEAVE`. */
const ZERO_AT = 0.97;
const ZERO_LEAVE = 0.9;

/**
 * The value a drag shows, at `fraction` of the travel and `scrub` of the way
 * past the fill's edge, with `showing` on screen now. 0 is the handle's place
 * at the very left; anywhere short of it the slider reads at least 1.
 */
export function dragValue(fraction: number, scrub: number, showing: number): number {
  if (scrub >= (showing === 0 ? ZERO_LEAVE : ZERO_AT)) return 0;
  return Math.max(1, settle(fraction * MAX_VALUE, Math.max(1, showing)));
}

/** The handle's place at 0: just left of the number, `PARK_GAP` clear of it. */
export function parkedX(number: NumberBox, width: number): number {
  return number.left - PARK_GAP - width / 2;
}

export type Half = { y: number; scale: number };

/** Each half's length (px) for a handle `channel` px tall: half the line, plus the overlap that hides the join. */
export function halfLength(channel: number): number {
  return (channel * HANDLE_HEIGHT + HALF_OVERLAP) / 2;
}

/**
 * The top half's center (px from the channel's middle; the bottom half
 * mirrors it) and length scale, `split` (0 to 1) of the way apart. Joined,
 * the halves make the one line; split, each clears the number's box.
 */
export function topHalf(split: number, channel: number, number: NumberBox): Half {
  const length = halfLength(channel);
  const joined = -(channel * HANDLE_HEIGHT) / 2 + length / 2;
  const scale = 1 - SPLIT_SHRINK * split;
  const apart = -(number.half + (length * scale) / 2);
  return { y: joined + (apart - joined) * split, scale };
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
