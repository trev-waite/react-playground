import {
  isSafeComponentName,
  normalizeFolder,
  toComponentName,
  type SaveIdeaInput,
  type SavedIdea,
  type IdeaStudioState,
} from "@react-playground/api";
import { buildComponentModule, buildPreviewModule } from "./promote";

export type SaveIdeaValidated = {
  title: string;
  folder: string;
  componentName: string;
  source: string;
  studio: IdeaStudioState | null;
  previousComponentName: string | null;
};

function clampControl(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function parseIdeaStudio(input: unknown): IdeaStudioState | null {
  if (typeof input !== "object" || input == null) return null;
  const rec = input as Record<string, unknown>;
  if (
    typeof rec.form !== "number" ||
    typeof rec.soft !== "number" ||
    typeof rec.drift !== "number"
  ) {
    return null;
  }

  const offsetRec =
    typeof rec.offset === "object" && rec.offset != null
      ? (rec.offset as Record<string, unknown>)
      : null;
  const x = typeof offsetRec?.x === "number" ? offsetRec.x : 0;
  const y = typeof offsetRec?.y === "number" ? offsetRec.y : 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    form: clampControl(rec.form),
    soft: clampControl(rec.soft),
    drift: clampControl(rec.drift),
    offset: { x, y },
  };
}

export function validateSaveRequest(
  input: SaveIdeaInput,
): { ok: true; value: SaveIdeaValidated } | { ok: false; error: string } {
  const title = input.name.trim() || "Untitled idea";
  const componentName = toComponentName(title);
  if (!componentName) {
    return { ok: false, error: "Idea name must start with a letter" };
  }

  const source = input.source.trim();
  if (!source) {
    return { ok: false, error: "Nothing to save yet" };
  }

  const folder = normalizeFolder(input.folder) ?? "";
  const previousRaw = input.previousComponentName?.trim() ?? "";
  const previousComponentName = isSafeComponentName(previousRaw)
    ? previousRaw
    : null;

  return {
    ok: true,
    value: {
      title,
      folder,
      componentName,
      source,
      studio: parseIdeaStudio(input.studio),
      previousComponentName,
    },
  };
}

export function buildIdeaFiles(
  componentName: string,
  title: string,
  source: string,
): { component: string; preview: string } {
  return {
    component: buildComponentModule(componentName, source),
    preview: buildPreviewModule(componentName, title, "experimental"),
  };
}

export function ideaRecord(
  value: SaveIdeaValidated,
  savedAt: string,
): Omit<SavedIdea, "source"> {
  return {
    name: value.title,
    folder: value.folder,
    componentName: value.componentName,
    studio: value.studio,
    savedAt,
  };
}
