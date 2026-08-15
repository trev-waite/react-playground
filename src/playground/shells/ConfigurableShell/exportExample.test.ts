import { describe, expect, test } from "bun:test";
import { exampleMetrics, exportExampleCode } from "./exportExample";

describe("exportExampleCode", () => {
  test("bakes current metrics into a generic Example module", () => {
    const source = exportExampleCode(40, 62, 28);
    const metrics = exampleMetrics(40, 62, 28);

    expect(source).toContain("export function Example()");
    expect(source).toContain("Aa");
    expect(source).toContain(`fontWeight: ${metrics.fontWeight}`);
    expect(source).toContain(`strokeWidth={${Number(metrics.stroke.toFixed(3))}}`);
    expect(source).not.toContain("<g transform");
    expect(source).not.toMatch(/specimen|quiet/i);
  });

  test("includes pan offset when the preview has been moved", () => {
    const source = exportExampleCode(40, 62, 28, { x: 20, y: -10 });
    expect(source).toContain('<g transform="translate(');
  });
});
