import { frameLoop, type FrameLoopCallback, type FrameLoopHandle, type FrameLoopOptions, type Gpu } from "vgpu";

export type PausableLoop = {
  /** True while a vgpu frame loop is running. */
  readonly running: boolean;
  stop(): void;
};

/**
 * `frameLoop` that only runs while `canvas` is on screen and the document is visible. rAF already
 * idles in hidden tabs; this also stops the loop when the idea is scrolled out of view, so a page
 * of GPU ideas costs only what is visible.
 *
 * The first frame always renders, even off screen. Drivers compile pipelines on first draw, which
 * can block the GPU process (and every animation on the page) for most of a second; doing it at
 * mount keeps that stall out of the moment the canvas scrolls or zooms into view.
 */
export function pausableLoop(
  gpu: Gpu,
  canvas: HTMLCanvasElement,
  cb: FrameLoopCallback,
  options: FrameLoopOptions = {},
): PausableLoop {
  let handle: FrameLoopHandle | null = null;
  let intersecting: boolean | null = null;
  let stopped = false;
  let primed = false;

  const run: FrameLoopCallback = frame => {
    cb(frame);
    if (primed) return;
    primed = true;
    sync();
  };

  const sync = () => {
    if (stopped) return;
    const visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    const shouldRun = !primed || (intersecting === true && visible);
    if (shouldRun && !handle) {
      handle = frameLoop(gpu, run, options);
    } else if (!shouldRun && handle) {
      handle.stop();
      handle = null;
    }
  };

  const observer = new IntersectionObserver(entries => {
    const latest = entries[entries.length - 1];
    if (latest) intersecting = latest.isIntersecting;
    sync();
  });
  observer.observe(canvas);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", sync);
  }
  sync();

  return {
    get running() {
      return handle !== null;
    },
    stop() {
      stopped = true;
      observer.disconnect();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", sync);
      }
      handle?.stop();
      handle = null;
    },
  };
}
