import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  RESERVED_LIVE_FOLDERS,
  buildSlug,
  type IdeaProject,
} from "@react-playground/api";
import { IdeaError } from "../ideas/ideaError";
import { buildLiveArtifact } from "./promote";

async function destinationMatches(
  dir: string,
  componentName: string,
  component: string,
  preview: string,
): Promise<boolean> {
  try {
    const entries = (await readdir(dir)).sort();
    if (
      entries.length !== 2 ||
      entries[0] !== `${componentName}.tsx` ||
      entries[1] !== "preview.tsx"
    ) {
      return false;
    }
    const [existingComponent, existingPreview] = await Promise.all([
      readFile(path.join(dir, `${componentName}.tsx`), "utf8"),
      readFile(path.join(dir, "preview.tsx"), "utf8"),
    ]);
    return existingComponent === component && existingPreview === preview;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Atomically publish the two-file portable Live artifact. */
export async function publishIdeaToDisk(
  liveRoot: string,
  document: IdeaProject,
  targetFolder: string,
): Promise<{ slug: string; dir: string; reused: boolean }> {
  if (!targetFolder || RESERVED_LIVE_FOLDERS.has(targetFolder)) {
    throw new IdeaError("invalid_request", "Choose or enter a Live folder", 400);
  }

  const slug = buildSlug(targetFolder, document.componentName);
  const parent = path.join(liveRoot, targetFolder);
  const dir = path.join(parent, document.componentName);
  const artifact = buildLiveArtifact(document);

  if (
    await destinationMatches(
      dir,
      document.componentName,
      artifact.component,
      artifact.preview,
    )
  ) {
    return { slug, dir, reused: true };
  }

  try {
    const existing = await readdir(dir);
    if (existing) {
      throw new IdeaError(
        "destination_exists",
        `${slug} already exists with different content. Rename the idea or choose another folder.`,
        409,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(parent, { recursive: true });
  const staging = path.join(parent, `.${document.componentName}.${crypto.randomUUID()}.tmp`);
  try {
    await mkdir(staging, { recursive: false });
    await Promise.all([
      writeFile(
        path.join(staging, `${document.componentName}.tsx`),
        artifact.component,
        "utf8",
      ),
      writeFile(path.join(staging, "preview.tsx"), artifact.preview, "utf8"),
    ]);
    await rename(staging, dir);
    return { slug, dir, reused: false };
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "EEXIST" &&
      await destinationMatches(
        dir,
        document.componentName,
        artifact.component,
        artifact.preview,
      )
    ) {
      return { slug, dir, reused: true };
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
