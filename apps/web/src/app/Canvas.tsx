import type { ReactNode } from "react";
import styles from "./Canvas.module.css";

/** Dotted canvas with one inset page card, the same frame a Live page rests in. */
export function Canvas({ children }: { children?: ReactNode }) {
  return (
    <main className={styles.canvas} aria-label="Component stage">
      <div className={styles.dots} aria-hidden="true" />
      <div className={styles.stage}>{children}</div>
    </main>
  );
}
