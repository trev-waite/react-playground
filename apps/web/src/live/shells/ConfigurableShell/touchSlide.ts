/** How far a finger travels before the slider reads it as a drag rather than a tap. */
export const TAP_SLOP = 8;

/**
 * A finger on a slider is a drag once it has moved past the tap slop, more
 * across than down. Anything else is left to the page, so a vertical swipe
 * that starts on a slider still scrolls.
 */
export function isSlide(dx: number, dy: number): boolean {
  return Math.abs(dx) >= TAP_SLOP && Math.abs(dx) > Math.abs(dy);
}
