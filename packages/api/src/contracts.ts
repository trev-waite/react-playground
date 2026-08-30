import { IDEA_SCHEMA_VERSION } from "./ideaDraft";
import { isSafeComponentName, normalizeFolder, toComponentName } from "./naming";
import type {
  CreateIdeaInput,
  IdeaAction,
  IdeaActionMock,
  IdeaDocument,
  IdeaDraft,
  IdeaDraftState,
  IdeaProject,
  IdeaSlider,
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

function parseMock(input: unknown): IdeaActionMock | null {
  return input === "none" ||
    input === "scroll" ||
    input === "form" ||
    input === "unform" ||
    input === "replay"
    ? input
    : null;
}

function parseSlider(input: unknown): IdeaSlider | null {
  const value = record(input);
  const id = nonEmptyString(value?.id);
  const label = typeof value?.label === "string" ? value.label : null;
  const min = finiteNumber(value?.min);
  const max = finiteNumber(value?.max);
  const step = finiteNumber(value?.step);
  const current = finiteNumber(value?.value);
  if (
    !value ||
    !id ||
    label == null ||
    min == null ||
    max == null ||
    step == null ||
    current == null ||
    min >= max ||
    step <= 0 ||
    current < min ||
    current > max
  ) {
    return null;
  }
  return { id, label, min, max, step, value: current };
}

function parseAction(input: unknown): IdeaAction | null {
  const value = record(input);
  const id = nonEmptyString(value?.id);
  const label = typeof value?.label === "string" ? value.label : null;
  const mock = parseMock(value?.mock);
  if (!value || !id || label == null || !mock) return null;
  return { id, label, mock };
}

function triple<T>(
  input: unknown,
  parse: (value: unknown) => T | null,
): [T, T, T] | null {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const first = parse(input[0]);
  const second = parse(input[1]);
  const third = parse(input[2]);
  return first && second && third ? [first, second, third] : null;
}

export function parseIdeaDraftState(input: unknown): IdeaDraftState | null {
  const value = record(input);
  if (!value || value.version !== 1) return null;
  const actions = triple(value.actions, parseAction);
  const sliders = triple(value.sliders, parseSlider);
  if (!actions || !sliders) return null;
  return { version: 1, actions, sliders };
}

function hasOneExampleExport(source: string): boolean {
  return (source.match(/export\s+function\s+Example\b/g)?.length ?? 0) === 1;
}

export function parseIdeaDraft(input: unknown): IdeaDraft | null {
  const value = record(input);
  const draft = parseIdeaDraftState(input);
  const source = value?.portableSourceTemplate;
  if (
    !draft ||
    typeof source !== "string" ||
    !source.trim() ||
    !hasOneExampleExport(source)
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
  const draft = parseIdeaDraft(value?.draft);
  if (!value || !name || !draft) return null;
  return { name, draft };
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
  const targetFolder = parseTargetFolder(value?.targetFolder);
  return value && expectedRevision != null && targetFolder
    ? { expectedRevision, targetFolder }
    : null;
}

export function parseIdeaSummary(input: unknown): IdeaSummary | null {
  const value = record(input);
  if (!value) return null;
  const id = nonEmptyString(value.id);
  const revision = integer(value.revision, 1);
  const name = nonEmptyString(value.name);
  const componentName = nonEmptyString(value.componentName);
  const updatedAt = isoDate(value.updatedAt);
  if (!id || !isSafeIdeaId(id) || revision == null || !name ||
      !componentName ||
      !isSafeComponentName(componentName) || !updatedAt) {
    return null;
  }
  return { id, revision, name, componentName, updatedAt };
}

export function parseIdeaDocument(input: unknown): IdeaDocument | null {
  const value = record(input);
  const summary = parseIdeaSummary(input);
  const draft = parseIdeaDraftState(value?.draft);
  const createdAt = isoDate(value?.createdAt);
  const sourceDigest = nonEmptyString(value?.sourceDigest);
  if (
    !value ||
    value.schemaVersion !== IDEA_SCHEMA_VERSION ||
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
    schemaVersion: IDEA_SCHEMA_VERSION,
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
