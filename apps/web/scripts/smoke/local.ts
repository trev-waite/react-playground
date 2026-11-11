import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { report, smoke } from "./checks.ts";

const READY_TIMEOUT_MS = 60_000;

const webRoot = path.resolve(import.meta.dir, "../..");
const dist = path.join(webRoot, "dist");
const wrangler = path.join(webRoot, "node_modules/.bin/wrangler");
const { values } = parseArgs({ options: { "no-build": { type: "boolean", default: false } } });

/** The production origin, from the custom domain in wrangler.json, which CI also builds with. */
async function siteUrl(): Promise<string> {
  const config: { routes?: { pattern: string; custom_domain?: boolean }[] } = await Bun.file(
    path.join(webRoot, "wrangler.json"),
  ).json();
  const host = config.routes?.find(route => route.custom_domain)?.pattern;
  if (!host) throw new Error("apps/web/wrangler.json has no custom_domain route.");
  return `https://${host}`;
}

function freePort(): number {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const { port } = probe;
  probe.stop(true);
  if (port === undefined) throw new Error("Couldn't find a free port.");
  return port;
}

async function waitUntilReady(origin: string, server: Bun.Subprocess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`wrangler dev exited with code ${server.exitCode}.`);
    const ready = await fetch(`${origin}/og.png`, { signal: AbortSignal.timeout(1000) }).then(
      response => response.ok,
      () => false,
    );
    if (ready) return;
    await Bun.sleep(250);
  }
  throw new Error(`wrangler dev wasn't serving ${origin} after ${READY_TIMEOUT_MS / 1000}s.`);
}

const site = await siteUrl();
if (!existsSync(wrangler)) throw new Error("Wrangler isn't installed; run bun install.");

if (!values["no-build"]) {
  const build = Bun.spawnSync([process.execPath, "run", "build"], {
    cwd: webRoot,
    env: { ...process.env, SITE_URL: site },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
}

const port = freePort();
const origin = `http://127.0.0.1:${port}`;
const server = Bun.spawn(
  [wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--show-interactive-dev-session=false"],
  { cwd: webRoot, stdout: "ignore", stderr: "inherit" },
);
const stop = () => server.kill("SIGTERM");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stop();
    process.exit(130);
  });
}

let exitCode = 1;
try {
  await waitUntilReady(origin, server);
  console.log(`Smoke testing ${origin} (wrangler dev) as ${site}`);
  exitCode = report(await smoke({ origin, siteUrl: site, dist, attempts: 1, retryMs: 0 }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  stop();
  await server.exited;
}
process.exit(exitCode);
