import type { Rect, Size } from "./geometry";

/** How the sheet reads layout. Swappable so the sheet can be tested without a browser. */
export type LayoutReader = {
  /** Where layout put an element inside the root, ignoring any transform or translate. */
  rect(element: HTMLElement, root: HTMLElement): Rect;
  /** The root's padding box, which items stay inside. */
  bounds(root: HTMLElement): Size;
  /** Screen pixels per sheet pixel, for a sheet drawn scaled. */
  scale(root: HTMLElement): number;
};

export const domReader: LayoutReader = {
  rect(element, root) {
    // Offsets ignore transforms, so this is the element's place before the sheet moved it.
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = element;
    while (node && node !== root) {
      x += node.offsetLeft;
      y += node.offsetTop;
      const parent: Element | null = node.offsetParent;
      node = parent instanceof HTMLElement ? parent : null;
      if (node && node !== root) {
        x += node.clientLeft;
        y += node.clientTop;
      }
    }
    return { x, y, width: element.offsetWidth, height: element.offsetHeight };
  },
  bounds(root) {
    return { width: root.clientWidth, height: root.clientHeight };
  },
  scale(root) {
    return root.offsetWidth > 0 ? root.getBoundingClientRect().width / root.offsetWidth : 1;
  },
};
