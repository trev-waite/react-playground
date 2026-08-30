import { describe, expect, test } from "bun:test";
import { createHttpPlaygroundApi } from "./httpPlaygroundApi";
import { PlaygroundApiError } from "./playgroundApi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const id = "11111111-1111-4111-8111-111111111111";
const draft = {
  kind: "source" as const,
  version: 1 as const,
  portableSourceTemplate: "export function Example() { return null; }",
};
const idea = {
  schemaVersion: 2 as const,
  id,
  revision: 1,
  name: "Morph Blob",
  targetFolder: "shapes",
  componentName: "MorphBlob",
  draft,
  sourceFile: "source.tsx" as const,
  sourceDigest: "daa35f325bfc72d3c725365ba6481373d18f998b17ed5b185e56d7f5fada37bf",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const summary = (({ draft: _draft, createdAt: _createdAt, schemaVersion: _schemaVersion, ...value }) => value)(idea);

describe("createHttpPlaygroundApi", () => {
  test("validates and lists ideas", async () => {
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async url => {
        expect(String(url)).toBe("http://api.test/api/ideas");
        return jsonResponse({ ok: true, ideas: [summary] });
      },
    });
    expect((await api.listIdeas())[0]?.id).toBe(id);
  });

  test("loads, creates, updates, and deletes ideas", async () => {
    const calls: string[] = [];
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(url)}`);
        if (init?.method === "DELETE") return jsonResponse({ ok: true });
        return jsonResponse({ ok: true, idea });
      },
    });

    expect((await api.loadIdea(id)).componentName).toBe("MorphBlob");
    await api.createIdea({ name: idea.name, targetFolder: "shapes", draft });
    await api.updateIdea(id, {
      name: idea.name,
      targetFolder: "shapes",
      draft,
      expectedRevision: 1,
    });
    await api.deleteIdea(id);
    expect(calls).toEqual([
      `GET http://api.test/api/ideas/${id}`,
      "POST http://api.test/api/ideas",
      `PUT http://api.test/api/ideas/${id}`,
      `DELETE http://api.test/api/ideas/${id}`,
    ]);
  });

  test("rejects malformed successful responses", async () => {
    const api = createHttpPlaygroundApi({
      fetch: async () => jsonResponse({ ok: true, ideas: [{ name: "Incomplete" }] }),
    });
    expect(api.listIdeas()).rejects.toBeInstanceOf(PlaygroundApiError);
  });

  test("surfaces typed API errors", async () => {
    const api = createHttpPlaygroundApi({
      fetch: async () =>
        jsonResponse(
          { ok: false, code: "revision_conflict", error: "Reload first" },
          409,
        ),
    });
    try {
      await api.updateIdea(id, {
        name: idea.name,
        targetFolder: "shapes",
        draft,
        expectedRevision: 1,
      });
      throw new Error("expected update to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PlaygroundApiError);
      expect((error as PlaygroundApiError).code).toBe("revision_conflict");
      expect((error as PlaygroundApiError).status).toBe(409);
    }
  });

  test("returns catalog refresh state from publish", async () => {
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async (url, init) => {
        expect(String(url)).toBe(`http://api.test/api/ideas/${id}/publish`);
        expect(init?.method).toBe("POST");
        return jsonResponse({
          ok: true,
          slug: "shapes/MorphBlob",
          catalogStatus: "refresh-failed",
        });
      },
    });
    expect(await api.publishIdea(id, { expectedRevision: 1 })).toEqual({
      slug: "shapes/MorphBlob",
      catalogStatus: "refresh-failed",
    });
  });
});
