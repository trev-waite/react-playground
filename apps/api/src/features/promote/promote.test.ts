import { describe, expect, test } from "bun:test";
import {
  buildLiveArtifact,
  buildComponentModule,
  buildPreviewModule,
} from "./promote";
import { defaultIdeaDraft, buildSlug } from "@react-playground/api";

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
  });

  test("buildSlug joins folder and name", () => {
    expect(buildSlug("feedback", "PulseMark")).toBe("feedback/PulseMark");
  });

  test("builds both Live files from a saved project snapshot", () => {
    const artifact = buildLiveArtifact({
      schemaVersion: 3,
      id: "11111111-1111-4111-8111-111111111111",
      revision: 1,
      name: "Morph Blob",
      componentName: "MorphBlob",
      draft: defaultIdeaDraft(),
      sourceFile: "source.tsx",
      sourceDigest: "daa35f325bfc72d3c725365ba6481373d18f998b17ed5b185e56d7f5fada37bf",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(artifact.component).toContain("function MorphBlob");
    expect(artifact.component).toContain("const SLIDERS = ");
    expect(artifact.component).not.toContain("ProximityControl");
    expect(artifact.component).not.toContain("mock");
    expect(artifact.preview).toContain("<MorphBlob />");
    expect(artifact.preview).not.toContain("sliders");
  });
});
