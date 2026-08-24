import type { IdeaStudioState } from "@react-playground/api";

export type IdeaStudioSession =
  | { kind: "demo" }
  | { kind: "blank" }
  | { kind: "restore"; studio: IdeaStudioState };

export type IdeaDraft = {
  source: string;
  studio?: IdeaStudioState | null;
};
