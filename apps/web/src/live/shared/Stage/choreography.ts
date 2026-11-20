/**
 * The one motion vocabulary the Stage components share: a word rises out of a
 * blur and leaves into one, a panel arrives from depth, and a word that stays
 * glides to its new place. Every timing lives here, and Stage hands the same
 * numbers to CSS.
 */
export const MOTION = {
  enterMs: 650,
  turnMs: 475,
  wordStaggerMs: 80,
  maxCascadeMs: 1400,
  riseDistance: 8,
  riseBlur: 6,
  arriveDistance: 24,
  ease: "cubic-bezier(0.22, 0.8, 0.3, 1)",
  springEase: "cubic-bezier(0.34, 1.45, 0.64, 1)",
  fadeEase: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export type Verb = "rise" | "recede" | "arrive";

export type Playback = {
  finished: Promise<void>;
  cancel: () => void;
};

export type CascadeOptions = {
  delayMs?: number;
  /** Each item's own duration; the enter duration unless a piece needs a quicker exit. */
  durationMs?: number;
  staggerMs?: number;
  maxCascadeMs?: number;
};

/** Delay before each of `count` items starts, staggered but never longer in total than `maxCascadeMs`. */
export function cascadeDelays(count: number, { delayMs = 0, staggerMs = MOTION.wordStaggerMs, maxCascadeMs = MOTION.maxCascadeMs }: CascadeOptions = {}): number[] {
  const stagger = count > 1 ? Math.min(staggerMs, maxCascadeMs / (count - 1)) : staggerMs;
  return Array.from({ length: count }, (_, index) => Math.round(delayMs + index * stagger));
}

/** Hidden ends are blurred and see-through; the visible end is the element's own style, so nothing is held once it lands. */
export function keyframesOf(verb: Verb): Keyframe[] {
  const { riseDistance, riseBlur, arriveDistance } = MOTION;
  switch (verb) {
    case "rise":
      return [{ opacity: 0, filter: `blur(${riseBlur}px)`, transform: `translateY(${riseDistance}px)` }, { opacity: 1, filter: "none", transform: "none" }];
    case "recede":
      return [{ opacity: 1, filter: "none", transform: "none" }, { opacity: 0, filter: `blur(${riseBlur}px)`, transform: `translateY(${-riseDistance}px)` }];
    case "arrive":
      return [{ opacity: 0, filter: `blur(${riseBlur}px)`, transform: `translateY(${arriveDistance}px) scale(0.96)` }, { opacity: 1, filter: "none", transform: "none" }];
  }
}

function easingOf(verb: Verb): string {
  return verb === "recede" ? MOTION.fadeEase : MOTION.ease;
}

/** Entering verbs hold their start through the delay, and leaving verbs hold their end, so the element is never seen at rest in between. */
function fillOf(verb: Verb): FillMode {
  return verb === "recede" ? "forwards" : "backwards";
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DONE: Playback = { finished: Promise.resolve(), cancel: () => {} };

/**
 * Plays `verb` over `elements` in a cascade. Under reduced motion nothing
 * moves: entering verbs land at once, clearing whatever hid the elements
 * before, and leaving verbs hide them at once until cancelled.
 */
export function play(elements: readonly Element[], verb: Verb, options: CascadeOptions = {}): Playback {
  if (elements.length === 0) return DONE;
  if (typeof elements[0]!.animate !== "function") return DONE;
  if (prefersReducedMotion()) {
    for (const element of elements) for (const animation of element.getAnimations()) animation.cancel();
    if (verb !== "recede") return DONE;
    const hidden = elements.map(element => element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 0, fill: "forwards" }));
    return { finished: Promise.resolve(), cancel: () => hidden.forEach(animation => animation.cancel()) };
  }
  const delays = cascadeDelays(elements.length, options);
  const duration = options.durationMs ?? MOTION.enterMs;
  const frames = keyframesOf(verb);
  const animations = elements.map((element, index) =>
    element.animate(frames, { duration, delay: delays[index], easing: easingOf(verb), fill: fillOf(verb) }),
  );
  return {
    finished: Promise.all(animations.map(animation => animation.finished)).then(
      () => {},
      () => {},
    ),
    cancel: () => {
      for (const animation of animations) animation.cancel();
    },
  };
}

export type Move = { element: Element; dx: number; dy: number };

/** Slides each element from where it was (`dx`, `dy` back along its move) to where layout now puts it. */
export function glide(moves: readonly Move[], { delayMs = 0, staggerMs = 0 }: { delayMs?: number; staggerMs?: number } = {}): Playback {
  if (moves.length === 0 || prefersReducedMotion()) return DONE;
  const animations = moves.map(({ element, dx, dy }, index) =>
    element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: MOTION.turnMs,
      delay: delayMs + index * staggerMs,
      easing: MOTION.springEase,
      fill: "backwards",
    }),
  );
  return {
    finished: Promise.all(animations.map(animation => animation.finished)).then(
      () => {},
      () => {},
    ),
    cancel: () => {
      for (const animation of animations) animation.cancel();
    },
  };
}

/** Where `element` sits inside `root`, in `root`'s own unscaled pixels, even while a parent scales it. */
export function positionIn(root: Element, element: Element): { x: number; y: number } {
  const outer = root.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  const scale = outer.width / Math.max(1, (root as HTMLElement).offsetWidth || outer.width);
  return { x: (inner.left - outer.left) / scale, y: (inner.top - outer.top) / scale };
}
