import { useEffect, useRef, type RefObject } from "react";

/** Wheel travel that counts as asking for the next page. */
const WHEEL_INTENT_PX = 24;
/** A gesture (including trackpad momentum) has ended after this much quiet. */
const GESTURE_GAP_MS = 160;
/** After a step, a clearly stronger swipe starts a new gesture even mid-momentum. */
const RESWIPE_AFTER_MS = 420;

const PAGE_KEYS: Record<string, -1 | 1> = {
  ArrowDown: 1,
  PageDown: 1,
  " ": 1,
  ArrowUp: -1,
  PageUp: -1,
};

function scrollsWithin(target: EventTarget | null, boundary: HTMLElement, deltaY: number): boolean {
  for (let node = target instanceof Element ? target : null; node && node !== boundary; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    const room = deltaY > 0 ? node.scrollHeight - node.clientHeight - node.scrollTop : node.scrollTop;
    if (room > 1) return true;
  }
  return false;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [role='slider'], [role='spinbutton']") != null
  );
}

/**
 * One wheel gesture or key press moves exactly one page. Native scroll-snap
 * alone snaps back on slow trackpad swipes, so intent is read here and the
 * deck glides with the shared spring. Touch keeps native snapping.
 */
export function usePaging(
  scrollerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  step: (delta: -1 | 1) => void,
) {
  // Re-subscribing mid-gesture would drop the lock and let momentum skip pages.
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled) return;
    let travel = 0;
    let locked = false;
    let lastEvent = 0;
    let lastStep = 0;
    let lastDelta = 0;

    function onWheel(event: WheelEvent) {
      // A component that handles the wheel itself (a scrubbable value) owns it.
      if (event.defaultPrevented || event.ctrlKey) return;
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      if (scrollsWithin(event.target, scroller!, event.deltaY)) return;
      event.preventDefault();

      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      const now = event.timeStamp;
      const reswipe =
        now - lastStep > RESWIPE_AFTER_MS && Math.abs(delta) > Math.abs(lastDelta) * 1.5 && Math.abs(delta) > 8;
      if (now - lastEvent > GESTURE_GAP_MS || reswipe) {
        locked = false;
        travel = 0;
      }
      lastEvent = now;
      lastDelta = delta;
      if (locked) return;

      travel += delta;
      if (Math.abs(travel) < WHEEL_INTENT_PX) return;
      locked = true;
      lastStep = now;
      stepRef.current(travel > 0 ? 1 : -1);
    }

    function onKeyDown(event: KeyboardEvent) {
      const direction = PAGE_KEYS[event.key];
      if (!direction || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || (event.key === " " && event.target instanceof HTMLButtonElement)) return;
      event.preventDefault();
      stepRef.current(event.shiftKey && event.key === " " ? -1 : direction);
    }

    scroller.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [scrollerRef, enabled]);
}
