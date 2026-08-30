export type IdeaActionMock = "none" | "scroll" | "form" | "unform" | "replay";

export type IdeaSlider = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
};

export type IdeaAction = {
  id: string;
  label: string;
  mock: IdeaActionMock;
};

export type IdeaDraftState = {
  version: 1;
  actions: [IdeaAction, IdeaAction, IdeaAction];
  sliders: [IdeaSlider, IdeaSlider, IdeaSlider];
};

export type IdeaDraft = IdeaDraftState & {
  portableSourceTemplate: string;
};

export type IdeaSummary = {
  id: string;
  revision: number;
  name: string;
  componentName: string;
  updatedAt: string;
};

export type IdeaDocument = IdeaSummary & {
  schemaVersion: 3;
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
  draft: IdeaDraft;
};

export type UpdateIdeaInput = CreateIdeaInput & {
  expectedRevision: number;
};

export type PublishIdeaInput = {
  expectedRevision: number;
  targetFolder: string;
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
