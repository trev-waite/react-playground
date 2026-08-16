import { describe, expect, test } from "bun:test";
import { blobPath, exampleMetrics, exportExampleCode } from "./exportExample";

describe("exportExampleCode", () => {
  test("bakes the current morph path into a generic Example module", () => {
    const source = exportExampleCode(46, 58, 36);
    const metrics = exampleMetrics(46, 58, 36);

    expect(source).toContain("export function Example()");
    expect(source).toContain("Morphing mark");
    expect(source).toContain(`d="${metrics.path}"`);
    expect(source).toContain(`d="${metrics.ghost}"`);
    expect(source).not.toContain("<g transform");
    expect(source).not.toMatch(/specimen|quiet|Aa/i);
  });

  test("closes a cubic path and changes shape as form increases", () => {
    const round = blobPath(8, 80, 0);
    const pinched = blobPath(92, 80, 0);
    expect(round.startsWith("M ")).toBe(true);
    expect(round.endsWith(" Z")).toBe(true);
    expect(round).not.toBe(pinched);
    expect(round.split(" C ").length).toBe(7);
  });

  test("includes pan offset when the preview has been moved", () => {
    const source = exportExampleCode(46, 58, 36, { x: 20, y: -10 });
    expect(source).toContain('<g transform="translate(');
  });
});
