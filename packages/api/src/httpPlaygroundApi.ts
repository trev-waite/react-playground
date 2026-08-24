import { PlaygroundApiError, type PlaygroundApi } from "./playgroundApi";
import type {
  IdeaSummary,
  PromoteInput,
  PromoteResult,
  SaveIdeaInput,
  SaveIdeaResult,
  SavedIdea,
} from "./types";

type OkEnvelope<T> = T & { ok: true };
type ErrEnvelope = { ok: false; error?: string };

export type HttpPlaygroundApiOptions = {
  /** Origin of the API, no trailing slash. Empty string uses same-origin `/api`. */
  baseUrl?: string;
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
};

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

export function createHttpPlaygroundApi(
  options: HttpPlaygroundApiOptions = {},
): PlaygroundApi {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchFn = options.fetch ?? globalThis.fetch;

  async function readOk<T>(
    res: Response,
    fallback: string,
  ): Promise<T> {
    let data: OkEnvelope<T> | ErrEnvelope;
    try {
      data = (await res.json()) as OkEnvelope<T> | ErrEnvelope;
    } catch {
      throw new PlaygroundApiError(fallback, res.status);
    }
    if (!res.ok || !data.ok) {
      throw new PlaygroundApiError(
        (data as ErrEnvelope).error ?? fallback,
        res.status,
      );
    }
    return data;
  }

  return {
    async listIdeas(): Promise<IdeaSummary[]> {
      const data = await readOk<{ ideas?: IdeaSummary[] }>(
        await fetchFn(apiUrl(baseUrl, "/api/ideas")),
        "Could not load saved prototypes",
      );
      return data.ideas ?? [];
    },

    async loadIdea(componentName: string): Promise<SavedIdea> {
      const data = await readOk<{ idea?: SavedIdea }>(
        await fetchFn(
          apiUrl(baseUrl, `/api/ideas/${encodeURIComponent(componentName)}`),
        ),
        "Could not open prototype",
      );
      if (!data.idea) throw new PlaygroundApiError("Could not open prototype");
      return data.idea;
    },

    async saveIdea(input: SaveIdeaInput): Promise<SaveIdeaResult> {
      const data = await readOk<{ idea?: IdeaSummary; ideas?: IdeaSummary[] }>(
        await fetchFn(apiUrl(baseUrl, "/api/ideas"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        "Save failed",
      );
      if (!data.idea) throw new PlaygroundApiError("Save failed");
      return { idea: data.idea, ideas: data.ideas ?? [] };
    },

    async deleteIdea(componentName: string): Promise<IdeaSummary[]> {
      const data = await readOk<{ ideas?: IdeaSummary[] }>(
        await fetchFn(
          apiUrl(baseUrl, `/api/ideas/${encodeURIComponent(componentName)}`),
          { method: "DELETE" },
        ),
        "Could not delete prototype",
      );
      return data.ideas ?? [];
    },

    async promote(input: PromoteInput): Promise<PromoteResult> {
      const data = await readOk<{ slug?: string }>(
        await fetchFn(apiUrl(baseUrl, "/api/promote"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        "Promote failed",
      );
      if (!data.slug) throw new PlaygroundApiError("Promote failed");
      return { slug: data.slug };
    },
  };
}
