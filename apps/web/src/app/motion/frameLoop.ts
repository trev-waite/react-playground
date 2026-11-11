/**
 * The one frame loop every animation in the app shares. Each frame runs two
 * steps: `update` advances animations, then `render` writes styles, so the
 * DOM is written once per frame however many values moved.
 *
 * Work scheduled while a frame runs lands in a later step of the same frame,
 * or in the next frame if its step has already run, as in Motion's loop.
 */
type FrameCallback = (timestamp: number) => void;

type Step = { current: Set<FrameCallback>; next: Set<FrameCallback> };

const steps: Step[] = [
  { current: new Set(), next: new Set() },
  { current: new Set(), next: new Set() },
];
const [updateStep, renderStep] = steps as [Step, Step];

let timestamp = 0;
let processing = false;
let requested = false;
let latched: number | undefined;

/**
 * The time animations measure from: the frame's own time inside a frame, and
 * one reading per task outside it, so values started together stay in step.
 */
export function now(): number {
  if (processing) return timestamp;
  if (latched === undefined) {
    latched = performance.now();
    queueMicrotask(() => (latched = undefined));
  }
  return latched;
}

function runFrame() {
  requested = false;
  timestamp = performance.now();
  processing = true;
  for (const step of steps) {
    const queue = step.next;
    step.next = step.current;
    step.current = queue;
    for (const callback of queue) {
      try {
        callback(timestamp);
      } catch (error) {
        // One failing callback must not stall every other animation.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
    queue.clear();
  }
  processing = false;
  if (updateStep.next.size > 0 || renderStep.next.size > 0) request();
}

function request() {
  if (requested) return;
  requested = true;
  // perf-allow: this is the shared loop that every motion value runs on.
  requestAnimationFrame(runFrame);
}

function schedule(step: Step, callback: FrameCallback) {
  step.next.add(callback);
  if (!processing) request();
}

export const frame = {
  update: (callback: FrameCallback) => schedule(updateStep, callback),
  render: (callback: FrameCallback) => schedule(renderStep, callback),
  cancel: (callback: FrameCallback) => {
    updateStep.next.delete(callback);
    renderStep.next.delete(callback);
  },
};
