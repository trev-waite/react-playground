import type { ReactNode } from "react";
import styles from "./Canvas.module.css";

type CanvasProps = {
  children?: ReactNode;
  empty?: boolean;
};

export function Canvas({ children, empty }: CanvasProps) {
  return (
    <main className={styles.canvas} aria-label="Component stage">
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.stage}>
        {empty ? (
          <p className={styles.hint}>
            Move to the left edge to open the sidebar and pick a component.
          </p>
        ) : (
          children
        )}
      </div>
    </main>
  );
}
