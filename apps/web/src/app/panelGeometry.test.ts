import { describe, expect, test } from "bun:test";
import { closedOffset, PANEL_PEEK, STUDIO_RAIL_WIDTH } from "./panelGeometry";

describe("closedOffset", () => {
  test("hides a left panel except for the peek strip", () => {
    expect(closedOffset("left", 256, PANEL_PEEK)).toBe(-(256 - PANEL_PEEK));
  });

  test("hides a right panel except for the peek strip", () => {
    expect(closedOffset("right", STUDIO_RAIL_WIDTH, PANEL_PEEK)).toBe(
      STUDIO_RAIL_WIDTH - PANEL_PEEK,
    );
  });
});
