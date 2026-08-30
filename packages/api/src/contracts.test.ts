import { describe, expect, test } from "bun:test";
import {
  parseCreateIdeaInput,
  parseIdeaDocument,
  parseIdeaDraft,
} from "./contracts";

const source = "export function Example() { return null; }";

describe("idea contracts", () => {
  test("accepts a versioned, constrained source draft", () => {
    expect(
      parseIdeaDraft({
        kind: "source",
        version: 1,
        portableSourceTemplate: source,
      }),
    ).not.toBeNull();
    expect(
      parseIdeaDraft({
        kind: "source",
        version: 1,
        portableSourceTemplate: "export default null",
      }),
    ).toBeNull();
  });

  test("preserves source formatting and requires one placeholder export", () => {
    const formatted = `\nexport function Example() {\n  return null;\n}\n`;
    expect(parseIdeaDraft({
      kind: "source",
      version: 1,
      portableSourceTemplate: formatted,
    })?.portableSourceTemplate).toBe(formatted);
    expect(parseIdeaDraft({
      kind: "source",
      version: 1,
      portableSourceTemplate: `${formatted}\nexport function Example() { return null; }`,
    })).toBeNull();
  });

  test("requires canonical target folders at the boundary", () => {
    expect(
      parseCreateIdeaInput({
        name: "Morph Blob",
        targetFolder: "my-shapes",
        draft: { kind: "source", version: 1, portableSourceTemplate: source },
      }),
    ).not.toBeNull();
    expect(
      parseCreateIdeaInput({
        name: "Morph Blob",
        targetFolder: null,
        draft: { kind: "source", version: 1, portableSourceTemplate: source },
      }),
    ).toBeNull();
    expect(
      parseCreateIdeaInput({
        name: "Morph Blob",
        targetFolder: "My Shapes",
        draft: { kind: "source", version: 1, portableSourceTemplate: source },
      }),
    ).toBeNull();
  });

  test("rejects documents whose derived component name is stale", () => {
    expect(
      parseIdeaDocument({
        schemaVersion: 2,
        id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        name: "Morph Blob",
        targetFolder: "shapes",
        componentName: "WrongName",
        draft: { kind: "source", version: 1 },
        sourceFile: "source.tsx",
        sourceDigest: "daa35f325bfc72d3c725365ba6481373d18f998b17ed5b185e56d7f5fada37bf",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
