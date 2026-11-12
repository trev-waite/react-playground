import { createContext, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useAnimatedValues, useMotionRender, useReducedMotion } from "../motion/hooks";
import { REDUCED_MOTION, SPRING, type Transition } from "../motion/transitions";
import { ThemeIcon } from "../theme/ThemeIcon";
import { THEME_TOGGLE, toggleTheme, useTheme } from "../theme/theme";
import { backPillPath } from "./backPillShape";
import type { DeckView } from "./CardDeck";
import styles from "./DeckChrome.module.css";

/**
 * Where the deck's view button docks when a host (the local studio) already
 * owns the top bar. Without a slot, Live centers the button on its own.
 */
export const DeckChromeSlot = createContext<HTMLElement | null>(null);

/** Floating row at the top center of the page for primary view controls. */
export function ChromeBar({ children }: { children: ReactNode }) {
  return <div className={styles.bar}>{children}</div>;
}

/** Room around the pill for its shadow to spread into. */
const SHADOW_BLEED = 40;

/**
 * One piece of glass for the ways back: home to the main site first, then
 * whatever the host adds. Each button keeps its own circle, and a neck that
 * dips in like water holds the circles together.
 */
export function BackPill({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useBorderBoxSize(ref);
  const id = useId();
  const path = size ? backPillPath(size.width, size.height) : null;
  const bleed = size && {
    x: -SHADOW_BLEED,
    y: -SHADOW_BLEED,
    width: size.width + SHADOW_BLEED * 2,
    height: size.height + SHADOW_BLEED * 2,
  };

  return (
    <div ref={ref} className={styles.backPill}>
      {path && bleed ? (
        <>
          <span className={styles.glass} style={{ clipPath: `path("${path}")` }} aria-hidden="true" />
          <svg className={styles.outline} width={size.width} height={size.height} aria-hidden="true">
            <defs>
              <clipPath id={`${id}inside`}>
                <path d={path} />
              </clipPath>
              <mask id={`${id}outside`} maskUnits="userSpaceOnUse" {...bleed}>
                <rect {...bleed} fill="white" />
                <path d={path} fill="black" />
              </mask>
              {/* --chrome-shadow, redrawn around the shape since a box-shadow would stay a box. */}
              <filter id={`${id}shadow`} filterUnits="userSpaceOnUse" {...bleed}>
                <ShadowLayer dy={1} blur={1} opacity={0.04} result="contact" />
                <ShadowLayer dy={6} blur={18} opacity={0.1} result="lift" />
                <feMerge>
                  <feMergeNode in="lift" />
                  <feMergeNode in="contact" />
                </feMerge>
              </filter>
            </defs>
            <path d={path} filter={`url(#${id}shadow)`} mask={`url(#${id}outside)`} />
            <path className={styles.edge} d={path} clipPath={`url(#${id}inside)`} />
          </svg>
        </>
      ) : null}
      <HomeLink />
      {children}
    </div>
  );
}

/** One box-shadow layer as a filter: the shadow alone, without the shape that casts it, so no dark rim is left at the edge. */
function ShadowLayer({ dy, blur, opacity, result }: { dy: number; blur: number; opacity: number; result: string }) {
  return (
    <>
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur / 2} />
      <feOffset dy={dy} />
      <feComponentTransfer result={result}>
        <feFuncA type="linear" slope={opacity} />
      </feComponentTransfer>
    </>
  );
}

function useBorderBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize(current => (current?.width === width && current.height === height ? current : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

const HOME_URL = "https://trevorwaite.com";

/** The way back to the main site, whether or not the visitor came from it. */
function HomeLink() {
  const hint = "Back to trevorwaite.com";
  const hintId = useId();

  return (
    <span className={styles.hintHost}>
      <a
        href={HOME_URL}
        className={styles.iconButton}
        aria-label={hint}
        aria-describedby={hintId}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M15.5 10H4.5M9 5.5L4.5 10L9 14.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
      <span id={hintId} role="tooltip" className={styles.hint}>
        {hint}
      </span>
    </span>
  );
}

export function ThemeButton() {
  return THEME_TOGGLE ? <ThemeToggle /> : null;
}

/** Flips the site between light and dark. Until it is pressed, the site follows the system. */
function ThemeToggle() {
  const dark = useTheme() === "dark";
  const hint = dark ? "Switch to light theme" : "Switch to dark theme";
  const hintId = useId();

  return (
    <span className={`${styles.hintHost} ${styles.glassCircle}`}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={hint}
        aria-describedby={hintId}
        onClick={toggleTheme}
      >
        <ThemeIcon dark={dark} />
      </button>
      <span id={hintId} role="tooltip" className={styles.hint}>
        {hint}
      </span>
    </span>
  );
}

type DeckViewButtonProps = {
  view: DeckView;
  title: string;
  onToggle: () => void;
};

export function DeckViewButton({ view, title, onToggle }: DeckViewButtonProps) {
  const grid = view === "grid";
  const hint = grid ? `Back to ${title}` : "Show all components";
  const hintId = useId();

  return (
    <span className={styles.hintHost}>
      <button
        type="button"
        className={`${styles.iconButton} ${styles.viewButton}`}
        aria-label={hint}
        aria-describedby={hintId}
        aria-pressed={grid}
        onClick={onToggle}
      >
        <ViewIcon grid={grid} />
      </button>
      <span id={hintId} role="tooltip" className={styles.hint}>
        {hint}
        {grid ? <kbd className={styles.key}>Esc</kbd> : null}
      </span>
    </span>
  );
}

const TILE = 6.5;
const GAP = 1;
const NEAR = 3;
const FAR = NEAR + TILE + GAP;
/** Past the 44px button's round edge, so incoming tiles arrive from outside it. */
const OUTSIDE = 24;

const PAGE = { x: NEAR, y: NEAR, width: FAR + TILE - NEAR, height: FAR + TILE - NEAR, rx: 4 };
const TILES = [
  { x: NEAR, y: NEAR, from: PAGE },
  { x: FAR, y: NEAR, from: { x: FAR + OUTSIDE, y: NEAR - OUTSIDE } },
  { x: NEAR, y: FAR, from: { x: NEAR - OUTSIDE, y: FAR + OUTSIDE } },
  { x: FAR, y: FAR, from: { x: FAR + OUTSIDE, y: FAR + OUTSIDE } },
];

/**
 * The deck in miniature: one page that shrinks into a tile while three more
 * fly in from beyond the button, on the same spring as the cards themselves.
 */
function ViewIcon({ grid }: { grid: boolean }) {
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? REDUCED_MOTION : SPRING.morph;

  return (
    <svg className={styles.icon} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {TILES.map((tile, index) => {
        const tileState = { x: tile.x, y: tile.y, width: TILE, height: TILE, rx: 2 };
        const pageState = index === 0 ? PAGE : { ...tile.from, width: TILE, height: TILE, rx: 2 };
        return <IconRect key={index} shape={grid ? tileState : pageState} transition={transition} />;
      })}
    </svg>
  );
}

type RectShape = { x: number; y: number; width: number; height: number; rx: number };

function IconRect({ shape, transition }: { shape: RectShape; transition: Transition }) {
  const ref = useRef<SVGRectElement>(null);
  const values = useAnimatedValues(shape, transition);
  const { x, y, width, height, rx } = values;
  const [initial] = useState(() => shape);

  useMotionRender([x, y, width, height, rx], () => {
    const rect = ref.current;
    if (!rect) return;
    for (const [name, value] of Object.entries(values)) {
      const text = `${value.get()}`;
      if (rect.getAttribute(name) !== text) rect.setAttribute(name, text);
    }
  });

  return <rect ref={ref} {...initial} fill="currentColor" />;
}

type DeckPagerProps = {
  hidden: boolean;
  index: number;
  count: number;
  onStep: (delta: -1 | 1) => void;
};

export function DeckPager({ hidden, index, count, onStep }: DeckPagerProps) {
  return (
    <nav
      className={styles.pager}
      aria-label="Pages"
      data-hidden={hidden || count < 2 || undefined}
      inert={hidden ? true : undefined}
    >
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Previous component"
        disabled={index === 0}
        onClick={() => onStep(-1)}
      >
        <Chevron direction="up" />
      </button>
      <span className={styles.count}>
        <span className={styles.srOnly}>Component </span>
        {index + 1}
        <span aria-hidden="true">/</span>
        <span className={styles.srOnly}> of </span>
        {count}
      </span>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Next component"
        disabled={index === count - 1}
        onClick={() => onStep(1)}
      >
        <Chevron direction="down" />
      </button>
    </nav>
  );
}

function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === "up" ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
