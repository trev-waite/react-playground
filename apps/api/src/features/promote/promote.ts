/**
 * Promote an Experimental idea into a Live component.
 * Never mutates ConfigurableShell or Experimental tooling.
 */
import { type IdeaProject } from "@react-playground/api";

/**
 * Turn studio export source into a named component module.
 * Accepts either `export function Example` or an already-named export.
 */
export function buildComponentModule(
  componentName: string,
  source: string,
): string {
  let body = source.trim();
  const placeholder = /export\s+function\s+Example\b/g;
  if ((body.match(placeholder) ?? []).length !== 1) {
    throw new Error("Portable source must export exactly one Example function");
  }
  body = body.replace(placeholder, `export function ${componentName}`);

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

export function buildLiveArtifact(document: IdeaProject): {
  component: string;
  preview: string;
} {
  return {
    component: buildComponentModule(
      document.componentName,
      document.draft.portableSourceTemplate,
    ),
    preview: buildPreviewModule(document.componentName, document.name),
  };
}
