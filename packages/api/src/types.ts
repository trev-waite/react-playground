export type EmeraldConstructVariant = "bird" | "stella" | "octagram";

export type EmeraldConstructState = {
  formationSpeed: number;
  detail: number;
  color: number;
  origin: { x: number; y: number };
  variant: EmeraldConstructVariant;
};

export type IdeaDraftState =
  | {
      kind: "emerald-construct";
      version: 1;
      editorState: EmeraldConstructState;
    }
  | {
      kind: "source";
      version: 1;
    };

export type IdeaDraft = IdeaDraftState & {
  portableSourceTemplate: string;
};

export type IdeaSummary = {
  id: string;
  revision: number;
  name: string;
  targetFolder: string;
  componentName: string;
  updatedAt: string;
};

export type IdeaDocument = IdeaSummary & {
  schemaVersion: 2;
  draft: IdeaDraftState;
  sourceFile: "source.tsx";
  sourceDigest: string;
  createdAt: string;
};

export type IdeaProject = Omit<IdeaDocument, "draft"> & {
  draft: IdeaDraft;
};

export type CreateIdeaInput = {
  name: string;
  targetFolder: string;
  draft: IdeaDraft;
};

export type UpdateIdeaInput = CreateIdeaInput & {
  expectedRevision: number;
};

export type PublishIdeaInput = {
  expectedRevision: number;
};

export type CatalogStatus = "ready" | "refresh-failed";

export type PublishIdeaResult = {
  slug: string;
  catalogStatus: CatalogStatus;
};

export type ApiErrorCode =
  | "invalid_request"
  | "invalid_document"
  | "not_found"
  | "revision_conflict"
  | "destination_exists"
  | "io_failure";
