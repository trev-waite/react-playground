import { frame } from "../motion/frameLoop";

let placements = 0;

/**
 * Keeps the pages around the open one unpainted for the frame they are placed
 * in (`[data-placing]` in CardDeck.module.css). They land off screen either
 * way, but each drops its camera transform as it moves, and a browser that
 * scores layout shifts reads that as a card jumping across the screen and
 * counts it against the page. A placement made while another is still unseen
 * takes over from it, so the pages show a frame after the last one.
 */
export function placeUnseen(scroller: HTMLElement, onFrame: (callback: () => void) => void = frame.render) {
  const placement = String(++placements);
  scroller.setAttribute("data-placing", placement);
  // Asked for from inside a frame, the second callback runs in the next one: after this placement has painted.
  onFrame(() =>
    onFrame(() => {
      if (scroller.getAttribute("data-placing") === placement) scroller.removeAttribute("data-placing");
    }),
  );
}
