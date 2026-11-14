import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  RESERVED_LIVE_FOLDERS,
  buildSlug,
  type IdeaProject,
} from "@react-playground/api";
import { IdeaError } from "../ideas/ideaError";
import { buildLiveArtifact } from "./promote";
import { writeChangedFile } from "../../files/writeChangedFile";

type LiveArtifact = ReturnType<typeof buildLiveArtifact>;

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Writes a new card's folder in one step, so the catalog never sees half of
 * it. Returns false when the folder appeared in the meantime.
 */
async function createLiveFolder(dir: string, componentName: string, artifact: LiveArtifact): Promise<boolean> {
  const parent = path.dirname(dir);
  await mkdir(parent, { recursive: true });
  const staging = path.join(parent, `.${componentName}.${crypto.randomUUID()}.tmp`);
  try {
    await mkdir(staging, { recursive: false });
    await Promise.all([
      writeFile(path.join(staging, `${componentName}.tsx`), artifact.component, "utf8"),
      writeFile(path.join(staging, "preview.tsx"), artifact.preview, "utf8"),
    ]);
    await rename(staging, dir);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST" || code === "ENOTEMPTY") return false;
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Make Live owns one file in a card's folder: the component. It writes a
 * starting `preview.tsx` only when the folder has none, and leaves a tuned
 * preview and whatever else sits beside it (tests, styles, helpers) alone, so
 * a finished card can be updated from its idea as often as needed.
 */
export async function publishIdeaToDisk(
  liveRoot: string,
  document: IdeaProject,
  targetFolder: string,
): Promise<{ slug: string; dir: string; reused: boolean }> {
  if (!targetFolder || RESERVED_LIVE_FOLDERS.has(targetFolder)) {
    throw new IdeaError("invalid_request", "Choose or enter a Live folder", 400);
  }

  const { componentName } = document;
  const slug = buildSlug(targetFolder, componentName);
  const dir = path.join(liveRoot, targetFolder, componentName);
  const componentFile = path.join(dir, `${componentName}.tsx`);
  const previewFile = path.join(dir, "preview.tsx");
  const artifact = buildLiveArtifact(document, slug);

  if (!(await exists(dir)) && (await createLiveFolder(dir, componentName, artifact))) {
    return { slug, dir, reused: false };
  }

  const hasPreview = await exists(previewFile);
  if (hasPreview && !(await exists(componentFile))) {
    throw new IdeaError(
      "destination_exists",
      `${slug} already holds a different component: its preview has no ${componentName}.tsx beside it. Rename the idea or choose another folder.`,
      409,
    );
  }

  const wroteComponent = await writeChangedFile(componentFile, artifact.component);
  const wrotePreview = !hasPreview && (await writeChangedFile(previewFile, artifact.preview));
  return { slug, dir, reused: !wroteComponent && !wrotePreview };
}
