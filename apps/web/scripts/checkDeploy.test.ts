import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { liveRoutes, type LiveRoute, type RouteCard } from "../src/lib/liveRoutes";
import { HEAD_SLOT, routeHead, stampHead, type HeadContext } from "../vite/routeHead";
import { deployProblems, PUBLIC_FILES } from "./checkDeploy";

const ROOT = '<div id="root"></div>';
const ENTRY = '<script type="module" src="/assets/index-AbCd1234.js"></script>';
const TEMPLATE = `<!doctype html><head>${HEAD_SLOT}</head><body>${ROOT}${ENTRY}</body>`;
const SITE: HeadContext = { siteUrl: "https://studio.example.com", cardImages: new Set() };
const CONTROLS: RouteCard = { slug: "controls", title: "Controls", members: [{ slug: "controls/Switch" }] };
const [HOME, CARD, MEMBER] = liveRoutes([CONTROLS]) as [LiveRoute, LiveRoute, LiveRoute];
/** The page the build writes for a route: the app, with that route's tags. */
const page = (route: LiveRoute, context = SITE) => stampHead(TEMPLATE, routeHead(route, context));
const INDEX = page(HOME);
const roots: string[] = [];

/** A clean build: the public files, a page for each route, and hashed assets. */
async function build(
  extra: Record<string, string> = {},
  publicExtra: Record<string, string> = {},
  tamper?: (dist: string, publicDir: string) => Promise<void>,
  cards: readonly RouteCard[] = [CONTROLS],
) {
  const root = await mkdtemp(path.join(tmpdir(), "check-deploy-"));
  roots.push(root);
  const dist = path.join(root, "dist");
  const publicDir = path.join(root, "public");
  const files: Record<string, string> = {
    "index.html": INDEX,
    "controls.html": page(CARD),
    "controls/Switch.html": page(MEMBER),
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
  return deployProblems(dist, publicDir, cards);
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

  test("refuses any page that is not a route's, even an exact copy of the app", async () => {
    expect(await build({ "admin.html": "<h1>admin</h1>", "controls/Dial.html": INDEX })).toEqual([
      "dist/admin.html is not on the allowlist",
      "dist/controls/Dial.html is not on the allowlist",
    ]);
  });

  test("refuses a build missing a route's page, which would make that component a 404", async () => {
    const shader: RouteCard = { slug: "shaders/LightDispersion", title: "Light Dispersion", members: [{ slug: "shaders/LightDispersion" }] };
    expect(await build({}, {}, undefined, [CONTROLS, shader])).toEqual([
      "dist has no page for /shaders/LightDispersion, so it would be a 404",
    ]);
  });

  test("refuses a route's page that is the grid's, so no link unfurls as the wrong page", async () => {
    expect(await build({ "controls.html": INDEX })).toEqual([
      "dist/controls.html is not the app page with /controls's own title and link preview",
    ]);
  });

  test("refuses a route's page with the right tags but not the app, so every path that answers runs it", async () => {
    const tagsOnly = page(MEMBER).replace(ROOT, "");
    expect(await build({ "controls/Switch.html": tagsOnly })).toEqual([
      "dist/controls/Switch.html is not the app page with /controls/Switch's own title and link preview",
    ]);
  });

  test("refuses a grid page that was never given its own tags", async () => {
    expect(await build({ "index.html": TEMPLATE })).toEqual(["dist/index.html lacks the grid's own title and link preview"]);
  });

  /** Every page with `markup` swapped for `replacement`, so the pages still agree with one another. */
  const everyPage = (markup: string, replacement: string) => ({
    "index.html": page(HOME).replace(markup, replacement),
    "controls.html": page(CARD).replace(markup, replacement),
    "controls/Switch.html": page(MEMBER).replace(markup, replacement),
  });
  const NOT_THE_APP = ["dist/index.html is not the app: it needs the #root element and a module script the build emitted"];

  test("refuses pages that all agree but do not run the app: no root, no script, or a script the build never emitted", async () => {
    expect(await build(everyPage(ROOT, ""))).toEqual(NOT_THE_APP);
    expect(await build(everyPage(ENTRY, ""))).toEqual(NOT_THE_APP);
    expect(await build({}, {}, dist => rm(path.join(dist, "assets/index-AbCd1234.js")))).toEqual(NOT_THE_APP);
  });

  test("refuses a root or an entry script that is only inside a comment or a template, where the app cannot find it", async () => {
    expect(await build(everyPage(ROOT, `<!--${ROOT}-->`))).toEqual(NOT_THE_APP);
    expect(await build(everyPage(ENTRY, `<!--${ENTRY}-->`))).toEqual(NOT_THE_APP);
    expect(await build(everyPage(ROOT, `<template>${ROOT}</template>`))).toEqual(NOT_THE_APP);
    expect(await build(everyPage(ENTRY, `<template>${ENTRY}</template>`))).toEqual(NOT_THE_APP);
    expect(await build(everyPage(ROOT, `<template><p>unused</p></template>${ROOT}`))).toEqual([]);
  });

  test("reads the page as HTML, so attributes may come in any order and the root may carry more", async () => {
    expect(await build(everyPage(ROOT, '<div class="app" id="root"></div>'))).toEqual([]);
    expect(await build(everyPage(ENTRY, '<script crossorigin src="/assets/index-AbCd1234.js" type="module"></script>'))).toEqual([]);
  });

  test("reads back an origin that had to be escaped in HTML", async () => {
    const odd: HeadContext = { siteUrl: "https://a&b.example.com", cardImages: new Set() };
    const pages = { "index.html": page(HOME, odd), "controls.html": page(CARD, odd), "controls/Switch.html": page(MEMBER, odd) };
    expect(pages["index.html"]).toContain("https://a&amp;b.example.com/");
    expect(await build(pages)).toEqual([]);
  });

  test("holds the pages to one another whatever origin they were built for, even none", async () => {
    const local: HeadContext = { siteUrl: null, cardImages: new Set() };
    const pages = { "index.html": page(HOME, local), "controls.html": page(CARD, local), "controls/Switch.html": page(MEMBER, local) };
    expect(await build(pages)).toEqual([]);
    expect(await build({ ...pages, "controls.html": page(CARD) })).toEqual([
      "dist/controls.html is not the app page with /controls's own title and link preview",
    ]);
  });

  test("ships a card's link-preview image, the sitemap, and robots.txt, but no image without a card", async () => {
    const image = { "og/controls.png": "x" };
    const pictured: HeadContext = { ...SITE, cardImages: new Set(["controls"]) };
    const pages = { "controls.html": page(CARD, pictured), "controls/Switch.html": page(MEMBER, pictured) };
    expect(await build({ ...image, ...pages, "sitemap.xml": "x", "robots.txt": "x" }, image)).toEqual([]);
    expect(await build(image, image)).toEqual([
      "dist/controls.html is not the app page with /controls's own title and link preview",
      "dist/controls/Switch.html is not the app page with /controls/Switch's own title and link preview",
    ]);
    expect(await build({}, { "og/retired.png": "x" })).toEqual(["public/og/retired.png is not on the allowlist"]);
  });

  test("refuses a catalog with no cards, so a broken scan cannot pass everything", async () => {
    expect(await build({}, {}, undefined, [])).toContain("the catalog defines no cards");
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
    const problems = await deployProblems(path.join(root, "dist"), path.join(root, "missing-public"), [CONTROLS]);
    expect(problems).toContain("dist/index.html is missing");
    expect(problems).toContain("dist/404.html is missing");
    expect(problems).toContain("dist/_headers is missing");
  });
});
