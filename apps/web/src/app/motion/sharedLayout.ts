import { useLayoutEffect, useRef, type RefObject } from "react";
import { mixNumber } from "./generators";
import { animate, MotionValue } from "./motionValue";
import type { Transition } from "./transitions";

type AxisDelta = { translate: number; scale: number };

/** Progress runs 0 → 1000, as Motion's did, so the spring settles on the same rest thresholds. */
const PROGRESS_END = 1000;

function snapped({ translate, scale }: AxisDelta): AxisDelta {
  return {
    translate: (translate >= -0.01 && translate <= 0.01) || Number.isNaN(translate) ? 0 : translate,
    scale: (scale >= 0.9999 && scale <= 1.0001) || Number.isNaN(scale) ? 1 : scale,
  };
}

/** How far, about its center, an axis at `min..max` must move to cover `fromMin..fromMax`. */
function axisDelta(min: number, max: number, fromMin: number, fromMax: number): AxisDelta {
  return snapped({
    translate: mixNumber(fromMin, fromMax, 0.5) - mixNumber(min, max, 0.5),
    scale: (fromMax - fromMin) / (max - min),
  });
}

function projection(x: AxisDelta, y: AxisDelta, progress: number): string {
  const px = snapped({ translate: mixNumber(x.translate, 0, progress), scale: mixNumber(x.scale, 1, progress) });
  const py = snapped({ translate: mixNumber(y.translate, 0, progress), scale: mixNumber(y.scale, 1, progress) });
  let result = "";
  if (px.translate || py.translate) result = `translate3d(${px.translate}px, ${py.translate}px, 0px) `;
  if (px.scale !== 1 || py.scale !== 1) result += `scale(${px.scale}, ${py.scale})`;
  return result || "none";
}

/** Starts a flight from `from` to the element's own place; returns a function that stops it. */
function flyFrom(element: HTMLElement, from: DOMRect, transition: Transition): () => void {
  element.style.transform = "";
  const to = element.getBoundingClientRect();
  const x = axisDelta(to.left, to.right, from.left, from.right);
  const y = axisDelta(to.top, to.bottom, from.top, from.bottom);
  if (!x.translate && !y.translate && x.scale === 1 && y.scale === 1) return () => {};

  element.style.transform = projection(x, y, 0);
  const flight = animate(new MotionValue(0), PROGRESS_END, {
    ...transition,
    onUpdate: latest => (element.style.transform = projection(x, y, latest / PROGRESS_END)),
  });
  return () => flight.stop();
}

/**
 * One element shown in different places, like Motion's `layoutId`: each
 * mount of it flies in from where the last one was on screen when it left.
 * `slotRef` is shared by every place the element can appear.
 */
export function useSharedLayout(
  ref: RefObject<HTMLElement | null>,
  slotRef: RefObject<DOMRect | null>,
  transition: Transition,
) {
  // Each mount flies once, with the transition it mounted with.
  const mountTransition = useRef(transition);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const from = slotRef.current;
    slotRef.current = null;
    const stop = from ? flyFrom(element, from, mountTransition.current) : undefined;
    return () => {
      slotRef.current = element.getBoundingClientRect();
      stop?.();
    };
  }, [ref, slotRef]);
}
