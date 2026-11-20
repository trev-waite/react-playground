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
  /** Drops a queued frame or wait; the loop sleeps until the next `wake()`. */
  sleep(): void;
  /** Stops for good and lets go of the target. */
  stop(): void;
};

export type VisibleLoopOptions = {
  /** Called as the target leaves the screen, after the loop has paused, and as it returns, before it wakes. */
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * The frame loop every animated Live component runs on. The deck keeps every card mounted, so a loop
 * runs only while its target is on screen: leaving it drops any queued frame or wait, and coming back
 * wakes it. Until the browser first reports where the target is, it counts as on screen, so a component
 * can draw its first frame as it mounts. A frame that has nothing left to move returns nothing, so a
 * still component costs nothing until something wakes it.
 */
export function visibleLoop(target: Element, frame: LoopFrame, options: VisibleLoopOptions = {}): VisibleLoop {
  let visible = true;
  let stopped = false;
  let queued = 0;
  let wait: ReturnType<typeof setTimeout> | undefined;
  let last = 0;

  const run = (now: number) => {
    queued = 0;
    const delta = Math.max(0, now - last);
    last = now;
    const next = frame(now, delta);
    if (stopped || !visible || queued || wait !== undefined) return;
    if (next === true) queued = requestAnimationFrame(run);
    else if (typeof next === "number") wait = setTimeout(wake, Math.max(0, next));
  };

  function wake() {
    clearTimeout(wait);
    wait = undefined;
    if (stopped || !visible || queued) return;
    last = performance.now();
    queued = requestAnimationFrame(run);
  }

  function sleep() {
    cancelAnimationFrame(queued);
    queued = 0;
    clearTimeout(wait);
    wait = undefined;
  }

  const observer = new IntersectionObserver(entries => {
    const next = entries[entries.length - 1]?.isIntersecting ?? true;
    if (next !== visible) {
      visible = next;
      if (!visible) sleep();
      options.onVisibleChange?.(visible);
    }
    if (visible) wake();
  });
  observer.observe(target);

  return {
    get visible() {
      return visible;
    },
    wake,
    sleep,
    stop() {
      stopped = true;
      sleep();
      observer.disconnect();
    },
  };
}
