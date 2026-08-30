import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultIdeaDraft } from "@react-playground/api";
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

const draft = defaultIdeaDraft();

describe("idea service", () => {
  test("uses stable identity so duplicate names and renames do not overwrite", async () => {
    const root = await tempPlayground();
    const service = createIdeaService(root);
    const first = await service.create({ name: "Study", draft });
    const second = await service.create({ name: "Study", draft });
    expect(first.id).not.toBe(second.id);
    expect(
      (await readdir(root)).filter(name => !name.startsWith(".")).sort(),
    ).toEqual(["Study", "Study2"]);

    const renamed = await service.update(first.id, {
      name: "Renamed study",
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
    const created = await service.create({ name: "Study", draft });
    const directory = path.join(root, created.componentName);
    const metadata = JSON.parse(
      await readFile(path.join(directory, "project.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(metadata.schemaVersion).toBe(3);
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
    const created = await service.create({ name: "Study", draft });
    const sourcePath = path.join(root, created.componentName, "source.tsx");
    const editedSource = "\nexport function Example() { return <div>agent edit</div>; }\n";
    await writeFile(sourcePath, editedSource);

    const loaded = await service.load(created.id);
    expect(loaded.revision).toBe(2);
    expect(loaded.draft.portableSourceTemplate).toBe(editedSource);
    expect(
      service.update(created.id, {
        name: "Stale browser edit",
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
      .toContain('"schemaVersion": 3');
    expect(
      await readFile(path.join(root, "MorphBlob", "source.tsx"), "utf8"),
    ).toContain("function Example");
  });

  test("drops legacy publication folders while migrating projects", async () => {
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
    expect(summary).not.toHaveProperty("targetFolder");
  });

  test("moves uuid directories onto the idea name while keeping the id in JSON", async () => {
    const root = await tempPlayground();
    const service = createIdeaService(root);
    const created = await service.create({ name: "Study", draft });
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

  test("adopts a hand-created source.tsx folder", async () => {
    const root = await tempPlayground();
    const directory = path.join(root, "QuietButton");
    await mkdir(directory);
    const source = "export function Example() { return <button>Hi</button>; }\n";
    await writeFile(path.join(directory, "source.tsx"), source);

    const service = createIdeaService(root);
    const [summary] = await service.list();
    expect(summary?.componentName).toBe("QuietButton");
    expect(summary?.name).toBe("Quiet Button");
    expect(summary).not.toHaveProperty("targetFolder");
    expect(summary?.id).not.toBe("QuietButton");
    expect(await readFile(path.join(directory, "source.tsx"), "utf8")).toBe(source);
    const metadata = JSON.parse(
      await readFile(path.join(directory, "project.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(metadata.id).toBe(summary?.id);
    expect(metadata.schemaVersion).toBe(3);
    expect(await service.load(summary!.id)).toMatchObject({
      componentName: "QuietButton",
      draft: { portableSourceTemplate: source },
    });
  });

  test("migrates schema 2 source drafts on load", async () => {
    const root = await tempPlayground();
    const directory = path.join(root, "Study");
    await mkdir(directory);
    const source = "export function Example() { return null; }\n";
    await writeFile(path.join(directory, "source.tsx"), source);
    await writeFile(
      path.join(directory, "project.json"),
      JSON.stringify({
        schemaVersion: 2,
        id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        name: "Study",
        targetFolder: "shapes",
        componentName: "Study",
        draft: { kind: "source", version: 1 },
        sourceFile: "source.tsx",
        sourceDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const loaded = await createIdeaService(root).load(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.draft.sliders).toHaveLength(3);
    expect(loaded.draft.actions[0]?.mock).toBe("none");
    const metadata = JSON.parse(
      await readFile(path.join(directory, "project.json"), "utf8"),
    ) as { schemaVersion: number; draft: { kind?: string } };
    expect(metadata.schemaVersion).toBe(3);
    expect(metadata.draft.kind).toBeUndefined();
  });

  test("migrates schema 2 construct drafts onto the shared dock", async () => {
    const root = await tempPlayground();
    const directory = path.join(root, "Bird");
    await mkdir(directory);
    const source = "export function Example() { return null; }\n";
    await writeFile(path.join(directory, "source.tsx"), source);
    await writeFile(
      path.join(directory, "project.json"),
      JSON.stringify({
        schemaVersion: 2,
        id: "22222222-2222-4222-8222-222222222222",
        revision: 1,
        name: "Bird",
        targetFolder: "effects",
        componentName: "Bird",
        draft: {
          kind: "emerald-construct",
          version: 1,
          editorState: {
            formationSpeed: 39,
            detail: 93,
            color: 42,
            origin: { x: 0.5, y: 0.5 },
            variant: "bird",
          },
        },
        sourceFile: "source.tsx",
        sourceDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const loaded = await createIdeaService(root).load(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.draft.sliders[0]).toMatchObject({ id: "formationSpeed", value: 39 });
    expect(loaded.draft.actions.map(action => action.label)).toEqual([
      "Build",
      "Dissolve",
      "Construct",
    ]);
    expect(loaded.draft.actions.map(action => action.mock)).toEqual([
      "form",
      "unform",
      "replay",
    ]);
    const metadata = JSON.parse(
      await readFile(path.join(directory, "project.json"), "utf8"),
    ) as { schemaVersion: number; draft: { kind?: string } };
    expect(metadata.schemaVersion).toBe(3);
    expect(metadata.draft.kind).toBeUndefined();
  });
});
