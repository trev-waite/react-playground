import { describe, expect, test } from "bun:test";
import { createHttpPlaygroundApi } from "./httpPlaygroundApi";
import { PlaygroundApiError } from "./playgroundApi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const idea = {
  name: "Morph Blob",
  folder: "shapes",
  componentName: "MorphBlob",
  savedAt: "2026-01-01T00:00:00.000Z",
  source: "export function MorphBlob() { return null; }",
  studio: { form: 1, soft: 2, drift: 3, offset: { x: 0, y: 0 } },
};

describe("createHttpPlaygroundApi", () => {
  test("lists ideas from the local HTTP API", async () => {
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async url => {
        expect(String(url)).toBe("http://api.test/api/ideas");
        return jsonResponse({ ok: true, ideas: [idea] });
      },
    });

    const ideas = await api.listIdeas();
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.componentName).toBe("MorphBlob");
  });

  test("loads, saves, and deletes ideas", async () => {
    const calls: string[] = [];
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${String(url)}`);
        if (String(url).endsWith("/api/ideas/MorphBlob") && !init?.method) {
          return jsonResponse({ ok: true, idea });
        }
        if (init?.method === "POST") {
          return jsonResponse({ ok: true, idea, ideas: [idea] });
        }
        if (init?.method === "DELETE") {
          return jsonResponse({ ok: true, ideas: [] });
        }
        return jsonResponse({ ok: false, error: "unexpected" }, 500);
      },
    });

    expect((await api.loadIdea("MorphBlob")).componentName).toBe("MorphBlob");
    const saved = await api.saveIdea({
      name: "Morph Blob",
      folder: "shapes",
      source: idea.source,
    });
    expect(saved.idea.componentName).toBe("MorphBlob");
    expect(await api.deleteIdea("MorphBlob")).toEqual([]);
    expect(calls).toEqual([
      "GET http://api.test/api/ideas/MorphBlob",
      "POST http://api.test/api/ideas",
      "DELETE http://api.test/api/ideas/MorphBlob",
    ]);
  });

  test("encodes component names in URLs", async () => {
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async url => {
        expect(String(url)).toBe("http://api.test/api/ideas/Foo%2FBar");
        return jsonResponse({ ok: false, error: "Invalid prototype name" }, 400);
      },
    });

    try {
      await api.loadIdea("Foo/Bar");
      throw new Error("expected load to fail");
    } catch (err) {
      expect(err).toBeInstanceOf(PlaygroundApiError);
    }
  });

  test("surfaces API error messages as PlaygroundApiError", async () => {
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async () =>
        jsonResponse({ ok: false, error: "shapes/MorphBlob already exists" }, 409),
    });

    try {
      await api.promote({
        folder: "shapes",
        name: "Morph Blob",
        source: "export function Example() { return null; }",
      });
      throw new Error("expected promote to fail");
    } catch (err) {
      expect(err).toBeInstanceOf(PlaygroundApiError);
      expect((err as PlaygroundApiError).message).toContain("already exists");
      expect((err as PlaygroundApiError).status).toBe(409);
    }
  });

  test("returns a slug from a successful promote", async () => {
    const api = createHttpPlaygroundApi({
      baseUrl: "http://api.test",
      fetch: async (url, init) => {
        expect(String(url)).toBe("http://api.test/api/promote");
        expect(init?.method).toBe("POST");
        return jsonResponse({ ok: true, slug: "shapes/MorphBlob" });
      },
    });
    expect(await api.promote({ folder: "shapes", name: "Morph Blob", source: "x" })).toEqual({
      slug: "shapes/MorphBlob",
    });
  });
});
