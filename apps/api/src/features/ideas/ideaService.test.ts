import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

  test("does not overwrite corrupt project metadata during adoption", async () => {
    const root = await tempPlayground();
    const directory = path.join(root, "BrokenIdea");
    await mkdir(directory);
    const source = "export function Example() { return null; }\n";
    await writeFile(path.join(directory, "source.tsx"), source);
    const corruptMetadata = "{ definitely not json";
    await writeFile(path.join(directory, "project.json"), corruptMetadata);

    expect(await createIdeaService(root).list()).toEqual([]);
    expect(await readFile(path.join(directory, "project.json"), "utf8")).toBe(
      corruptMetadata,
    );
  });
});
