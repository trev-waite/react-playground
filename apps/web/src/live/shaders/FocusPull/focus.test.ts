import { describe, expect, test } from "bun:test";
import { blurLevel, fitPage, MAX_BLUR_LEVEL, pageRowAt, projectPage } from "./focus";
import { layoutPoem, POEM } from "./poem";

const ASPECTS = [0.6, 1, 1.6, 2.4];

describe("Focus Pull page", () => {
  test.each(ASPECTS)("at aspect %f the whole page fits on screen and fills it", aspect => {
    const page = fitPage(aspect, 1.3);
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const corner = projectPage(page, aspect, u, v);
      expect(Math.abs(corner.x)).toBeLessThanOrEqual(0.861);
      expect(Math.abs(corner.y)).toBeLessThanOrEqual(0.861);
    }
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => projectPage(page, aspect, u!, v!));
    const top = Math.max(...corners.map(corner => corner.y));
    const bottom = Math.min(...corners.map(corner => corner.y));
    const reach = Math.max(...corners.map(corner => Math.abs(corner.x)));
    expect(Math.max(reach, (top - bottom) / 2)).toBeGreaterThan(0.85);
    expect(top + bottom).toBeCloseTo(0, 6);
  });

  test("the far edge of the page draws narrower than the near edge", () => {
    const page = fitPage(1.6, 1.3);
    const far = projectPage(page, 1.6, 1, 0).x - projectPage(page, 1.6, 0, 0).x;
    const near = projectPage(page, 1.6, 1, 1).x - projectPage(page, 1.6, 0, 1).x;
    expect(far).toBeLessThan(near * 0.8);
  });

  test.each(ASPECTS)("the pointer finds the row it is over, top to bottom, at aspect %f", aspect => {
    const page = fitPage(aspect, 1.3);
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const at = projectPage(page, aspect, 0.5, v);
      expect(pageRowAt(page, aspect, at.x, at.y)!).toBeCloseTo(Math.min(1, v), 4);
    }
    expect(pageRowAt(page, aspect, 0.99, 0.99)).toBeNull();
  });

  test("blur grows with distance from the focus, is capped, and starts full before the page opens", () => {
    expect(blurLevel(0)).toBe(0);
    expect(blurLevel(0.1)).toBeLessThan(blurLevel(0.2));
    expect(blurLevel(-0.1)).toBe(blurLevel(0.1));
    expect(blurLevel(1)).toBe(MAX_BLUR_LEVEL);
    expect(blurLevel(0, 0)).toBe(MAX_BLUR_LEVEL);
  });

  test("the poem lays out top to bottom with its stanza breaks left out of the rows", () => {
    const layout = layoutPoem(POEM, 1000, (text, size) => text.length * size * 0.5);
    const rows = layout.rows.filter(Number.isFinite);
    expect(rows).toHaveLength(POEM.filter(Boolean).length);
    for (let index = 1; index < rows.length; index++) expect(rows[index]!).toBeGreaterThan(rows[index - 1]!);
    expect(rows[0]!).toBeGreaterThan(0);
    expect(rows.at(-1)!).toBeLessThan(1);
  });
});
