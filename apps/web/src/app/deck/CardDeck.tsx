import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import type { LiveCard } from "../../lib/catalog";
import { SPRING } from "../motion";
import { createCardMotion, jumpCard, moveCard, type CardMotion } from "./cardMotion";
import { DeckCard } from "./DeckCard";
import { usePaging } from "./usePaging";
import {
  cameraPose,
  centeredScrollTop,
  gridLayout,
  gridPose,
  offsetRect,
  pageFrame,
  pagePose,
  type Size,
} from "./deckLayout";
import styles from "./CardDeck.module.css";

export type DeckView = "page" | "grid";

type CardDeckProps = {
  cards: LiveCard[];
  view: DeckView;
  activeIndex: number;
  /** Take wheel and keyboard paging. Off while another view is showing. */
  listening: boolean;
  /** The page the reader scrolled to. */
  onActiveChange: (index: number) => void;
  /** A grid tile was chosen. */
  onOpen: (index: number) => void;
};

const SCROLL_SETTLE_MS = 120;
const INSTANT = { duration: 0 } as const;
/** Fallback for browsers without requestIdleCallback. */
const IDLE_FALLBACK_MS = 200;

function whenIdle(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, IDLE_FALLBACK_MS);
  return () => clearTimeout(id);
}

function useViewportSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setSize(current =>
        current.width === element.clientWidth && current.height === element.clientHeight
          ? current
          : { width: element.clientWidth, height: element.clientHeight },
      );
    // A classic scrollbar makes the scroller narrower than the window; lay out for it before the first paint.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Pages stack in a native scroll-snap column. The grid is a camera pulled
 * back from that page: the open card shrinks into its tile while the others
 * arrive from beyond the viewport, and opening a tile runs the same shot in
 * reverse. Cards are absolutely placed so one element (and its component
 * state) survives every change of layout.
 */
export function CardDeck({ cards, view, activeIndex, listening, onActiveChange, onOpen }: CardDeckProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const viewport = useViewportSize(scrollerRef);
  const reducedMotion = useReducedMotion();
  /** The page column has taken over from the zoom. False in the grid and in flight. */
  const [paged, setPaged] = useState(view === "page");
  const [nearIndex, setNearIndex] = useState(activeIndex);
  /** Previews mounted ahead of time, and kept, so the grid never pays for first renders mid-flight. */
  const [warm, setWarm] = useState<ReadonlySet<string>>(() => new Set());
  const motions = useRef(new Map<string, CardMotion>());
  const flight = useRef(0);
  const scrollTop = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const glide = useRef<AnimationPlaybackControls | null>(null);

  const grid = useMemo(() => gridLayout(cards.map(card => card.size), viewport), [cards, viewport]);
  const frame = pageFrame(viewport);
  const layout = view === "grid" ? "grid" : paged ? "pages" : "flight";
  const transition = reducedMotion ? INSTANT : SPRING.morph;
  const pageRect = (index: number) => offsetRect(frame, index * viewport.height);

  function motionFor(card: LiveCard, index: number): CardMotion {
    let motion = motions.current.get(card.slug);
    if (!motion) {
      motion = createCardMotion(pagePose(pageRect(index)));
      motions.current.set(card.slug, motion);
    }
    return motion;
  }

  const latest = useRef({ cards, grid, frame, viewport, activeIndex, transition });
  latest.current = { cards, grid, frame, viewport, activeIndex, transition };
  const previous = useRef<{ view: DeckView; paged: boolean; grid: typeof grid } | null>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const { cards, grid, frame, viewport, activeIndex, transition } = latest.current;
    const prior = previous.current;
    previous.current = { view, paged, grid };
    const each = (place: (motion: CardMotion, index: number) => void) =>
      cards.forEach((card, index) => place(motionFor(card, index), index));
    const focus = grid.rects[activeIndex];

    const showPages = () => {
      scroller.scrollTop = activeIndex * viewport.height;
      scrollTop.current = scroller.scrollTop;
      each((motion, index) => jumpCard(motion, pagePose(offsetRect(frame, index * viewport.height))));
    };

    /** Runs one camera move; true when it finished without being superseded. */
    const fly = async (id: number, move: (card: LiveCard, index: number) => Promise<void>) => {
      // Cards ride the compositor while they fly so the camera never repaints them.
      scroller.dataset.flying = "";
      await Promise.all(cards.map(move));
      if (flight.current !== id) return false;
      delete scroller.dataset.flying;
      return true;
    };

    if (prior && prior.view !== view && focus) {
      // The camera owns the scroll from here; a page glide or settle would fight it.
      stopGlide();
      clearTimeout(settleTimer.current);
      const id = ++flight.current;
      if (view === "grid") {
        if (prior.paged) {
          // Hand over from the page column to the grid's scroll without a visible jump.
          const visibleTop = motionFor(cards[activeIndex]!, activeIndex).top.get() - scrollTop.current;
          const top = centeredScrollTop(focus, viewport, grid.height);
          scroller.scrollTop = top;
          scrollTop.current = top;
          const camera = offsetRect(frame, top);
          each((motion, index) =>
            jumpCard(
              motion,
              index === activeIndex
                ? pagePose({ ...frame, y: visibleTop + top })
                : cameraPose(grid.rects[index]!, focus, camera),
            ),
          );
          setPaged(false);
        }
        void fly(id, (card, index) => moveCard(motionFor(card, index), gridPose(grid.rects[index]!), transition));
      } else {
        const camera = offsetRect(frame, scroller.scrollTop);
        void fly(id, (card, index) =>
          moveCard(
            motionFor(card, index),
            index === activeIndex ? pagePose(camera) : cameraPose(grid.rects[index]!, focus, camera),
            transition,
          ),
        ).then(landed => {
          if (landed) setPaged(true);
        });
      }
      return;
    }

    if (view === "page" && paged && prior && !prior.paged) {
      showPages();
      // The tile that opened this page is gone; keep keyboard focus in the deck.
      if (document.activeElement === document.body) scroller.focus({ preventScroll: true });
      return;
    }

    if (prior && prior.grid === grid) return;
    // First paint, a resize, or a catalog change: settle where the current view rests.
    flight.current++;
    delete scroller.dataset.flying;
    if (view === "grid") {
      each((motion, index) => jumpCard(motion, gridPose(grid.rects[index]!)));
    } else if (paged) {
      showPages();
    } else {
      setPaged(true);
    }
  }, [view, paged, grid]);

  function stopGlide() {
    glide.current?.stop();
    glide.current = null;
    delete scrollerRef.current?.dataset.gliding;
  }

  // Glide to pages chosen by wheel, keys, the pager, or a link. Scroll-snap
  // stays off in flight so it cannot fight the spring.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || layout !== "pages") return;
    setNearIndex(activeIndex);
    const target = activeIndex * viewport.height;
    stopGlide();
    if (Math.abs(scroller.scrollTop - target) < 1) return;
    if (reducedMotion || Math.abs(scroller.scrollTop - target) > viewport.height * 1.5) {
      scroller.scrollTop = target;
      return;
    }
    scroller.dataset.gliding = "";
    glide.current = animate(scroller.scrollTop, target, {
      ...SPRING.morph,
      onUpdate: top => {
        scroller.scrollTop = top;
      },
      onComplete: stopGlide,
    });
  }, [activeIndex, layout, viewport.height, reducedMotion]);

  useEffect(
    () => () => {
      clearTimeout(settleTimer.current);
      glide.current?.stop();
    },
    [],
  );

  useEffect(() => {
    if (layout !== "pages") {
      if (warm.size < cards.length) setWarm(new Set(cards.map(card => card.slug)));
      return;
    }
    const next = cards.find(card => !warm.has(card.slug));
    if (!next) return;
    return whenIdle(() => setWarm(current => new Set(current).add(next.slug)));
  }, [cards, layout, warm]);

  usePaging(scrollerRef, listening && layout === "pages", direction => {
    const next = Math.min(cards.length - 1, Math.max(0, latest.current.activeIndex + direction));
    if (next !== latest.current.activeIndex) onActiveChange(next);
  });

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scrollTop.current = scroller.scrollTop;
    if (layout !== "pages") return;
    const index = Math.round(scroller.scrollTop / viewport.height);
    setNearIndex(index);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      if (index !== latest.current.activeIndex) onActiveChange(index);
    }, SCROLL_SETTLE_MS);
  }

  return (
    <div className={styles.deck}>
      <div
        ref={scrollerRef}
        className={styles.scroller}
        data-layout={layout}
        tabIndex={-1}
        onScroll={onScroll}
      >
        <div
          className={styles.content}
          style={{ height: layout === "pages" ? cards.length * viewport.height : grid.height }}
        >
          {layout === "pages"
            ? cards.map(card => (
                <div key={card.slug} className={styles.snap} style={{ height: viewport.height }} />
              ))
            : null}
          {cards.map((card, index) => (
            <DeckCard
              key={card.slug}
              card={card}
              motion={motionFor(card, index)}
              mounted={layout !== "pages" || warm.has(card.slug) || Math.abs(index - nearIndex) <= 1}
              interactive={layout === "pages"}
              raised={index === activeIndex}
              onOpen={layout === "grid" ? () => onOpen(index) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
