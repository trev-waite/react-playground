import { MOTION, prefersReducedMotion } from "@/live/shared/Stage/choreography";
import { followPointer, type PointerPlace } from "@/live/shared/Stage/tone";

/** How quickly the lamp catches the hand, per second. */
const FOLLOW_RATE = 6;
/** The lamp comes up over longer than a word rises: light, unlike type, should feel slow. */
export const LAMP_RISE_MS = MOTION.enterMs * 2;
/** Where the lamp rests under reduced motion: low and to the left, so the letters' walls catch it. */
export const RESTING_LAMP: PointerPlace = { x: 0.2, y: 0.3 };

/** A slow pass back and forth across the word, low on the page, for when nobody holds the lamp. */
export function idleLamp(seconds: number): PointerPlace {
  return { x: 0.5 + 0.42 * Math.sin(seconds * 0.35 - 1.2), y: 0.42 + 0.2 * Math.sin(seconds * 0.23 + 0.4) };
}

/** 0 before the lamp is switched on, easing to 1 over `LAMP_RISE_MS`. */
export function presenceAt(elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / LAMP_RISE_MS));
  return 1 - (1 - t) ** 3;
}

export function approach(current: PointerPlace, target: PointerPlace, seconds: number, rate = FOLLOW_RATE): PointerPlace {
  const keep = Math.exp(-rate * seconds);
  return { x: target.x + (current.x - target.x) * keep, y: target.y + (current.y - target.y) * keep };
}

export type Lamp = {
  /** Switches the lamp on: its light rises from now. */
  open: () => void;
  /** The lamp's place, as shares of the stage, and how far it has come up. */
  sample: (now: number) => { place: PointerPlace; presence: number };
  stop: () => void;
};

export function createLamp(stage: HTMLElement): Lamp {
  const reduced = prefersReducedMotion();
  let hand: PointerPlace | null = null;
  let place = reduced ? RESTING_LAMP : idleLamp(0);
  let openedAt: number | null = null;
  let last = 0;
  let idleSince = 0;
  const unfollow = followPointer(stage, next => {
    hand = next;
  });

  return {
    open: () => {
      openedAt ??= performance.now();
    },
    sample: now => {
      const seconds = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (hand) idleSince = now;
      const target = hand ?? (reduced ? place : idleLamp((now - idleSince) / 1000 + 2.4));
      place = reduced ? target : approach(place, target, seconds, hand ? FOLLOW_RATE * 2 : FOLLOW_RATE);
      const presence = openedAt === null ? 0 : reduced ? 1 : presenceAt(now - openedAt);
      return { place, presence };
    },
    stop: unfollow,
  };
}
