import { describe, expect, test } from "bun:test";
import {
  coerceIdeaDraftState,
  parseCreateIdeaInput,
  parseIdeaDocument,
  parseIdeaDraft,
  parsePublishIdeaInput,
} from "./contracts";
import { defaultIdeaDraft, defaultIdeaDraftState } from "./ideaDraft";

describe("idea contracts", () => {
  test("accepts a versioned dock draft with one Example export", () => {
    expect(parseIdeaDraft(defaultIdeaDraft())).not.toBeNull();
    expect(
      parseIdeaDraft({
        ...defaultIdeaDraft(),
        portableSourceTemplate: "export default null",
      }),
    ).toBeNull();
  });

  test("preserves source formatting and requires one placeholder export", () => {
    const formatted = `\nexport function Example() {\n  return null;\n}\n`;
    expect(
      parseIdeaDraft({
        ...defaultIdeaDraft(),
        portableSourceTemplate: formatted,
      })?.portableSourceTemplate,
    ).toBe(formatted);
    expect(
      parseIdeaDraft({
        ...defaultIdeaDraft(),
        portableSourceTemplate: `${formatted}\nexport function Example() { return null; }`,
      }),
    ).toBeNull();
  });

  test("migrates source and construct kinds into dock settings", () => {
    expect(coerceIdeaDraftState({ kind: "source", version: 1 })).toEqual(
      defaultIdeaDraftState(),
    );
    const migrated = coerceIdeaDraftState({
      kind: "emerald-construct",
      version: 1,
      editorState: {
        formationSpeed: 39,
        detail: 93,
        color: 42,
        origin: { x: 0.5, y: 0.5 },
        variant: "bird",
      },
    });
    expect(migrated?.sliders[0]?.id).toBe("formationSpeed");
    expect(migrated?.sliders[0]?.value).toBe(39);
    expect(migrated?.actions[0]?.label).toBe("Build");
    expect(migrated?.actions.map(action => action.mock)).toEqual([
      "form",
      "unform",
      "replay",
    ]);
    expect(
      parseIdeaDraft({
        ...defaultIdeaDraft(),
        actions: defaultIdeaDraft().actions.map((action, index) =>
          index === 0 ? { ...action, mock: "form" } : action,
        ),
      }),
    ).not.toBeNull();
  });

  test("keeps Live destinations out of drafts and validates them at publish", () => {
    expect(
      parseCreateIdeaInput({
        name: "Morph Blob",
        draft: defaultIdeaDraft(),
      }),
    ).not.toBeNull();
    expect(
      parsePublishIdeaInput({
        expectedRevision: 1,
        targetFolder: "my-shapes",
      }),
    ).not.toBeNull();
    expect(
      parsePublishIdeaInput({
        expectedRevision: 1,
        targetFolder: "My Shapes",
      }),
    ).toBeNull();
  });

  test("rejects documents whose derived component name is stale", () => {
    expect(
      parseIdeaDocument({
        schemaVersion: 3,
        id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        name: "Morph Blob",
        componentName: "WrongName",
        draft: defaultIdeaDraft(),
        sourceFile: "source.tsx",
        sourceDigest: "daa35f325bfc72d3c725365ba6481373d18f998b17ed5b185e56d7f5fada37bf",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
