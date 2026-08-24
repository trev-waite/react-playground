import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHttpPlaygroundApi } from "@react-playground/api";
import { startPlaygroundApi } from "./server";

const dirs: string[] = [];
const servers: ReturnType<typeof startPlaygroundApi>[] = [];

async function tempPlayground(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "api-http-"));
  dirs.push(dir);
  return dir;
}

function startApi(playgroundRoot: string, refreshRegistry?: () => Promise<void>) {
  const server = startPlaygroundApi({
    playgroundRoot,
    corsOrigin: "http://localhost:3000",
    port: 0,
    refreshRegistry,
  });
  servers.push(server);
  return server;
}

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const source = `export function Example() {
  return <div>blob</div>;
}
`;

describe("startPlaygroundApi", () => {
  test("lists, saves, loads, and deletes ideas over HTTP", async () => {
    const root = await tempPlayground();
    const server = startApi(root);
    const api = createHttpPlaygroundApi({ baseUrl: server.url.origin });

    expect(await api.listIdeas()).toEqual([]);

    const saved = await api.saveIdea({
      name: "Morph Blob",
      folder: "shapes",
      source,
      studio: { form: 40, soft: 50, drift: 20, offset: { x: 0, y: 0 } },
    });
    expect(saved.idea.componentName).toBe("MorphBlob");
    expect(saved.ideas).toHaveLength(1);

    const loaded = await api.loadIdea("MorphBlob");
    expect(loaded.name).toBe("Morph Blob");
    expect(loaded.source).toContain("export function MorphBlob");

    const remaining = await api.deleteIdea("MorphBlob");
    expect(remaining).toEqual([]);
    expect(await api.listIdeas()).toEqual([]);
  });

  test("rejects an invalid prototype name", async () => {
    const root = await tempPlayground();
    const server = startApi(root);
    const res = await fetch(`${server.url.origin}/api/ideas/foo-bar`);
    const data = (await res.json()) as { ok: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Invalid prototype name");
  });

  test("returns 404 for a missing idea", async () => {
    const root = await tempPlayground();
    const server = startApi(root);
    const res = await fetch(`${server.url.origin}/api/ideas/MissingIdea`);
    expect(res.status).toBe(404);
  });

  test("promotes and invokes registry refresh", async () => {
    const root = await tempPlayground();
    let refreshed = 0;
    const server = startApi(root, async () => {
      refreshed += 1;
    });
    const api = createHttpPlaygroundApi({ baseUrl: server.url.origin });

    await api.saveIdea({ name: "Morph Blob", folder: "shapes", source });
    const promoted = await api.promote({
      folder: "shapes",
      name: "Morph Blob",
      source,
      discardExperimental: "MorphBlob",
    });
    expect(promoted.slug).toBe("shapes/MorphBlob");
    expect(refreshed).toBe(1);
    expect(await api.listIdeas()).toEqual([]);
  });

  test("keeps published files when registry refresh fails", async () => {
    const root = await tempPlayground();
    const server = startApi(root, async () => {
      throw new Error("sync failed");
    });
    const api = createHttpPlaygroundApi({ baseUrl: server.url.origin });

    try {
      await api.promote({ folder: "shapes", name: "Morph Blob", source });
      throw new Error("expected promote to fail");
    } catch (err) {
      expect(String(err)).toContain("failed to refresh the Live catalog");
    }

    expect(
      await Bun.file(path.join(root, "shapes", "MorphBlob", "MorphBlob.tsx")).exists(),
    ).toBe(true);
  });

  test("answers OPTIONS with CORS for a loopback alias", async () => {
    const root = await tempPlayground();
    const server = startApi(root);
    const res = await fetch(`${server.url.origin}/api/ideas`, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:3000" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:3000",
    );
  });
});
