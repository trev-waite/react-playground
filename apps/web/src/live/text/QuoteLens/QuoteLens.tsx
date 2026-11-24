import { useEffect, useId, useRef, type RefObject } from "react";
import { visibleLoop, type FrameRequest } from "@/live/kit/visibleLoop";
import { cascadeDelays, play, prefersReducedMotion } from "@/live/kit/Stage/choreography";
import { Stage, Words } from "@/live/kit/Stage/Stage";
import stageStyles from "@/live/kit/Stage/Stage.module.css";
import { approach, clampCenter, cloneTransform, driftAt, follow, grabOffset, heldAt, lensPart, MIN_GRIP, type Point, type Size } from "./lens";
import styles from "./QuoteLens.module.css";

export type Quote = { text: string; author: string; source: string; href?: string };

/** Dan Campbell on the Lions' injuries, November 17, 2026, as NFL.com reported it (it printed "s---"), joined where it left lines out. */
const QUOTE: Quote = {
  text: "If you’re not careful, you lay in bed at night and you start thinking about all the ‘what ifs?’ And at some point, you become a miserable piece of shit. … I refuse to look at it that way. It’s time to move on.",
  author: "Dan Campbell",
  source: "Detroit Lions head coach, November 17, 2026",
  href: "https://www.nfl.com/news/lions-dan-campbell-refuses-to-be-a-miserable-piece-of-expletive-after-string-of-injuries",
};

/** The glass's two strengths; pressing it switches between them. */
const MAGNIFY = 1.6;
const MAGNIFY_CLOSE = 2.4;
/** Movement that makes a press on the glass a drag rather than a press of it. */
const DRAG_SLOP = 6;
/** A click this soon after a drag ends belongs to the drag. */
const CLICK_GRACE_MS = 400;
/** How quickly the glass catches up with a tap or a key, how gently it drifts back into its idle path, and how fast it zooms, per second. */
const FOLLOW_RATE = 16;
const DRIFT_RATE = 2.5;
const ZOOM_RATE = 12;
/** Left alone this long, the glass goes back to drifting over the page. */
const IDLE_MS = 3500;
const KEY_STEP = 16;
const KEY_LEAP = 48;

type Lens = { arrive: () => void; stop: () => void };

type LensParts = {
  page: HTMLDivElement;
  lens: HTMLButtonElement;
  clone: HTMLSpanElement;
};

/** Where the page is on screen, and how much the deck has scaled it. */
type Frame = { left: number; top: number; ratio: number };

type Hold = { id: number; touch: boolean; offset: Point; from: Point; moved: boolean; frame: Frame | null };

function startLens({ page, lens, clone }: LensParts): Lens {
  const reduced = prefersReducedMotion();
  let size: Size = { width: page.clientWidth, height: page.clientHeight };
  let radius = lens.offsetWidth / 2;
  let current: Point = driftAt(0, size);
  let target: Point = current;
  let scale = MAGNIFY;
  let drifting = !reduced;
  let shown = false;
  let last = 0;
  let driftFrom = 0;
  let hold: Hold | null = null;
  let clickAfterDragUntil = -Infinity;
  let mouseInside = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const zoomed = () => lens.getAttribute("aria-pressed") === "true";

  const draw = () => {
    lens.style.transform = `translate(${current.x - radius}px, ${current.y - radius}px)`;
    clone.style.transform = cloneTransform(current, radius, scale);
  };

  const tick = (now: number): FrameRequest => {
    if (!shown) return false;
    const seconds = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (drifting) target = driftAt((now - driftFrom) / 1000, size);
    current = reduced || hold ? target : follow(current, target, seconds, drifting ? DRIFT_RATE : FOLLOW_RATE);
    const strength = zoomed() ? MAGNIFY_CLOSE : MAGNIFY;
    scale = reduced ? strength : approach(scale, strength, seconds, ZOOM_RATE);
    draw();
    const settled = Math.hypot(current.x - target.x, current.y - target.y) < 0.1 && Math.abs(scale - strength) < 0.001;
    if (!settled || drifting) return true;
    last = 0;
    return false;
  };

  const loop = visibleLoop(page, tick, {
    onVisibleChange: visible => {
      if (!visible) last = 0;
    },
  });

  const wake = () => {
    if (shown) loop.wake();
  };

  const rest = () => {
    clearTimeout(idleTimer);
    if (reduced) return;
    // perf-allow: re-arms only while someone holds the glass, has a mouse over the card, or focuses the lens.
    idleTimer = setTimeout(() => {
      if (hold || mouseInside || lens.matches(":focus-visible")) return rest();
      drifting = true;
      driftFrom = performance.now() - 2000;
      wake();
    }, IDLE_MS);
  };

  const aim = (next: Point) => {
    drifting = false;
    target = clampCenter(next, size);
    rest();
    wake();
  };

  /** Holds the glass where it is now, as a hand reaches for it. */
  const still = () => {
    if (drifting) aim(current);
  };

  const toggle = () => {
    lens.setAttribute("aria-pressed", String(!zoomed()));
    wake();
  };

  const measure = (): Frame => {
    const bounds = page.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, ratio: bounds.width / Math.max(1, page.offsetWidth) };
  };

  const onPage = (x: number, y: number, frame: Frame): Point => ({ x: (x - frame.left) / frame.ratio, y: (y - frame.top) / frame.ratio });

  const partAt = (point: Point, frame: Frame) => lensPart(point, current, radius, MIN_GRIP / frame.ratio);

  const setCursor = (cursor: "grab" | "grabbing" | null) => {
    if (cursor) page.dataset.cursor = cursor;
    else delete page.dataset.cursor;
  };

  /** A press on the glass, its rim, or its handle takes hold of it where it was pressed; anywhere else it is not the glass's. */
  const press = (x: number, y: number, id: number, touch: boolean): boolean => {
    if (hold || !shown) return false;
    const frame = measure();
    const hand = onPage(x, y, frame);
    if (!partAt(hand, frame)) return false;
    drifting = false;
    target = current;
    hold = { id, touch, offset: grabOffset(current, hand), from: { x, y }, moved: false, frame };
    lens.style.setProperty("--held-x", `${hand.x - current.x + radius}px`);
    lens.style.setProperty("--held-y", `${hand.y - current.y + radius}px`);
    lens.dataset.lifted = "";
    setCursor("grabbing");
    clearTimeout(idleTimer);
    wake();
    return true;
  };

  const drag = (x: number, y: number) => {
    if (!hold) return;
    hold.moved ||= Math.hypot(x - hold.from.x, y - hold.from.y) > DRAG_SLOP;
    hold.frame ??= measure();
    aim(heldAt(onPage(x, y, hold.frame), hold.offset, size));
  };

  const release = (event: Event, cancelled: boolean) => {
    if (!hold) return;
    if (hold.moved || cancelled) clickAfterDragUntil = event.timeStamp + CLICK_GRACE_MS;
    hold = null;
    delete lens.dataset.lifted;
    setCursor(mouseInside ? "grab" : null);
    rest();
  };

  /** A mouse or pen: a finger is followed by its touch events instead, which Safari on an iPhone delivers where it can drop a pointer press. */
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    if (!press(event.clientX, event.clientY, event.pointerId, false)) return;
    event.preventDefault();
    page.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !shown) return;
    if (hold) {
      if (!hold.touch && event.pointerId === hold.id) drag(event.clientX, event.clientY);
      return;
    }
    const frame = measure();
    setCursor(partAt(onPage(event.clientX, event.clientY, frame), frame) ? "grab" : null);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (hold && !hold.touch && event.pointerId === hold.id) release(event, event.type !== "pointerup");
  };

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    mouseInside = true;
    still();
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    mouseInside = false;
    if (!hold) setCursor(null);
    rest();
  };

  const heldTouch = (event: TouchEvent) => {
    if (!hold?.touch) return undefined;
    for (let index = 0; index < event.changedTouches.length; index++) {
      const touch = event.changedTouches[index];
      if (touch?.identifier === hold.id) return touch;
    }
    return undefined;
  };

  /** One finger on the glass, its rim, or its handle holds it in every direction; a swipe that starts anywhere else still pages the deck. */
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    if (event.touches.length === 1 && touch) press(touch.clientX, touch.clientY, touch.identifier, true);
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!hold) return;
    if (event.cancelable) event.preventDefault();
    const touch = heldTouch(event);
    if (touch) drag(touch.clientX, touch.clientY);
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (heldTouch(event)) release(event, event.type === "touchcancel");
  };

  const onScroll = () => {
    if (hold) hold.frame = null;
  };

  /**
   * A press of the glass that stayed put looks closer, as Enter and Space do; a press anywhere
   * else on the page but a link brings the glass there. A click that ends a drag is the drag's.
   */
  const onClick = (event: MouseEvent) => {
    if (!shown) return;
    if (event.timeStamp < clickAfterDragUntil) {
      clickAfterDragUntil = -Infinity;
      event.preventDefault();
      return;
    }
    if (event.detail === 0) {
      if (event.target === lens) toggle();
      return;
    }
    const frame = measure();
    const at = onPage(event.clientX, event.clientY, frame);
    if (partAt(at, frame)) {
      event.preventDefault();
      toggle();
      return;
    }
    if ((event.target as Element).closest("a") || window.getSelection()?.isCollapsed === false) return;
    aim(at);
  };

  const onKey = (event: KeyboardEvent) => {
    const step = event.shiftKey ? KEY_LEAP : KEY_STEP;
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    aim({ x: (drifting ? current.x : target.x) + move.x, y: (drifting ? current.y : target.y) + move.y });
  };

  // The copy lays out with the page, so the glass never shows it out of step: in a deck flight, one more short text layout a frame.
  const resize = new ResizeObserver(() => {
    size = { width: page.clientWidth, height: page.clientHeight };
    radius = lens.offsetWidth / 2;
    clone.style.width = `${size.width}px`;
    clone.style.height = `${size.height}px`;
    target = drifting ? target : clampCenter(target, size);
    current = clampCenter(current, size);
    if (hold) hold.frame = null;
    draw();
    wake();
  });
  resize.observe(page);
  resize.observe(lens);

  const surface = page.parentElement!;
  const listeners: [EventTarget, string, (event: never) => void, AddEventListenerOptions?][] = [
    [surface, "pointerdown", onPointerDown],
    [surface, "pointermove", onPointerMove],
    [surface, "pointerup", onPointerUp],
    [surface, "pointercancel", onPointerUp],
    [surface, "lostpointercapture", onPointerUp],
    [surface, "pointerenter", onPointerEnter],
    [surface, "pointerleave", onPointerLeave],
    // A press must reach a non-passive listener for Safari on an iPhone to deliver it, and a held finger's moves are cancelled so the deck stays put.
    [surface, "touchstart", onTouchStart, { passive: false }],
    [surface, "touchmove", onTouchMove, { passive: false }],
    [surface, "touchend", onTouchEnd],
    [surface, "touchcancel", onTouchEnd],
    [surface, "click", onClick],
    [lens, "keydown", onKey],
    [window, "scroll", onScroll, { capture: true, passive: true }],
  ];
  for (const [target, type, listener, options] of listeners) target.addEventListener(type, listener as EventListener, options);
  draw();

  return {
    arrive: () => {
      if (shown) return;
      shown = true;
      lens.dataset.shown = "";
      driftFrom = performance.now();
      play(lens.firstElementChild ? [lens.firstElementChild] : [], "arrive");
      if (mouseInside) still();
      wake();
    },
    stop: () => {
      loop.stop();
      clearTimeout(idleTimer);
      resize.disconnect();
      for (const [target, type, listener, options] of listeners) target.removeEventListener(type, listener as EventListener, options);
    },
  };
}

function useLens(refs: { [Key in keyof LensParts]: RefObject<LensParts[Key] | null> }, opened: RefObject<boolean>) {
  const lensRef = useRef<Lens | null>(null);
  useEffect(() => {
    const page = refs.page.current;
    const lens = refs.lens.current;
    const clone = refs.clone.current;
    if (!page || !lens || !clone) return;
    const controller = startLens({ page, lens, clone });
    lensRef.current = controller;
    if (opened.current) controller.arrive();
    return () => {
      controller.stop();
      lensRef.current = null;
    };
  }, [refs.page, refs.lens, refs.clone, opened]);
  return lensRef;
}

/** Raises the quote and then its attribution, and calls `landed` once both are in place. */
function revealPassage(page: HTMLElement, landed: () => void): () => void {
  const words = Array.from(page.querySelectorAll("[data-word]"));
  const attribution = page.querySelector("[data-attribution]");
  const playbacks = [play(words, "rise"), play(attribution ? [attribution] : [], "rise", { delayMs: cascadeDelays(words.length).at(-1) })];
  let cancelled = false;
  void Promise.all(playbacks.map(playback => playback.finished)).then(() => {
    if (!cancelled) landed();
  });
  return () => {
    cancelled = true;
    for (const playback of playbacks) playback.cancel();
  };
}

/** The quote and its attribution. The lens's copy is drawn the same, but only as a picture of the page: no link, nothing to read twice. */
function Passage({ quote, copy = false }: { quote: Quote; copy?: boolean }) {
  if (copy) {
    return (
      <span className={styles.figure}>
        <span className={`${stageStyles.display} ${styles.quote}`}>“{quote.text}”</span>
        <span className={styles.attribution}>
          <span className={quote.href ? stageStyles.link : undefined}>{quote.author}</span>
          <span className={stageStyles.support}>{quote.source}</span>
        </span>
      </span>
    );
  }
  return (
    <figure className={styles.figure}>
      <blockquote className={`${stageStyles.display} ${styles.quote}`}>
        <p>
          <Words text={`“${quote.text}”`} />
        </p>
      </blockquote>
      <figcaption className={styles.attribution} data-attribution>
        {quote.href ? (
          <a className={stageStyles.link} href={quote.href} target="_blank" rel="noopener noreferrer">
            {quote.author}
          </a>
        ) : (
          <span>{quote.author}</span>
        )}
        <span className={stageStyles.support}>{quote.source}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The glass is drawn on a 200-unit square around the lens's center: the window is 100 units across
 * each way, the rim sits outside it, and the handle runs off to the lower right.
 */
const GRIP = "M147 -11.5C175 -13 225 -13.5 246 -12Q262 -11 262 0Q262 11 246 12C225 13.5 175 13 147 11.5Z";

/** The glass's soft shadow on the page, rim and handle together. */
function LensShadow() {
  return (
    <svg className={styles.shadow} viewBox="-100 -100 200 200" aria-hidden="true">
      <circle r="110" />
      <path d={GRIP} transform="rotate(45)" />
      <rect x="104" y="-12.5" width="44" height="25" rx="3" transform="rotate(45)" />
    </svg>
  );
}

/** A polished steel rim and a lacquered handle with a steel ferrule, over a lens that catches the light. */
function LensFrame() {
  const id = useId();
  const url = (name: string) => `url(#${id}${name})`;
  return (
    <svg className={styles.frame} viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}rim`} gradientUnits="userSpaceOnUse" x1="-80" y1="-80" x2="80" y2="80">
          <stop offset="0" className={styles.steelLight} />
          <stop offset="0.2" className={styles.steelMid} />
          <stop offset="0.42" className={styles.steelDark} />
          <stop offset="0.52" className={styles.steelMid} />
          <stop offset="0.64" className={styles.steelLight} />
          <stop offset="0.86" className={styles.steelDark} />
          <stop offset="1" className={styles.steelDeep} />
        </linearGradient>
        <linearGradient id={`${id}steel`} gradientUnits="userSpaceOnUse" x1="0" y1="-13" x2="0" y2="13">
          <stop offset="0" className={styles.steelDark} />
          <stop offset="0.28" className={styles.steelLight} />
          <stop offset="0.55" className={styles.steelMid} />
          <stop offset="1" className={styles.steelDeep} />
        </linearGradient>
        <linearGradient id={`${id}grip`} gradientUnits="userSpaceOnUse" x1="0" y1="-13.5" x2="0" y2="13.5">
          <stop offset="0" className={styles.gripEdge} />
          <stop offset="0.3" className={styles.gripShine} />
          <stop offset="0.6" className={styles.gripBody} />
          <stop offset="1" className={styles.gripEdge} />
        </linearGradient>
        <radialGradient id={`${id}lens`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="100">
          <stop offset="0.72" className={styles.lensClear} />
          <stop offset="0.94" className={styles.lensTint} />
          <stop offset="1" className={styles.lensEdge} />
        </radialGradient>
        <linearGradient id={`${id}shine`} gradientUnits="userSpaceOnUse" x1="-70" y1="-70" x2="10" y2="10">
          <stop offset="0" className={styles.shineStrong} />
          <stop offset="1" className={styles.shineNone} />
        </linearGradient>
        <clipPath id={`${id}inside`}>
          <circle r="92" />
        </clipPath>
        <radialGradient id={`${id}glint`}>
          <stop offset="0" className={styles.shineStrong} />
          <stop offset="1" className={styles.shineNone} />
        </radialGradient>
      </defs>
      <g transform="rotate(45)">
        <rect x="104" y="-6" width="22" height="12" fill={url("steel")} />
        <rect x="122" y="-12.5" width="27" height="25" rx="3" fill={url("steel")} />
        <path d="M128 -12.5v25M143 -12.5v25" className={styles.groove} />
        <path d={GRIP} fill={url("grip")} />
        <path d="M153 -7.5C185 -9.5 225 -9.5 248 -7.5" className={styles.gripHighlight} />
      </g>
      <circle r="100" fill={url("lens")} />
      <path d="M0 -92A92 92 0 1 0 0 92A92 92 0 1 0 0 -92ZM9 -79A90 90 0 1 1 9 101A90 90 0 1 1 9 -79Z" fillRule="evenodd" fill={url("shine")} clipPath={url("inside")} />
      <ellipse cx="-50" cy="-56" rx="15" ry="6" transform="rotate(-42 -50 -56)" fill={url("glint")} />
      <circle r="98.5" className={styles.pressedRing} />
      <circle r="105" fill="none" stroke={url("rim")} strokeWidth="10" />
      <circle r="100.6" className={styles.rimInner} />
      <circle r="101.8" className={styles.rimInnerLight} />
      <circle r="109.6" className={styles.rimOuter} />
    </svg>
  );
}

export function QuoteLens({ quote = QUOTE }: { quote?: Quote }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLButtonElement>(null);
  const cloneRef = useRef<HTMLSpanElement>(null);
  const openedRef = useRef(false);
  const lens = useLens({ page: pageRef, lens: lensRef, clone: cloneRef }, openedRef);

  const open = () => {
    const page = pageRef.current;
    if (!page) return;
    return revealPassage(page, () => {
      openedRef.current = true;
      lens.current?.arrive();
    });
  };

  return (
    <Stage className={styles.stage} onOpen={open}>
      <div ref={pageRef} className={`${styles.sheet} ${styles.page}`} data-reveal>
        <Passage quote={quote} />
      </div>
      <button
        ref={lensRef}
        type="button"
        className={styles.lens}
        aria-pressed="false"
        aria-label="Magnifying glass. Press to look closer; move it with the arrow keys, by dragging its glass or handle, or by tapping the page."
      >
        <span className={styles.body}>
          <LensShadow />
          <span className={styles.window}>
            <span ref={cloneRef} className={`${styles.sheet} ${styles.clone}`} inert aria-hidden="true">
              <Passage quote={quote} copy />
            </span>
          </span>
          <LensFrame />
        </span>
      </button>
    </Stage>
  );
}
