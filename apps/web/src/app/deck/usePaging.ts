import { useEffect, useRef, type RefObject } from "react";
import { GESTURE_GAP_MS, wheelGesture } from "./wheelGesture";

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

export type PagingInput = {
  /** Wheel travel that commits to the next page. */
  commitAt: number;
  /** The page follows the wheel this far (px, signed) before committing. */
  pull: (travel: number) => void;
  /** A wheel gesture passed `commitAt`, or a key asked for a page. */
  step: (delta: -1 | 1) => void;
  /** A wheel gesture ended short of `commitAt`. */
  release: () => void;
};

/**
 * One wheel gesture or key press moves at most one page. The page follows the
 * wheel at first, then glides on once the gesture passes `commitAt`; momentum
 * after that is ignored. Native scroll-snap alone snaps back on slow trackpad
 * swipes, so intent is read here. Touch keeps native snapping.
 */
export function usePaging(scrollerRef: RefObject<HTMLElement | null>, enabled: boolean, input: PagingInput) {
  // Re-subscribing mid-gesture would drop the lock and let momentum skip pages.
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled) return;
    const gesture = wheelGesture();
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;

    function onWheel(event: WheelEvent) {
      // A component that handles the wheel itself (a scrubbable value) owns it.
      if (event.defaultPrevented || event.ctrlKey) return;
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      if (scrollsWithin(event.target, scroller!, event.deltaY)) return;
      event.preventDefault();

      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      const intent = gesture.read(delta, event.timeStamp, inputRef.current.commitAt);
      if (!intent) return;
      clearTimeout(releaseTimer);
      if (intent.type === "step") {
        inputRef.current.step(intent.direction);
        return;
      }
      inputRef.current.pull(intent.travel);
      releaseTimer = setTimeout(() => {
        gesture.end();
        inputRef.current.release();
      }, GESTURE_GAP_MS);
    }

    function onKeyDown(event: KeyboardEvent) {
      const direction = PAGE_KEYS[event.key];
      if (!direction || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || (event.key === " " && event.target instanceof HTMLButtonElement)) return;
      event.preventDefault();
      inputRef.current.step(event.shiftKey && event.key === " " ? -1 : direction);
    }

    scroller.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(releaseTimer);
      scroller.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [scrollerRef, enabled]);
}
