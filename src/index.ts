import { serve } from "bun";
import index from "./index.html";
import {
  deleteExperimentalIdea,
  listExperimentalIdeas,
  loadExperimentalIdea,
  saveExperimentalIdea,
} from "./lib/ideaDisk";
import { isSafeComponentName } from "./lib/idea";
import { promoteIdeaToDisk } from "./lib/promoteDisk";
import { syncPlaygroundRegistry } from "../scripts/sync-playground";
import path from "node:path";

const ROOT = path.join(import.meta.dir, "..");
const PLAYGROUND = path.join(ROOT, "src", "playground");

async function readJsonBody(
  req: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }

  if (typeof body !== "object" || body == null) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "Invalid body" }, { status: 400 }),
    };
  }

  return { ok: true, value: body as Record<string, unknown> };
}

function parseIdeaName(
  req: Request,
): { ok: true; name: string } | { ok: false; response: Response } {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const name = decodeURIComponent(parts[2] ?? "");
  if (!isSafeComponentName(name)) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "Invalid prototype name" },
        { status: 400 },
      ),
    };
  }
  return { ok: true, name };
}

function strField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

async function handlePromote(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const result = await promoteIdeaToDisk(PLAYGROUND, {
    folder: strField(parsed.value, "folder"),
    name: strField(parsed.value, "name"),
    source: strField(parsed.value, "source"),
    discardExperimental: strField(parsed.value, "discardExperimental") || undefined,
  });
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  await syncPlaygroundRegistry();
  return Response.json({ ok: true, slug: result.slug });
}

async function handleListIdeas(): Promise<Response> {
  const ideas = await listExperimentalIdeas(PLAYGROUND);
  return Response.json({ ok: true, ideas });
}

async function handleSaveIdea(req: Request): Promise<Response> {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const result = await saveExperimentalIdea(PLAYGROUND, {
    name: strField(parsed.value, "name"),
    folder: strField(parsed.value, "folder"),
    source: strField(parsed.value, "source"),
    studio: parsed.value.studio,
    previousComponentName: strField(parsed.value, "previousComponentName") || undefined,
  });
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return Response.json({ ok: true, idea: result.idea, ideas: result.ideas });
}

async function handleLoadIdea(req: Request): Promise<Response> {
  const parsed = parseIdeaName(req);
  if (!parsed.ok) return parsed.response;

  const idea = await loadExperimentalIdea(PLAYGROUND, parsed.name);
  if (!idea) {
    return Response.json(
      { ok: false, error: "Prototype not found" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, idea });
}

async function handleDeleteIdea(req: Request): Promise<Response> {
  const parsed = parseIdeaName(req);
  if (!parsed.ok) return parsed.response;

  const result = await deleteExperimentalIdea(PLAYGROUND, parsed.name);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  const ideas = await listExperimentalIdeas(PLAYGROUND);
  return Response.json({ ok: true, ideas });
}

const server = serve({
  routes: {
    "/api/promote": {
      POST: handlePromote,
    },
    "/api/ideas": {
      GET: handleListIdeas,
      POST: handleSaveIdea,
    },
    "/api/ideas/:name": {
      GET: handleLoadIdea,
      DELETE: handleDeleteIdea,
    },
    // SPA: serve index.html for all routes so React Router can handle them.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // CSS Modules break under Bun's browser HMR (import_*_module undefined).
    // Full page reload on save still works; keep Modules for exportable experiments.
    hmr: false,
    console: true,
  },
});

console.log(`Playground running at ${server.url}`);
