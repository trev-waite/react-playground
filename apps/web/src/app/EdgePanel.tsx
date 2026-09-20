import { createContext, useContext, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  LIVE_SIDEBAR_WIDTH,
  PANEL_PEEK,
  type EdgePanelApi,
  type EdgeReveal,
  type EdgeSide,
} from "./panelGeometry";
import { useEdgeReveal } from "./useEdgeReveal";
import styles from "./EdgePanel.module.css";

export {
  LIVE_SIDEBAR_WIDTH,
  STUDIO_RAIL_WIDTH,
  type EdgePanelApi,
  type EdgeReveal,
  type EdgeSide,
} from "./panelGeometry";

const EdgePanelContext = createContext<EdgePanelApi | null>(null);

export function useEdgePanel(): EdgePanelApi {
  const api = useContext(EdgePanelContext);
  if (!api) {
    throw new Error("useEdgePanel must be used within EdgePanel");
  }
  return api;
}

type EdgePanelProps = {
  side: EdgeSide;
  label: string;
  width?: number;
  defaultOpen?: boolean;
  reveal?: EdgeReveal;
  enabled?: boolean;
  children: ReactNode;
};

export function EdgePanel({
  side,
  label,
  width = LIVE_SIDEBAR_WIDTH,
  defaultOpen = false,
  reveal = "proximity",
  enabled = true,
  children,
}: EdgePanelProps) {
  const reducedMotion = useReducedMotion();
  const { open, panelRef, openNow, close, toggle, scheduleClose, closedX } =
    useEdgeReveal({
      side,
      width,
      peek: PANEL_PEEK,
      defaultOpen,
      reveal,
      enabled,
    });
  const spring = { type: "spring" as const, bounce: 0, duration: 0.35 };
  const isToggle = reveal === "toggle";

  return (
    <EdgePanelContext.Provider value={{ close, toggle }}>
      {isToggle ? null : (
        <div
          className={styles.hotzone}
          data-side={side}
          aria-hidden="true"
          onPointerEnter={openNow}
        />
      )}
      <motion.aside
        ref={panelRef}
        className={styles.panel}
        data-side={side}
        data-open={open || undefined}
        data-reveal={reveal}
        initial={false}
        animate={
          reducedMotion
            ? { x: open ? 0 : closedX, opacity: 1 }
            : { x: open ? 0 : closedX }
        }
        transition={reducedMotion ? { duration: 0.18 } : spring}
        onPointerEnter={isToggle ? undefined : openNow}
        onPointerLeave={isToggle ? undefined : scheduleClose}
        aria-hidden={isToggle ? undefined : !open}
        aria-expanded={open}
        aria-label={label}
        style={{ width }}
      >
        {isToggle ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-label={open ? `Hide ${label}` : `Show ${label}`}
            onClick={toggle}
          >
            <span className={styles.handle} aria-hidden="true" />
          </button>
        ) : (
          <span className={styles.handle} aria-hidden="true" />
        )}
        {isToggle ? (
          <div className={styles.body} inert={open ? undefined : true}>
            {children}
          </div>
        ) : (
          children
        )}
      </motion.aside>
    </EdgePanelContext.Provider>
  );
}
