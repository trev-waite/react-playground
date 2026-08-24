/** Catalog group reserved for ConfigurableShell and other editing structure. */
export const SHELLS_FOLDER = "shells";
/** On-disk WIP prototypes. Skipped by the Live catalog; deleted on Make Live. */
export const EXPERIMENTAL_FOLDER = "experimental";

export const RESERVED_LIVE_FOLDERS = new Set([
  SHELLS_FOLDER,
  EXPERIMENTAL_FOLDER,
]);

const COMPONENT_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/** Folder segment: lowercase letters, digits, and hyphens. */
export function normalizeFolder(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** PascalCase component name from an idea title. */
export function toComponentName(input: string): string | null {
  const parts = input
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const name = parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  if (!/^[A-Za-z]/.test(name)) return null;
  return name;
}

export function buildSlug(folder: string, componentName: string): string {
  return `${folder}/${componentName}`;
}

export function experimentalSlug(componentName: string): string {
  return `${EXPERIMENTAL_FOLDER}/${componentName}`;
}

export function isWipExperimentalSlug(slug: string): boolean {
  return (
    slug === EXPERIMENTAL_FOLDER || slug.startsWith(`${EXPERIMENTAL_FOLDER}/`)
  );
}

export function isSafeComponentName(input: string): boolean {
  return COMPONENT_NAME_RE.test(input);
}
