import { describe, expect, test } from "bun:test";
import { parseIdeaStudio, validateSaveRequest } from "./idea";

describe("parseIdeaStudio", () => {
  test("reads finite control values and clamps the sliders", () => {
    expect(
      parseIdeaStudio({
        form: 140,
        soft: -8,
        drift: 36,
        offset: { x: 12, y: -4 },
      }),
    ).toEqual({
      form: 100,
      soft: 0,
      drift: 36,
      offset: { x: 12, y: -4 },
    });
  });

  test("keeps an optional construct variant", () => {
    expect(
      parseIdeaStudio({
        form: 56,
        soft: 58,
        drift: 42,
        offset: { x: 0.5, y: 0.5 },
        variant: "stella",
      }),
    ).toEqual({
      form: 56,
      soft: 58,
      drift: 42,
      offset: { x: 0.5, y: 0.5 },
      variant: "stella",
    });
  });

  test("rejects incomplete snapshots", () => {
    expect(parseIdeaStudio({ form: 1, soft: 2 })).toBeNull();
    expect(parseIdeaStudio(null)).toBeNull();
  });
});

describe("validateSaveRequest", () => {
  test("saves without a live folder", () => {
    const result = validateSaveRequest({
      name: "Morph Blob",
      folder: "",
      source: "export function Example() { return null; }",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.componentName).toBe("MorphBlob");
      expect(result.value.folder).toBe("");
    }
  });

  test("rejects empty source", () => {
    const result = validateSaveRequest({
      name: "Morph Blob",
      folder: "buttons",
      source: "  ",
    });
    expect(result.ok).toBe(false);
  });
});
