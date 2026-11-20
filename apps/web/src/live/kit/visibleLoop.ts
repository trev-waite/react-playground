/**
 * What a frame asks for next: `true` for another frame, a number of milliseconds to wait before the
 * next one, or nothing to sleep until `wake()`.
 */
export type FrameRequest = boolean | number | void;

/** One frame: the rAF timestamp, and the milliseconds since the last frame, or since the wake for the first one. */
export type LoopFrame = (now: number, delta: number) => FrameRequest;

export type VisibleLoop = {
  /** True while the target is on screen. */
  readonly visible: boolean;
  /** Queues a frame, unless one is queued already or the target is off screen. */
  wake(): void;
  /**
   * Drops a queued frame or wait, and the loop sleeps until the next `wake()`: not even the frame that
   * calls it, or the target coming back on screen, starts it again.
   */
  sleep(): void;
  /** Stops for good and lets go of the target. */
  stop(): void;
};

export type VisibleLoopOptions = {
  /**
   * Whether the target counts as on screen until the browser first reports where it is. On (the
   * default), a component can draw its first frame as it mounts. Off, nothing runs until the target is
   * seen, and that first sighting calls `onVisibleChange(true)`.
   */
  initiallyVisible?: boolean;
  /**
   * Called as the target leaves the screen, after the loop has paused, and as it comes back, before it
   * wakes. A target that starts on screen never left, so this is not called for it: start work with
   * `wake()`, and use this for what leaving and returning change, such as a timer.
   */
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * The frame loop every animated Live component runs on. The deck keeps every card mounted, so a loop
 * runs only while its target is on screen: leaving it drops any queued frame or wait, and coming back
 * wakes it, unless it was put to sleep. A report that only confirms the target is on screen starts a
 * loop that has not run yet and leaves a running one to its frames' own requests. A frame that has
 * nothing left to move returns nothing, so a still component costs nothing until something wakes it.
 */
export function visibleLoop(target: Element, frame: LoopFrame, options: VisibleLoopOptions = {}): VisibleLoop {
  let visible = options.initiallyVisible ?? true;
  let stopped = false;
  let slept = false;
  let started = false;
  let queued = 0;
  let wait: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  let running = false;

  const run = (now: number) => {
    queued = 0;
    const delta = Math.max(0, now - last);
    last = now;
    running = true;
    let next: FrameRequest;
    try {
      next = frame(now, delta);
    } finally {
      running = false;
    }
    if (stopped || slept || !visible || queued || wait !== undefined) return;
    if (next === true) queued = requestAnimationFrame(run);
    else if (typeof next === "number") wait = setTimeout(resume, Math.max(0, next));
  };

  function resume() {
    clearTimeout(wait);
    wait = undefined;
    if (stopped || slept || !visible || queued) return;
    if (!running) last = performance.now();
    started = true;
    queued = requestAnimationFrame(run);
  }

  function pause() {
    cancelAnimationFrame(queued);
    queued = 0;
    clearTimeout(wait);
    wait = undefined;
  }

  const observer = new IntersectionObserver(entries => {
    if (stopped) return;
    const next = entries[entries.length - 1]?.isIntersecting ?? true;
    if (next !== visible) {
      visible = next;
      if (!visible) pause();
      options.onVisibleChange?.(visible);
      if (visible) resume();
    } else if (visible && !started) {
      resume();
    }
  });
  observer.observe(target);

  return {
    get visible() {
      return visible;
    },
    wake() {
      slept = false;
      resume();
    },
    sleep() {
      slept = true;
      pause();
    },
    stop() {
      stopped = true;
      pause();
      observer.disconnect();
    },
  };
}
