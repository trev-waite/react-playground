import { motion, useReducedMotion } from "motion/react";
import { REDUCED_MOTION, SPRING } from "../app/motion";
import { useView } from "./ViewController";
import styles from "./ViewToggle.module.css";

export function ViewToggle() {
  const { mode, setMode, animating } = useView();
  const reducedMotion = useReducedMotion();

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
            <motion.span
              className={styles.pill}
              layoutId="view-mode-pill"
              transition={reducedMotion ? REDUCED_MOTION : SPRING.pill}
              aria-hidden="true"
            />
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
            <motion.span
              className={styles.pill}
              layoutId="view-mode-pill"
              transition={reducedMotion ? REDUCED_MOTION : SPRING.pill}
              aria-hidden="true"
            />
          ) : null}
          <span className={styles.label}>Experimental</span>
        </button>
      </div>
    </div>
  );
}
