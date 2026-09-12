import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { reloadLiveCatalog } from "../../lib/liveCatalog";
import type { TreeNode } from "../../lib/types";
import { Tree } from "./Tree";
import styles from "./Sidebar.module.css";

/** Always open when pointer is this close to the left edge. */
const EDGE_PX = 56;
/**
 * Wider proximity field: if the pointer is inside this band and moving
 * toward the edge, open early so the panel is already arriving.
 */
const PROXIMITY_PX = 140;
/** Leftward velocity (px/ms) that counts as “approaching”. */
const APPROACH_VX = -0.12;
const CLOSE_GRACE_MS = 220;
const SIDEBAR_WIDTH = 260;
/** How much of the panel stays visible when “closed” (rounded edge + shadow). */
const PEEK_PX = 14;
const CLOSED_X = -(SIDEBAR_WIDTH - PEEK_PX);

type SidebarProps = {
  tree: TreeNode[];
};

export function Sidebar({ tree }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  const panelRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<{ x: number; t: number } | null>(null);
  const reducedMotion = useReducedMotion();

  openRef.current = open;

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  }

  function openNow() {
    clearCloseTimer();
    if (openRef.current) return;
    // Commit immediately so the spring starts on this frame, not the next.
    flushSync(() => setOpen(true));
  }

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const now = e.timeStamp;
      const prev = lastPointer.current;
      let approaching = false;

      if (prev != null) {
        const dt = Math.max(now - prev.t, 1);
        const vx = (e.clientX - prev.x) / dt;
        approaching = vx <= APPROACH_VX;
      }
      lastPointer.current = { x: e.clientX, t: now };

      const nearEdge = e.clientX <= EDGE_PX;
      const inProximity = e.clientX <= PROXIMITY_PX && approaching;

      if (nearEdge || inProximity) {
        openNow();
        return;
      }

      const panel = panelRef.current;
      let inPanel = false;
      if (openRef.current && panel != null) {
        const rect = panel.getBoundingClientRect();
        inPanel =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
      }

      if (inPanel) {
        openNow();
      } else if (openRef.current) {
        scheduleClose();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && openRef.current) {
        setOpen(false);
      }
    }

    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("keydown", onKeyDown);
      clearCloseTimer();
    };
  }, []);

  const spring = { type: "spring" as const, bounce: 0, duration: 0.35 };

  return (
    <>
      <div
        className={styles.hotzone}
        aria-hidden="true"
        onPointerEnter={openNow}
      />
      <motion.aside
        ref={panelRef}
        className={styles.sidebar}
        initial={false}
        animate={
          reducedMotion
            ? {
                x: open ? 0 : CLOSED_X,
                opacity: 1,
              }
            : {
                x: open ? 0 : CLOSED_X,
              }
        }
        transition={reducedMotion ? { duration: 0.18 } : spring}
        onPointerEnter={openNow}
        onPointerLeave={scheduleClose}
        aria-hidden={!open}
        aria-label="Component browser"
        data-open={open || undefined}
      >
        <span className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <p className={styles.brand}>Playground</p>
          <div className={styles.headerRow}>
            <p className={styles.caption}>Live</p>
            <button
              type="button"
              className={styles.refresh}
              aria-label="Reload Live catalog"
              onClick={() => void reloadLiveCatalog()}
            >
              Refresh
            </button>
          </div>
        </header>
        <nav className={styles.nav} aria-label="Live components">
          {tree.length === 0 ? (
            <p className={styles.empty}>No live components yet.</p>
          ) : (
            <Tree nodes={tree} onNavigate={() => setOpen(false)} />
          )}
        </nav>
      </motion.aside>
    </>
  );
}
