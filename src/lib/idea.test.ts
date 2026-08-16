import { describe, expect, test } from "bun:test";
import {
  experimentalSlug,
  isSafeComponentName,
  isWipExperimentalSlug,
  parseIdeaStudio,
  validateSaveRequest,
} from "./idea";

describe("isWipExperimentalSlug", () => {
  test("matches the reserved experimental tree only", () => {
    expect(isWipExperimentalSlug("experimental")).toBe(true);
    expect(isWipExperimentalSlug(experimentalSlug("MorphBlob"))).toBe(true);
    expect(isWipExperimentalSlug("shells/ConfigurableShell")).toBe(false);
    expect(isWipExperimentalSlug("buttons/PrimaryButton")).toBe(false);
  });
});

describe("isSafeComponentName", () => {
  test("allows PascalCase names and rejects path traversal", () => {
    expect(isSafeComponentName("MorphBlob")).toBe(true);
    expect(isSafeComponentName("../shells")).toBe(false);
    expect(isSafeComponentName("experimental/Foo")).toBe(false);
    expect(isSafeComponentName("")).toBe(false);
  });
});

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
