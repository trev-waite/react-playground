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
  /** A finger or the main mouse button went down on the button. */
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
  const stop = () => timers.clear(timer);
  return {
    press: () => {
      stop();
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
