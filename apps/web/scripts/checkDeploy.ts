import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Glob } from "bun";
import { folderFromFamilyPath, slugFromPreviewPath } from "../src/lib/catalog.ts";

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

/** Vite's content-hashed scripts and styles. */
const HASHED_ASSET = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
/** A component route, written by liveRoutesPlugin as a copy of index.html. */
const ROUTE_PAGE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.html$/;
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

/** The routes the source defines: every component preview and every family folder under `liveDir`. */
export async function catalogRoutes(liveDir: string): Promise<string[]> {
  const routes: string[] = [];
  for await (const file of new Glob("**/{preview.tsx,family.ts}").scan({ cwd: liveDir })) {
    const absolute = path.join(liveDir, file);
    const route = slugFromPreviewPath(absolute) ?? folderFromFamilyPath(absolute);
    if (route) routes.push(route);
  }
  return routes.sort();
}

/** Every reason `dist` should not deploy; empty when it may. `routes` are the pages it must have, and only those. */
export async function deployProblems(dist: string, publicDir: string, routes: readonly string[]): Promise<string[]> {
  const problems: string[] = [];
  const { files: publicFiles, irregular: publicIrregular } = await listFiles(publicDir);
  for (const file of publicIrregular) problems.push(`public/${file} is not a regular file`);
  for (const file of publicFiles) {
    if (!PUBLIC_FILES.includes(file)) problems.push(`public/${file} is not on the allowlist`);
  }
  for (const file of PUBLIC_FILES) {
    if (!publicFiles.includes(file)) problems.push(`public/${file} is missing`);
  }

  const { files: distFiles, irregular: distIrregular } = await listFiles(dist);
  for (const file of distIrregular) problems.push(`dist/${file} is not a regular file`);
  for (const required of ["index.html", "404.html", "_headers"]) {
    if (!distFiles.includes(required)) problems.push(`dist/${required} is missing`);
  }
  const index = await readFile(path.join(dist, "index.html"), "utf8").catch(() => "");
  const pages = distFiles
    .filter(file => ROUTE_PAGE.test(file) && file !== "index.html" && !PUBLIC_FILES.includes(file))
    .map(file => file.replace(/\.html$/, ""));
  if (routes.length === 0) problems.push("the catalog defines no component routes");
  for (const route of routes) {
    if (!pages.includes(route)) problems.push(`dist has no page for /${route}, so it would be a 404`);
  }
  for (const page of pages) {
    if (!routes.includes(page)) problems.push(`dist/${page}.html is not a component route`);
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
    const isRoute = ROUTE_PAGE.test(file) && file !== "index.html" && !PUBLIC_FILES.includes(file);
    if (file !== "index.html" && !PUBLIC_FILES.includes(file) && !HASHED_ASSET.test(file) && !isRoute) {
      problems.push(`dist/${file} is not on the allowlist`);
      continue;
    }
    if (isRoute && (await readFile(absolute, "utf8")) !== index) {
      problems.push(`dist/${file} is not the app page`);
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
  const routes = await catalogRoutes(path.join(web, "src/live"));
  const problems = await deployProblems(path.join(web, "dist"), path.join(web, "public"), routes);
  if (problems.length) {
    console.error(`The build must not deploy:\n${problems.map(problem => `  - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`The build ships only allowlisted files, with a page for each of ${routes.length} routes.`);
}
