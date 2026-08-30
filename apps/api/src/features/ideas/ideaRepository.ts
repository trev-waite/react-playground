import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  coerceIdeaDraftState,
  defaultIdeaDraftState,
  IDEA_SCHEMA_VERSION,
  isSafeComponentName,
  isSafeIdeaId,
  parseIdeaDocument,
  parseIdeaDraft,
  parseIdeaProject,
  parseIdeaSummary,
  toComponentName,
  type IdeaDocument,
  type IdeaDraft,
  type IdeaDraftState,
  type IdeaProject,
} from "@react-playground/api";
import { IdeaError } from "./ideaError";

const PROJECT_FILE = "project.json";
const SOURCE_FILE = "source.tsx";
const LEGACY_META_FILE = "idea.json";

const UUID_DIRECTORY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidDirectory(name: string): boolean {
  return UUID_DIRECTORY_RE.test(name);
}

function isIdeaDirectoryName(name: string): boolean {
  return !name.startsWith(".") && (isSafeComponentName(name) || isUuidDirectory(name));
}

function uniqueDirectoryName(
  preferred: string,
  taken: Set<string>,
  current?: string,
): string {
  if (!isSafeComponentName(preferred)) {
    throw new IdeaError("invalid_request", "Idea name must start with a letter", 400);
  }
  if (
    current &&
    !isUuidDirectory(current) &&
    taken.has(preferred) &&
    current !== preferred
  ) {
    return current;
  }
  if (!taken.has(preferred)) return preferred;
  let suffix = 2;
  while (taken.has(`${preferred}${suffix}`)) suffix += 1;
  return `${preferred}${suffix}`;
}

export function sourceDigest(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function draftState(draft: IdeaDraft): IdeaDraftState {
  const { portableSourceTemplate: _source, ...state } = draft;
  return state;
}

function documentFromProject(project: IdeaProject): IdeaDocument {
  return { ...project, draft: draftState(project.draft) };
}

function assertValidProject(project: IdeaProject): void {
  if (
    !parseIdeaProject(project) ||
    sourceDigest(project.draft.portableSourceTemplate) !== project.sourceDigest
  ) {
    throw new IdeaError("invalid_document", "Refusing to write an invalid idea", 500);
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function listIdeaDirectoryNames(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter(entry => entry.isDirectory() && isIdeaDirectoryName(entry.name))
    .map(entry => entry.name);
}

async function readDirectoryIdeaId(directory: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(directory, PROJECT_FILE), "utf8"),
    );
    if (typeof parsed !== "object" || parsed == null) return null;
    const id = (parsed as Record<string, unknown>).id;
    return typeof id === "string" && isSafeIdeaId(id) ? id : null;
  } catch {
    return null;
  }
}

async function readDirectoryComponentName(directory: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(directory, PROJECT_FILE), "utf8"),
    );
    if (typeof parsed !== "object" || parsed == null) return null;
    const componentName = (parsed as Record<string, unknown>).componentName;
    return typeof componentName === "string" && isSafeComponentName(componentName)
      ? componentName
      : null;
  } catch {
    return null;
  }
}

async function findDirectoryById(root: string, id: string): Promise<string | null> {
  if (!isSafeIdeaId(id)) {
    throw new IdeaError("invalid_request", "Invalid idea id", 400);
  }
  for (const name of await listIdeaDirectoryNames(root)) {
    const directory = path.join(root, name);
    if ((await readDirectoryIdeaId(directory)) === id) return directory;
  }
  return null;
}

async function takenDirectoryNames(root: string, exceptId?: string): Promise<Set<string>> {
  const taken = new Set<string>();
  for (const name of await listIdeaDirectoryNames(root)) {
    const directory = path.join(root, name);
    const id = await readDirectoryIdeaId(directory);
    if (id && id === exceptId) continue;
    taken.add(name);
  }
  return taken;
}

async function allocateDirectory(
  root: string,
  project: Pick<IdeaProject, "id" | "componentName">,
  current?: string | null,
): Promise<string> {
  const taken = await takenDirectoryNames(root, project.id);
  const currentName = current ? path.basename(current) : undefined;
  return path.join(
    root,
    uniqueDirectoryName(project.componentName, taken, currentName),
  );
}

async function writeProjectDirectory(directory: string, project: IdeaProject): Promise<void> {
  assertValidProject(project);
  await mkdir(directory, { recursive: false });
  await Promise.all([
    writeFile(
      path.join(directory, PROJECT_FILE),
      `${JSON.stringify(documentFromProject(project), null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      path.join(directory, SOURCE_FILE),
      project.draft.portableSourceTemplate,
      "utf8",
    ),
  ]);
}

function temporaryPath(root: string, id: string, kind: "stage" | "backup"): string {
  return path.join(root, `.${id}.${kind}-${crypto.randomUUID()}`);
}

async function matchingTemporaryDirectories(root: string, id: string, kind: string) {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const prefix = `.${id}.${kind}-`;
  return entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
    .map(entry => path.join(root, entry.name))
    .sort();
}

async function recoverProjectDirectory(
  ideasRoot: string,
  id: string,
): Promise<string | null> {
  const root = path.resolve(ideasRoot);
  const existing = await findDirectoryById(root, id);
  const backups = await matchingTemporaryDirectories(root, id, "backup");
  if (existing) {
    await Promise.all(backups.map(backup => rm(backup, { recursive: true, force: true })));
    return existing;
  }
  const backup = backups.at(-1);
  if (!backup) return null;
  const preferred =
    (await readDirectoryComponentName(backup)) ?? "Idea";
  const dest = await allocateDirectory(
    root,
    { id, componentName: isSafeComponentName(preferred) ? preferred : "Idea" },
  );
  await rename(backup, dest);
  await Promise.all(
    backups
      .filter(candidate => candidate !== backup)
      .map(candidate => rm(candidate, { recursive: true, force: true })),
  );
  return dest;
}

async function replaceProjectDirectory(
  ideasRoot: string,
  project: IdeaProject,
): Promise<void> {
  assertValidProject(project);
  const root = path.resolve(ideasRoot);
  await mkdir(root, { recursive: true });
  const current =
    (await recoverProjectDirectory(ideasRoot, project.id)) ??
    (await findDirectoryById(root, project.id));
  if (!current) {
    throw new IdeaError("not_found", "Prototype not found", 404);
  }
  const finalDirectory = await allocateDirectory(root, project, current);
  const staging = temporaryPath(root, project.id, "stage");
  const backup = temporaryPath(root, project.id, "backup");
  await writeProjectDirectory(staging, project);
  let movedCurrent = false;
  try {
    await rename(current, backup);
    movedCurrent = true;
    await rename(staging, finalDirectory);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedCurrent && !(await pathExists(finalDirectory))) {
      await rename(backup, current);
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (await pathExists(finalDirectory)) {
      await rm(backup, { recursive: true, force: true });
    }
  }
}

function legacyStudioToDraft(input: unknown): IdeaDraftState {
  if (typeof input !== "object" || input == null) return defaultIdeaDraftState();
  const value = input as Record<string, unknown>;
  const offset =
    typeof value.offset === "object" && value.offset != null
      ? (value.offset as Record<string, unknown>)
      : null;
  if (
    typeof value.form !== "number" ||
    typeof value.soft !== "number" ||
    typeof value.drift !== "number" ||
    typeof offset?.x !== "number" ||
    typeof offset.y !== "number"
  ) {
    return defaultIdeaDraftState();
  }
  const clamp = (number: number) => Math.min(100, Math.max(0, number));
  return (
    coerceIdeaDraftState({
      kind: "emerald-construct",
      version: 1,
      editorState: {
        formationSpeed: clamp(value.form),
        detail: clamp(value.soft),
        color: clamp(value.drift),
        origin: { x: 0.5, y: 0.68 },
        variant: "bird",
      },
    }) ?? defaultIdeaDraftState()
  );
}

function projectFromParts(
  document: Omit<IdeaDocument, "schemaVersion" | "sourceFile" | "sourceDigest" | "draft"> & {
    draft: IdeaDraftState;
  },
  source: string,
): IdeaProject {
  return {
    ...document,
    schemaVersion: IDEA_SCHEMA_VERSION,
    sourceFile: SOURCE_FILE,
    sourceDigest: sourceDigest(source),
    draft: { ...document.draft, portableSourceTemplate: source },
  };
}

async function migrateEmbeddedSourceProject(
  ideasRoot: string,
  id: string,
  input: unknown,
): Promise<IdeaProject | null> {
  if (typeof input !== "object" || input == null) return null;
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1) return null;
  const summary = parseIdeaSummary(input);
  const draft = parseIdeaDraft(value.draft);
  const createdAt =
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
      ? value.createdAt
      : null;
  if (!summary || summary.id !== id || !draft || !createdAt) return null;
  const project = projectFromParts(
    {
      ...summary,
      createdAt,
      draft: draftState(draft),
    },
    draft.portableSourceTemplate,
  );
  await replaceProjectDirectory(ideasRoot, project);
  return project;
}

async function migrateLegacyDirectory(
  ideasRoot: string,
  directoryName: string,
): Promise<void> {
  if (!isSafeComponentName(directoryName)) return;
  const legacyDir = path.join(path.resolve(ideasRoot), directoryName);
  const metaPath = path.join(legacyDir, LEGACY_META_FILE);
  if (!(await pathExists(metaPath))) return;

  try {
    const parsed = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
    const legacySource = await readFile(
      path.join(legacyDir, `${directoryName}.tsx`),
      "utf8",
    );
    const source = legacySource.replace(
      new RegExp(`export\\s+function\\s+${directoryName}\\b`),
      "export function Example",
    );
    const name =
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : directoryName;
    const componentName = toComponentName(name);
    if (!componentName) throw new Error("invalid name");
    const legacyDate =
      typeof parsed.savedAt === "string" && Number.isFinite(Date.parse(parsed.savedAt))
        ? parsed.savedAt
        : new Date().toISOString();
    const editorState = legacyStudioToDraft(parsed.studio);
    const id = crypto.randomUUID();
    const project = projectFromParts(
      {
        id,
        revision: 1,
        name,
        componentName,
        draft: editorState,
        createdAt: legacyDate,
        updatedAt: legacyDate,
      },
      source,
    );
    const root = path.resolve(ideasRoot);
    const staging = temporaryPath(root, id, "stage");
    try {
      await writeProjectDirectory(staging, project);
      await rm(legacyDir, { recursive: true, force: true });
      await rename(staging, await allocateDirectory(root, project));
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`[ideas] could not migrate ${legacyDir}`, error);
  }
}

function displayNameFromComponent(componentName: string): string {
  return componentName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

async function adoptHandCreatedDirectory(
  ideasRoot: string,
  directoryName: string,
): Promise<void> {
  if (!isSafeComponentName(directoryName)) return;
  try {
    const directory = path.join(path.resolve(ideasRoot), directoryName);
    if (await readDirectoryIdeaId(directory)) return;

    let source: string;
    try {
      source = await readFile(path.join(directory, SOURCE_FILE), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    const draft = parseIdeaDraft({
      ...defaultIdeaDraftState(),
      portableSourceTemplate: source,
    });
    if (!draft) return;

    const now = new Date().toISOString();
    const project = projectFromParts(
      {
        id: crypto.randomUUID(),
        revision: 1,
        name: displayNameFromComponent(directoryName),
        componentName: directoryName,
        draft: defaultIdeaDraftState(),
        createdAt: now,
        updatedAt: now,
      },
      source,
    );
    assertValidProject(project);
    const staging = path.join(directory, `.${project.id}.project-stage`);
    try {
      await writeFile(
        staging,
        `${JSON.stringify(documentFromProject(project), null, 2)}\n`,
        "utf8",
      );
      await rename(staging, path.join(directory, PROJECT_FILE));
    } finally {
      await rm(staging, { force: true });
    }
  } catch (error) {
    console.warn(`[ideas] could not adopt ${directoryName}`, error);
  }
}

async function migrateSchema2Document(
  ideasRoot: string,
  directory: string,
  id: string,
  input: unknown,
): Promise<IdeaProject | null> {
  if (typeof input !== "object" || input == null) return null;
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 2) return null;
  const summary = parseIdeaSummary(input);
  const draft = coerceIdeaDraftState(value.draft);
  const createdAt =
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
      ? value.createdAt
      : null;
  if (!summary || summary.id !== id || !draft || !createdAt) return null;
  let source: string;
  try {
    source = await readFile(path.join(directory, SOURCE_FILE), "utf8");
  } catch {
    return null;
  }
  const project = projectFromParts({ ...summary, createdAt, draft }, source);
  await replaceProjectDirectory(ideasRoot, project);
  return project;
}

export async function readIdeaProject(
  ideasRoot: string,
  id: string,
): Promise<IdeaProject | null> {
  await recoverProjectDirectory(ideasRoot, id);
  const directory = await findDirectoryById(path.resolve(ideasRoot), id);
  if (!directory) return null;
  let metadataSource: string;
  try {
    metadataSource = await readFile(path.join(directory, PROJECT_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataSource);
  } catch {
    throw new IdeaError("invalid_document", `Saved idea ${id} has invalid JSON`, 500);
  }

  const migrated = await migrateEmbeddedSourceProject(ideasRoot, id, parsed);
  if (migrated) return migrated;

  const schema2 = await migrateSchema2Document(ideasRoot, directory, id, parsed);
  if (schema2) return schema2;

  const document = parseIdeaDocument(parsed);
  if (!document || document.id !== id) {
    throw new IdeaError(
      "invalid_document",
      `Saved idea ${id} is invalid or uses an unsupported schema`,
      500,
    );
  }

  let source: string;
  try {
    source = await readFile(path.join(directory, document.sourceFile), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new IdeaError("invalid_document", `Saved idea ${id} is missing source.tsx`, 500);
    }
    throw error;
  }
  const draft = parseIdeaDraft({ ...document.draft, portableSourceTemplate: source });
  if (!draft) {
    throw new IdeaError("invalid_document", `Saved idea ${id} has invalid source.tsx`, 500);
  }

  const actualDigest = sourceDigest(source);
  const project: IdeaProject = { ...document, draft };
  if (actualDigest === document.sourceDigest) return project;

  const reconciled: IdeaProject = {
    ...project,
    revision: project.revision + 1,
    sourceDigest: actualDigest,
    updatedAt: new Date().toISOString(),
  };
  await replaceProjectDirectory(ideasRoot, reconciled);
  return reconciled;
}

export async function listIdeaProjects(ideasRoot: string): Promise<IdeaProject[]> {
  const root = path.resolve(ideasRoot);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await migrateLegacyDirectory(ideasRoot, entry.name);
      await adoptHandCreatedDirectory(ideasRoot, entry.name);
    }
  }

  const migratedEntries = await readdir(root, { withFileTypes: true });
  const projects: IdeaProject[] = [];
  const seen = new Set<string>();
  for (const entry of migratedEntries) {
    if (!entry.isDirectory() || !isIdeaDirectoryName(entry.name)) continue;
    const directory = path.join(root, entry.name);
    const id = await readDirectoryIdeaId(directory);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const project = await readIdeaProject(ideasRoot, id);
      if (!project) continue;
      if (isUuidDirectory(entry.name)) {
        const dest = await allocateDirectory(root, project, directory);
        if (dest !== directory) await rename(directory, dest);
      }
      projects.push(project);
    } catch (error) {
      console.warn(`[ideas] skipped invalid project ${entry.name}`, error);
    }
  }
  return projects;
}

export async function createIdeaProject(
  ideasRoot: string,
  project: IdeaProject,
): Promise<void> {
  assertValidProject(project);
  const root = path.resolve(ideasRoot);
  const staging = temporaryPath(root, project.id, "stage");
  await mkdir(root, { recursive: true });
  if (await findDirectoryById(root, project.id)) {
    throw new IdeaError("io_failure", `Idea ${project.id} already exists`, 500);
  }
  const finalDirectory = await allocateDirectory(root, project);
  if (await pathExists(finalDirectory)) {
    throw new IdeaError("io_failure", `Idea ${project.componentName} already exists`, 500);
  }
  try {
    await writeProjectDirectory(staging, project);
    await rename(staging, finalDirectory);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function replaceIdeaProject(
  ideasRoot: string,
  project: IdeaProject,
): Promise<void> {
  await replaceProjectDirectory(ideasRoot, project);
}

export async function deleteIdeaProject(
  ideasRoot: string,
  id: string,
): Promise<void> {
  const root = path.resolve(ideasRoot);
  await recoverProjectDirectory(ideasRoot, id);
  const directory = await findDirectoryById(root, id);
  if (directory) await rm(directory, { recursive: true, force: true });
  const temporary = [
    ...(await matchingTemporaryDirectories(root, id, "stage")),
    ...(await matchingTemporaryDirectories(root, id, "backup")),
  ];
  await Promise.all(temporary.map(item => rm(item, { recursive: true, force: true })));
}
