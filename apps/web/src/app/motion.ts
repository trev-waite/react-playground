import type { Transition } from "motion/react";

/**
 * One motion vocabulary for the playground chrome. Every moving surface picks
 * one of these so springs feel related wherever they appear.
 */
export const SPRING = {
  /** Page ⇄ card morph. Every card shares it so the grid moves like one camera. */
  morph: { type: "spring", visualDuration: 0.52, bounce: 0.14 },
  /** Panels sliding in from an edge. */
  panel: { type: "spring", visualDuration: 0.35, bounce: 0 },
  /** Small pills and toggles that should land with a little life. */
  pill: { type: "spring", stiffness: 480, damping: 18, mass: 0.45 },
} as const satisfies Record<string, Transition>;

/** Reduced motion keeps state changes legible without travel. */
export const REDUCED_MOTION = { duration: 0.16, ease: "easeOut" } as const satisfies Transition;
