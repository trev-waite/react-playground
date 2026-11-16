import type { Flight } from "./recorder.ts";

/** A layout this far from the last is a new one; less is rounding. */
const RELAID_PX = 0.5;
/** A card moving less than this between frames is close enough to still for a jump in its preview to show. */
const NEARLY_STILL_PX = 3;
/** The most a preview's content may change size, against its card, between two such frames. Rounding accounts for under 2%. */
const MAX_LANDING_JUMP = 0.05;
/** How long before a flight ends its preview must already be laid out for good. The morph lands some 400ms before the box rests. */
const SETTLED_FOR_MS = 250;
/** Chrome calls a page's shifts good below 0.1; the cards around a flight should add nothing. */
const MAX_LAYOUT_SHIFT = 0.02;

/**
 * What a recorded flight got wrong, in words; nothing if it flew clean. A jump
 * is a change in the content's size that comes with a new layout while the
 * card has all but stopped: a new layout while it still moves fast is a
 * stepped preview's step, and a change with no new layout is the component's
 * own doing. Judging only near-still frames holds a slow runner, which sees
 * fewer frames, to the same thing.
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
