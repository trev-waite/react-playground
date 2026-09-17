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
  defaultIdeaDraftState,
  IDEA_SCHEMA_VERSION,
  isSafeComponentName,
  isSafeIdeaId,
  parseIdeaDocument,
  parseIdeaDraft,
  parseIdeaProject,
  type IdeaDocument,
  type IdeaDraft,
  type IdeaDraftState,
  type IdeaProject,
} from "@react-playground/api";
import { IdeaError } from "./ideaError";
import { writeChangedFile } from "../../files/writeChangedFile";

const PROJECT_FILE = "project.json";
const SOURCE_FILE = "source.tsx";

function isIdeaDirectoryName(name: string): boolean {
  return isSafeComponentName(name);
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

async function readProjectMetadata(
  directory: string,
): Promise<Record<string, unknown> | null> {
  let source: string;
  try {
    source = await readFile(path.join(directory, PROJECT_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(source);
    if (typeof parsed === "object" && parsed != null) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    throw new IdeaError(
      "invalid_document",
      `Saved project ${path.basename(directory)} has invalid JSON`,
      500,
    );
  }
  throw new IdeaError(
    "invalid_document",
    `Saved project ${path.basename(directory)} has invalid metadata`,
    500,
  );
}

async function readDirectoryIdeaId(directory: string): Promise<string | null> {
  const parsed = await readProjectMetadata(directory);
  if (!parsed) return null;
  const id = parsed.id;
  return typeof id === "string" && isSafeIdeaId(id) ? id : null;
}

async function readDirectoryComponentName(directory: string): Promise<string | null> {
  const parsed = await readProjectMetadata(directory);
  const componentName = parsed?.componentName;
  return typeof componentName === "string" && isSafeComponentName(componentName)
    ? componentName
    : null;
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
  if (finalDirectory === current) {
    // Source is canonical. If metadata writing is interrupted, the next read
    // reconciles its digest and revision without rewriting the source.
    await writeChangedFile(path.join(current, SOURCE_FILE), project.draft.portableSourceTemplate);
    await writeChangedFile(
      path.join(current, PROJECT_FILE),
      `${JSON.stringify(documentFromProject(project), null, 2)}\n`,
    );
    return;
  }
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
    if (await pathExists(path.join(directory, PROJECT_FILE))) return;

    let source: string;
    try {
      source = await readFile(path.join(directory, SOURCE_FILE), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    if (!parseIdeaDraft({
      ...defaultIdeaDraftState(),
      portableSourceTemplate: source,
    })) return;

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

export async function readIdeaProject(
  ideasRoot: string,
  id: string,
): Promise<IdeaProject | null> {
  const directory = await recoverProjectDirectory(ideasRoot, id);
  if (!directory) return null;
  return readDirectoryProject(directory, id);
}

async function readDirectoryProject(directory: string, expectedId?: string): Promise<IdeaProject | null> {
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
    throw new IdeaError("invalid_document", `Saved idea ${path.basename(directory)} has invalid JSON`, 500);
  }

  const document = parseIdeaDocument(parsed);
  if (!document || (expectedId && document.id !== expectedId)) {
    throw new IdeaError(
      "invalid_document",
      `Saved idea ${path.basename(directory)} is invalid or uses an unsupported schema`,
      500,
    );
  }
  const id = document.id;

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
  await writeChangedFile(
    path.join(directory, PROJECT_FILE),
    `${JSON.stringify(documentFromProject(reconciled), null, 2)}\n`,
  );
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
    if (entry.isDirectory()) await adoptHandCreatedDirectory(ideasRoot, entry.name);
  }

  const projectEntries = await readdir(root, { withFileTypes: true });
  const projects: IdeaProject[] = [];
  const seen = new Set<string>();
  for (const entry of projectEntries) {
    if (!entry.isDirectory() || !isIdeaDirectoryName(entry.name)) continue;
    try {
      const directory = path.join(root, entry.name);
      const project = await readDirectoryProject(directory);
      if (!project || seen.has(project.id)) continue;
      seen.add(project.id);
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
