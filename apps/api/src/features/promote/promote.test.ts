import { describe, expect, test } from "bun:test";
import {
  buildComponentModule,
  buildPreviewModule,
  validatePromoteRequest,
} from "./promote";
import { buildSlug } from "@react-playground/api";

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
