export type Easing = "linear" | "easeOut" | ((progress: number) => number);

/** A spring set by feel (`visualDuration`, `bounce`) or by physics (`stiffness`, `damping`, `mass`). */
export type SpringTransition =
  | { type: "spring"; visualDuration: number; bounce: number }
  | { type: "spring"; stiffness: number; damping: number; mass: number };

/** A timed curve. `duration` is in seconds; 0 lands on the target at once. */
export type TweenTransition = { duration: number; ease?: Easing };

export type Transition = SpringTransition | TweenTransition;

/**
 * One motion vocabulary for the playground chrome. Every moving surface picks
 * one of these so springs feel related wherever they appear.
 */
export const SPRING = {
  /** Page to grid. Every card shares it so the grid moves like one camera, and settles with a little overshoot. */
  morph: { type: "spring", visualDuration: 0.52, bounce: 0.14 },
  /**
   * Grid to page. No bounce: a card grows straight into its page and never
   * past it, where a few pixels of overshoot and shrink-back would read as a
   * jolt at the end. Shorter, so it arrives as soon as the bouncing one did.
   */
  morphToPage: { type: "spring", visualDuration: 0.4, bounce: 0 },
  /** Panels sliding in from an edge. */
  panel: { type: "spring", visualDuration: 0.35, bounce: 0 },
  /** Small pills and toggles that should land with a little life. */
  pill: { type: "spring", stiffness: 480, damping: 18, mass: 0.45 },
} as const satisfies Record<string, SpringTransition>;

/** Reduced motion keeps state changes legible without travel. */
export const REDUCED_MOTION = { duration: 0.16, ease: "easeOut" } as const satisfies TweenTransition;
