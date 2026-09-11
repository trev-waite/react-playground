import { parseIdeaProject, parseIdeaSummary } from "./contracts";
import { PlaygroundApiError, type PlaygroundApi } from "./playgroundApi";
import type {
  ApiErrorCode,
  CreateIdeaInput,
  IdeaProject,
  IdeaSummary,
  PublishIdeaInput,
  PublishIdeaResult,
  UpdateIdeaInput,
} from "./types";

export type HttpPlaygroundApiOptions = {
  /** Origin of the API, no trailing slash. Empty string uses same-origin `/api`. */
  baseUrl?: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

type JsonRecord = Record<string, unknown>;
const API_ERROR_CODES = new Set<ApiErrorCode>([
  "invalid_request",
  "invalid_document",
  "not_found",
  "revision_conflict",
  "destination_exists",
  "io_failure",
]);

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

function asRecord(input: unknown): JsonRecord | null {
  return typeof input === "object" && input != null ? (input as JsonRecord) : null;
}

function errorCode(input: unknown): ApiErrorCode | undefined {
  return typeof input === "string" && API_ERROR_CODES.has(input as ApiErrorCode)
    ? (input as ApiErrorCode)
    : undefined;
}

export function createHttpPlaygroundApi(
  options: HttpPlaygroundApiOptions = {},
): PlaygroundApi {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchFn = options.fetch ?? globalThis.fetch;

  async function readOk(res: Response, fallback: string): Promise<JsonRecord> {
    let data: JsonRecord | null = null;
    try {
      data = asRecord(await res.json());
    } catch {
      // Handled below as an invalid response.
    }
    if (!data || !res.ok || data.ok !== true) {
      throw new PlaygroundApiError(
        typeof data?.error === "string" ? data.error : fallback,
        res.status,
        errorCode(data?.code),
      );
    }
    return data;
  }

  function invalidResponse(fallback: string): never {
    throw new PlaygroundApiError(`${fallback}: invalid API response`);
  }

  return {
    async listIdeas(): Promise<IdeaSummary[]> {
      const data = await readOk(
        await fetchFn(apiUrl(baseUrl, "/api/ideas")),
        "Could not load saved prototypes",
      );
      if (!Array.isArray(data.ideas)) invalidResponse("Could not load saved prototypes");
      const ideas: IdeaSummary[] = [];
      for (const value of data.ideas) {
        const idea = parseIdeaSummary(value);
        if (!idea) invalidResponse("Could not load saved prototypes");
        ideas.push(idea);
      }
      return ideas;
    },

    async loadIdea(id: string): Promise<IdeaProject> {
      const data = await readOk(
        await fetchFn(apiUrl(baseUrl, `/api/ideas/${encodeURIComponent(id)}`)),
        "Could not open prototype",
      );
      return parseIdeaProject(data.idea) ?? invalidResponse("Could not open prototype");
    },

    async createIdea(input: CreateIdeaInput): Promise<IdeaProject> {
      const data = await readOk(
        await fetchFn(apiUrl(baseUrl, "/api/ideas"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        "Save failed",
      );
      return parseIdeaProject(data.idea) ?? invalidResponse("Save failed");
    },

    async updateIdea(id: string, input: UpdateIdeaInput): Promise<IdeaProject> {
      const data = await readOk(
        await fetchFn(apiUrl(baseUrl, `/api/ideas/${encodeURIComponent(id)}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        "Save failed",
      );
      return parseIdeaProject(data.idea) ?? invalidResponse("Save failed");
    },

    async deleteIdea(id: string): Promise<void> {
      await readOk(
        await fetchFn(apiUrl(baseUrl, `/api/ideas/${encodeURIComponent(id)}`), {
          method: "DELETE",
        }),
        "Could not delete prototype",
      );
    },

    async publishIdea(id: string, input: PublishIdeaInput): Promise<PublishIdeaResult> {
      const data = await readOk(
        await fetchFn(apiUrl(baseUrl, `/api/ideas/${encodeURIComponent(id)}/publish`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        "Publish failed",
      );
      if (typeof data.slug !== "string") {
        invalidResponse("Publish failed");
      }
      return { slug: data.slug };
    },
  };
}
