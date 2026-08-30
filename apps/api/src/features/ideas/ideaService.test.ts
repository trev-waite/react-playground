import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createIdeaService } from "./ideaService";

const directories: string[] = [];

async function tempPlayground(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "idea-service-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const draft = {
  kind: "source" as const,
  version: 1 as const,
  portableSourceTemplate: "export function Example() { return null; }",
};

describe("idea service", () => {
  test("uses stable identity so duplicate names and renames do not overwrite", async () => {
    const root = await tempPlayground();
    const service = createIdeaService(root);
    const first = await service.create({ name: "Study", targetFolder: "shapes", draft });
    const second = await service.create({ name: "Study", targetFolder: "shapes", draft });
    expect(first.id).not.toBe(second.id);
    expect(
      (await readdir(root)).filter(name => !name.startsWith(".")).sort(),
    ).toEqual(["Study", "Study2"]);

    const renamed = await service.update(first.id, {
      name: "Renamed study",
      targetFolder: "shapes",
      draft,
      expectedRevision: first.revision,
    });
    expect(renamed.id).toBe(first.id);
    expect(await service.load(second.id)).not.toBeNull();
    expect(await service.list()).toHaveLength(2);
    expect(
      (await readdir(root)).filter(name => !name.startsWith(".")).sort(),
    ).toEqual(["RenamedStudy", "Study2"]);
  });

  test("writes metadata and source as separate canonical files", async () => {
    const root = await tempPlayground();
    const service = createIdeaService(root);
    const created = await service.create({ name: "Study", targetFolder: "shapes", draft });
    const directory = path.join(root, created.componentName);
    const metadata = JSON.parse(
      await readFile(path.join(directory, "project.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(metadata.schemaVersion).toBe(2);
    expect(metadata.id).toBe(created.id);
    expect(metadata.id).not.toBe("Study");
    expect(JSON.stringify(metadata)).not.toContain("portableSourceTemplate");
    expect(await readFile(path.join(directory, "source.tsx"), "utf8")).toBe(
      draft.portableSourceTemplate,
    );
    expect((await import("node:fs/promises")).readdir(directory)).resolves.toEqual([
      "project.json",
      "source.tsx",
    ]);
  });

  test("adopts direct source.tsx edits as a new revision", async () => {
    const root = await tempPlayground();
    const service = createIdeaService(root);
    const created = await service.create({ name: "Study", targetFolder: "shapes", draft });
    const sourcePath = path.join(root, created.componentName, "source.tsx");
    const editedSource = "\nexport function Example() { return <div>agent edit</div>; }\n";
    await writeFile(sourcePath, editedSource);

    const loaded = await service.load(created.id);
    expect(loaded.revision).toBe(2);
    expect(loaded.draft.portableSourceTemplate).toBe(editedSource);
    expect(
      service.update(created.id, {
        name: "Stale browser edit",
        targetFolder: "shapes",
        draft,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
  });

  test("migrates legacy component-name folders before listing", async () => {
    const root = await tempPlayground();
    const legacy = path.join(root, "MorphBlob");
    await mkdir(legacy, { recursive: true });
    await writeFile(
      path.join(legacy, "idea.json"),
      JSON.stringify({
        name: "Morph Blob",
        folder: "shapes",
        savedAt: "2026-01-01T00:00:00.000Z",
        studio: {
          form: 40,
          soft: 50,
          drift: 20,
          offset: { x: 0.5, y: 0.5 },
          variant: "bird",
        },
      }),
    );
    await writeFile(
      path.join(legacy, "MorphBlob.tsx"),
      "export function MorphBlob() { return null; }",
    );

    const service = createIdeaService(root);
    const [summary] = await service.list();
    expect(summary?.componentName).toBe("MorphBlob");
    expect(summary?.id).not.toBe("MorphBlob");
    expect(await readFile(path.join(root, "MorphBlob", "project.json"), "utf8"))
      .toContain('"schemaVersion": 2');
    expect(
      await readFile(path.join(root, "MorphBlob", "source.tsx"), "utf8"),
    ).toContain("function Example");
  });

  test("clears reserved folders while migrating legacy projects", async () => {
    const root = await tempPlayground();
    const legacy = path.join(root, "MorphBlob");
    await mkdir(legacy, { recursive: true });
    await writeFile(
      path.join(legacy, "idea.json"),
      JSON.stringify({ name: "Morph Blob", folder: "experimental" }),
    );
    await writeFile(
      path.join(legacy, "MorphBlob.tsx"),
      "export function MorphBlob() { return null; }",
    );

    const [summary] = await createIdeaService(root).list();
    expect(summary?.targetFolder).toBe("components");
  });

  test("moves uuid directories onto the idea name while keeping the id in JSON", async () => {
    const root = await tempPlayground();
    const service = createIdeaService(root);
    const created = await service.create({ name: "Study", targetFolder: "shapes", draft });
    await rename(
      path.join(root, "Study"),
      path.join(root, created.id),
    );

    expect(await service.load(created.id)).not.toBeNull();
    await service.list();
    expect(await readdir(root)).toContain("Study");
    expect(await readdir(root)).not.toContain(created.id);
    const metadata = JSON.parse(
      await readFile(path.join(root, "Study", "project.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(metadata.id).toBe(created.id);
  });
});
