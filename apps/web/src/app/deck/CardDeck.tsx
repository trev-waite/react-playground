import { startTransition, useCallback, useDeferredValue, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { LiveCard } from "../../lib/catalog";
import { frame as frameLoop } from "../motion/frameLoop";
import { useReducedMotion } from "../motion/hooks";
import { SPRING } from "../motion/transitions";
import { CardMotions, jumpCard, moveCard, nearPose, type CardMotion } from "./cardMotion";
import { DeckCard } from "./DeckCard";
import { nearCards, nextToWarm, type DeckPlace, type GridWindow } from "./mountPolicy";
import { useDocumentScroll } from "./useDocumentScroll";
import { commitDistance, EDGE_PULL, PageScroll } from "./pageScroll";
import { placeUnseen } from "./placeUnseen";
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
  onShowCode?: (index: number, trigger: HTMLElement) => void;
  /** A page's code button is about to be pressed (hovered or focused): fetch what it opens. */
  onPrepareCode?: (index: number) => void;
  /** The deck owns the page, so phones may scroll the document itself. */
  documentScroll?: boolean;
};

const SCROLL_SETTLE_MS = 120;
const INSTANT = { duration: 0 } as const;
/** The open card's way back from its overshoot: as long as the morph spring takes, starting and ending at rest. */
const SETTLE = { duration: 0.5, ease: (progress: number) => progress * progress * (3 - 2 * progress) } as const;
/** Fallback for browsers without requestIdleCallback. */
const IDLE_FALLBACK_MS = 200;
/** A scroll this recent still counts as the reader moving. */
const QUIET_AFTER_SCROLL_MS = 200;

/**
 * Runs `callback` in an idle moment when nothing is moving. Mounting a
 * preview can take several frames, so it waits out flights, glides, and
 * scrolls rather than stalling them.
 */
function whenQuiet(isMoving: () => boolean, callback: () => void): () => void {
  let cancel = () => {};
  const wait = () => {
    const run = () => (isMoving() ? wait() : callback());
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run);
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(run, IDLE_FALLBACK_MS);
      cancel = () => clearTimeout(id);
    }
  };
  wait();
  return () => cancel();
}

/** Mounts `card` once its code has arrived and nothing is moving, so the mount never waits on the network mid-motion. */
function warmWhenReady(card: LiveCard, isMoving: () => boolean, mount: () => void): () => void {
  let stopped = false;
  let stopWaiting = () => {};
  void Promise.allSettled(card.members.map(member => member.load())).then(() => {
    if (!stopped) stopWaiting = whenQuiet(isMoving, mount);
  });
  return () => {
    stopped = true;
    stopWaiting();
  };
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

/**
 * The page column's height. Pages are a small viewport tall, but once Safari's
 * toolbars collapse the document shows a large viewport, and the last page could
 * no longer scroll up to its place, so a large viewport is kept below its top.
 */
function pagesHeight(count: number, pageHeight: number, scrollsDocument: boolean): number | string {
  const column = count * pageHeight;
  return scrollsDocument ? `max(${column}px, calc(${column - pageHeight}px + 100lvh))` : column;
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
  onShowCode,
  onPrepareCode,
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
  /** Where the reader scrolled the grid to, in quarter screens; null until they scroll it, when it centers the open card. */
  const [gridTop, setGridTop] = useState<number | null>(null);
  /**
   * The camera is at rest: no flight since the view last changed has yet to
   * land. The page column takes over before the open card stops settling, so
   * `paged` alone would let new previews mount under a moving card.
   */
  const [landed, setLanded] = useState(true);
  if (shownView !== view) {
    setShownView(view);
    setPaged(false);
    setLanded(false);
    if (view === "grid") setGridTop(null);
  }
  const [nearIndex, setNearIndex] = useState(activeIndex);
  /** The page whose neighbors mount: it trails `nearIndex` in a background render, so a new neighbor never blocks a glide. */
  const mountIndex = useDeferredValue(nearIndex);
  /** Previews mounted once near, or ahead of time while idle, and kept, so a flight never pays for first renders. */
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
  /** When the reader last scrolled, so idle work waits for them to stop. */
  const lastScroll = useRef(-Infinity);
  /** Bumped by every programmatic scroll, so only the last one to rest turns snapping back on. */
  const snapRequest = useRef(0);
  const [pages] = useState(() => new PageScroll());

  const grid = useMemo(
    () => gridLayout(cards.map(card => card.size), viewport, viewport.insets),
    [cards, viewport],
  );
  const frame = pageFrame(viewport, viewport.insets);
  const layout = view === "grid" ? "grid" : paged ? "pages" : "flight";
  const transition = reducedMotion ? { toGrid: INSTANT, toPage: INSTANT } : { toGrid: SPRING.morph, toPage: SPRING.morphToPage };
  const pageRect = (index: number) => offsetRect(frame, index * viewport.height);

  const motionFor = (card: LiveCard, index: number): CardMotion =>
    motions.for(card.slug, pagePose(pageRect(index)));

  const latest = useRef({ cards, grid, frame, viewport, activeIndex, transition, scrollsDocument });
  useLayoutEffect(() => {
    latest.current = { cards, grid, frame, viewport, activeIndex, transition, scrollsDocument };
  });
  const focusRect = grid.rects[activeIndex];
  const gridWindow: GridWindow = {
    rects: grid.rects,
    top: gridTop ?? (focusRect ? centeredScrollTop(focusRect, viewport, grid.height) : 0),
    height: viewport.height,
  };
  const place: DeckPlace = !landed
    ? { layout: "flight" }
    : layout === "pages"
      ? { layout, index: mountIndex }
      : layout === "grid"
        ? { layout, grid: gridWindow }
        : { layout: "flight" };
  const near = nearCards(place, cards.length);
  const nearSlugs = [...near].map(index => cards[index]!.slug);
  if (nearSlugs.some(slug => !warm.has(slug))) setWarm(new Set([...warm, ...nearSlugs]));
  const warmNext = nextToWarm(place, cards.length, index => warm.has(cards[index]!.slug));
  const warmNextSlug = warmNext === null ? null : cards[warmNext]!.slug;
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
    setLanded(!flying);
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
      placeUnseen(scroller);
      const flown = landing.current;
      // The reader paged on while the camera flew: the card it brought in is not the one to show, so nothing eases.
      if (!flown || flown.slug !== cards[activeIndex]?.slug) {
        showPages();
        setFlying(false);
        return;
      }
      const open = motionOf(cards[activeIndex]!, activeIndex);
      // A card that arrived without overshooting is already in place, to the pixel: nothing is left to ease.
      if (nearPose(open, pagePose({ ...pageAt(activeIndex).rect, y: flown.top }))) {
        showPages();
        setFlying(false);
        return;
      }
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
      const opening = motionOf(open, activeIndex);
      const destination = pagePose(camera);
      landing.current = { slug: open.slug, top: camera.y };
      // The page column takes over as the open card arrives: at the top of its overshoot (chrome springs past 1 and
      // falls back), or, with no bounce, once its chrome has landed on 1, which puts its preview's page layout in,
      // and the rest of it is drawn within half a pixel of its page. The cards flying out of view are placed
      // directly then, rather than waited for.
      let last = opening.chrome.get();
      let watching = true;
      const check = () => {
        const next = opening.chrome.get();
        const arrived = (next >= 1 && next < last) || (next >= 1 && nearPose(opening, destination));
        last = next;
        if (watching && (arrived || flight.current !== id)) stopWatching();
        if (arrived && flight.current === id) setPaged(true);
      };
      // Every value of the open card, not just its chrome: the far-travelling ones are the last within half a pixel.
      const unsubscribes = Object.values(opening).map(value => value.on(check));
      const stopWatching = () => {
        watching = false;
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
      fly(
        id,
        (card, index) =>
          moveCard(
            motionOf(card, index),
            index === activeIndex ? pagePose(camera) : cameraPose(grid.rects[index]!, focus, camera),
            transition.toPage,
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
          (card, index) => moveCard(motionOf(card, index), gridPose(grid.rects[index]!), transition.toGrid),
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

  // A phone's document scroll runs on the compositor, so a mount cannot stall it; waiting out a run
  // of flicks would only leave each card to mount as it arrives. The deck's own glide is drawn here.
  const isMoving = useCallback(
    () =>
      Boolean(scrollerRef.current?.hasAttribute("data-flying")) ||
      pages.moving ||
      (!scrollsDocument && performance.now() - lastScroll.current < QUIET_AFTER_SCROLL_MS),
    [pages, scrollsDocument],
  );

  useEffect(() => {
    const card = latest.current.cards.find(each => each.slug === warmNextSlug);
    if (!card) return;
    return warmWhenReady(card, isMoving, () => startTransition(() => setWarm(current => new Set(current).add(card.slug))));
  }, [warmNextSlug, isMoving]);

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
    lastScroll.current = performance.now();
    const host = pageHost();
    if (!host) return;
    scrolled.current = scrollPlace(host, layout === "grid" ? latest.current.grid : undefined);
    if (layout === "grid") {
      const step = viewport.height / 4;
      setGridTop(Math.round(host.scrollTop / step) * step);
    }
    if (layout !== "pages") return;
    const index = Math.round(host.scrollTop / viewport.height);
    setNearIndex(index);
    clearTimeout(settleTimer.current);
    // Only a scroll the reader made picks the page; a glide already knows where it is going.
    const settle = (top: number) => {
      settleTimer.current = setTimeout(() => {
        const now = pageHost()?.scrollTop ?? top;
        // A long frame can hold this timer past the last scroll event while momentum still
        // carries the page; picking a page then would glide back against the reader's flick.
        if (Math.abs(now - top) > 1) {
          settle(now);
          return;
        }
        const resting = Math.round(now / viewport.height);
        if (!pages.moving && resting !== latest.current.activeIndex) onActiveChange(resting);
      }, SCROLL_SETTLE_MS);
    };
    settle(host.scrollTop);
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
          style={{ height: layout === "pages" ? pagesHeight(cards.length, viewport.height, scrollsDocument) : grid.height }}
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
              page={frame}
              mounted={warm.has(card.slug) || near.has(index)}
              interactive={layout === "pages"}
              current={index === activeIndex}
              // Pages never overlap. Moving the raise as the reader pages made Safari repaint two whole cards.
              raised={layout !== "pages" && index === activeIndex}
              onOpen={layout === "grid" ? () => onOpen(index) : undefined}
              onShowCode={onShowCode ? trigger => onShowCode(index, trigger) : undefined}
              onPrepareCode={onPrepareCode ? () => onPrepareCode(index) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
