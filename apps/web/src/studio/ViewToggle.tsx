import { useRef, type RefObject } from "react";
import { useReducedMotion } from "../app/motion/hooks";
import { useSharedLayout } from "../app/motion/sharedLayout";
import { REDUCED_MOTION, SPRING, type Transition } from "../app/motion/transitions";
import { useView } from "./ViewController";
import styles from "./ViewToggle.module.css";

export function ViewToggle() {
  const { mode, setMode, animating } = useView();
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? REDUCED_MOTION : SPRING.pill;
  const pillSlot = useRef<DOMRect | null>(null);

  return (
    <div className={styles.wrap} role="group" aria-label="View mode">
      <div className={styles.track}>
        <button
          type="button"
          className={styles.segment}
          aria-pressed={mode === "live"}
          data-active={mode === "live" || undefined}
          disabled={animating && mode === "live"}
          onClick={() => setMode("live")}
        >
          {mode === "live" ? (
            <Pill slot={pillSlot} transition={transition} />
          ) : null}
          <span className={styles.label}>Live</span>
        </button>
        <button
          type="button"
          className={styles.segment}
          aria-pressed={mode === "experimental"}
          data-active={mode === "experimental" || undefined}
          disabled={animating && mode === "experimental"}
          onClick={() => setMode("experimental")}
        >
          {mode === "experimental" ? (
            <Pill slot={pillSlot} transition={transition} />
          ) : null}
          <span className={styles.label}>Experimental</span>
        </button>
      </div>
    </div>
  );
}

/** The active segment's highlight, which slides to whichever segment is chosen. */
function Pill({ slot, transition }: { slot: RefObject<DOMRect | null>; transition: Transition }) {
  const ref = useRef<HTMLSpanElement>(null);
  useSharedLayout(ref, slot, transition);
  return <span ref={ref} className={styles.pill} aria-hidden="true" />;
}
