import { describe, expect, test } from "bun:test";
import { exportEmeraldConstructCode } from "./exportCode";

describe("exportEmeraldConstructCode", () => {
  test("bakes current construct props into an Example module", () => {
    const source = exportEmeraldConstructCode(56, 58, 42, "bird", {
      x: 0.25,
      y: 0.75,
    });
    expect(source).toContain("export function Example(");
    expect(source).toContain("from \"react\"");
    expect(source).toContain("const SPEED = 56");
    expect(source).toContain("const FACETS = ");
    expect(source).toContain('const ORIGIN = {"x":0.25,"y":0.75}');
    expect(source).toContain("getContext(\"2d\")");
    expect(source).toContain('role="img"');
    expect(source).not.toContain("ConfigurableShell");
    expect(source).not.toContain("ProximityControl");
    expect(source).not.toContain("ctx.arc");
  });
});
