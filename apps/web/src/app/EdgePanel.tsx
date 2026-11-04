import { useRef, useState, type ReactNode } from "react";
import { transform, useAnimatedValues, useMotionStyle, useReducedMotion } from "./motion/hooks";
import { REDUCED_MOTION, SPRING } from "./motion/transitions";
import { closedOffset, PANEL_PEEK, type EdgeSide } from "./panelGeometry";
import styles from "./EdgePanel.module.css";

export { STUDIO_RAIL_WIDTH, type EdgeSide } from "./panelGeometry";

type EdgePanelProps = {
  side: EdgeSide;
  label: string;
  width: number;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** A glass rail that slides in from an edge and leaves a peek strip to pull it back. */
export function EdgePanel({ side, label, width, defaultOpen = false, children }: EdgePanelProps) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  const { x } = useAnimatedValues(
    { x: open ? 0 : closedOffset(side, width, PANEL_PEEK) },
    reducedMotion ? REDUCED_MOTION : SPRING.panel,
  );
  const panelStyle = useMotionStyle(ref, [x], style => style("transform", transform({ x: x.get() })));

  return (
    <aside
      ref={ref}
      className={styles.panel}
      data-side={side}
      data-open={open || undefined}
      aria-label={label}
      style={{ ...panelStyle, width }}
    >
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-label={open ? `Hide ${label}` : `Show ${label}`}
        onClick={() => setOpen(current => !current)}
      >
        <span className={styles.handle} aria-hidden="true" />
      </button>
      <div className={styles.body} inert={open ? undefined : true}>
        {children}
      </div>
    </aside>
  );
}
