export type IdeaStudioState = {
  form: number;
  soft: number;
  drift: number;
  offset: { x: number; y: number };
  variant?: string;
};

export type IdeaSummary = {
  name: string;
  folder: string;
  componentName: string;
  savedAt: string;
};

export type SavedIdea = IdeaSummary & {
  source: string;
  studio: IdeaStudioState | null;
};

export type SaveIdeaInput = {
  name: string;
  folder: string;
  source: string;
  studio?: IdeaStudioState | null;
  previousComponentName?: string;
};

export type SaveIdeaResult = {
  idea: IdeaSummary;
  ideas: IdeaSummary[];
};

export type PromoteInput = {
  folder: string;
  name: string;
  source: string;
  discardExperimental?: string;
};

export type PromoteResult = {
  slug: string;
};
