import { describe, expect, test } from "bun:test";
import { HOLD_DELAY_MS, windHold, type HoldTimers } from "./windHold";

function fakeTimers() {
  let now = 0;
  let pending: { at: number; run: () => void; id: number } | null = null;
  let nextId = 0;
  const timers: HoldTimers = {
    set: (run, ms) => {
      pending = { at: now + ms, run, id: ++nextId };
      return pending.id;
    },
    clear: timer => {
      if (pending?.id === timer) pending = null;
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    while (pending && pending.at <= end) {
      const due = pending;
      pending = null;
      now = due.at;
      due.run();
    }
    now = end;
  };
  return { timers, advance };
}

function setup() {
  const clock = fakeTimers();
  let steps = 0;
  const hold = windHold(() => steps++, clock.timers);
  return { hold, advance: clock.advance, steps: () => steps };
}

describe("windHold", () => {
  test("a tap whose press and click both arrive steps once", () => {
    const { hold, steps } = setup();
    hold.press();
    hold.release();
    hold.activate(false);
    expect(steps()).toBe(1);
  });

  test("a tap that arrives only as a click still steps", () => {
    const { hold, steps } = setup();
    hold.activate(false);
    hold.activate(false);
    expect(steps()).toBe(2);
  });

  test("holding steps at once, then keeps stepping faster until released", () => {
    const { hold, advance, steps } = setup();
    hold.press();
    expect(steps()).toBe(1);
    advance(HOLD_DELAY_MS - 1);
    expect(steps()).toBe(1);
    advance(1);
    expect(steps()).toBe(2);
    advance(1000);
    const held = steps();
    expect(held).toBeGreaterThan(10);
    hold.release();
    hold.activate(false);
    advance(1000);
    expect(steps()).toBe(held);
  });

  test("a press the browser takes back leaves the next tap to count", () => {
    const { hold, steps } = setup();
    hold.press();
    hold.cancel();
    hold.activate(false);
    expect(steps()).toBe(2);
  });

  test("Enter or Space steps even after a press that never clicked", () => {
    const { hold, steps } = setup();
    hold.press();
    hold.release();
    hold.activate(true);
    expect(steps()).toBe(2);
  });
});
