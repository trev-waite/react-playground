import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  EXPERIMENTAL_FOLDER,
  isSafeComponentName,
  type IdeaSummary,
  type SaveIdeaInput,
  type SavedIdea,
} from "@react-playground/api";
import {
  buildIdeaFiles,
  ideaRecord,
  parseIdeaStudio,
  validateSaveRequest,
} from "./idea";

export type IdeaDiskError = {
  ok: false;
  error: string;
  status: number;
};

function experimentalRoot(playgroundRoot: string): string {
  return path.resolve(playgroundRoot, EXPERIMENTAL_FOLDER);
}

/** Resolve a component dir only if it stays inside the experimental folder. */
export function resolveExperimentalDir(
  playgroundRoot: string,
  componentName: string,
): string | null {
  if (!isSafeComponentName(componentName)) return null;
  const root = experimentalRoot(playgroundRoot);
  const resolved = path.resolve(root, componentName);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

async function readIdeaMeta(
  dir: string,
): Promise<{
  name: string;
  folder: string;
  studio: SavedIdea["studio"];
  savedAt: string;
} | null> {
  const metaFile = Bun.file(path.join(dir, "idea.json"));
  if (!(await metaFile.exists())) return null;
  try {
    const parsed = JSON.parse(await metaFile.text()) as Record<string, unknown>;
    const name = typeof parsed.name === "string" ? parsed.name : path.basename(dir);
    const folder = typeof parsed.folder === "string" ? parsed.folder : "";
    const savedAt =
      typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString();
    const studio = parseIdeaStudio(parsed.studio);
    return { name, folder, studio, savedAt };
  } catch {
    return null;
  }
}

export async function listExperimentalIdeas(
  playgroundRoot: string,
): Promise<IdeaSummary[]> {
  const root = experimentalRoot(playgroundRoot);
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }

  const ideas: IdeaSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeComponentName(entry.name)) continue;
    const dir = resolveExperimentalDir(playgroundRoot, entry.name);
    if (!dir) continue;
    const meta = await readIdeaMeta(dir);
    if (!meta) continue;
    ideas.push({
      name: meta.name,
      folder: meta.folder,
      componentName: entry.name,
      savedAt: meta.savedAt,
    });
  }

  ideas.sort((a, b) => {
    const byDate = b.savedAt.localeCompare(a.savedAt);
    return byDate !== 0 ? byDate : a.componentName.localeCompare(b.componentName);
  });
  return ideas;
}

export async function loadExperimentalIdea(
  playgroundRoot: string,
  componentName: string,
): Promise<SavedIdea | null> {
  const dir = resolveExperimentalDir(playgroundRoot, componentName);
  if (!dir) return null;
  const meta = await readIdeaMeta(dir);
  if (!meta) return null;

  const componentPath = path.join(dir, `${componentName}.tsx`);
  const componentFile = Bun.file(componentPath);
  if (!(await componentFile.exists())) return null;

  return {
    name: meta.name,
    folder: meta.folder,
    componentName,
    savedAt: meta.savedAt,
    studio: meta.studio,
    source: await componentFile.text(),
  };
}

export async function deleteExperimentalIdea(
  playgroundRoot: string,
  componentName: string,
): Promise<{ ok: true } | IdeaDiskError> {
  const dir = resolveExperimentalDir(playgroundRoot, componentName);
  if (!dir) {
    return { ok: false, error: "Invalid prototype name", status: 400 };
  }
  await rm(dir, { recursive: true, force: true });
  return { ok: true };
}

export type SaveIdeaDiskResult =
  | { ok: true; idea: IdeaSummary; ideas: IdeaSummary[] }
  | IdeaDiskError;

export async function saveExperimentalIdea(
  playgroundRoot: string,
  request: SaveIdeaInput,
): Promise<SaveIdeaDiskResult> {
  const validated = validateSaveRequest(request);
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const { value } = validated;
  const dir = resolveExperimentalDir(playgroundRoot, value.componentName);
  if (!dir) {
    return { ok: false, error: "Invalid prototype name", status: 400 };
  }

  const savedAt = new Date().toISOString();
  const files = buildIdeaFiles(value.componentName, value.title, value.source);
  const record = ideaRecord(value, savedAt);

  await mkdir(dir, { recursive: true });
  await Bun.write(path.join(dir, `${value.componentName}.tsx`), files.component);
  await Bun.write(path.join(dir, "preview.tsx"), files.preview);
  await Bun.write(path.join(dir, "idea.json"), `${JSON.stringify(record, null, 2)}\n`);

  if (
    value.previousComponentName &&
    value.previousComponentName !== value.componentName
  ) {
    const removed = await deleteExperimentalIdea(
      playgroundRoot,
      value.previousComponentName,
    );
    if (!removed.ok) return removed;
  }

  const ideas = await listExperimentalIdeas(playgroundRoot);
  return {
    ok: true,
    idea: {
      name: record.name,
      folder: record.folder,
      componentName: record.componentName,
      savedAt: record.savedAt,
    },
    ideas,
  };
}
