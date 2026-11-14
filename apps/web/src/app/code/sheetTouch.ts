type ScrollBox = Pick<Element, "scrollTop" | "scrollLeft" | "scrollHeight" | "scrollWidth" | "clientHeight" | "clientWidth">;

/**
 * Whether `box` has room to scroll where a finger that moved `dx`, `dy` is
 * taking it, along the axis it moved most. A finger moving up scrolls the
 * content down.
 */
export function canScroll(box: ScrollBox, dx: number, dy: number): boolean {
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
  }
  return dx < 0 ? box.scrollLeft + box.clientWidth < box.scrollWidth - 1 : box.scrollLeft > 0;
}

/**
 * Keeps a finger on the sheet from scrolling the page under it, which phones
 * scroll as the document: a move goes through only where a scroll area under
 * it can still scroll that way.
 */
export function holdPageUnder(sheet: HTMLElement): () => void {
  let last: { x: number; y: number } | null = null;
  const start = (event: TouchEvent) => {
    const touch = event.touches[0];
    last = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const move = (event: TouchEvent) => {
    const touch = event.touches[0];
    const scroller = event.target instanceof Element ? event.target.closest("[data-scrolls]") : null;
    const free = Boolean(touch && last && scroller && canScroll(scroller, touch.clientX - last.x, touch.clientY - last.y));
    if (touch) last = { x: touch.clientX, y: touch.clientY };
    if (!free) event.preventDefault();
  };
  sheet.addEventListener("touchstart", start, { passive: true });
  sheet.addEventListener("touchmove", move, { passive: false });
  return () => {
    sheet.removeEventListener("touchstart", start);
    sheet.removeEventListener("touchmove", move);
  };
}
