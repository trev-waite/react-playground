/** Holding a wind button steps once, waits, then steps faster and faster. */
export const HOLD_DELAY_MS = 420;
const HOLD_FIRST_MS = 160;
const HOLD_FASTEST_MS = 70;

export type HoldTimers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
};

const browserTimers: HoldTimers = {
  // perf-allow: repeats only while a finger or mouse holds the button.
  set: (run, ms) => setTimeout(run, ms),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export type WindHold = {
  /** A finger or the main mouse button went down on the button; another while it is held is ignored. */
  press: () => void;
  /** It lifted or slid off; the click that may follow is the same tap. */
  release: () => void;
  /** The browser took the press back, so no click follows it. */
  cancel: () => void;
  /** The button was activated: by a tap or a click, or by Enter or Space (`fromKeyboard`). */
  activate: (fromKeyboard: boolean) => void;
};

/**
 * A press steps at once and, held, keeps stepping. A click steps only when no
 * press already did, so a tap counts once whether the browser delivers its
 * press, its click, or both, and still counts if the press never reaches the
 * button.
 */
export function windHold(step: () => void, timers: HoldTimers = browserTimers): WindHold {
  let timer: unknown;
  let pressed = false;
  let holding = false;
  const stop = () => {
    holding = false;
    timers.clear(timer);
  };
  return {
    press: () => {
      if (holding) return;
      holding = true;
      pressed = true;
      step();
      let wait = HOLD_FIRST_MS;
      const repeat = () => {
        step();
        wait = Math.max(HOLD_FASTEST_MS, wait * 0.85);
        timer = timers.set(repeat, wait);
      };
      timer = timers.set(repeat, HOLD_DELAY_MS);
    },
    release: stop,
    cancel: () => {
      stop();
      pressed = false;
    },
    activate: fromKeyboard => {
      const counted = pressed && !fromKeyboard;
      pressed = false;
      if (!counted) step();
    },
  };
}

/**
 * Winds `button` while it is held. A finger is followed by its touch events
 * alone, so its pointer events can't count the same press again; pointer
 * events follow a mouse or pen.
 */
export function bindWindHold(button: EventTarget, step: () => void, timers?: HoldTimers): () => void {
  const hold = windHold(step, timers);
  const fromPointer =
    (run: () => void) =>
    (event: Event): void => {
      if ((event as PointerEvent).pointerType !== "touch") run();
    };
  const pressPointer = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType !== "touch" && pointer.button === 0) hold.press();
  };
  const activate = (event: Event) => hold.activate((event as MouseEvent).detail === 0);
  const listeners: [string, (event: Event) => void, AddEventListenerOptions?][] = [
    // React's touch listeners are passive, and in Safari on iOS a press reached controls with a non-passive one when these buttons missed it.
    ["touchstart", hold.press, { passive: false }],
    ["touchend", hold.release],
    ["touchcancel", hold.cancel],
    ["pointerdown", pressPointer],
    ["pointerup", fromPointer(hold.release)],
    ["pointerleave", fromPointer(hold.release)],
    ["pointercancel", fromPointer(hold.cancel)],
    ["click", activate],
  ];
  for (const [type, listener, options] of listeners) button.addEventListener(type, listener, options);
  return () => {
    for (const [type, listener] of listeners) button.removeEventListener(type, listener);
    hold.release();
  };
}
