/** Whether `element` draws light ink on a dark ground, read from its resolved text color. */
export function isDarkTone(element: Element): boolean {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(getComputedStyle(element).color);
  if (!match) return false;
  const [red, green, blue] = match.slice(1, 4).map(Number) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 128;
}

export type PointerPlace = { x: number; y: number };

/**
 * Follows a pointer over `element` as shares of its size: a mouse while it
 * hovers, a finger or pen while it presses. A finger that turns into a scroll
 * hands the page back and stops being followed.
 */
export function followPointer(element: HTMLElement, onMove: (place: PointerPlace | null) => void): () => void {
  let pressed: number | null = null;
  const place = (event: PointerEvent): PointerPlace => {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
    };
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    pressed = event.pointerId;
    onMove(place(event));
  };
  const onMovePointer = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || event.pointerId === pressed) onMove(place(event));
  };
  const onEnd = (event: PointerEvent) => {
    if (event.pointerId === pressed) pressed = null;
  };
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === "mouse") onMove(null);
  };
  element.addEventListener("pointerdown", onDown);
  element.addEventListener("pointermove", onMovePointer);
  element.addEventListener("pointerup", onEnd);
  element.addEventListener("pointercancel", onEnd);
  element.addEventListener("pointerleave", onLeave);
  return () => {
    element.removeEventListener("pointerdown", onDown);
    element.removeEventListener("pointermove", onMovePointer);
    element.removeEventListener("pointerup", onEnd);
    element.removeEventListener("pointercancel", onEnd);
    element.removeEventListener("pointerleave", onLeave);
  };
}

/** The display face for canvas text, matching `--stage-display-font`. */
export const DISPLAY_FONT = '"Instrument Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
