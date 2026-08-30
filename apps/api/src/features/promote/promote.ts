import type { IdeaProject } from "@react-playground/api";

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
): string {
  return `import { ${componentName} } from "./${componentName}";

export const meta = {
  title: ${JSON.stringify(title)},
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
