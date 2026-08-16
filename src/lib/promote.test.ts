import { describe, expect, test } from "bun:test";
import {
  buildComponentModule,
  buildPreviewModule,
  buildSlug,
  normalizeFolder,
  toComponentName,
  validatePromoteRequest,
} from "./promote";
import { statusFromPreviewSource } from "../../scripts/sync-playground";

describe("normalizeFolder", () => {
  test("normalizes display names", () => {
    expect(normalizeFolder("Buttons")).toBe("buttons");
    expect(normalizeFolder(" my shapes ")).toBe("my-shapes");
    expect(normalizeFolder("")).toBeNull();
  });
});

describe("toComponentName", () => {
  test("builds PascalCase names", () => {
    expect(toComponentName("morph blob")).toBe("MorphBlob");
    expect(toComponentName("Untitled idea")).toBe("UntitledIdea");
    expect(toComponentName("123 bad")).toBeNull();
  });
});

describe("validatePromoteRequest", () => {
  test("accepts a normal idea", () => {
    const result = validatePromoteRequest({
      folder: "shapes",
      name: "Morph Blob",
      source: "export function Example() { return null; }",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slug).toBe("shapes/MorphBlob");
      expect(result.componentName).toBe("MorphBlob");
    }
  });

  test("rejects shells folder to protect ConfigurableShell", () => {
    const result = validatePromoteRequest({
      folder: "shells",
      name: "Anything",
      source: "export function Example() { return null; }",
    });
    expect(result.ok).toBe(false);
  });

  test("rejects experimental folder so WIP is not published onto itself", () => {
    const result = validatePromoteRequest({
      folder: "experimental",
      name: "Anything",
      source: "export function Example() { return null; }",
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildComponentModule / buildPreviewModule", () => {
  test("renames Example export and builds a live preview", () => {
    const component = buildComponentModule(
      "MorphBlob",
      `export function Example() {\n  return <div />;\n}\n`,
    );
    expect(component).toContain("export function MorphBlob()");
    expect(component).not.toContain("export function Example");

    const preview = buildPreviewModule("MorphBlob", "Morph Blob");
    expect(preview).toContain('title: "Morph Blob"');
    expect(preview).toContain("import { MorphBlob }");
    expect(preview).not.toContain("experimental");

    const experimental = buildPreviewModule(
      "MorphBlob",
      "Morph Blob",
      "experimental",
    );
    expect(experimental).toContain('status: "experimental"');
  });

  test("buildSlug joins folder and name", () => {
    expect(buildSlug("feedback", "PulseMark")).toBe("feedback/PulseMark");
  });
});

describe("statusFromPreviewSource", () => {
  test("defaults to live", () => {
    expect(statusFromPreviewSource("export const meta = {};")).toBe("live");
  });

  test("detects experimental", () => {
    expect(statusFromPreviewSource(`status: "experimental"`)).toBe(
      "experimental",
    );
  });
});
