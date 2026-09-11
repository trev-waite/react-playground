import type { ComponentType } from "react";

export type IdeaExample = ComponentType<{
  sliders?: Record<string, number>;
  progress?: number;
}>;

const IDEA_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const sourceLoaders = import.meta.glob<{ Example?: IdeaExample }>(
  "./ideas/*/source.tsx",
);

function ideaNameFromPath(filePath: string): string | null {
  const name = filePath.replace(/\\/g, "/").match(/\/ideas\/([^/]+)\/source\.tsx$/)?.[1];
  if (!name || !IDEA_NAME_RE.test(name)) return null;
  return name;
}

export const ideaModules: Record<
  string,
  () => Promise<{ Example?: IdeaExample }>
> = Object.fromEntries(
  Object.entries(sourceLoaders).flatMap(([filePath, load]) => {
    const name = ideaNameFromPath(filePath);
    return name ? [[name, load]] : [];
  }),
);
