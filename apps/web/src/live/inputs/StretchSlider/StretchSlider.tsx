import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import {
  FOLLOW_SPRING,
  MAX_VALUE,
  MIN_FILL,
  POP_KICK,
  POP_SPRING,
  STRETCH_SPRING,
  atRest,
  clampValue,
  fillOffset,
  fills,
  fractionAt,
  keyValue,
  layoutX,
  pillShape,
  shapedX,
  stepSpring,
  stretchFor,
  touchIntent,
  type SpringState,
} from "./stretch";
import styles from "./StretchSlider.module.css";

type StretchSliderProps = {
  label: string;
  defaultValue?: number;
  onChange?: (value: number) => void;
};

/** Moves the fill and bends the pill, on one frame loop. */
type Pill = {
  /** Carries the fill toward `fraction` (0 to 1); `held` while a pointer drags it. A press is not a flick: its jump never stretches the pill. */
  aim: (fraction: number, held: boolean) => void;
  /** Where a point `x` px into the pill would sit with the pill at rest, so the handle stays under the pointer while it stretches. */
  rest: (x: number) => number;
  pop: () => void;
  stop: () => void;
};

/** Drag speed is smoothed over about this long, so one uneven pointer event cannot jerk the pill. */
const DRAG_SMOOTHING_S = 0.05;

type PillParts = { body: HTMLElement; channel: HTMLElement; fill: HTMLElement; number: HTMLElement };

function startPill({ body, channel, fill, number }: PillParts, start: number): Pill {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = body.offsetWidth;
  let travel = channel.offsetWidth;
  let anchor = number.offsetLeft;
  let position: SpringState = { value: start, velocity: 0 };
  let target = start;
  /** Where the pointer asked for last frame, and how fast its asks are moving: the drag's own speed, not the fill's. */
  let lastTarget = start;
  let dragVelocity = 0;
  let held = false;
  let stretch: SpringState = { value: 0, velocity: 0 };
  let pop: SpringState = { value: 0, velocity: 0 };
  let shape = pillShape(0, 0, width);
  let frame = 0;
  let previous = 0;

  function paintFill() {
    fill.style.transform = `translateX(${fillOffset(position.value, travel)}px)`;
  }

  function paintShape() {
    if (atRest(stretch, 0) && atRest(pop, 0)) {
      shape = pillShape(0, 0, width);
      body.style.transform = "";
      number.style.transform = "";
      return;
    }
    shape = pillShape(stretch.value, pop.value, width);
    body.style.transform = `translateX(${shape.shiftX}px) scale(${shape.scaleX}, ${shape.scaleY})`;
    number.style.transform = `translateX(${shapedX(anchor, shape, width) - anchor}px)`;
  }

  function tick(now: number) {
    frame = 0;
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (dt > 0) {
      const instant = (target - lastTarget) / dt;
      dragVelocity += (instant - dragVelocity) * (1 - Math.exp(-dt / DRAG_SMOOTHING_S));
    }
    lastTarget = target;
    position = stepSpring(position, target, FOLLOW_SPRING, dt);
    const speed = (dragVelocity * Math.max(0, travel - MIN_FILL)) / Math.max(1, width);
    stretch = stepSpring(stretch, held ? stretchFor(speed) : 0, STRETCH_SPRING, dt);
    pop = stepSpring(pop, 0, POP_SPRING, dt);
    const resting =
      atRest(position, target) && atRest(stretch, 0) && atRest(pop, 0) && Math.abs(dragVelocity) < 0.005;
    if (resting) {
      position = { value: target, velocity: 0 };
      dragVelocity = 0;
    }
    paintFill();
    paintShape();
    if (!resting) schedule();
  }

  function schedule() {
    // perf-allow: runs only while the fill moves or the pill is stretched or ringing, and sleeps at rest, even under a held pointer.
    frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame) return;
    if (reducedMotion.matches) {
      position = { value: target, velocity: 0 };
      lastTarget = target;
      stretch = { value: 0, velocity: 0 };
      pop = { value: 0, velocity: 0 };
      paintFill();
      paintShape();
      return;
    }
    previous = performance.now();
    schedule();
  }

  function onMotionPreference() {
    if (!reducedMotion.matches) return;
    cancelAnimationFrame(frame);
    frame = 0;
    wake();
  }

  const resizeObserver = new ResizeObserver(() => {
    width = body.offsetWidth;
    travel = channel.offsetWidth;
    anchor = number.offsetLeft;
    paintFill();
  });
  resizeObserver.observe(body);
  reducedMotion.addEventListener("change", onMotionPreference);
  paintFill();

  return {
    aim(fraction, holding) {
      if (holding && !held) lastTarget = fraction;
      target = fraction;
      held = holding;
      wake();
    },
    rest(x) {
      const center = width / 2;
      return center + (x - center - shape.shiftX) / shape.scaleX;
    },
    pop() {
      if (reducedMotion.matches) return;
      pop = { value: pop.value, velocity: pop.velocity + POP_KICK };
      wake();
    },
    stop() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      reducedMotion.removeEventListener("change", onMotionPreference);
    },
  };
}

type Press = { pointerId: number; x: number; y: number; sliding: boolean };

/**
 * A pill slider. Drag the line, or anywhere on the pill: the grey fill follows
 * smoothly, a fast flick stretches the pill like rubber, and filling it to 100
 * turns it green with a springy pop.
 */
export function StretchSlider({ label, defaultValue = 40, onChange }: StretchSliderProps) {
  const [value, setValue] = useState(() => clampValue(defaultValue));
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const pill = useRef<Pill | null>(null);
  const press = useRef<Press | null>(null);
  const latest = useRef(value);

  const startFraction = useEffectEvent(() => latest.current / MAX_VALUE);

  useLayoutEffect(() => {
    const [body, channel, fill, number] = [bodyRef.current, channelRef.current, fillRef.current, numberRef.current];
    if (!body || !channel || !fill || !number) return;
    const started = startPill({ body, channel, fill, number }, startFraction());
    pill.current = started;
    return () => {
      pill.current = null;
      started.stop();
    };
  }, []);

  function commit(next: number) {
    const previous = latest.current;
    if (next === previous) return;
    if (fills(previous, next)) pill.current?.pop();
    latest.current = next;
    setValue(next);
    onChange?.(next);
  }

  function fractionUnder(clientX: number): number {
    const root = rootRef.current;
    const body = bodyRef.current;
    const channel = channelRef.current;
    if (!root || !body || !channel) return latest.current / MAX_VALUE;
    const rendered = root.getBoundingClientRect();
    const local = layoutX(clientX, rendered.left, rendered.width, root.offsetWidth) - body.offsetLeft;
    const x = pill.current?.rest(local) ?? local;
    return fractionAt(x, body.clientLeft + channel.offsetLeft, channel.offsetWidth);
  }

  function dragTo(clientX: number) {
    const fraction = fractionUnder(clientX);
    pill.current?.aim(fraction, true);
    commit(clampValue(fraction * MAX_VALUE));
  }

  function letGo() {
    setDragging(false);
    pill.current?.aim(latest.current / MAX_VALUE, false);
  }

  const beginTouchSlide = useEffectEvent((clientX: number) => {
    setDragging(true);
    dragTo(clientX);
  });

  /**
   * A finger decides here, in a cancelable touchmove: Safari pans the page
   * for a diagonal swipe even under `touch-action: pan-y`, and cancelling
   * the move before its pan begins is the only way to keep a slide.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onTouchMove = (event: TouchEvent) => {
      const current = press.current;
      const touch = event.touches[0];
      if (!current || !touch) return;
      if (!current.sliding) {
        if (event.touches.length > 1) return;
        const intent = touchIntent(touch.clientX - current.x, touch.clientY - current.y);
        if (!intent) return;
        if (intent === "scroll") {
          press.current = null;
          return;
        }
        current.sliding = true;
        beginTouchSlide(touch.clientX);
      }
      event.preventDefault();
    };
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => root.removeEventListener("touchmove", onTouchMove);
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || press.current?.sliding) return;
    const touch = event.pointerType === "touch";
    press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, sliding: !touch };
    if (touch) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragTo(event.clientX);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = press.current;
    if (!current?.sliding || current.pointerId !== event.pointerId) return;
    dragTo(event.clientX);
  }

  function endPress(event: PointerEvent<HTMLDivElement>, tapped: boolean) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (tapped && !current.sliding) dragTo(event.clientX);
    letGo();
  }

  return (
    <div
      ref={rootRef}
      className={styles.slider}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={MAX_VALUE}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      data-full={value === MAX_VALUE || undefined}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={event => endPress(event, true)}
      onPointerCancel={event => endPress(event, false)}
      onKeyDown={event => {
        const next = keyValue(event.key, latest.current, event.shiftKey);
        if (next == null) return;
        event.preventDefault();
        commit(next);
        pill.current?.aim(next / MAX_VALUE, false);
      }}
    >
      <div ref={bodyRef} className={styles.body} aria-hidden="true">
        <div ref={channelRef} className={styles.channel}>
          <div ref={fillRef} className={styles.fill}>
            <span className={styles.handle} />
          </div>
        </div>
      </div>
      <span ref={numberRef} className={styles.number} aria-hidden="true">
        {value}
        <span className={styles.unit}>%</span>
      </span>
    </div>
  );
}
