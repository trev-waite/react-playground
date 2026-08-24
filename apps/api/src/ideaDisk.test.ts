import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  deleteExperimentalIdea,
  listExperimentalIdeas,
  loadExperimentalIdea,
  resolveExperimentalDir,
  saveExperimentalIdea,
} from "./ideaDisk";
import { promoteIdeaToDisk } from "./promoteDisk";
import { isWipExperimentalSlug } from "./idea";

const dirs: string[] = [];

async function tempPlayground(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "playground-ideas-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const source = `export function Example() {
  return <div>blob</div>;
}
`;

describe("resolveExperimentalDir", () => {
  test("stays inside the experimental folder", () => {
    const root = "/tmp/playground";
    expect(resolveExperimentalDir(root, "MorphBlob")).toBe(
      path.resolve(root, "experimental", "MorphBlob"),
    );
    expect(resolveExperimentalDir(root, "../shells")).toBeNull();
    expect(resolveExperimentalDir(root, "ConfigurableShell")).toBe(
      path.resolve(root, "experimental", "ConfigurableShell"),
    );
  });
});

describe("save / load / switch experimental ideas", () => {
  test("writes, updates, renames, and lists prototypes", async () => {
    const root = await tempPlayground();

    const first = await saveExperimentalIdea(root, {
      name: "Morph Blob",
      folder: "shapes",
      source,
      studio: { form: 40, soft: 50, drift: 20, offset: { x: 0, y: 0 } },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const loaded = await loadExperimentalIdea(root, "MorphBlob");
    expect(loaded?.name).toBe("Morph Blob");
    expect(loaded?.folder).toBe("shapes");
    expect(loaded?.studio?.form).toBe(40);
    expect(loaded?.source).toContain("export function MorphBlob");

    const updated = await saveExperimentalIdea(root, {
      name: "Morph Blob",
      folder: "buttons",
      source,
      studio: { form: 12, soft: 18, drift: 8, offset: { x: 1, y: 2 } },
      previousComponentName: "MorphBlob",
    });
    expect(updated.ok).toBe(true);

    const renamed = await saveExperimentalIdea(root, {
      name: "Pulse Mark",
      folder: "buttons",
      source,
      studio: { form: 12, soft: 18, drift: 8, offset: { x: 1, y: 2 } },
      previousComponentName: "MorphBlob",
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.idea.componentName).toBe("PulseMark");
    expect(await loadExperimentalIdea(root, "MorphBlob")).toBeNull();
    expect(await loadExperimentalIdea(root, "PulseMark")).not.toBeNull();

    const listed = await listExperimentalIdeas(root);
    expect(listed.map(idea => idea.componentName)).toEqual(["PulseMark"]);
  });
});

describe("Make Live discards the experimental copy", () => {
  test("publishes into the chosen folder and deletes the WIP files", async () => {
    const root = await tempPlayground();

    const saved = await saveExperimentalIdea(root, {
      name: "Morph Blob",
      folder: "shapes",
      source,
      studio: { form: 40, soft: 50, drift: 20, offset: { x: 0, y: 0 } },
    });
    expect(saved.ok).toBe(true);

    const shellsDir = path.join(root, "shells", "ConfigurableShell");
    await mkdir(shellsDir, { recursive: true });
    await Bun.write(path.join(shellsDir, "marker.txt"), "keep");

    const promoted = await promoteIdeaToDisk(root, {
      folder: "shapes",
      name: "Morph Blob",
      source,
      discardExperimental: "MorphBlob",
    });
    expect(promoted.ok).toBe(true);
    if (!promoted.ok) return;
    expect(promoted.slug).toBe("shapes/MorphBlob");

    expect(await Bun.file(path.join(promoted.dir, "MorphBlob.tsx")).exists()).toBe(
      true,
    );
    expect(await loadExperimentalIdea(root, "MorphBlob")).toBeNull();
    expect(await Bun.file(path.join(shellsDir, "marker.txt")).text()).toBe("keep");
    expect(isWipExperimentalSlug(promoted.slug)).toBe(false);
  });

  test("does not delete WIP when promote is rejected", async () => {
    const root = await tempPlayground();
    await saveExperimentalIdea(root, {
      name: "Morph Blob",
      folder: "shapes",
      source,
      studio: { form: 1, soft: 2, drift: 3, offset: { x: 0, y: 0 } },
    });

    const rejected = await promoteIdeaToDisk(root, {
      folder: "experimental",
      name: "Morph Blob",
      source,
      discardExperimental: "MorphBlob",
    });
    expect(rejected.ok).toBe(false);
    expect(await loadExperimentalIdea(root, "MorphBlob")).not.toBeNull();
  });

  test("rejects a Live path that already exists", async () => {
    const root = await tempPlayground();
    const first = await promoteIdeaToDisk(root, {
      folder: "shapes",
      name: "Morph Blob",
      source,
    });
    expect(first.ok).toBe(true);

    const conflict = await promoteIdeaToDisk(root, {
      folder: "shapes",
      name: "Morph Blob",
      source,
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.status).toBe(409);
      expect(conflict.error).toContain("already exists");
    }
  });
});

describe("deleteExperimentalIdea", () => {
  test("removes a saved prototype", async () => {
    const root = await tempPlayground();
    await saveExperimentalIdea(root, {
      name: "Morph Blob",
      folder: "shapes",
      source,
    });
    const deleted = await deleteExperimentalIdea(root, "MorphBlob");
    expect(deleted.ok).toBe(true);
    expect(await listExperimentalIdeas(root)).toEqual([]);
  });
});
