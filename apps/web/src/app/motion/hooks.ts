import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { frame } from "./frameLoop";
import { animate, MotionValue } from "./motionValue";
import type { Transition } from "./transitions";

/** Read once per mount, as Motion's hook did. */
export function useReducedMotion(): boolean {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return reduced;
}

export function useMotionValue(initial: number): MotionValue {
  const [value] = useState(() => new MotionValue(initial));
  return value;
}

/**
 * Values that start at `target` and animate whenever one of its numbers
 * changes, like a Motion component's `animate` prop with `initial={false}`.
 */
export function useAnimatedValues<K extends string>(
  target: Record<K, number>,
  transition: Transition,
): Record<K, MotionValue> {
  const [values] = useState(() => {
    const created = {} as Record<K, MotionValue>;
    for (const key in target) created[key] = new MotionValue(target[key]);
    return created;
  });
  const previous = useRef(target);

  useEffect(() => {
    for (const key in target) {
      if (target[key] !== previous.current[key]) animate(values[key], target[key], transition);
    }
    previous.current = target;
  });

  useEffect(
    () => () => {
      for (const key in values) values[key].stop();
    },
    [values],
  );

  return values;
}

/**
 * Calls `render` in the render step of each frame that moves one of `values`,
 * and once each commit has finished (so values a parent set in its own layout
 * effect are painted in the same frame), in case other inputs changed.
 */
export function useMotionRender(values: readonly MotionValue[], render: () => void) {
  const renderLatest = useEffectEvent(render);

  useLayoutEffect(() => {
    const draw = () => renderLatest();
    const schedule = () => frame.render(draw);
    const unsubscribes = values.map(value => value.on(schedule));
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      frame.cancel(draw);
    };
  }, [values]);

  useLayoutEffect(() => queueMicrotask(() => renderLatest()));
}

type StyleKey = Extract<keyof CSSProperties, string>;
type StyleWriter = (property: StyleKey, value: string) => void;

/**
 * Keeps an element's styles in step with motion values without React
 * re-rendering. Spread the returned style into the element's `style` so it is
 * painted (and measurable by children) from the first commit; after that only
 * changed properties are written, once per frame.
 */
export function useMotionStyle(
  ref: RefObject<HTMLElement | SVGElement | null>,
  values: readonly MotionValue[],
  write: (style: StyleWriter) => void,
): CSSProperties {
  const [initial] = useState(() => {
    const style: Record<string, string> = {};
    write((property, value) => (style[property] = value));
    return style as CSSProperties;
  });
  const [written] = useState(() => new Map<StyleKey, string>(Object.entries(initial) as [StyleKey, string][]));

  useMotionRender(values, () => {
    const element = ref.current;
    if (!element) return;
    const style = element.style as unknown as Record<StyleKey, string>;
    write((property, value) => {
      if (written.get(property) === value) return;
      written.set(property, value);
      style[property] = value;
    });
  });

  return initial;
}

/** Motion's transform order and its `none` at identity, which keeps a stacking context from forming at rest. */
export function transform({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }): string {
  let result = "";
  if (x !== 0) result += `translateX(${x}px) `;
  if (y !== 0) result += `translateY(${y}px) `;
  if (scale !== 1) result += `scale(${scale}) `;
  return result.trim() || "none";
}

export function px(value: number): string {
  return `${value}px`;
}

export function opacity(value: number): string {
  return `${Math.min(1, Math.max(0, value))}`;
}
