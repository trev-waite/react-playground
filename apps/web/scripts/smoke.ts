const ATTEMPTS = 6;
const RETRY_MS = 5000;

type Check = { name: string; run: (origin: string) => Promise<void> };

const checks: Check[] = [
  {
    name: "home page serves the Live app with its security headers",
    async run(origin) {
      const response = await get(`${origin}/`);
      expect(response.status === 200, `status ${response.status}`);
      expect(isHtml(response), `content-type ${response.headers.get("content-type")}`);
      expect(response.headers.has("content-security-policy"), "no Content-Security-Policy header");
      const html = await response.text();
      expect(html.includes('<div id="root">'), "no #root element");
      expect(html.includes(`<meta property="og:url" content="${origin}/"`), "og:url is not this origin");
    },
  },
  {
    name: "hashed scripts load and are cached as immutable",
    async run(origin) {
      const html = await (await get(`${origin}/`)).text();
      const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
      expect(script !== undefined, "no /assets script in index.html");
      const response = await get(`${origin}${script}`);
      expect(response.status === 200, `${script} status ${response.status}`);
      expect(response.headers.get("cache-control")?.includes("immutable") === true, `${script} is not immutable`);
    },
  },
  {
    name: "component slugs fall back to the app",
    async run(origin) {
      const response = await get(`${origin}/smoke-test-unknown-slug`);
      expect(response.status === 200 && isHtml(response), `status ${response.status}`);
    },
  },
  {
    name: "link preview image is public",
    async run(origin) {
      const response = await get(`${origin}/og.png`);
      expect(response.status === 200, `status ${response.status}`);
      expect(response.headers.get("content-type") === "image/png", `content-type ${response.headers.get("content-type")}`);
    },
  },
  {
    name: "plain HTTP redirects to HTTPS",
    async run(origin) {
      const insecure = origin.replace(/^https:/, "http:");
      if (insecure === origin) return;
      const response = await get(`${insecure}/`);
      expect(response.status === 301 || response.status === 308, `status ${response.status}`);
      expect(response.headers.get("location") === `${origin}/`, `location ${response.headers.get("location")}`);
    },
  },
];

function get(url: string): Promise<Response> {
  return fetch(url, { redirect: "manual", headers: { "cache-control": "no-cache" } });
}

function isHtml(response: Response): boolean {
  return response.headers.get("content-type")?.startsWith("text/html") === true;
}

function expect(condition: boolean, failure: string): asserts condition {
  if (!condition) throw new Error(failure);
}

async function runWithRetries(check: Check, origin: string): Promise<string | null> {
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await check.run(origin);
      return null;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      if (attempt < ATTEMPTS) await Bun.sleep(RETRY_MS);
    }
  }
  return failure;
}

const origin = process.argv[2]?.replace(/\/+$/, "");
if (!origin) {
  console.error("Usage: bun scripts/smoke.ts <origin>");
  process.exit(2);
}

let failed = false;
for (const check of checks) {
  const failure = await runWithRetries(check, origin);
  console.log(`${failure ? "fail" : "ok  "}  ${check.name}${failure ? `: ${failure}` : ""}`);
  failed ||= failure !== null;
}
process.exit(failed ? 1 : 0);
