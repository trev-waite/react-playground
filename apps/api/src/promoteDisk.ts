import { mkdir } from "node:fs/promises";
import path from "node:path";
import { deleteExperimentalIdea } from "./ideaDisk";
import {
  buildComponentModule,
  buildPreviewModule,
  toComponentName,
  validatePromoteRequest,
  type PromoteRequest,
  type PromoteResponse,
} from "./promote";

export type PromoteToDiskResult =
  | { ok: true; slug: string; dir: string }
  | { ok: false; error: string; status: number };

/**
 * Write a new Live component under src/playground/<folder>/<Name>/.
 * Does not modify ConfigurableShell or any existing experimental tooling.
 */
export async function promoteIdeaToDisk(
  playgroundRoot: string,
  request: PromoteRequest,
): Promise<PromoteToDiskResult> {
  const validated = validatePromoteRequest(request);
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const { folder, componentName, title, slug } = validated;
  const dir = path.join(playgroundRoot, folder, componentName);
  const componentPath = path.join(dir, `${componentName}.tsx`);
  const previewPath = path.join(dir, "preview.tsx");

  if (await Bun.file(componentPath).exists()) {
    return {
      ok: false,
      error: `${slug} already exists. Rename the idea or choose a different Live folder.`,
      status: 409,
    };
  }

  const componentSource = buildComponentModule(componentName, request.source);
  const previewSource = buildPreviewModule(componentName, title);

  await mkdir(dir, { recursive: true });
  await Bun.write(componentPath, componentSource);
  await Bun.write(previewPath, previewSource);

  const discardName = request.discardExperimental?.trim() ?? "";
  if (discardName) {
    const componentNameToDiscard = toComponentName(discardName) ?? discardName;
    const discarded = await deleteExperimentalIdea(
      playgroundRoot,
      componentNameToDiscard,
    );
    if (!discarded.ok) {
      console.error(
        `[promote] published ${slug} but failed to remove experimental/${componentNameToDiscard}: ${discarded.error}`,
      );
    }
  }

  return { ok: true, slug, dir };
}

export type { PromoteRequest, PromoteResponse };
