import type {
  PromoteInput,
  PromoteResult,
  SaveIdeaInput,
  SaveIdeaResult,
  IdeaSummary,
  SavedIdea,
} from "./types";

export class PlaygroundApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PlaygroundApiError";
    this.status = status;
  }
}

/**
 * UI-facing backend contract. The web app depends on this interface only.
 * Swap implementations (local HTTP, remote, in-memory) without changing pages.
 */
export interface PlaygroundApi {
  listIdeas(): Promise<IdeaSummary[]>;
  loadIdea(componentName: string): Promise<SavedIdea>;
  saveIdea(input: SaveIdeaInput): Promise<SaveIdeaResult>;
  deleteIdea(componentName: string): Promise<IdeaSummary[]>;
  promote(input: PromoteInput): Promise<PromoteResult>;
}
