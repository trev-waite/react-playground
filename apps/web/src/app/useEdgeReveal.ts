import { useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import {
  closedOffset,
  PANEL_PEEK,
  type EdgeReveal,
  type EdgeSide,
} from "./panelGeometry";

/** Always open when the pointer is this close to the active edge. */
const EDGE_PX = 56;
/**
 * Wider proximity field: if the pointer is inside this band and moving
 * toward the edge, open early so the panel is already arriving.
 */
const PROXIMITY_PX = 140;
/** Speed (px/ms) toward the edge that counts as “approaching”. */
const APPROACH_SPEED = 0.12;
const CLOSE_GRACE_MS = 220;

type UseEdgeRevealOptions = {
  side: EdgeSide;
  width: number;
  peek?: number;
  defaultOpen?: boolean;
  reveal?: EdgeReveal;
  enabled?: boolean;
};

export function useEdgeReveal({
  side,
  width,
  peek = PANEL_PEEK,
  defaultOpen = false,
  reveal = "proximity",
  enabled = true,
}: UseEdgeRevealOptions): {
  open: boolean;
  panelRef: RefObject<HTMLElement | null>;
  openNow: () => void;
  close: () => void;
  toggle: () => void;
  scheduleClose: () => void;
  closedX: number;
} {
  const [open, setOpen] = useState(defaultOpen);
  const openRef = useRef(open);
  const panelRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<{ x: number; t: number } | null>(null);
  const closedX = closedOffset(side, width, peek);

  openRef.current = open;

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    if (reveal === "toggle") return;
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  }

  function openNow() {
    clearCloseTimer();
    if (openRef.current) return;
    flushSync(() => setOpen(true));
  }

  function close() {
    clearCloseTimer();
    setOpen(false);
  }

  function toggle() {
    if (openRef.current) close();
    else openNow();
  }

  useEffect(() => {
    if (!enabled || reveal !== "proximity") return;

    function onPointerMove(event: PointerEvent) {
      const now = event.timeStamp;
      const prev = lastPointer.current;
      let approaching = false;

      if (prev != null) {
        const dt = Math.max(now - prev.t, 1);
        const vx = (event.clientX - prev.x) / dt;
        approaching =
          side === "left" ? vx <= -APPROACH_SPEED : vx >= APPROACH_SPEED;
      }
      lastPointer.current = { x: event.clientX, t: now };

      const edgeDistance =
        side === "left" ? event.clientX : window.innerWidth - event.clientX;
      const nearEdge = edgeDistance <= EDGE_PX;
      const inProximity = edgeDistance <= PROXIMITY_PX && approaching;

      if (nearEdge || inProximity) {
        openNow();
        return;
      }

      const panel = panelRef.current;
      const inPanel =
        openRef.current &&
        panel != null &&
        event.target instanceof Node &&
        panel.contains(event.target);

      if (inPanel) {
        openNow();
      } else if (openRef.current) {
        scheduleClose();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || !openRef.current) {
        return;
      }
      setOpen(false);
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
  }, [side, enabled, reveal]);

  return { open, panelRef, openNow, close, toggle, scheduleClose, closedX };
}
