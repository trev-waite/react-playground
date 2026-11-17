import { frame } from "../motion/frameLoop";

let placements = 0;

/**
 * Hides the pages around the open one for the frame they are placed in. They
 * land off screen, but the browser still scores their move as a layout shift.
 */
export function placeUnseen(scroller: HTMLElement, onFrame: (callback: () => void) => void = frame.render) {
  const placement = String(++placements);
  scroller.setAttribute("data-placing", placement);
  // The second callback runs after this placement has painted.
  onFrame(() =>
    onFrame(() => {
      if (scroller.getAttribute("data-placing") === placement) scroller.removeAttribute("data-placing");
    }),
  );
}
