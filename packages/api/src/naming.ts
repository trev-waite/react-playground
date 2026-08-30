export const SHELLS_FOLDER = "shells";
export const EXPERIMENTAL_FOLDER = "experimental";

export const RESERVED_LIVE_FOLDERS = new Set([
  SHELLS_FOLDER,
  EXPERIMENTAL_FOLDER,
]);

const COMPONENT_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

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

export function isSafeComponentName(input: string): boolean {
  return COMPONENT_NAME_RE.test(input);
}
