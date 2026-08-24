const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isAllowedOrigin(origin: string, allowed: string): boolean {
  if (allowed === "*") return true;
  if (origin === allowed) return true;
  try {
    const allowedUrl = new URL(allowed);
    const originUrl = new URL(origin);
    return (
      allowedUrl.protocol === originUrl.protocol &&
      allowedUrl.port === originUrl.port &&
      LOOPBACK_HOSTS.has(allowedUrl.hostname) &&
      LOOPBACK_HOSTS.has(originUrl.hostname)
    );
  } catch {
    return false;
  }
}

export type HttpHelpers = {
  corsHeaders: (req: Request) => Record<string, string>;
  withCors: (req: Request, response: Response) => Response;
  handleOptions: (req: Request) => Response;
  readJsonBody: (
    req: Request,
  ) => Promise<
    { ok: true; value: Record<string, unknown> } | { ok: false; response: Response }
  >;
  json: (req: Request, data: unknown, status?: number) => Response;
};

export function createHttp(corsOrigin: string): HttpHelpers {
  function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("Origin");
    const allow =
      corsOrigin === "*"
        ? (origin ?? "*")
        : origin && isAllowedOrigin(origin, corsOrigin)
          ? origin
          : corsOrigin;

    return {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
  }

  function withCors(req: Request, response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(req))) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  function handleOptions(req: Request): Response {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  async function readJsonBody(
    req: Request,
  ): Promise<
    { ok: true; value: Record<string, unknown> } | { ok: false; response: Response }
  > {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return {
        ok: false,
        response: withCors(
          req,
          Response.json(
            { ok: false, error: "Invalid JSON body" },
            { status: 400 },
          ),
        ),
      };
    }

    if (typeof body !== "object" || body == null) {
      return {
        ok: false,
        response: withCors(
          req,
          Response.json({ ok: false, error: "Invalid body" }, { status: 400 }),
        ),
      };
    }

    return { ok: true, value: body as Record<string, unknown> };
  }

  function json(req: Request, data: unknown, status = 200): Response {
    return withCors(req, Response.json(data, { status }));
  }

  return { corsHeaders, withCors, handleOptions, readJsonBody, json };
}

export function strField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}
