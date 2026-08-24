/**
 * Promote an Experimental idea into a new Live playground component.
 * Never mutates ConfigurableShell or other experimental tooling.
 */
import {
  RESERVED_LIVE_FOLDERS,
  SHELLS_FOLDER,
  buildSlug,
  normalizeFolder,
  toComponentName,
  type PromoteInput,
} from "@react-playground/api";

export type PromoteResponse =
  | { ok: true; slug: string }
  | { ok: false; error: string };

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

export function validatePromoteRequest(
  input: PromoteInput,
):
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
