import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHttpPlaygroundApi, PlaygroundApiError, defaultIdeaDraft } from "@react-playground/api";
import { createPlaygroundApiHandler } from "./server";

const directories: string[] = [];

async function tempPlayground(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "api-http-"));
  directories.push(directory);
  return directory;
}

function apiHandler(root: string) {
  return createPlaygroundApiHandler({
    experimentalRoot: root,
    liveRoot: root,
    corsOrigin: "http://localhost:3000",
  });
}

function apiClient(playgroundRoot: string) {
  const handler = apiHandler(playgroundRoot);
  return createHttpPlaygroundApi({
    baseUrl: "http://api.test",
    fetch: (input, init) => handler(new Request(input, init)),
  });
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const draft = {
  ...defaultIdeaDraft(),
  portableSourceTemplate: "export function Example() { return <div>blob</div>; }",
};

describe("playground API handler", () => {
  test("creates, updates, loads, lists, and deletes stable-id ideas", async () => {
    const root = await tempPlayground();
    const api = apiClient(root);

    const created = await api.createIdea({
      name: "Morph Blob",
      draft,
    });
    expect(created.id).not.toBe(created.componentName);
    expect((await api.listIdeas())[0]?.id).toBe(created.id);

    const updated = await api.updateIdea(created.id, {
      name: "Pulse Mark",
      draft,
      expectedRevision: created.revision,
    });
    expect(updated.componentName).toBe("PulseMark");
    expect(updated.revision).toBe(2);
    expect(await api.loadIdea(created.id)).not.toHaveProperty("targetFolder");

    await api.deleteIdea(created.id);
    expect(await api.listIdeas()).toEqual([]);
  });

  test("rejects stale revisions without changing the project", async () => {
    const root = await tempPlayground();
    const api = apiClient(root);
    const created = await api.createIdea({
      name: "Morph Blob",
      draft,
    });
    await api.updateIdea(created.id, {
      name: "First edit",
      draft,
      expectedRevision: 1,
    });

    try {
      await api.updateIdea(created.id, {
        name: "Stale edit",
        draft,
        expectedRevision: 1,
      });
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(PlaygroundApiError);
      expect((error as PlaygroundApiError).code).toBe("revision_conflict");
    }
    expect((await api.loadIdea(created.id)).name).toBe("First edit");
  });

  test("publishes idempotently into the Live folder", async () => {
    const root = await tempPlayground();
    const api = apiClient(root);
    const created = await api.createIdea({
      name: "Morph Blob",
      draft,
    });

    const publishInput = { expectedRevision: 1, targetFolder: "shapes" };
    expect(await api.publishIdea(created.id, publishInput)).toEqual({
      slug: "shapes/MorphBlob",
    });
    expect(await api.publishIdea(created.id, publishInput)).toEqual({
      slug: "shapes/MorphBlob",
    });
    expect(
      await readFile(
        path.join(root, "shapes", "MorphBlob", "MorphBlob.tsx"),
        "utf8",
      ),
    ).toContain("function MorphBlob");
    expect(await api.listIdeas()).toHaveLength(1);
  });

  test("rejects invalid ids and supports loopback CORS aliases", async () => {
    const root = await tempPlayground();
    const handler = apiHandler(root);
    const invalid = await handler(new Request("http://api.test/api/ideas/short"));
    expect(invalid.status).toBe(400);

    const options = await handler(
      new Request("http://api.test/api/ideas", {
        method: "OPTIONS",
        headers: { Origin: "http://127.0.0.1:3000" },
      }),
    );
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
  });
});
