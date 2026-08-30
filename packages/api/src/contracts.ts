import { isSafeComponentName, normalizeFolder, toComponentName } from "./naming";
import type {
  CreateIdeaInput,
  EmeraldConstructState,
  IdeaDocument,
  IdeaDraft,
  IdeaDraftState,
  IdeaProject,
  IdeaSummary,
  PublishIdeaInput,
  UpdateIdeaInput,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function record(input: unknown): UnknownRecord | null {
  return typeof input === "object" && input != null ? (input as UnknownRecord) : null;
}

function finiteNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}

function nonEmptyString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function integer(input: unknown, minimum = 0): number | null {
  return typeof input === "number" && Number.isInteger(input) && input >= minimum
    ? input
    : null;
}

function isoDate(input: unknown): string | null {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) return null;
  return input;
}

export function isSafeIdeaId(input: string): boolean {
  return /^[a-zA-Z0-9-]{8,64}$/.test(input);
}

export function parseEmeraldConstructState(input: unknown): EmeraldConstructState | null {
  const value = record(input);
  const origin = record(value?.origin);
  if (!value || !origin) return null;

  const formationSpeed = finiteNumber(value.formationSpeed);
  const detail = finiteNumber(value.detail);
  const color = finiteNumber(value.color);
  const x = finiteNumber(origin.x);
  const y = finiteNumber(origin.y);
  const variant = value.variant;
  if (
    formationSpeed == null || detail == null || color == null ||
    x == null || y == null ||
    (variant !== "bird" && variant !== "stella" && variant !== "octagram") ||
    formationSpeed < 0 || formationSpeed > 100 ||
    detail < 0 || detail > 100 || color < 0 || color > 100 ||
    x < 0 || x > 1 || y < 0 || y > 1
  ) {
    return null;
  }

  return { formationSpeed, detail, color, origin: { x, y }, variant };
}

export function parseIdeaDraftState(input: unknown): IdeaDraftState | null {
  const value = record(input);
  if (!value || value.version !== 1) return null;
  if (value.kind === "source") {
    return { kind: "source", version: 1 };
  }
  if (value.kind !== "emerald-construct") return null;
  const editorState = parseEmeraldConstructState(value.editorState);
  return editorState
    ? { kind: "emerald-construct", version: 1, editorState }
    : null;
}

export function parseIdeaDraft(input: unknown): IdeaDraft | null {
  const value = record(input);
  const draft = parseIdeaDraftState(input);
  const source = value?.portableSourceTemplate;
  const placeholderExports =
    typeof source === "string"
      ? source.match(/export\s+function\s+Example\b/g)?.length ?? 0
      : 0;
  if (
    !draft ||
    typeof source !== "string" ||
    !source.trim() ||
    placeholderExports !== 1
  ) {
    return null;
  }
  return { ...draft, portableSourceTemplate: source };
}

function parseTargetFolder(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const normalized = normalizeFolder(input);
  return normalized && normalized === input ? normalized : undefined;
}

export function parseCreateIdeaInput(input: unknown): CreateIdeaInput | null {
  const value = record(input);
  const name = nonEmptyString(value?.name);
  const targetFolder = parseTargetFolder(value?.targetFolder);
  const draft = parseIdeaDraft(value?.draft);
  if (!value || !name || !targetFolder || !draft) return null;
  return { name, targetFolder, draft };
}

export function parseUpdateIdeaInput(input: unknown): UpdateIdeaInput | null {
  const value = record(input);
  const base = parseCreateIdeaInput(input);
  const expectedRevision = integer(value?.expectedRevision, 1);
  return base && expectedRevision != null ? { ...base, expectedRevision } : null;
}

export function parsePublishIdeaInput(input: unknown): PublishIdeaInput | null {
  const value = record(input);
  const expectedRevision = integer(value?.expectedRevision, 1);
  return value && expectedRevision != null ? { expectedRevision } : null;
}

export function parseIdeaSummary(input: unknown): IdeaSummary | null {
  const value = record(input);
  if (!value) return null;
  const id = nonEmptyString(value.id);
  const revision = integer(value.revision, 1);
  const name = nonEmptyString(value.name);
  const targetFolder = parseTargetFolder(value.targetFolder);
  const componentName = nonEmptyString(value.componentName);
  const updatedAt = isoDate(value.updatedAt);
  if (!id || !isSafeIdeaId(id) || revision == null || !name ||
      !targetFolder || !componentName ||
      !isSafeComponentName(componentName) || !updatedAt) {
    return null;
  }
  return { id, revision, name, targetFolder, componentName, updatedAt };
}

export function parseIdeaDocument(input: unknown): IdeaDocument | null {
  const value = record(input);
  const summary = parseIdeaSummary(input);
  const draft = parseIdeaDraftState(value?.draft);
  const createdAt = isoDate(value?.createdAt);
  const sourceDigest = nonEmptyString(value?.sourceDigest);
  if (
    !value ||
    value.schemaVersion !== 2 ||
    value.sourceFile !== "source.tsx" ||
    !summary ||
    !draft ||
    !createdAt ||
    !sourceDigest ||
    !/^[a-f0-9]{64}$/.test(sourceDigest)
  ) {
    return null;
  }
  if (toComponentName(summary.name) !== summary.componentName) return null;
  return {
    ...summary,
    schemaVersion: 2,
    draft,
    sourceFile: "source.tsx",
    sourceDigest,
    createdAt,
  };
}

export function parseIdeaProject(input: unknown): IdeaProject | null {
  const document = parseIdeaDocument(input);
  const value = record(input);
  const draft = parseIdeaDraft(value?.draft);
  return document && draft ? { ...document, draft } : null;
}
