import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Fetch, type Outcome, report, smoke } from "./checks";

const ORIGIN = "https://studio.example.com";
const SECURITY = { "content-security-policy": "default-src 'self'" };
const APP = (siteUrl: string) =>
  `<!doctype html><meta property="og:url" content="${siteUrl}/" /><div id="root"></div><script type="module" src="/assets/index-AbCd1234.js"></script>`;

let dist = "";

beforeAll(async () => {
  dist = await mkdtemp(path.join(tmpdir(), "smoke-"));
  await mkdir(path.join(dist, "controls"));
  await writeFile(path.join(dist, "index.html"), APP(ORIGIN));
  await writeFile(path.join(dist, "controls/Switch.html"), APP(ORIGIN));
});

afterAll(() => rm(dist, { recursive: true, force: true }));

/** A Worker that serves the Live build the way production does. */
function site(siteUrl = ORIGIN): (url: URL) => Response {
  return url => {
    if (url.protocol === "http:" && url.host === new URL(ORIGIN).host) return new Response(null, { status: 301, headers: { location: `${ORIGIN}/` } });
    if (url.pathname === "/" || url.pathname === "/controls/Switch") {
      return new Response(APP(siteUrl), { headers: { "content-type": "text/html; charset=utf-8", ...SECURITY } });
    }
    if (url.pathname === "/assets/index-AbCd1234.js") {
      return new Response("", { headers: { "content-type": "text/javascript", "cache-control": "public, immutable" } });
    }
    if (url.pathname === "/og.png") return new Response("", { headers: { "content-type": "image/png" } });
    return new Response("Nothing at this address", { status: 404, headers: { "content-type": "text/html", ...SECURITY } });
  };
}

/** Bot Fight Mode: a 403 challenge page for HTTPS page requests, before the Worker sees them. */
function challengePages(worker: (url: URL) => Response): (url: URL) => Response {
  return url =>
    url.protocol === "http:" || /\.(?:js|png)$/.test(url.pathname)
      ? worker(url)
      : new Response("Just a moment...", { status: 403, headers: { "content-type": "text/html", "cf-mitigated": "challenge" } });
}

function fake(handle: (url: URL) => Response): { fetch: Fetch; requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    fetch: async url => {
      requests.push(url);
      return handle(new URL(url));
    },
  };
}

async function run(
  handle: (url: URL) => Response,
  options: { origin?: string; siteUrl?: string; skipChallenges?: boolean } = {},
) {
  const { fetch, requests } = fake(handle);
  const outcomes = await smoke({
    origin: options.origin ?? ORIGIN,
    siteUrl: options.siteUrl ?? ORIGIN,
    dist,
    skipChallenges: options.skipChallenges ?? true,
    attempts: 3,
    retryMs: 0,
    fetch,
  });
  return { outcomes, requests, statuses: Object.fromEntries(outcomes.map(outcome => [outcome.name, outcome.status])) };
}

function quietly<T>(work: () => T): T {
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    return work();
  } finally {
    log.mockRestore();
  }
}

describe("smoke checks", () => {
  test("a healthy site passes every check", async () => {
    const { outcomes } = await run(site());
    expect(outcomes.filter(outcome => outcome.status !== "ok")).toEqual([]);
  });

  test("a bot challenge skips the checks that need a page, once each, and still passes", async () => {
    const { outcomes, requests, statuses } = await run(challengePages(site()));
    expect(statuses).toEqual({
      "home page serves the Live app with its security headers": "skip",
      "hashed scripts load and are cached as immutable": "ok",
      "a component route serves the app": "skip",
      "/smoke-test-unknown-slug gets the 404 page": "skip",
      "/.env gets the 404 page": "skip",
      "/.git/config gets the 404 page": "skip",
      "a missing script is a 404 that browsers won't keep, never the app": "ok",
      "link preview image is public": "ok",
      "plain HTTP redirects to HTTPS": "ok",
    });
    expect(requests.filter(url => url === `${ORIGIN}/`)).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === "skip")?.reason).toBe("Cloudflare answered / with a bot challenge");
    expect(quietly(() => report(outcomes))).toBe(0);
  });

  test("a 403 without the challenge header fails after its retries", async () => {
    const forbidden = (url: URL) => (url.pathname === "/" ? new Response("Forbidden", { status: 403 }) : site()(url));
    const { outcomes, requests } = await run(forbidden);
    expect(outcomes[0]).toEqual({
      name: "home page serves the Live app with its security headers",
      status: "fail",
      reason: "status 403",
    });
    expect(requests.filter(url => url === `${ORIGIN}/`).length).toBeGreaterThanOrEqual(3);
    expect(quietly(() => report(outcomes))).toBe(1);
  });

  test("a server error fails even beside skipped checks", async () => {
    const broken = challengePages(url =>
      url.pathname === "/og.png" ? new Response("", { status: 502 }) : site()(url),
    );
    const { outcomes, statuses } = await run(broken);
    expect(statuses["link preview image is public"]).toBe("fail");
    expect(quietly(() => report(outcomes))).toBe(1);
  });

  test("the build's scripts are checked even when the page is challenged", async () => {
    const brokenScripts = challengePages(url =>
      url.pathname.startsWith("/assets/index-") ? new Response("", { status: 500 }) : site()(url),
    );
    const { outcomes, statuses } = await run(brokenScripts);
    expect(statuses["hashed scripts load and are cached as immutable"]).toBe("fail");
    expect(quietly(() => report(outcomes))).toBe(1);
  });

  test("the challenge header on anything but a 403 page fails", async () => {
    const spoofed = (url: URL) =>
      url.pathname === "/"
        ? new Response("", { status: 503, headers: { "content-type": "text/html", "cf-mitigated": "challenge" } })
        : site()(url);
    const { statuses } = await run(spoofed);
    expect(statuses["home page serves the Live app with its security headers"]).toBe("fail");
  });

  test("a challenge fails where no Cloudflare sits in front, as with wrangler dev", async () => {
    const { outcomes, statuses } = await run(challengePages(site()), { skipChallenges: false });
    expect(statuses["home page serves the Live app with its security headers"]).toBe("fail");
    expect(outcomes.some(outcome => outcome.status === "skip" && outcome.reason?.includes("challenge"))).toBe(false);
  });

  test("og:url must name the site the build was made for, wherever it is served", async () => {
    const local = "http://127.0.0.1:8787";
    const served = await run(site(ORIGIN), { origin: local, siteUrl: ORIGIN });
    expect(served.statuses["home page serves the Live app with its security headers"]).toBe("ok");
    expect(served.requests.every(url => url.startsWith(local))).toBe(true);

    const wrongBuild = await run(site(local), { origin: local, siteUrl: ORIGIN });
    expect(wrongBuild.outcomes[0]?.status).toBe("fail");
    expect(wrongBuild.outcomes[0]?.reason).toBe(`og:url is not ${ORIGIN}/`);
  });

  test("a plain HTTP origin skips the HTTPS redirect check", async () => {
    const { statuses } = await run(site(), { origin: "http://127.0.0.1:8787" });
    expect(statuses["plain HTTP redirects to HTTPS"]).toBe("skip");
  });
});

describe("report", () => {
  test("prints a line per check and passes on skips alone", () => {
    const outcomes: Outcome[] = [
      { name: "a", status: "ok" },
      { name: "b", status: "skip", reason: "challenged" },
    ];
    const log = spyOn(console, "log").mockImplementation(() => {});
    expect(report(outcomes)).toBe(0);
    expect(log.mock.calls.map(call => call[0])).toEqual(["ok    a", "skip  b: challenged"]);
    log.mockRestore();
  });
});
