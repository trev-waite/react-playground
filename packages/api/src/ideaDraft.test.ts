import { describe, expect, test } from "bun:test";
import { bakeSliders, defaultIdeaDraft, sliderRecord } from "./ideaDraft";

describe("bakeSliders", () => {
  test("replaces only the SLIDERS block", () => {
    const source = `const SLIDERS = {"slider1":1,"slider2":2,"slider3":3};

export function Example({ sliders = SLIDERS } = {}) {
  return sliders.slider1;
}
`;
    const baked = bakeSliders(source, defaultIdeaDraft().sliders);
    expect(baked).toContain(`const SLIDERS = ${JSON.stringify(sliderRecord(defaultIdeaDraft().sliders))};`);
    expect(baked).toContain("export function Example");
    expect(baked).toContain("return sliders.slider1;");
    expect(baked).not.toContain("ProximityControl");
    expect(baked).not.toContain('"slider1":1');
  });

  test("prepends a SLIDERS block when the source has none", () => {
    const source = "export function Example() { return null; }";
    const baked = bakeSliders(source, defaultIdeaDraft().sliders);
    expect(baked.startsWith("const SLIDERS = ")).toBe(true);
    expect(baked).toContain("export function Example()");
  });

  test("does not rewrite agent-edited code outside the SLIDERS block", () => {
    const source = `const SLIDERS = {"slider1":1,"slider2":2,"slider3":3};

// agent note: keep this comment
export function Example({ sliders = SLIDERS } = {}) {
  const size = sliders.slider1 * 2;
  return <div style={{ width: size }} />;
}
`;
    const baked = bakeSliders(source, defaultIdeaDraft().sliders);
    expect(baked).toContain("// agent note: keep this comment");
    expect(baked).toContain("const size = sliders.slider1 * 2;");
    expect(baked).toContain("<div style={{ width: size }} />");
  });
});
