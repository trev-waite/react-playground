import type { IdeaProject } from "@react-playground/api";

/**
 * The idea's source as its Live component. An idea brought in from Live
 * imports its own Live folder's files by `@/live/<slug>/`; written into that
 * folder, those imports become `./`.
 */
export function buildComponentModule(
  componentName: string,
  source: string,
  slug: string,
): string {
  let body = source.trim();
  const placeholder = /export\s+function\s+Example\b/g;
  if ((body.match(placeholder) ?? []).length !== 1) {
    throw new Error("Portable source must export exactly one Example function");
  }
  body = body.replace(placeholder, `export function ${componentName}`);
  body = body.replaceAll(new RegExp(`(["'])@/live/${RegExp.escape(slug)}/`, "g"), "$1./");

  if (!body.endsWith("\n")) body += "\n";
  return body;
}

/**
 * A new card starts on paper on the light site and blue on the dark one, set
 * for a near-black component. Its swatches are then picked against the
 * component's real colors (the new-component skill).
 */
export function buildPreviewModule(
  componentName: string,
  title: string,
): string {
  return `import type { CardMeta } from "@/lib/types";
import { ${componentName} } from "./${componentName}";

export const meta: CardMeta = {
  title: ${JSON.stringify(title)},
  surface: {
    light: { swatch: "paper", content: ["#111113"] },
    dark: { swatch: "blue", content: ["#111113"] },
  },
};

export default function ${componentName}Preview() {
  return <${componentName} />;
}
`;
}

export function buildLiveArtifact(document: IdeaProject, slug: string): {
  component: string;
  preview: string;
} {
  return {
    component: buildComponentModule(
      document.componentName,
      document.draft.portableSourceTemplate,
      slug,
    ),
    preview: buildPreviewModule(document.componentName, document.name),
  };
}
