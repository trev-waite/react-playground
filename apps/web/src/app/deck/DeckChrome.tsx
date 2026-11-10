import { createContext, useId, type ReactNode } from "react";
import { m, useReducedMotion } from "motion/react";
import { REDUCED_MOTION, SPRING } from "../motion";
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
        return (
          <m.rect
            key={index}
            initial={false}
            animate={grid ? tileState : pageState}
            transition={transition}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
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
