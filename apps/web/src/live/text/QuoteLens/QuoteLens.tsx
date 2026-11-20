import { useEffect, useRef, type RefObject } from "react";
import { cascadeDelays, play, prefersReducedMotion } from "@/live/shared/Stage/choreography";
import { Stage, Words } from "@/live/shared/Stage/Stage";
import stageStyles from "@/live/shared/Stage/Stage.module.css";
import { approach, clampCenter, cloneTransform, driftAt, follow, type Point, type Size } from "./lens";
import styles from "./QuoteLens.module.css";

export type Quote = { text: string; author: string; source: string; href?: string };

/** Dan Campbell on the Lions' injuries, November 17, 2026, in the words NFL.com printed, joined where it left a line out. */
const QUOTE: Quote = {
  text: "If you’re not careful, you lay in bed at night and you start thinking about all the ‘what ifs.’ … I refuse to look at it that way. It’s time to move on.",
  author: "Dan Campbell",
  source: "Detroit Lions head coach, November 17, 2026",
  href: "https://www.nfl.com/news/lions-dan-campbell-refuses-to-be-a-miserable-piece-of-expletive-after-string-of-injuries",
};

/** The glass's two strengths; pressing it switches between them. */
const MAGNIFY = 1.6;
const MAGNIFY_CLOSE = 2.4;
/** Movement that makes a press a drag rather than a press of the glass. */
const DRAG_SLOP = 6;
/** How quickly the glass catches the hand, how gently it drifts back into its idle path, and how fast it zooms, per second. */
const FOLLOW_RATE = 16;
const DRIFT_RATE = 2.5;
const ZOOM_RATE = 12;
/** Left alone this long, the glass goes back to drifting over the page. */
const IDLE_MS = 3500;
/** Quiet time after the page last resized before the magnified copy lays out at the new size. */
const RESIZE_SETTLE_MS = 120;
const KEY_STEP = 16;
const KEY_LEAP = 48;

type Lens = { arrive: () => void; stop: () => void };

type LensParts = {
  page: HTMLDivElement;
  lens: HTMLButtonElement;
  clone: HTMLSpanElement;
};

function startLens({ page, lens, clone }: LensParts): Lens {
  const reduced = prefersReducedMotion();
  let size: Size = { width: page.clientWidth, height: page.clientHeight };
  let radius = lens.offsetWidth / 2;
  let current: Point = driftAt(0, size);
  let target: Point = current;
  let scale = MAGNIFY;
  let drifting = !reduced;
  let shown = false;
  let visible = true;
  let frame = 0;
  let last = 0;
  let driftFrom = 0;
  let touchedAt = 0;
  let grab: { id: number; offset: Point; from: Point; claimed: boolean } | null = null;
  let tap: { id: number; from: Point } | null = null;
  let mouseInside = false;
  let sized = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  let dragged = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const zoomed = () => lens.getAttribute("aria-pressed") === "true";

  const draw = () => {
    lens.style.transform = `translate(${current.x - radius}px, ${current.y - radius}px)`;
    clone.style.transform = cloneTransform(current, radius, scale);
  };

  const tick = (now: number) => {
    frame = 0;
    const seconds = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (drifting) target = driftAt((now - driftFrom) / 1000, size);
    current = reduced ? target : follow(current, target, seconds, drifting ? DRIFT_RATE : FOLLOW_RATE);
    const strength = zoomed() ? MAGNIFY_CLOSE : MAGNIFY;
    scale = reduced ? strength : approach(scale, strength, seconds, ZOOM_RATE);
    draw();
    const settled = Math.hypot(current.x - target.x, current.y - target.y) < 0.1 && Math.abs(scale - strength) < 0.001;
    if (!settled || drifting) wake();
    else last = 0;
  };

  const wake = () => {
    if (!frame && visible && shown) frame = requestAnimationFrame(tick);
  };

  const rest = () => {
    clearTimeout(idleTimer);
    if (reduced) return;
    idleTimer = setTimeout(() => {
      if (grab || mouseInside || lens.matches(":focus-visible")) return rest();
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

  const local = (event: PointerEvent): Point => {
    const bounds = page.getBoundingClientRect();
    const ratio = bounds.width / Math.max(1, page.offsetWidth);
    return { x: (event.clientX - bounds.left) / ratio, y: (event.clientY - bounds.top) / ratio };
  };

  const onHover = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || grab || !shown) return;
    aim(local(event));
  };

  const onMouseEnter = (event: PointerEvent) => {
    if (event.pointerType === "mouse") mouseInside = true;
  };

  const onMouseLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    mouseInside = false;
    rest();
  };

  /** A finger on the page places the glass where it lifts, unless it moved: then it was a swipe for the deck. */
  const onPageDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || !shown || lens.contains(event.target as Node)) return;
    if ((event.target as Element).closest("a")) return;
    tap = { id: event.pointerId, from: local(event) };
  };

  const onPageUp = (event: PointerEvent) => {
    if (!tap || event.pointerId !== tap.id) return;
    const at = local(event);
    const still = Math.hypot(at.x - tap.from.x, at.y - tap.from.y) <= DRAG_SLOP;
    tap = null;
    if (!still) return;
    touchedAt = event.timeStamp;
    aim(at);
  };

  const onPageCancel = () => {
    tap = null;
  };

  /** A finger on the glass drags it only once it moves sideways; a vertical swipe is left to page the deck. */
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || grab || !shown) return;
    const at = local(event);
    grab = { id: event.pointerId, offset: { x: current.x - at.x, y: current.y - at.y }, from: at, claimed: false };
  };

  const onMove = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.id) return;
    const at = local(event);
    if (!grab.claimed) {
      const dx = at.x - grab.from.x;
      const dy = at.y - grab.from.y;
      if (Math.hypot(dx, dy) <= DRAG_SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        grab = null;
        return;
      }
      grab.claimed = true;
      lens.setPointerCapture(event.pointerId);
      lens.dataset.lifted = "";
    }
    aim({ x: at.x + grab.offset.x, y: at.y + grab.offset.y });
  };

  const onUp = (event: PointerEvent) => {
    if (!grab || event.pointerId !== grab.id) return;
    dragged = grab.claimed;
    grab = null;
    delete lens.dataset.lifted;
    rest();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (grab?.claimed) event.preventDefault();
  };

  /** A mouse never presses the glass itself, which floats under it: a click anywhere on the page but a link looks closer. */
  const onPageClick = (event: MouseEvent) => {
    if (!fine.matches || !shown || (event.target as Element).closest("a") || lens.contains(event.target as Node)) return;
    lens.setAttribute("aria-pressed", String(!zoomed()));
    wake();
  };

  const onClick = (event: MouseEvent) => {
    if (dragged || event.timeStamp - touchedAt < 50) {
      dragged = false;
      event.preventDefault();
      return;
    }
    lens.setAttribute("aria-pressed", String(!zoomed()));
    wake();
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

  /** The copy relays out its text only once the page has stopped resizing, so a deck flight lays out one quote a frame, not two. */
  const sizeClone = () => {
    clone.style.width = `${size.width}px`;
    clone.style.height = `${size.height}px`;
    clone.style.visibility = "";
    draw();
  };

  const resize = new ResizeObserver(() => {
    size = { width: page.clientWidth, height: page.clientHeight };
    radius = lens.offsetWidth / 2;
    clearTimeout(settleTimer);
    if (sized) {
      clone.style.visibility = "hidden";
      settleTimer = setTimeout(sizeClone, RESIZE_SETTLE_MS);
    } else {
      sized = true;
      sizeClone();
    }
    target = drifting ? target : clampCenter(target, size);
    current = clampCenter(current, size);
    draw();
    wake();
  });
  resize.observe(page);
  resize.observe(lens);

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) wake();
    else if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
  });
  observer.observe(page);

  const surface = page.parentElement!;
  surface.addEventListener("pointermove", onHover);
  surface.addEventListener("pointerenter", onMouseEnter);
  surface.addEventListener("pointerleave", onMouseLeave);
  page.addEventListener("pointerdown", onPageDown);
  page.addEventListener("pointerup", onPageUp);
  page.addEventListener("click", onPageClick);
  page.addEventListener("pointercancel", onPageCancel);
  lens.addEventListener("pointerdown", onDown);
  lens.addEventListener("pointermove", onMove);
  lens.addEventListener("pointerup", onUp);
  lens.addEventListener("pointercancel", onUp);
  lens.addEventListener("touchmove", onTouchMove, { passive: false });
  lens.addEventListener("keydown", onKey);
  lens.addEventListener("click", onClick);
  draw();

  return {
    arrive: () => {
      if (shown) return;
      shown = true;
      lens.dataset.shown = "";
      driftFrom = performance.now();
      play(lens.firstElementChild ? [lens.firstElementChild] : [], "arrive");
      wake();
    },
    stop: () => {
      cancelAnimationFrame(frame);
      clearTimeout(idleTimer);
      clearTimeout(settleTimer);
      resize.disconnect();
      observer.disconnect();
      surface.removeEventListener("pointermove", onHover);
      surface.removeEventListener("pointerenter", onMouseEnter);
      surface.removeEventListener("pointerleave", onMouseLeave);
      page.removeEventListener("pointerdown", onPageDown);
      page.removeEventListener("pointerup", onPageUp);
      page.removeEventListener("click", onPageClick);
      page.removeEventListener("pointercancel", onPageCancel);
      lens.removeEventListener("pointerdown", onDown);
      lens.removeEventListener("pointermove", onMove);
      lens.removeEventListener("pointerup", onUp);
      lens.removeEventListener("pointercancel", onUp);
      lens.removeEventListener("touchmove", onTouchMove);
      lens.removeEventListener("keydown", onKey);
      lens.removeEventListener("click", onClick);
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
        aria-label="Magnifying glass. Press to look closer; move it with the arrow keys, or by pointing, tapping, or dragging."
      >
        <span className={styles.body}>
          <span className={styles.shadow} />
          <span className={styles.handle} />
          <span className={styles.rim} />
          <span className={styles.window}>
            <span ref={cloneRef} className={`${styles.sheet} ${styles.clone}`} inert aria-hidden="true">
              <Passage quote={quote} copy />
            </span>
            <span className={styles.glass} />
          </span>
        </span>
      </button>
    </Stage>
  );
}
