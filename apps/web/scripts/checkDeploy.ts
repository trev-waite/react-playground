import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { liveRoutes, type LiveRoute, type RouteCard } from "../src/lib/liveRoutes.ts";
import { readLiveCards } from "../vite/liveCards.ts";
import { routePageFile } from "../vite/liveRoutesPlugin.ts";
import { cardImagePath, renderHead, routeHead, unescapeHtml } from "../vite/routeHead.ts";

/** Everything public/ may hold. Each one ships as is. */
export const PUBLIC_FILES = [
  "404.html",
  "404.js",
  "_headers",
  "apple-touch-icon.png",
  "favicon.svg",
  "logo.svg",
  "og.mp4",
  "og.png",
  "theme.js",
];

/** Written by liveRoutesPlugin when the build knows its origin. */
const GENERATED_FILES = ["robots.txt", "sitemap.xml"];

/** Vite's content-hashed scripts and styles. */
const HASHED_ASSET = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const MAX_FILE_BYTES = 3_000_000;
/** Cloudflare applies at most this many `_headers` rules. */
const MAX_HEADER_RULES = 100;
/** Signs that something meant for this machine or the studio reached the bundle. */
const LEAKS: [RegExp, string][] = [
  [/\/(?:Users|home)\/[A-Za-z0-9._-]+\//, "a local file path"],
  [/\/api\/ideas/, "the studio's idea API"],
  [/sourceMappingURL=/, "a source map reference"],
];

/** Every entry under `root`. Anything but a plain file or folder (a symlink above all) is `irregular`: uploads follow links. */
async function listFiles(root: string, prefix = ""): Promise<{ files: string[]; irregular: string[] }> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  const irregular: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const nested = await listFiles(root, relative);
      files.push(...nested.files);
      irregular.push(...nested.irregular);
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      irregular.push(relative);
    }
  }
  return { files: files.sort(), irregular: irregular.sort() };
}

/**
 * Whether a page runs the app: it has the element the app mounts on and a
 * module script the build emitted. Read from the parsed page, so markup inside
 * a comment or a `<template>` does not count and the attributes may come in
 * any order.
 */
async function runsApp(html: string, distFiles: readonly string[]): Promise<boolean> {
  let mounts = false;
  let templates = 0;
  const scripts: string[] = [];
  const page = new HTMLRewriter()
    .on("template", {
      element(template) {
        templates++;
        template.onEndTag(() => void templates--);
      },
    })
    .on("body #root", { element: () => void (mounts ||= templates === 0) })
    .on('script[type="module"][src]', {
      element(script) {
        if (templates === 0) scripts.push(script.getAttribute("src") ?? "");
      },
    })
    .transform(new Response(html));
  await page.text();
  return mounts && scripts.some(src => distFiles.includes(src.replace(/^\//, "")));
}

/**
 * What each route's page must be, to the byte: the grid's page with that
 * route's tags in place of the grid's. So the grid's page is held to running
 * the app first. The origin and the cards with an image of their own are read
 * back from the build, so the pages are held to one another whatever origin
 * they were built for.
 */
async function expectedPages(dist: string, distFiles: readonly string[], cards: readonly RouteCard[]) {
  const index = await readFile(path.join(dist, "index.html"), "utf8").catch(() => "");
  const origin = /<meta property="og:url" content="([^"]*)\/" \/>/.exec(index)?.[1];
  const context = {
    siteUrl: origin ? unescapeHtml(origin) : null,
    cardImages: new Set(cards.filter(card => distFiles.includes(cardImagePath(card.slug))).map(card => card.slug)),
  };
  const head = (route: LiveRoute) => renderHead(routeHead(route, context));
  const [home, ...rest] = liveRoutes(cards);
  const homeHead = head(home!);
  return {
    isApp: await runsApp(index, distFiles),
    hasHomeHead: index.split(homeHead).length === 2,
    page: (route: LiveRoute) => (route === home ? index : index.replace(homeHead, () => head(route))),
    routes: [home!, ...rest],
  };
}

/**
 * Every reason `dist` should not deploy; empty when it may. `cards` is the
 * catalog the source defines: the build must have a page for each of its
 * routes, each the app with that route's own tags, and no page besides.
 */
export async function deployProblems(dist: string, publicDir: string, cards: readonly RouteCard[]): Promise<string[]> {
  const problems: string[] = [];
  const { files: distFiles, irregular: distIrregular } = await listFiles(dist);
  const expected = await expectedPages(dist, distFiles, cards);
  const pages = new Map(expected.routes.map(route => [routePageFile(route), route]));
  /** public/ may also hold one link-preview image per card. */
  const shipped = [...PUBLIC_FILES, ...cards.map(card => cardImagePath(card.slug))];
  if (cards.length === 0) problems.push("the catalog defines no cards");

  const { files: publicFiles, irregular: publicIrregular } = await listFiles(publicDir);
  for (const file of publicIrregular) problems.push(`public/${file} is not a regular file`);
  for (const file of publicFiles) {
    if (!shipped.includes(file)) problems.push(`public/${file} is not on the allowlist`);
  }
  for (const file of PUBLIC_FILES) {
    if (!publicFiles.includes(file)) problems.push(`public/${file} is missing`);
  }

  for (const file of distIrregular) problems.push(`dist/${file} is not a regular file`);
  for (const required of ["404.html", "_headers"]) {
    if (!distFiles.includes(required)) problems.push(`dist/${required} is missing`);
  }
  for (const [file, route] of pages) {
    if (distFiles.includes(file)) continue;
    problems.push(route.card ? `dist has no page for ${route.path}, so it would be a 404` : `dist/${file} is missing`);
  }
  if (distFiles.includes("index.html") && !expected.isApp) {
    problems.push("dist/index.html is not the app: it needs the #root element and a module script the build emitted");
  }
  if (distFiles.includes("index.html") && !expected.hasHomeHead) {
    problems.push("dist/index.html lacks the grid's own title and link preview");
  }
  const headers = await readFile(path.join(dist, "_headers"), "utf8").catch(() => "");
  const rules = headers.split("\n").filter(line => line.startsWith("/"));
  if (rules.length > MAX_HEADER_RULES) {
    problems.push(`dist/_headers has ${rules.length} rules; Cloudflare applies only ${MAX_HEADER_RULES}`);
  }
  if (rules.some(rule => rule.trim() === "/assets/*")) {
    problems.push("dist/_headers caches all of /assets/*, so a missing file's 404 would be kept for a year");
  }

  for (const file of distFiles) {
    const absolute = path.join(dist, file);
    if (file.split("/").some(segment => segment.startsWith("."))) {
      problems.push(`dist/${file} is a hidden file`);
      continue;
    }
    if (file.endsWith(".map")) {
      problems.push(`dist/${file} is a source map`);
      continue;
    }
    const route = pages.get(file);
    if (!route && !shipped.includes(file) && !GENERATED_FILES.includes(file) && !HASHED_ASSET.test(file)) {
      problems.push(`dist/${file} is not on the allowlist`);
      continue;
    }
    if (route?.card && expected.hasHomeHead && (await readFile(absolute, "utf8")) !== expected.page(route)) {
      problems.push(`dist/${file} is not the app page with ${route.path}'s own title and link preview`);
    }
    if ((await stat(absolute)).size > MAX_FILE_BYTES) {
      problems.push(`dist/${file} is larger than ${MAX_FILE_BYTES} bytes`);
    }
    if (/\.(?:js|css|html)$/.test(file)) {
      const text = await readFile(absolute, "utf8");
      for (const [pattern, what] of LEAKS) {
        if (pattern.test(text)) problems.push(`dist/${file} contains ${what}`);
      }
    }
  }
  return problems;
}

if (import.meta.main) {
  const web = path.join(import.meta.dir, "..");
  const cards = await readLiveCards(path.join(web, "src/live"));
  const problems = await deployProblems(path.join(web, "dist"), path.join(web, "public"), cards);
  if (problems.length) {
    console.error(`The build must not deploy:\n${problems.map(problem => `  - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`The build ships only allowlisted files, with a page for each of ${liveRoutes(cards).length} routes.`);
}
