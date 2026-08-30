import type { EmeraldConstructState, IdeaDraft } from "@react-playground/api";

export type IdeaStudioSession =
  | { kind: "demo" }
  | { kind: "blank" }
  | { kind: "restore"; editorState: EmeraldConstructState };

export type { IdeaDraft };
