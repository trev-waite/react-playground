import { describe, expect, test } from "bun:test";
import {
  closedOffset,
  LIVE_SIDEBAR_WIDTH,
  PANEL_PEEK,
  STUDIO_RAIL_WIDTH,
} from "./panelGeometry";

describe("closedOffset", () => {
  test("hides a left panel except for the peek strip", () => {
    expect(closedOffset("left", LIVE_SIDEBAR_WIDTH, PANEL_PEEK)).toBe(
      -(LIVE_SIDEBAR_WIDTH - PANEL_PEEK),
    );
  });

  test("hides a right panel except for the peek strip", () => {
    expect(closedOffset("right", STUDIO_RAIL_WIDTH, PANEL_PEEK)).toBe(
      STUDIO_RAIL_WIDTH - PANEL_PEEK,
    );
  });
});
