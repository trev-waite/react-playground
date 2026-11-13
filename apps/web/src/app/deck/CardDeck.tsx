import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { LiveCard } from "../../lib/catalog";
import { frame as frameLoop } from "../motion/frameLoop";
import { useReducedMotion } from "../motion/hooks";
import { SPRING } from "../motion/transitions";
import { CardMotions, jumpCard, moveCard, type CardMotion } from "./cardMotion";
import { DeckCard } from "./DeckCard";
import { useDocumentScroll } from "./useDocumentScroll";
import { commitDistance, EDGE_PULL, PageScroll } from "./pageScroll";
import { usePaging } from "./usePaging";
import {
  anchoredScrollTop,
  cameraPose,
  centeredScrollTop,
  gridAnchor,
  gridLayout,
  gridPose,
  type GridAnchor,
  NO_INSETS,
  offsetRect,
  pageFrame,
  pagePose,
  type Insets,
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
  /** The deck owns the page, so phones may scroll the document itself. */
  documentScroll?: boolean;
};

const SCROLL_SETTLE_MS = 120;
const INSTANT = { duration: 0 } as const;
/** The open card's way back from its overshoot: as long as the morph spring takes, starting and ending at rest. */
const SETTLE = { duration: 0.5, ease: (progress: number) => progress * progress * (3 - 2 * progress) } as const;
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

/**
 * Holds the page still under a flying camera. A cancelled touchmove, not
 * `touch-action: none`: Safari keeps a touch-action region after the style
 * goes, and the page that lands would not scroll under it.
 */
function holdTouch(event: TouchEvent) {
  event.preventDefault();
}

type Viewport = Size & { insets: Insets };
type GridLayout = ReturnType<typeof gridLayout>;

/** Which element scrolled: the document on phones, the deck's own scroller elsewhere. */
type ScrollHost = "document" | "deck";
type ScrollPlace = { host: ScrollHost | null; top: number; anchor: GridAnchor | null };

function sameViewport(a: Viewport, b: Viewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.insets.top === b.insets.top &&
    a.insets.right === b.insets.right &&
    a.insets.bottom === b.insets.bottom &&
    a.insets.left === b.insets.left
  );
}

/**
 * The page size the deck lays out for, and the safe-area insets from a probe.
 * The deck's own scroller gives the height, unless the document scrolls: then
 * the probe's small viewport height holds pages still while Safari's toolbars collapse.
 */
function useViewport(
  scrollerRef: RefObject<HTMLElement | null>,
  probeRef: RefObject<HTMLElement | null>,
  scrollsDocument: boolean,
): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    insets: NO_INSETS,
  }));
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const probe = probeRef.current;
    if (!scroller || !probe) return;
    const measure = () => {
      const style = getComputedStyle(probe);
      const next: Viewport = {
        width: scroller.clientWidth,
        height: scrollsDocument ? probe.clientHeight : scroller.clientHeight,
        insets: {
          top: parseFloat(style.paddingTop) || 0,
          right: parseFloat(style.paddingRight) || 0,
          bottom: parseFloat(style.paddingBottom) || 0,
          left: parseFloat(style.paddingLeft) || 0,
        },
      };
      setViewport(current => (sameViewport(current, next) ? current : next));
    };
    // A classic scrollbar makes the scroller narrower than the window; lay out for it before the first paint.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [scrollerRef, probeRef, scrollsDocument]);
  return viewport;
}

/** The element whose scroll the reader sees: the document on phones, the deck's scroller elsewhere. */
function scrollHost(scrollsDocument: boolean, scroller: HTMLElement | null): HTMLElement | null {
  return scrollsDocument ? document.documentElement : scroller;
}

/** Where `host` is scrolled, and the grid card at the top of it when the grid shows. */
function scrollPlace(host: HTMLElement, grid?: GridLayout): ScrollPlace {
  const top = host.scrollTop;
  return {
    host: host === document.documentElement ? "document" : "deck",
    top,
    anchor: grid ? gridAnchor(grid.rects, top) : null,
  };
}

/**
 * Pages stack in a native scroll-snap column. The grid is a camera pulled
 * back from that page: the open card shrinks into its tile while the others
 * arrive from beyond the viewport, and opening a tile runs the same shot in
 * reverse. Cards are absolutely placed so one element (and its component
 * state) survives every change of layout.
 */
export function CardDeck({
  cards,
  view,
  activeIndex,
  listening,
  onActiveChange,
  onOpen,
  documentScroll = false,
}: CardDeckProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const scrollsDocument = useDocumentScroll(documentScroll);
  const viewport = useViewport(scrollerRef, probeRef, scrollsDocument);
  const reducedMotion = useReducedMotion();
  /** The page column has taken over from the zoom. False in the grid and in flight. */
  const [paged, setPaged] = useState(view === "page");
  // Leaving a view hands it to the camera: the page column only returns once a flight lands.
  const [shownView, setShownView] = useState(view);
  if (shownView !== view) {
    setShownView(view);
    setPaged(false);
  }
  const [nearIndex, setNearIndex] = useState(activeIndex);
  /** Previews mounted ahead of time, and kept, so the grid never pays for first renders mid-flight. */
  const [warm, setWarm] = useState<ReadonlySet<string>>(() => new Set());
  const [motions] = useState(() => new CardMotions());
  const flight = useRef(0);
  /** The card a flight to a page is bringing in, and where its top is headed, to tell how far past it the card has sprung. */
  const landing = useRef<{ slug: string; top: number } | null>(null);
  /** The last scroll the reader saw, and the grid card at the top of it, so a relayout keeps their place. */
  const scrolled = useRef<ScrollPlace>({
    host: null,
    top: 0,
    anchor: null,
  });
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Bumped by every programmatic scroll, so only the last one to rest turns snapping back on. */
  const snapRequest = useRef(0);
  const [pages] = useState(() => new PageScroll());

  const grid = useMemo(
    () => gridLayout(cards.map(card => card.size), viewport, viewport.insets),
    [cards, viewport],
  );
  const frame = pageFrame(viewport, viewport.insets);
  const layout = view === "grid" ? "grid" : paged ? "pages" : "flight";
  const transition = reducedMotion ? INSTANT : SPRING.morph;
  const pageRect = (index: number) => offsetRect(frame, index * viewport.height);

  const motionFor = (card: LiveCard, index: number): CardMotion =>
    motions.for(card.slug, pagePose(pageRect(index)));

  const latest = useRef({ cards, grid, frame, viewport, activeIndex, transition, scrollsDocument });
  useLayoutEffect(() => {
    latest.current = { cards, grid, frame, viewport, activeIndex, transition, scrollsDocument };
  });
  if (layout === "pages" ? false : cards.some(card => !warm.has(card.slug))) {
    setWarm(new Set(cards.map(card => card.slug)));
  }
  const [nearFor, setNearFor] = useState({ activeIndex, layout });
  if (nearFor.activeIndex !== activeIndex || nearFor.layout !== layout) {
    setNearFor({ activeIndex, layout });
    if (layout === "pages") setNearIndex(activeIndex);
  }


  /**
   * Turns scroll-snap back on a frame after a programmatic scroll has painted.
   * Safari returns a snapping document to the page a finger last left it on,
   * unless the new offset reached its compositor before snapping resumed.
   */
  const resumeSnap = useCallback(() => {
    const request = ++snapRequest.current;
    frameLoop.render(() =>
      frameLoop.render(() => {
        if (snapRequest.current === request) scrollerRef.current?.removeAttribute("data-gliding");
      }),
    );
  }, []);

  useLayoutEffect(
    () =>
      pages.attach({
        write: top => {
          const host = scrollHost(latest.current.scrollsDocument, scrollerRef.current);
          if (host) host.scrollTop = top;
        },
        onSettle: () => resumeSnap(),
      }),
    [pages, resumeSnap],
  );

  /** Marks the cards in flight: they ride the compositor, and a finger cannot scroll the page under them. */
  const setFlying = useCallback((flying: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.hasAttribute("data-flying") === flying) return;
    scroller.toggleAttribute("data-flying", flying);
    if (flying) window.addEventListener("touchmove", holdTouch, { passive: false });
    else window.removeEventListener("touchmove", holdTouch);
  }, []);

  const stopGlide = useCallback(() => {
    pages.stop();
    snapRequest.current++;
    scrollerRef.current?.removeAttribute("data-gliding");
  }, [pages]);

  /** Puts the page column at `top` at once, with snapping off until Safari has seen it there. */
  const jumpPages = useCallback(
    (host: HTMLElement, top: number) => {
      stopGlide();
      scrollerRef.current?.setAttribute("data-gliding", "");
      host.scrollTop = top;
      resumeSnap();
    },
    [stopGlide, resumeSnap],
  );

  /** Moves the page column in `host` toward `target` from wherever it is, turning snapping off until it rests. */
  const scrollPages = useCallback(
    (host: HTMLElement | null, target: number, how: "follow" | "glide") => {
      const scroller = scrollerRef.current;
      if (!scroller || !host) return;
      pages.sync(host.scrollTop);
      snapRequest.current++;
      scroller.dataset.gliding = "";
      if (how === "follow") pages.follow(target);
      else pages.glide(target);
    },
    [pages],
  );

  const previous = useRef<{ view: DeckView; paged: boolean; grid: typeof grid } | null>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const host = scrollHost(latest.current.scrollsDocument, scrollerRef.current);
    if (!host) return;
    const hostChanged = scrolled.current.host !== null && scrolled.current.host !== (scrollsDocument ? "document" : "deck");
    const { cards, grid, frame, viewport, activeIndex, transition } = latest.current;
    const prior = previous.current;
    previous.current = { view, paged, grid };
    const motionOf = (card: LiveCard, index: number) =>
      motions.for(card.slug, pagePose(offsetRect(frame, index * viewport.height)));
    const each = (place: (motion: CardMotion, index: number) => void) =>
      cards.forEach((card, index) => place(motionOf(card, index), index));
    const focus = grid.rects[activeIndex];

    const pageAt = (index: number) => pagePose(offsetRect(frame, index * viewport.height));

    const showPages = () => {
      jumpPages(host, activeIndex * viewport.height);
      scrolled.current = scrollPlace(host);
      each((motion, index) => jumpCard(motion, pageAt(index)));
    };

    /**
     * Takes the page column over from a camera that is still settling. The open
     * card is at rest at the top of its overshoot, so it eases the last few
     * pixels from there, still composited as a flight, while the pages above and
     * below are placed at once: Safari shows their edges under its toolbars.
     */
    const landPages = () => {
      const flown = landing.current;
      // The reader paged on while the camera flew: the card it brought in is not the one to show, so nothing eases.
      if (!flown || flown.slug !== cards[activeIndex]?.slug) {
        showPages();
        setFlying(false);
        return;
      }
      const open = motionOf(cards[activeIndex]!, activeIndex);
      const overshoot = open.top.get() - flown.top;
      jumpPages(host, activeIndex * viewport.height);
      scrolled.current = scrollPlace(host);
      each((motion, index) => {
        if (motion !== open) jumpCard(motion, pageAt(index));
      });
      const page = pageAt(activeIndex);
      open.top.jump(page.rect.y + overshoot);
      const id = flight.current;
      void moveCard(open, page, SETTLE).then(() => {
        if (flight.current === id) setFlying(false);
      });
    };

    /** Runs one camera move; `land` follows unless another move superseded it. */
    const fly = (id: number, move: (card: LiveCard, index: number) => Promise<void>, land: () => void) => {
      setFlying(true);
      void Promise.all(cards.map(move)).then(() => {
        if (flight.current === id) land();
      });
    };

    /** Flies the camera in to the active page, and hands over to the page column as the card arrives. */
    const flyToPage = (id: number) => {
      const open = cards[activeIndex];
      if (!focus || !open) return;
      const camera = offsetRect(frame, host.scrollTop);
      const { chrome } = motionOf(open, activeIndex);
      landing.current = { slug: open.slug, top: camera.y };
      // Chrome springs to 1, so falling from past 1 is the top of the overshoot. A move with no bounce lands at rest.
      let last = chrome.get();
      const stopWatching = chrome.on(next => {
        const arrived = next >= 1 && next < last;
        last = next;
        if (arrived || flight.current !== id) stopWatching();
        if (arrived && flight.current === id) setPaged(true);
      });
      fly(
        id,
        (card, index) =>
          moveCard(
            motionOf(card, index),
            index === activeIndex ? pagePose(camera) : cameraPose(grid.rects[index]!, focus, camera),
            transition,
          ),
        () => {
          stopWatching();
          setPaged(true);
        },
      );
    };

    if (prior && prior.view !== view && focus) {
      // The camera owns the scroll from here; a page glide or settle would fight it.
      stopGlide();
      clearTimeout(settleTimer.current);
      const id = ++flight.current;
      if (view === "grid") {
        if (prior.paged) {
          // Hand over from the page column to the grid's scroll without a visible jump.
          const visibleTop = motionOf(cards[activeIndex]!, activeIndex).top.get() - scrolled.current.top;
          const top = centeredScrollTop(focus, viewport, grid.height);
          host.scrollTop = top;
          scrolled.current = scrollPlace(host, grid);
          const camera = offsetRect(frame, top);
          each((motion, index) =>
            jumpCard(
              motion,
              index === activeIndex
                ? pagePose({ ...frame, y: visibleTop + top })
                : cameraPose(grid.rects[index]!, focus, camera),
            ),
          );
        }
        fly(
          id,
          (card, index) => moveCard(motionOf(card, index), gridPose(grid.rects[index]!), transition),
          () => setFlying(false),
        );
      } else {
        flyToPage(id);
      }
      return;
    }

    if (view === "page" && paged && prior && !prior.paged) {
      landPages();
      // The tile that opened this page is gone; keep keyboard focus in the deck.
      if (document.activeElement === document.body) scroller.focus({ preventScroll: true });
      return;
    }

    if (prior && prior.grid === grid && !hostChanged) return;
    // First paint, a resize, or a catalog change: settle where the current view rests.
    // A glide in progress is aiming at the old layout's offsets, so it stops here.
    stopGlide();
    flight.current++;
    setFlying(false);
    if (view === "grid") {
      each((motion, index) => jumpCard(motion, gridPose(grid.rects[index]!)));
      // A resize, or crossing the phone breakpoint (which swaps the scrolling element), keeps the top card in place.
      const anchor = scrolled.current.anchor;
      const top = anchor ? anchoredScrollTop(grid.rects, anchor) : null;
      if (prior && top !== null) host.scrollTop = top;
      scrolled.current = scrollPlace(host, grid);
    } else if (paged) {
      showPages();
    } else if (focus) {
      // Resized mid-flight to a page: finish the move at the new size.
      flyToPage(flight.current);
    }
  }, [view, paged, grid, scrollsDocument, motions, stopGlide, jumpPages, setFlying]);

  // Glide to pages chosen by wheel, keys, the pager, or a link. Scroll-snap
  // stays off in flight so it cannot fight the spring.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const host = scrollHost(latest.current.scrollsDocument, scrollerRef.current);
    if (!scroller || !host || layout !== "pages") return;
    const target = activeIndex * viewport.height;
    if (!pages.moving && Math.abs(host.scrollTop - target) < 1) return;
    if (reducedMotion || Math.abs(host.scrollTop - target) > viewport.height * 1.5) {
      jumpPages(host, target);
      return;
    }
    scrollPages(host, target, "glide");
  }, [activeIndex, layout, viewport.height, reducedMotion, scrollsDocument, pages, scrollPages, jumpPages]);

  useEffect(() => {
    motions.keep(new Set(cards.map(card => card.slug)));
  }, [cards, motions]);

  useEffect(
    () => () => {
      clearTimeout(settleTimer.current);
      pages.stop();
      motions.stopAll();
      window.removeEventListener("touchmove", holdTouch);
    },
    [pages, motions],
  );

  useEffect(() => {
    if (layout !== "pages") return;
    const next = cards.find(card => !warm.has(card.slug));
    if (!next) return;
    return whenIdle(() => setWarm(current => new Set(current).add(next.slug)));
  }, [cards, layout, warm]);

  const restingTop = () => latest.current.activeIndex * viewport.height;
  const pageHost = () => scrollHost(latest.current.scrollsDocument, scrollerRef.current);
  usePaging(scrollerRef, listening && layout === "pages", {
    commitAt: commitDistance(viewport.height),
    pull: travel => {
      if (reducedMotion) return;
      const index = latest.current.activeIndex;
      const pastEnd = (travel < 0 && index === 0) || (travel > 0 && index === cards.length - 1);
      scrollPages(pageHost(), restingTop() + travel * (pastEnd ? EDGE_PULL : 1), "follow");
    },
    step: direction => {
      const next = Math.min(cards.length - 1, Math.max(0, latest.current.activeIndex + direction));
      if (next !== latest.current.activeIndex) onActiveChange(next);
      else if (pages.moving) scrollPages(pageHost(), restingTop(), "glide");
    },
    release: () => {
      const host = pageHost();
      if (pages.moving || host?.scrollTop !== restingTop()) scrollPages(host, restingTop(), "glide");
    },
  });

  function onScroll() {
    const host = pageHost();
    if (!host) return;
    scrolled.current = scrollPlace(host, layout === "grid" ? latest.current.grid : undefined);
    if (layout !== "pages") return;
    const index = Math.round(host.scrollTop / viewport.height);
    setNearIndex(index);
    clearTimeout(settleTimer.current);
    // Only a scroll the reader made picks the page; a glide already knows where it is going.
    settleTimer.current = setTimeout(() => {
      if (!pages.moving && index !== latest.current.activeIndex) onActiveChange(index);
    }, SCROLL_SETTLE_MS);
  }

  const onDocumentScroll = useEffectEvent(onScroll);

  useEffect(() => {
    if (!scrollsDocument) return;
    window.addEventListener("scroll", onDocumentScroll, { passive: true });
    return () => window.removeEventListener("scroll", onDocumentScroll);
  }, [scrollsDocument]);

  return (
    <div className={styles.deck}>
      <div ref={probeRef} className={styles.probe} aria-hidden="true" />
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
              tile={grid.rects[index]!}
              pageWidth={frame.width}
              mounted={layout !== "pages" || warm.has(card.slug) || Math.abs(index - nearIndex) <= 1}
              interactive={layout === "pages"}
              // Pages never overlap. Moving the raise as the reader pages made Safari repaint two whole cards.
              raised={layout !== "pages" && index === activeIndex}
              onOpen={layout === "grid" ? () => onOpen(index) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
