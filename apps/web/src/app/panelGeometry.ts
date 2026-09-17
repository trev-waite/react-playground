export type EdgeSide = "left" | "right";

/** Proximity follows the pointer (Live). Toggle waits for a click on the peek. */
export type EdgeReveal = "proximity" | "toggle";

export type EdgePanelApi = {
  close: () => void;
  toggle: () => void;
};

/** Keep in sync with `--shell-sidebar-width`. */
export const LIVE_SIDEBAR_WIDTH = 256;
/** Keep in sync with `--shell-studio-rail-width`. */
export const STUDIO_RAIL_WIDTH = 320;
/** Visible strip when dismissed. Matches `--space-2`. */
export const PANEL_PEEK = 16;

export function closedOffset(
  side: EdgeSide,
  width: number,
  peek: number = PANEL_PEEK,
): number {
  const hidden = width - peek;
  return side === "left" ? -hidden : hidden;
}
