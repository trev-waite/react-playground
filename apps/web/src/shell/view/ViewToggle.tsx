import { motion, useReducedMotion } from "motion/react";
import { useView } from "./ViewController";
import styles from "./ViewToggle.module.css";

const bounceSpring = {
  type: "spring" as const,
  stiffness: 480,
  damping: 18,
  mass: 0.45,
};

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
              transition={reducedMotion ? { duration: 0.16 } : bounceSpring}
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
              transition={reducedMotion ? { duration: 0.16 } : bounceSpring}
              aria-hidden="true"
            />
          ) : null}
          <span className={styles.label}>Experimental</span>
        </button>
      </div>
    </div>
  );
}
