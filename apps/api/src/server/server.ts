import { isSafeComponentName } from "@react-playground/api";
import { parseIdeaStudio } from "../features/ideas/idea";
import {
  deleteExperimentalIdea,
  listExperimentalIdeas,
  loadExperimentalIdea,
  saveExperimentalIdea,
} from "../features/ideas/ideaDisk";
import { promoteIdeaToDisk } from "../features/promote/promoteDisk";
import { createHttp, strField } from "./http";

export type PlaygroundApiServerOptions = {
  playgroundRoot: string;
  corsOrigin: string;
  port?: number;
  refreshRegistry?: () => Promise<void>;
};

export function startPlaygroundApi(options: PlaygroundApiServerOptions) {
  const { playgroundRoot, corsOrigin, port = 0, refreshRegistry } = options;
  const { json, handleOptions, readJsonBody } = createHttp(corsOrigin);

  function parseIdeaName(
    req: Request,
  ): { ok: true; name: string } | { ok: false; response: Response } {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const name = decodeURIComponent(parts[2] ?? "");
    if (!isSafeComponentName(name)) {
      return {
        ok: false,
        response: json(req, { ok: false, error: "Invalid prototype name" }, 400),
      };
    }
    return { ok: true, name };
  }

  async function handlePromote(req: Request): Promise<Response> {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const result = await promoteIdeaToDisk(playgroundRoot, {
      folder: strField(parsed.value, "folder"),
      name: strField(parsed.value, "name"),
      source: strField(parsed.value, "source"),
      discardExperimental:
        strField(parsed.value, "discardExperimental") || undefined,
    });
    if (!result.ok) {
      return json(req, { ok: false, error: result.error }, result.status);
    }

    if (refreshRegistry) {
      try {
        await refreshRegistry();
      } catch (err) {
        console.error("[promote] registry sync failed", err);
        return json(
          req,
          {
            ok: false,
            error: "Published files, but failed to refresh the Live catalog",
          },
          500,
        );
      }
    }

    return json(req, { ok: true, slug: result.slug });
  }

  async function handleListIdeas(req: Request): Promise<Response> {
    const ideas = await listExperimentalIdeas(playgroundRoot);
    return json(req, { ok: true, ideas });
  }

  async function handleSaveIdea(req: Request): Promise<Response> {
    const parsed = await readJsonBody(req);
    if (!parsed.ok) return parsed.response;

    const result = await saveExperimentalIdea(playgroundRoot, {
      name: strField(parsed.value, "name"),
      folder: strField(parsed.value, "folder"),
      source: strField(parsed.value, "source"),
      studio: parseIdeaStudio(parsed.value.studio),
      previousComponentName:
        strField(parsed.value, "previousComponentName") || undefined,
    });
    if (!result.ok) {
      return json(req, { ok: false, error: result.error }, result.status);
    }

    return json(req, { ok: true, idea: result.idea, ideas: result.ideas });
  }

  async function handleLoadIdea(req: Request): Promise<Response> {
    const parsed = parseIdeaName(req);
    if (!parsed.ok) return parsed.response;

    const idea = await loadExperimentalIdea(playgroundRoot, parsed.name);
    if (!idea) {
      return json(req, { ok: false, error: "Prototype not found" }, 404);
    }

    return json(req, { ok: true, idea });
  }

  async function handleDeleteIdea(req: Request): Promise<Response> {
    const parsed = parseIdeaName(req);
    if (!parsed.ok) return parsed.response;

    const result = await deleteExperimentalIdea(playgroundRoot, parsed.name);
    if (!result.ok) {
      return json(req, { ok: false, error: result.error }, result.status);
    }

    const ideas = await listExperimentalIdeas(playgroundRoot);
    return json(req, { ok: true, ideas });
  }

  return Bun.serve({
    port,
    routes: {
      "/api/promote": {
        POST: handlePromote,
        OPTIONS: handleOptions,
      },
      "/api/ideas": {
        GET: handleListIdeas,
        POST: handleSaveIdea,
        OPTIONS: handleOptions,
      },
      "/api/ideas/:name": {
        GET: handleLoadIdea,
        DELETE: handleDeleteIdea,
        OPTIONS: handleOptions,
      },
    },
    fetch(req) {
      if (req.method === "OPTIONS") return handleOptions(req);
      return json(req, { ok: false, error: "Not found" }, 404);
    },
  });
}
