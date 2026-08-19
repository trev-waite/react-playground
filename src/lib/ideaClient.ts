import type { IdeaSummary, SaveIdeaRequest, SavedIdea } from "./idea";

type OkEnvelope<T> = T & { ok: true };
type ErrEnvelope = { ok: false; error?: string };

async function readOk<T>(res: Response, fallback: string): Promise<T> {
  const data = (await res.json()) as OkEnvelope<T> | ErrEnvelope;
  if (!res.ok || !data.ok) {
    throw new Error((data as ErrEnvelope).error ?? fallback);
  }
  return data;
}

export async function listIdeas(): Promise<IdeaSummary[]> {
  const data = await readOk<{ ideas?: IdeaSummary[] }>(
    await fetch("/api/ideas"),
    "Could not load saved prototypes",
  );
  return data.ideas ?? [];
}

export async function loadIdea(componentName: string): Promise<SavedIdea> {
  const data = await readOk<{ idea?: SavedIdea }>(
    await fetch(`/api/ideas/${componentName}`),
    "Could not open prototype",
  );
  if (!data.idea) throw new Error("Could not open prototype");
  return data.idea;
}

export async function saveIdea(request: SaveIdeaRequest): Promise<{
  idea: IdeaSummary;
  ideas: IdeaSummary[];
}> {
  const data = await readOk<{ idea?: IdeaSummary; ideas?: IdeaSummary[] }>(
    await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
    "Save failed",
  );
  if (!data.idea) throw new Error("Save failed");
  return { idea: data.idea, ideas: data.ideas ?? [] };
}

export async function deleteIdea(componentName: string): Promise<IdeaSummary[]> {
  const data = await readOk<{ ideas?: IdeaSummary[] }>(
    await fetch(`/api/ideas/${componentName}`, { method: "DELETE" }),
    "Could not delete prototype",
  );
  return data.ideas ?? [];
}
