import type { IdeaSummary } from "@react-playground/api";

/** `/experimental/MorphBlob` → `MorphBlob`. */
export function ideaNameFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/experimental\/([A-Za-z][A-Za-z0-9]*)\/?$/);
  return match?.[1] ?? null;
}

export function initialIdeaComponentName(
  pathname: string,
  ideas: IdeaSummary[],
): string | null {
  return ideaNameFromPath(pathname) ?? ideas[0]?.componentName ?? null;
}

export type IdeaGroup = {
  folder: string;
  ideas: IdeaSummary[];
};

/** Filter saved ideas and group them by their intended Live folder. */
export function organizeIdeas(
  ideas: IdeaSummary[],
  query: string,
): IdeaGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingIdeas = normalizedQuery
    ? ideas.filter(idea =>
        [idea.name, idea.componentName, idea.folder].some(value =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
    : ideas;

  const grouped = new Map<string, IdeaSummary[]>();
  for (const idea of matchingIdeas) {
    const folder = idea.folder.trim();
    grouped.set(folder, [...(grouped.get(folder) ?? []), idea]);
  }

  return [...grouped.entries()]
    .sort(([folderA], [folderB]) => {
      if (!folderA) return 1;
      if (!folderB) return -1;
      return folderA.localeCompare(folderB);
    })
    .map(([folder, groupedIdeas]) => ({ folder, ideas: groupedIdeas }));
}

/** Short relative time for the project list. */
export function formatSavedAt(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
