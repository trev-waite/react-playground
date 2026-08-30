import type {
  ApiErrorCode,
  CreateIdeaInput,
  IdeaProject,
  IdeaSummary,
  PublishIdeaInput,
  PublishIdeaResult,
  UpdateIdeaInput,
} from "./types";

export class PlaygroundApiError extends Error {
  readonly status: number | undefined;
  readonly code: ApiErrorCode | undefined;

  constructor(message: string, status?: number, code?: ApiErrorCode) {
    super(message);
    this.name = "PlaygroundApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * UI-facing contract for saved Experimental projects and Live publishing.
 */
export interface PlaygroundApi {
  listIdeas(): Promise<IdeaSummary[]>;
  loadIdea(id: string): Promise<IdeaProject>;
  createIdea(input: CreateIdeaInput): Promise<IdeaProject>;
  updateIdea(id: string, input: UpdateIdeaInput): Promise<IdeaProject>;
  deleteIdea(id: string): Promise<void>;
  publishIdea(id: string, input: PublishIdeaInput): Promise<PublishIdeaResult>;
}
