import {
  isSafeIdeaId,
  parseCreateIdeaInput,
  parsePublishIdeaInput,
  parseUpdateIdeaInput,
} from "@react-playground/api";
import { IdeaError } from "../features/ideas/ideaError";
import { createIdeaService } from "../features/ideas/ideaService";
import { publishIdeaToDisk } from "../features/promote/promoteDisk";
import { createHttp } from "./http";

export type PlaygroundApiServerOptions = {
  experimentalRoot: string;
  liveRoot: string;
  corsOrigin: string;
  port?: number;
  refreshRegistry?: () => Promise<void>;
};

export function createPlaygroundApiHandler(
  options: Omit<PlaygroundApiServerOptions, "port">,
) {
  const { experimentalRoot, liveRoot, corsOrigin, refreshRegistry } = options;
  const { json, handleOptions, readJsonBody } = createHttp(corsOrigin);
  const ideas = createIdeaService(experimentalRoot);

  function ideaId(req: Request): string {
    const id = decodeURIComponent(new URL(req.url).pathname.split("/").filter(Boolean)[2] ?? "");
    if (!isSafeIdeaId(id)) throw new IdeaError("invalid_request", "Invalid idea id", 400);
    return id;
  }

  function route(handler: (req: Request) => Promise<Response>) {
    return async (req: Request): Promise<Response> => {
      try {
        return await handler(req);
      } catch (error) {
        if (error instanceof IdeaError) {
          return json(
            req,
            { ok: false, code: error.code, error: error.message },
            error.status,
          );
        }
        console.error("[playground-api] request failed", error);
        return json(
          req,
          { ok: false, code: "io_failure", error: "Local file operation failed" },
          500,
        );
      }
    };
  }

  const handleListIdeas = route(async req =>
    json(req, { ok: true, ideas: await ideas.list() }),
  );

  const handleCreateIdea = route(async req => {
    const body = await readJsonBody(req);
    if (!body.ok) return body.response;
    const input = parseCreateIdeaInput(body.value);
    if (!input) {
      throw new IdeaError("invalid_request", "Invalid idea document", 400);
    }
    return json(req, { ok: true, idea: await ideas.create(input) }, 201);
  });

  const handleLoadIdea = route(async req =>
    json(req, { ok: true, idea: await ideas.load(ideaId(req)) }),
  );

  const handleUpdateIdea = route(async req => {
    const id = ideaId(req);
    const body = await readJsonBody(req);
    if (!body.ok) return body.response;
    const input = parseUpdateIdeaInput(body.value);
    if (!input) throw new IdeaError("invalid_request", "Invalid idea document", 400);
    return json(req, { ok: true, idea: await ideas.update(id, input) });
  });

  const handleDeleteIdea = route(async req => {
    await ideas.delete(ideaId(req));
    return json(req, { ok: true });
  });

  const handlePublishIdea = route(async req => {
    const id = ideaId(req);
    const body = await readJsonBody(req);
    if (!body.ok) return body.response;
    const input = parsePublishIdeaInput(body.value);
    if (!input) throw new IdeaError("invalid_request", "Invalid publish request", 400);

    const published = await ideas.withCurrent(
      id,
      input.expectedRevision,
      idea => publishIdeaToDisk(liveRoot, idea),
    );

    let catalogStatus: "ready" | "refresh-failed" = "ready";
    if (refreshRegistry) {
      try {
        await refreshRegistry();
      } catch (error) {
        catalogStatus = "refresh-failed";
        console.error("[publish] registry sync failed", error);
      }
    }
    return json(req, { ok: true, slug: published.slug, catalogStatus });
  });

  return async function handleRequest(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return handleOptions(req);
    const pathname = new URL(req.url).pathname;
    if (pathname === "/api/ideas") {
      if (req.method === "GET") return handleListIdeas(req);
      if (req.method === "POST") return handleCreateIdea(req);
    } else if (/^\/api\/ideas\/[^/]+\/publish$/.test(pathname)) {
      if (req.method === "POST") return handlePublishIdea(req);
    } else if (/^\/api\/ideas\/[^/]+$/.test(pathname)) {
      if (req.method === "GET") return handleLoadIdea(req);
      if (req.method === "PUT") return handleUpdateIdea(req);
      if (req.method === "DELETE") return handleDeleteIdea(req);
    }
    return json(req, { ok: false, code: "not_found", error: "Not found" }, 404);
  };
}

export function startPlaygroundApi(options: PlaygroundApiServerOptions) {
  const { port = 0, ...handlerOptions } = options;
  return Bun.serve({
    port,
    fetch: createPlaygroundApiHandler(handlerOptions),
  });
}
