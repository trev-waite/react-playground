import path from "node:path";
import { Glob } from "bun";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type SmokeOptions = {
  /** Where the requests go. */
  origin: string;
  /** The origin the build was made for, which its og:url names. */
  siteUrl: string;
  /** The build being served, for the scripts and component page to request. */
  dist: string;
  /** Skip a check that Cloudflare answers with a bot challenge. Only production sits behind Cloudflare. */
  skipChallenges: boolean;
  attempts: number;
  retryMs: number;
  fetch?: Fetch;
};

export type Outcome = { name: string; status: "ok" | "skip" | "fail"; reason?: string };

/** Thrown when a check can't say anything about this origin, such as when Cloudflare answers with a bot challenge. */
export class Skipped extends Error {}

type Context = { origin: string; siteUrl: string; dist: string; get: (url: string) => Promise<Response> };
type Check = { name: string; run: (context: Context) => Promise<void> };

const REQUEST_TIMEOUT_MS = 5_000;
const PROBES = ["/smoke-test-unknown-slug", "/.env", "/.git/config"];

const checks: Check[] = [
  {
    name: "home page serves the Live app with its security headers",
    async run({ origin, siteUrl, get }) {
      const response = await get(`${origin}/`);
      expect(response.status === 200, `status ${response.status}`);
      expect(isHtml(response), `content-type ${response.headers.get("content-type")}`);
      expect(response.headers.has("content-security-policy"), "no Content-Security-Policy header");
      const html = await response.text();
      expect(html.includes('<div id="root">'), "no #root element");
      expect(html.includes(`<meta property="og:url" content="${siteUrl}/"`), `og:url is not ${siteUrl}/`);
    },
  },
  {
    name: "hashed scripts load and are cached as immutable",
    async run({ origin, dist, get }) {
      const html = await Bun.file(path.join(dist, "index.html")).text();
      const scripts = new Set(html.match(/\/assets\/[A-Za-z0-9_-]+\.js/g));
      expect(scripts.size > 0, "no /assets script in dist/index.html");
      for (const script of scripts) {
        const response = await get(`${origin}${script}`);
        expect(response.status === 200, `${script} status ${response.status}`);
        expect(
          response.headers.get("content-type")?.includes("javascript") === true,
          `${script} content-type ${response.headers.get("content-type")}`,
        );
        expect(response.headers.get("cache-control")?.includes("immutable") === true, `${script} is not immutable`);
      }
    },
  },
  {
    name: "a component's path serves the app with that component's own title",
    async run({ origin, dist, get }) {
      const page = await componentPage(dist);
      expect(page !== null, "dist has no component page to request");
      const response = await get(`${origin}${page.path}`);
      expect(response.status === 200 && isHtml(response), `${page.path} status ${response.status}`);
      const html = await response.text();
      expect(html.includes('<div id="root">'), `${page.path} is not the app`);
      expect(html.includes(page.title), `${page.path} is not titled ${page.title}`);
    },
  },
  {
    name: "the sitemap lists the home page",
    async run({ origin, siteUrl, get }) {
      const response = await get(`${origin}/sitemap.xml`);
      expect(response.status === 200, `status ${response.status}`);
      expect((await response.text()).includes(`<loc>${siteUrl}/</loc>`), `no <loc> for ${siteUrl}/`);
    },
  },
  ...PROBES.map(
    (probe): Check => ({
      name: `${probe} gets the 404 page`,
      async run({ origin, get }) {
        const response = await get(`${origin}${probe}`);
        expect(response.status === 404, `status ${response.status}`);
        expect(response.headers.has("content-security-policy"), "no Content-Security-Policy header");
        expect((await response.text()).includes("Nothing at this address"), "not the 404 page");
      },
    }),
  ),
  {
    name: "a missing script is a 404 that browsers won't keep, never the app",
    async run({ origin, get }) {
      const response = await get(`${origin}/assets/smoke-missing-AbCd1234.js`);
      expect(response.status === 404, `status ${response.status}`);
      expect(!response.headers.get("cache-control")?.includes("immutable"), "the 404 is cached as immutable");
      expect(!(await response.text()).includes('<div id="root">'), "served the app in place of a script");
    },
  },
  {
    name: "link preview image is public",
    async run({ origin, get }) {
      const response = await get(`${origin}/og.png`);
      expect(response.status === 200, `status ${response.status}`);
      expect(response.headers.get("content-type") === "image/png", `content-type ${response.headers.get("content-type")}`);
    },
  },
  {
    name: "plain HTTP redirects to HTTPS",
    async run({ origin, get }) {
      const insecure = origin.replace(/^https:/, "http:");
      if (insecure === origin) throw new Skipped("the origin is plain HTTP");
      const response = await get(`${insecure}/`);
      expect(response.status === 301 || response.status === 308, `status ${response.status}`);
      expect(response.headers.get("location") === `${origin}/`, `location ${response.headers.get("location")}`);
    },
  },
];

/** A component's page from the build being smoke tested, and the title the build gave it. */
async function componentPage(dist: string): Promise<{ path: string; title: string } | null> {
  for await (const file of new Glob("**/*.html").scan({ cwd: dist })) {
    if (file === "index.html" || file === "404.html") continue;
    const title = /<title>[^<]*<\/title>/.exec(await Bun.file(path.join(dist, file)).text())?.[0];
    if (title) return { path: `/${file.replace(/\.html$/, "")}`, title };
  }
  return null;
}

function isHtml(response: Response): boolean {
  return response.headers.get("content-type")?.startsWith("text/html") === true;
}

function expect(condition: boolean, failure: string): asserts condition {
  if (!condition) throw new Error(failure);
}

/** Cloudflare's Bot Fight Mode answers datacenter IPs with a 403 challenge page that never reaches the Worker. */
function isChallenge(response: Response): boolean {
  return response.status === 403 && isHtml(response) && response.headers.get("cf-mitigated")?.toLowerCase() === "challenge";
}

async function runCheck(check: Check, context: Context, { attempts, retryMs }: SmokeOptions): Promise<Outcome> {
  let reason = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await check.run(context);
      return { name: check.name, status: "ok" };
    } catch (error) {
      if (error instanceof Skipped) return { name: check.name, status: "skip", reason: error.message };
      reason = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await Bun.sleep(retryMs);
    }
  }
  return { name: check.name, status: "fail", reason };
}

export async function smoke(options: SmokeOptions): Promise<Outcome[]> {
  const send = options.fetch ?? fetch;
  const context: Context = {
    origin: options.origin.replace(/\/+$/, ""),
    siteUrl: options.siteUrl.replace(/\/+$/, ""),
    dist: options.dist,
    async get(url) {
      const response = await send(url, {
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (isChallenge(response)) {
        const challenge = `Cloudflare answered ${new URL(url).pathname} with a bot challenge`;
        throw options.skipChallenges ? new Skipped(challenge) : new Error(challenge);
      }
      return response;
    },
  };
  const outcomes: Outcome[] = [];
  for (const check of checks) outcomes.push(await runCheck(check, context, options));
  return outcomes;
}

/** Prints one line per check and returns the exit code: skips alone still pass. */
export function report(outcomes: readonly Outcome[]): number {
  for (const { name, status, reason } of outcomes) {
    console.log(`${status.padEnd(4)}  ${name}${reason ? `: ${reason}` : ""}`);
  }
  return outcomes.some(outcome => outcome.status === "fail") ? 1 : 0;
}
