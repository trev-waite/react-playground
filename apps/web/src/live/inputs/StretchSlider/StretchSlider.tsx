import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import {
  FOLLOW_SPRING,
  HANDLE_INSET,
  MAX_VALUE,
  MIN_FILL,
  PARK_SPRING,
  POP_KICK,
  POP_SPRING,
  STRETCH_SPRING,
  atRest,
  clampValue,
  dragValue,
  fillOffset,
  fillOpacity,
  fills,
  fractionAt,
  keyValue,
  layoutX,
  parkedX,
  pillShape,
  retracted,
  scrubAt,
  shapedX,
  splitAt,
  stepSpring,
  stretchFor,
  topHalf,
  touchIntent,
  type NumberBox,
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
  /**
   * Carries the fill toward `fraction` (0 to 1); `held` while a pointer drags it, when `scrub` is how far past the
   * fill's edge the pointer has taken the handle. A press is not a flick: its jump never stretches the pill.
   */
  aim: (fraction: number, held: boolean, scrub?: number) => void;
  /** How far past the fill's edge, toward its place at 0, a handle at `x` px into the channel would be. */
  scrubAt: (x: number) => number;
  /** Where a point `x` px into the pill would sit unstretched, so the handle stays under the pointer while it stretches. The pop swells in place and is not undone: a still pointer must not read it as a move. */
  rest: (x: number) => number;
  pop: () => void;
  /** Sends the handle to its place at 0, past the number, or back to the fill's edge. */
  park: (atZero: boolean) => void;
  stop: () => void;
};

const HANDLE_WIDTH = 2.5;

/** Drag speed is smoothed over about this long, so one uneven pointer event cannot jerk the pill. */
const DRAG_SMOOTHING_S = 0.05;

type PillParts = { body: HTMLElement; channel: HTMLElement; fill: HTMLElement; number: HTMLElement; top: HTMLElement; bottom: HTMLElement };

function startPill({ body, channel, fill, number, top, bottom }: PillParts, start: number): Pill {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = body.offsetWidth;
  let travel = channel.offsetWidth;
  let anchor = number.offsetLeft;
  let height = channel.offsetHeight;
  let box = numberBox();
  let position: SpringState = { value: start, velocity: 0 };
  let target = start;
  /** Where the pointer asked for last frame, and how fast its asks are moving: the drag's own speed, not the fill's. */
  let lastTarget = start;
  let dragVelocity = 0;
  let held = false;
  let stretch: SpringState = { value: 0, velocity: 0 };
  let pop: SpringState = { value: 0, velocity: 0 };
  let parkTarget = start === 0 ? 1 : 0;
  let park: SpringState = { value: parkTarget, velocity: 0 };
  /** Where a pointer has taken the handle past the fill's edge; null when no pointer holds it, and the value places it. */
  let scrub: number | null = null;
  let shape = pillShape(0, 0, width);
  let frame = 0;
  let previous = 0;

  function numberBox(): NumberBox {
    const left = number.offsetLeft - body.offsetLeft - body.clientLeft - channel.offsetLeft;
    return { left, right: left + number.offsetWidth, half: number.offsetHeight / 2 };
  }

  function paintFill() {
    const offset = fillOffset(position.value, travel);
    fill.style.transform = `translateX(${offset - MIN_FILL * retracted(park.value)}px)`;
    const opacity = fillOpacity(park.value);
    fill.style.opacity = opacity === 1 ? "" : String(opacity);
    const edge = travel + offset - HANDLE_INSET;
    const parked = parkedX(box, HANDLE_WIDTH);
    const x = edge + (parked - edge) * park.value;
    const half = topHalf(splitAt(x, parked, box, HANDLE_WIDTH), height, box);
    top.style.transform = `translate(${x}px, ${half.y}px) scaleY(${half.scale})`;
    bottom.style.transform = `translate(${x}px, ${-half.y}px) scaleY(${half.scale})`;
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
    const parkAt = scrub ?? parkTarget;
    park = stepSpring(park, parkAt, scrub === null ? PARK_SPRING : FOLLOW_SPRING, dt);
    const resting =
      atRest(position, target) &&
      atRest(stretch, 0) &&
      atRest(pop, 0) &&
      atRest(park, parkAt) &&
      Math.abs(dragVelocity) < 0.005;
    if (resting) {
      position = { value: target, velocity: 0 };
      park = { value: parkAt, velocity: 0 };
      dragVelocity = 0;
    }
    paintFill();
    paintShape();
    if (!resting) schedule();
  }

  function schedule() {
    // perf-allow: runs only while the fill or handle moves or the pill is stretched or ringing, and sleeps at rest, even under a held pointer.
    frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame) return;
    if (reducedMotion.matches) {
      position = { value: target, velocity: 0 };
      lastTarget = target;
      stretch = { value: 0, velocity: 0 };
      pop = { value: 0, velocity: 0 };
      park = { value: scrub ?? parkTarget, velocity: 0 };
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
    height = channel.offsetHeight;
    box = numberBox();
    paintFill();
  });
  resizeObserver.observe(body);
  resizeObserver.observe(number);
  reducedMotion.addEventListener("change", onMotionPreference);
  paintFill();

  return {
    aim(fraction, holding, scrubbed) {
      if (holding && !held) lastTarget = fraction;
      target = fraction;
      held = holding;
      scrub = holding ? (scrubbed ?? 0) : null;
      wake();
    },
    scrubAt(x) {
      return scrubAt(x, parkedX(box, HANDLE_WIDTH));
    },
    rest(x) {
      const pulled = pillShape(stretch.value, 0, width);
      const center = width / 2;
      return center + (x - center - pulled.shiftX) / pulled.scaleX;
    },
    pop() {
      if (reducedMotion.matches) return;
      pop = { value: pop.value, velocity: pop.velocity + POP_KICK };
      wake();
    },
    park(atZero) {
      parkTarget = atZero ? 1 : 0;
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
 * turns it green with a springy pop. Past the fill's emptiest, a drag takes the
 * line over the number, parting around it, to 0 at the very left as the grey
 * slides away.
 */
export function StretchSlider({ label, defaultValue = 40, onChange }: StretchSliderProps) {
  const [value, setValue] = useState(() => clampValue(defaultValue));
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  const topRef = useRef<HTMLSpanElement>(null);
  const bottomRef = useRef<HTMLSpanElement>(null);
  const pill = useRef<Pill | null>(null);
  const press = useRef<Press | null>(null);
  const latest = useRef(value);

  const startFraction = useEffectEvent(() => latest.current / MAX_VALUE);

  useLayoutEffect(() => {
    const [body, channel, fill, number, top, bottom] = [
      bodyRef.current,
      channelRef.current,
      fillRef.current,
      numberRef.current,
      topRef.current,
      bottomRef.current,
    ];
    if (!body || !channel || !fill || !number || !top || !bottom) return;
    const started = startPill({ body, channel, fill, number, top, bottom }, startFraction());
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
    if ((previous === 0) !== (next === 0)) pill.current?.park(next === 0);
    latest.current = next;
    setValue(next);
    onChange?.(next);
  }

  /** Where a pointer at `clientX` puts the handle: a fraction of the travel, and how far past the fill's edge toward 0. */
  function handleUnder(clientX: number): { fraction: number; scrub: number } {
    const root = rootRef.current;
    const body = bodyRef.current;
    const channel = channelRef.current;
    if (!root || !body || !channel) return { fraction: latest.current / MAX_VALUE, scrub: 0 };
    const rendered = root.getBoundingClientRect();
    const local = layoutX(clientX, rendered.left, rendered.width, root.offsetWidth) - body.offsetLeft;
    const x = pill.current?.rest(local) ?? local;
    const left = body.clientLeft + channel.offsetLeft;
    return { fraction: fractionAt(x, left, channel.offsetWidth), scrub: pill.current?.scrubAt(x - left) ?? 0 };
  }

  function dragTo(clientX: number) {
    const { fraction, scrub } = handleUnder(clientX);
    pill.current?.aim(fraction, true, scrub);
    commit(dragValue(fraction, scrub, latest.current));
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
          <div ref={fillRef} className={styles.fill} />
          <span ref={topRef} className={styles.half} />
          <span ref={bottomRef} className={styles.half} />
        </div>
      </div>
      <span ref={numberRef} className={styles.number} aria-hidden="true">
        {value}
        <span className={styles.unit}>%</span>
      </span>
    </div>
  );
}
