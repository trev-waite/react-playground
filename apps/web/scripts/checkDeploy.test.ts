import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deployProblems, PUBLIC_FILES } from "./checkDeploy";

const INDEX = '<!doctype html><div id="root"></div><script type="module" src="/assets/index-AbCd1234.js"></script>';
const roots: string[] = [];

/** A clean build: the public files, the app page, one route, and hashed assets. */
async function build(
  extra: Record<string, string> = {},
  publicExtra: Record<string, string> = {},
  tamper?: (dist: string, publicDir: string) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), "check-deploy-"));
  roots.push(root);
  const dist = path.join(root, "dist");
  const publicDir = path.join(root, "public");
  const files: Record<string, string> = {
    "index.html": INDEX,
    "controls/Switch.html": INDEX,
    "assets/index-AbCd1234.js": "console.log(1)",
    "assets/style-EfGh5678.css": "body{}",
    ...Object.fromEntries(PUBLIC_FILES.map(file => [file, "x"])),
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dist, file)), { recursive: true });
    await writeFile(path.join(dist, file), content);
  }
  for (const [file, content] of Object.entries({ ...Object.fromEntries(PUBLIC_FILES.map(file => [file, "x"])), ...publicExtra })) {
    await mkdir(path.dirname(path.join(publicDir, file)), { recursive: true });
    await writeFile(path.join(publicDir, file), content);
  }
  await tamper?.(dist, publicDir);
  return deployProblems(dist, publicDir);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("deploy allowlist", () => {
  test("a clean build may deploy", async () => {
    expect(await build()).toEqual([]);
  });

  test("refuses secrets and hidden files", async () => {
    const problems = await build({ ".env": "TOKEN=1", ".git/config": "[core]", "assets/.DS_Store": "" });
    expect(problems).toEqual([
      "dist/.env is a hidden file",
      "dist/.git/config is a hidden file",
      "dist/assets/.DS_Store is a hidden file",
    ]);
  });

  test("refuses source maps, source files, and unhashed scripts", async () => {
    const problems = await build({
      "assets/index-AbCd1234.js.map": "{}",
      "src/main.tsx": "export {}",
      "assets/app.js": "1",
    });
    expect(problems).toEqual([
      "dist/assets/app.js is not on the allowlist",
      "dist/assets/index-AbCd1234.js.map is a source map",
      "dist/src/main.tsx is not on the allowlist",
    ]);
  });

  test("refuses a page that is not the app, so nothing else ships as a route", async () => {
    expect(await build({ "admin.html": "<h1>admin</h1>" })).toEqual(["dist/admin.html is not the app page"]);
  });

  test("refuses bundles that leak local paths, the studio's API, or source maps", async () => {
    const problems = await build({
      "assets/leak-AbCd1234.js": 'fetch("/api/ideas"); const p = "/Users/trev/secret"; //# sourceMappingURL=x',
    });
    expect(problems).toEqual([
      "dist/assets/leak-AbCd1234.js contains a local file path",
      "dist/assets/leak-AbCd1234.js contains the studio's idea API",
      "dist/assets/leak-AbCd1234.js contains a source map reference",
    ]);
  });

  test("refuses anything new in public/, and notices a missing 404 page", async () => {
    expect(await build({}, { "draft.psd": "x" })).toEqual(["public/draft.psd is not on the allowlist"]);
  });

  test("refuses symlinks, which an upload would follow to files outside the build", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "check-deploy-"));
    roots.push(root);
    const secret = path.join(root, "secret.txt");
    await writeFile(secret, "TOKEN=1");
    const problems = await build({}, {}, async (dist, publicDir) => {
      await rm(path.join(dist, "og.png"));
      await symlink(secret, path.join(dist, "og.png"));
      await rm(path.join(publicDir, "favicon.svg"));
      await symlink(secret, path.join(publicDir, "favicon.svg"));
    });
    expect(problems).toContain("dist/og.png is not a regular file");
    expect(problems).toContain("public/favicon.svg is not a regular file");
  });

  test("refuses a build with no route pages, which would make every component a 404", async () => {
    const problems = await build({}, {}, async dist => {
      await rm(path.join(dist, "controls"), { recursive: true });
    });
    expect(problems).toEqual(["dist has no component route pages, so every component would be a 404"]);
  });

  test("refuses caching all of /assets/* and more header rules than Cloudflare applies", async () => {
    const blanket = await build({ _headers: "/*\n  X-Content-Type-Options: nosniff\n\n/assets/*\n  Cache-Control: immutable\n" });
    expect(blanket).toEqual(["dist/_headers caches all of /assets/*, so a missing file's 404 would be kept for a year"]);
    const tooMany = await build({ _headers: Array.from({ length: 101 }, (_, i) => `/a${i}\n  X: y\n`).join("") });
    expect(tooMany).toEqual(["dist/_headers has 101 rules; Cloudflare applies only 100"]);
  });

  test("requires the app page, the 404 page, and the headers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "check-deploy-"));
    roots.push(root);
    await mkdir(path.join(root, "dist"));
    const problems = await deployProblems(path.join(root, "dist"), path.join(root, "missing-public"));
    expect(problems).toContain("dist/index.html is missing");
    expect(problems).toContain("dist/404.html is missing");
    expect(problems).toContain("dist/_headers is missing");
  });
});
