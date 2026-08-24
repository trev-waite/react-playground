/**
 * Promote an Experimental idea into a new Live playground component.
 * Never mutates ConfigurableShell or other experimental tooling.
 */

/** Catalog group reserved for ConfigurableShell and other editing structure. */
export const SHELLS_FOLDER = "shells";
/** On-disk WIP prototypes. Skipped by the Live catalog; deleted on Make Live. */
export const EXPERIMENTAL_FOLDER = "experimental";

export const RESERVED_LIVE_FOLDERS = new Set([
  SHELLS_FOLDER,
  EXPERIMENTAL_FOLDER,
]);

export type PromoteRequest = {
  /** Top-level playground group, e.g. "buttons" */
  folder: string;
  /** Display / idea name, e.g. "Morph Blob" */
  name: string;
  /** Portable component source from the Experimental workbench */
  source: string;
  /**
   * Saved experimental prototype to delete after a successful publish.
   * Must be a component name under src/playground/experimental/.
   */
  discardExperimental?: string;
};

export type PromoteResponse =
  | { ok: true; slug: string }
  | { ok: false; error: string };

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

/**
 * Turn studio export source into a named component module.
 * Accepts either `export function Example` or an already-named export.
 */
export function buildComponentModule(
  componentName: string,
  source: string,
): string {
  let body = source.trim();
  if (/export\s+function\s+Example\b/.test(body)) {
    body = body.replace(
      /export\s+function\s+Example\b/,
      `export function ${componentName}`,
    );
  } else if (!new RegExp(`export\\s+function\\s+${componentName}\\b`).test(body)) {
    // Wrap bare JSX / anonymous snippets as a named component when needed.
    if (/^export\s+function\s+[A-Za-z]/.test(body)) {
      body = body.replace(
        /export\s+function\s+[A-Za-z][A-Za-z0-9]*/,
        `export function ${componentName}`,
      );
    } else {
      body = `export function ${componentName}() {\n  return (\n${indent(body, 4)}\n  );\n}\n`;
    }
  }

  if (!body.endsWith("\n")) body += "\n";
  return body;
}

export function buildPreviewModule(
  componentName: string,
  title: string,
  status: "live" | "experimental" = "live",
): string {
  const statusLine =
    status === "experimental"
      ? `\n  status: "experimental" as const,`
      : "";
  return `import { ${componentName} } from "./${componentName}";

export const meta = {
  title: ${JSON.stringify(title)},${statusLine}
};

export default function ${componentName}Preview() {
  return <${componentName} />;
}
`;
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map(line => (line.length ? pad + line : line))
    .join("\n");
}

export function validatePromoteRequest(input: {
  folder: string;
  name: string;
  source: string;
}):
  | { ok: true; folder: string; componentName: string; title: string; slug: string }
  | { ok: false; error: string } {
  const folder = normalizeFolder(input.folder);
  if (!folder) {
    return { ok: false, error: "Choose or enter a folder" };
  }
  if (RESERVED_LIVE_FOLDERS.has(folder)) {
    return {
      ok: false,
      error:
        folder === SHELLS_FOLDER
          ? "Use another folder — shells is reserved for editing structure"
          : "Use another folder — experimental is reserved for in-progress ideas",
    };
  }

  const title = input.name.trim() || "Untitled idea";
  const componentName = toComponentName(title);
  if (!componentName) {
    return { ok: false, error: "Idea name must start with a letter" };
  }

  const source = input.source.trim();
  if (!source) {
    return { ok: false, error: "Nothing to publish yet" };
  }

  return {
    ok: true,
    folder,
    componentName,
    title,
    slug: buildSlug(folder, componentName),
  };
}
