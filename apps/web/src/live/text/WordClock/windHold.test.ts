import { describe, expect, test } from "bun:test";
import { bindWindHold, HOLD_DELAY_MS, windHold, type HoldTimers } from "./windHold";

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

  test("a second finger on a held button doesn't step again", () => {
    const { hold, advance, steps } = setup();
    hold.press();
    hold.press();
    expect(steps()).toBe(1);
    advance(HOLD_DELAY_MS);
    expect(steps()).toBe(2);
    hold.release();
    hold.press();
    expect(steps()).toBe(3);
  });
});

class Button extends EventTarget {
  readonly options = new Map<string, AddEventListenerOptions | boolean | undefined>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    this.options.set(type, options);
    super.addEventListener(type, listener, options);
  }
}

function bound() {
  const clock = fakeTimers();
  const button = new Button();
  let steps = 0;
  const unbind = bindWindHold(button, () => steps++, clock.timers);
  const fire = (type: string, fields: Record<string, unknown> = {}) => button.dispatchEvent(Object.assign(new Event(type), fields));
  return { button, fire, unbind, advance: clock.advance, steps: () => steps };
}

const finger = { pointerType: "touch", button: 0 };

describe("bindWindHold", () => {
  test("listens for a finger's touchstart without marking it passive", () => {
    const { button } = bound();
    expect(button.options.get("touchstart")).toEqual({ passive: false });
  });

  test("a held finger winds when only its touches arrive", () => {
    const { fire, advance, steps } = bound();
    fire("touchstart");
    advance(1000);
    const held = steps();
    expect(held).toBeGreaterThan(5);
    fire("touchend");
    fire("click", { detail: 1 });
    advance(1000);
    expect(steps()).toBe(held);
  });

  test("a finger's pointer events, even late ones, add nothing to its touches", () => {
    const { fire, advance, steps } = bound();
    fire("pointerdown", finger);
    fire("touchstart");
    fire("pointerup", finger);
    fire("touchend");
    fire("click", { detail: 1 });
    expect(steps()).toBe(1);
    fire("touchstart");
    fire("touchend");
    fire("pointerdown", finger);
    fire("pointerup", finger);
    fire("click", { detail: 1 });
    expect(steps()).toBe(2);
    fire("touchstart");
    fire("pointerup", finger);
    fire("pointerleave", finger);
    advance(HOLD_DELAY_MS);
    expect(steps()).toBe(4);
  });

  test("a tap that arrives only as a click steps", () => {
    const { fire, steps } = bound();
    fire("click", { detail: 1 });
    expect(steps()).toBe(1);
  });

  test("a mouse or pen holds with its main button only, and stops when it slides off", () => {
    const { fire, advance, steps } = bound();
    fire("pointerdown", { pointerType: "mouse", button: 2 });
    expect(steps()).toBe(0);
    fire("pointerdown", { pointerType: "mouse", button: 0 });
    advance(HOLD_DELAY_MS);
    expect(steps()).toBe(2);
    fire("pointerleave", { pointerType: "mouse" });
    advance(1000);
    expect(steps()).toBe(2);
    fire("pointerdown", { pointerType: "pen", button: 0 });
    fire("pointerup", { pointerType: "pen" });
    fire("click", { detail: 1 });
    expect(steps()).toBe(3);
  });

  test("a touch the browser takes back stops the hold and leaves the next tap to count", () => {
    const { fire, advance, steps } = bound();
    fire("touchstart");
    fire("touchcancel");
    advance(1000);
    fire("click", { detail: 1 });
    expect(steps()).toBe(2);
  });

  test("unbinding stops a hold and ignores later presses", () => {
    const { fire, unbind, advance, steps } = bound();
    fire("touchstart");
    unbind();
    advance(1000);
    fire("touchstart");
    fire("click", { detail: 0 });
    expect(steps()).toBe(1);
  });
});
