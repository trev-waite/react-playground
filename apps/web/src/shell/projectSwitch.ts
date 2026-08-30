import type { IdeaSummary } from "@react-playground/api";

/** `/experimental/<idea-id>` → the stable idea id. */
export function ideaIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/experimental\/([A-Za-z0-9-]{8,64})\/?$/);
  return match?.[1] ?? null;
}

export function initialIdeaId(
  pathname: string,
  ideas: IdeaSummary[],
): string | null {
  return ideaIdFromPath(pathname) ?? ideas[0]?.id ?? null;
}

/** Filter saved ideas by name, component, or remembered Live folder. */
export function filterIdeas(
  ideas: IdeaSummary[],
  query: string,
): IdeaSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingIdeas = normalizedQuery
    ? ideas.filter(idea =>
        [idea.name, idea.componentName, idea.targetFolder ?? ""].some(value =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
    : ideas;

  return [...matchingIdeas].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
  );
}

/** Short relative time for the project list. */
export function formatUpdatedAt(iso: string, now = Date.now()): string {
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
