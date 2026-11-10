/** A gesture (including trackpad momentum) has ended after this much quiet. */
export const GESTURE_GAP_MS = 160;
/** After a step, a clearly stronger swipe starts a new gesture even mid-momentum. */
const RESWIPE_AFTER_MS = 420;

export type WheelIntent = { type: "pull"; travel: number } | { type: "step"; direction: -1 | 1 } | null;

/**
 * Reads wheel events one gesture at a time. Travel pulls the page until it
 * passes `commitAt`, which steps once; the rest of that gesture, momentum
 * included, is ignored unless a clearly stronger swipe starts a new one.
 */
export function wheelGesture() {
  let travel = 0;
  let locked = false;
  let lastEvent = -Infinity;
  let lastStep = -Infinity;
  let lastDelta = 0;

  return {
    /** `delta` in px; `time` is the event's timestamp in ms. */
    read(delta: number, time: number, commitAt: number): WheelIntent {
      const reswipe =
        locked && time - lastStep > RESWIPE_AFTER_MS && Math.abs(delta) > Math.abs(lastDelta) * 1.5 && Math.abs(delta) > 8;
      if (time - lastEvent > GESTURE_GAP_MS || reswipe) {
        locked = false;
        travel = 0;
      }
      lastEvent = time;
      lastDelta = delta;
      if (locked) return null;
      travel += delta;
      if (Math.abs(travel) < commitAt) return { type: "pull", travel };
      locked = true;
      lastStep = time;
      return { type: "step", direction: travel > 0 ? 1 : -1 };
    },
    /** The gesture went quiet before it stepped. */
    end() {
      travel = 0;
    },
  };
}
