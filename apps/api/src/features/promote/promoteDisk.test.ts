import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IdeaProject } from "@react-playground/api";
import { defaultIdeaDraft } from "@react-playground/api";
import { IdeaError } from "../ideas/ideaError";
import { publishIdeaToDisk } from "./promoteDisk";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "publish-disk-"));
  directories.push(dir);
  return dir;
}

const idea: IdeaProject = {
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
};

describe("publishIdeaToDisk", () => {
  test("publishes atomically and treats exact retries as success", async () => {
    const playground = await root();
    expect((await publishIdeaToDisk(playground, idea, "shapes")).reused).toBe(false);
    expect((await publishIdeaToDisk(playground, idea, "shapes")).reused).toBe(true);
  });

  test("overwrites a Live component whose files already exist", async () => {
    const playground = await root();
    await publishIdeaToDisk(playground, idea, "shapes");
    const componentPath = path.join(
      playground,
      "shapes",
      "MorphBlob",
      "MorphBlob.tsx",
    );
    await writeFile(componentPath, "export function MorphBlob() {}\n");
    const previewPath = path.join(path.dirname(componentPath), "preview.tsx");
    const previewBefore = await stat(previewPath);
    const componentBefore = await stat(componentPath);
    const published = await publishIdeaToDisk(playground, idea, "shapes");
    expect(published.reused).toBe(false);
    const next = await readFile(componentPath, "utf8");
    expect(next).not.toBe("export function MorphBlob() {}\n");
    expect(next).toContain("export function MorphBlob");
    expect((await stat(previewPath)).ino).toBe(previewBefore.ino);
    expect((await stat(previewPath)).mtimeMs).toBe(previewBefore.mtimeMs);
    expect((await stat(componentPath)).ino).not.toBe(componentBefore.ino);
    expect((await readdir(path.dirname(componentPath))).sort()).toEqual(["MorphBlob.tsx", "preview.tsx"]);
  });

  test("rejects partial or different destinations", async () => {
    const playground = await root();
    const destination = path.join(playground, "shapes", "MorphBlob");
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, "notes.txt"), "user file");
    try {
      await publishIdeaToDisk(playground, idea, "shapes");
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(IdeaError);
      expect((error as IdeaError).code).toBe("destination_exists");
    }
  });

  test("rejects reserved Live folders", async () => {
    const playground = await root();
    expect(
      publishIdeaToDisk(playground, idea, "experimental"),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(
      publishIdeaToDisk(playground, idea, "shells"),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
