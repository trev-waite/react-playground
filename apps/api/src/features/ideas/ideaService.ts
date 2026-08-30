import {
  RESERVED_LIVE_FOLDERS,
  toComponentName,
  type CreateIdeaInput,
  type IdeaProject,
  type IdeaSummary,
  type UpdateIdeaInput,
} from "@react-playground/api";
import { IdeaError } from "./ideaError";
import {
  createIdeaProject,
  deleteIdeaProject,
  listIdeaProjects,
  readIdeaProject,
  replaceIdeaProject,
  sourceDigest,
} from "./ideaRepository";

function summary(project: IdeaProject): IdeaSummary {
  const { id, revision, name, targetFolder, componentName, updatedAt } = project;
  return { id, revision, name, targetFolder, componentName, updatedAt };
}

function validateIdentity(
  input: CreateIdeaInput,
): { name: string; componentName: string; targetFolder: string } {
  const name = input.name.trim();
  const componentName = toComponentName(name);
  if (!name || !componentName) {
    throw new IdeaError("invalid_request", "Idea name must start with a letter", 400);
  }
  if (!input.targetFolder || RESERVED_LIVE_FOLDERS.has(input.targetFolder)) {
    throw new IdeaError("invalid_request", "Choose a Live folder", 400);
  }
  return { name, componentName, targetFolder: input.targetFolder };
}

export function createIdeaService(ideasRoot: string) {
  let mutationQueue: Promise<void> = Promise.resolve();

  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    async list(): Promise<IdeaSummary[]> {
      const projects = await mutate(() => listIdeaProjects(ideasRoot));
      return projects
        .map(summary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
    },

    load(id: string): Promise<IdeaProject> {
      return mutate(async () => {
        const project = await readIdeaProject(ideasRoot, id);
        if (!project) throw new IdeaError("not_found", "Prototype not found", 404);
        return project;
      });
    },

    create(input: CreateIdeaInput): Promise<IdeaProject> {
      return mutate(async () => {
        const { name, componentName, targetFolder } = validateIdentity(input);
        const now = new Date().toISOString();
        const project: IdeaProject = {
          schemaVersion: 2,
          id: crypto.randomUUID(),
          revision: 1,
          name,
          targetFolder,
          componentName,
          draft: input.draft,
          sourceFile: "source.tsx",
          sourceDigest: sourceDigest(input.draft.portableSourceTemplate),
          createdAt: now,
          updatedAt: now,
        };
        await createIdeaProject(ideasRoot, project);
        return project;
      });
    },

    update(id: string, input: UpdateIdeaInput): Promise<IdeaProject> {
      return mutate(async () => {
        const current = await readIdeaProject(ideasRoot, id);
        if (!current) throw new IdeaError("not_found", "Prototype not found", 404);
        if (current.revision !== input.expectedRevision) {
          throw new IdeaError(
            "revision_conflict",
            "This idea changed since it was opened. Reload it before saving again.",
            409,
          );
        }
        const { name, componentName, targetFolder } = validateIdentity(input);
        const updated: IdeaProject = {
          ...current,
          revision: current.revision + 1,
          name,
          targetFolder,
          componentName,
          draft: input.draft,
          sourceDigest: sourceDigest(input.draft.portableSourceTemplate),
          updatedAt: new Date().toISOString(),
        };
        await replaceIdeaProject(ideasRoot, updated);
        return updated;
      });
    },

    delete(id: string): Promise<void> {
      return mutate(() => deleteIdeaProject(ideasRoot, id));
    },

    withCurrent<T>(
      id: string,
      expectedRevision: number,
      operation: (project: IdeaProject) => Promise<T>,
    ): Promise<T> {
      return mutate(async () => {
        const project = await readIdeaProject(ideasRoot, id);
        if (!project) throw new IdeaError("not_found", "Prototype not found", 404);
        if (project.revision !== expectedRevision) {
          throw new IdeaError(
            "revision_conflict",
            "This idea changed since it was opened. Reload it before continuing.",
            409,
          );
        }
        return operation(project);
      });
    },
  };
}

export type IdeaService = ReturnType<typeof createIdeaService>;
