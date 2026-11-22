import type { Flight } from "./recorder.ts";

/** A layout this far from the last is a new one; less is rounding. */
const RELAID_PX = 0.5;
/** A card moving less than this per frame is still enough for a jump in its preview to show. */
const NEARLY_STILL_PX = 3;
/** Rounding accounts for under 2%. */
const MAX_LANDING_JUMP = 0.05;
/** The preview must be laid out for good this long before the flight ends. */
const SETTLED_FOR_MS = 250;
const MAX_LAYOUT_SHIFT = 0.02;
/** A card that had held still and then moves this fast has jumped to a place it should already have reached. */
const JUMP_PX = 12;
/** Speeds are per frame at 60 Hz, so one long frame reads as the steady motion it covers, not a jump. */
const FRAME_MS = 1000 / 60;

/**
 * What a recorded flight got wrong. A jump is a new layout that changes the
 * content's size while the card is all but still: earlier, it is a stepped
 * preview's step; without a new layout, it is the component's own doing.
 */
export function judgeFlight(what: string, { frames, shift }: Flight): string[] {
  const took = frames.findIndex(frame => frame.flying);
  const landed = frames.findLastIndex(frame => frame.flying);
  if (landed - took < 2) return [`${what}: the flight was not seen (${frames.length} frames).`];

  const failures: string[] = [];
  let jump = 0;
  for (let index = took + 1; index <= Math.min(landed + 1, frames.length - 1); index++) {
    const frame = frames[index]!;
    const last = frames[index - 1]!;
    const relaid = frame.layout.some((side, each) => Math.abs(side - last.layout[each]!) > RELAID_PX);
    if (frame.moved >= NEARLY_STILL_PX || !relaid) continue;
    frame.sizes.forEach((size, each) => {
      const before = last.sizes[each]!;
      if (before > 0 && size > 0) jump = Math.max(jump, Math.abs(size / before - 1));
    });
  }
  if (jump > MAX_LANDING_JUMP) {
    failures.push(`${what}: the preview's content jumped ${Math.round(jump * 100)}% in size while its card was all but still.`);
  }

  let held = 0;
  let travelled = false;
  for (let index = Math.max(took, 1); index < frames.length; index++) {
    const { moved, at } = frames[index]!;
    const speed = (moved * FRAME_MS) / Math.max(FRAME_MS, at - frames[index - 1]!.at);
    if (travelled && held >= 2 && speed > JUMP_PX) {
      failures.push(`${what}: the card stopped short of its place, then jumped ${Math.round(moved)}px.`);
      break;
    }
    held = speed < NEARLY_STILL_PX ? held + 1 : 0;
    travelled ||= speed >= NEARLY_STILL_PX;
  }

  const end = frames[landed]!.at;
  const settling = frames.filter(frame => frame.at > end - SETTLED_FOR_MS).map(frame => frame.layout);
  const late = settling.find(layout => layout.some((side, each) => Math.abs(side - settling[0]![each]!) > RELAID_PX));
  if (late) {
    failures.push(`${what}: the preview was still laying out as it arrived (${settling[0]!.join(" × ")} → ${late.join(" × ")}).`);
  }

  if (shift > MAX_LAYOUT_SHIFT) {
    failures.push(`${what}: the browser scored a layout shift of ${shift.toFixed(3)} for the cards around it, though nothing on screen jumped.`);
  }
  return failures;
}
