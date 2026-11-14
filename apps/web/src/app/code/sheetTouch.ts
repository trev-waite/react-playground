type ScrollBox = Pick<Element, "scrollTop" | "scrollLeft" | "scrollHeight" | "scrollWidth" | "clientHeight" | "clientWidth">;
type Axis = "x" | "y";

/** How far a finger travels before its gesture picks an axis; smaller wobbles neither scroll nor get cancelled. */
const SLOP = 8;

/** Whether `box` has room to scroll along `axis` where a finger moving by `delta` takes it; a finger moving up scrolls content down. */
function room(box: ScrollBox, axis: Axis, delta: number): boolean {
  if (axis === "y") return delta < 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
  return delta < 0 ? box.scrollLeft + box.clientWidth < box.scrollWidth - 1 : box.scrollLeft > 0;
}

/**
 * One finger's gesture over the sheet. Past the slop it settles on an axis,
 * the one its scroll area can scroll if only one can, and keeps it, so
 * wobble or a diagonal drift never cancels a scroll the area can make.
 */
export function sheetGesture() {
  let travel = { x: 0, y: 0 };
  let axis: Axis | null = null;
  return {
    start() {
      travel = { x: 0, y: 0 };
      axis = null;
    },
    /** Whether a move of `dx`, `dy` over `box` may go on; false means it would scroll the page under the sheet. */
    move(dx: number, dy: number, box: ScrollBox | null): boolean {
      if (!box) return false;
      travel = { x: travel.x + dx, y: travel.y + dy };
      if (!axis) {
        if (Math.hypot(travel.x, travel.y) < SLOP) return true;
        const x = box.scrollWidth > box.clientWidth + 1;
        const y = box.scrollHeight > box.clientHeight + 1;
        axis = x !== y ? (x ? "x" : "y") : Math.abs(travel.x) > Math.abs(travel.y) ? "x" : "y";
      }
      const delta = axis === "x" ? dx : dy;
      return delta === 0 || room(box, axis, delta);
    },
  };
}

/** Keeps a finger on the sheet from scrolling the page under it, which phones scroll as the document. */
export function holdPageUnder(sheet: HTMLElement): () => void {
  const gesture = sheetGesture();
  let last: { x: number; y: number } | null = null;
  const start = (event: TouchEvent) => {
    const touch = event.touches[0];
    last = touch ? { x: touch.clientX, y: touch.clientY } : null;
    gesture.start();
  };
  const move = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch || !last) return;
    const scroller = event.target instanceof Element ? event.target.closest("[data-scrolls]") : null;
    const free = gesture.move(touch.clientX - last.x, touch.clientY - last.y, scroller);
    last = { x: touch.clientX, y: touch.clientY };
    if (!free && event.cancelable) event.preventDefault();
  };
  sheet.addEventListener("touchstart", start, { passive: true });
  sheet.addEventListener("touchmove", move, { passive: false });
  return () => {
    sheet.removeEventListener("touchstart", start);
    sheet.removeEventListener("touchmove", move);
  };
}
