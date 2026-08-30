import { describe, expect, test } from "bun:test";
import { defaultIdeaDraft } from "@react-playground/api";
import { emptyIdeaDraft } from "./ideaSession";

describe("emptyIdeaDraft", () => {
  test("starts a new idea on the shared dock template", () => {
    expect(emptyIdeaDraft).toEqual(defaultIdeaDraft());
    expect(emptyIdeaDraft.actions).toHaveLength(3);
    expect(emptyIdeaDraft.sliders).toHaveLength(3);
    expect(emptyIdeaDraft.portableSourceTemplate).toContain("const SLIDERS = ");
    expect(emptyIdeaDraft.portableSourceTemplate).toContain("export function Example");
  });
});
