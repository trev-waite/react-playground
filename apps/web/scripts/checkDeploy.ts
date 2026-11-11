import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Everything public/ may hold. Each one ships as is. */
export const PUBLIC_FILES = [
  "404.html",
  "_headers",
  "apple-touch-icon.png",
  "favicon.svg",
  "logo.svg",
  "og.mp4",
  "og.png",
];

/** Vite's content-hashed scripts and styles. */
const HASHED_ASSET = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
/** A component route, written by liveRoutesPlugin as a copy of index.html. */
const ROUTE_PAGE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.html$/;
const MAX_FILE_BYTES = 3_000_000;
/** Signs that something meant for this machine or the studio reached the bundle. */
const LEAKS: [RegExp, string][] = [
  [/\/(?:Users|home)\/[A-Za-z0-9._-]+\//, "a local file path"],
  [/\/api\/ideas/, "the studio's idea API"],
  [/sourceMappingURL=/, "a source map reference"],
];

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else files.push(relative);
  }
  return files.sort();
}

/** Every reason `dist` should not deploy; empty when it may. */
export async function deployProblems(dist: string, publicDir: string): Promise<string[]> {
  const problems: string[] = [];
  const publicFiles = await listFiles(publicDir);
  for (const file of publicFiles) {
    if (!PUBLIC_FILES.includes(file)) problems.push(`public/${file} is not on the allowlist`);
  }
  for (const file of PUBLIC_FILES) {
    if (!publicFiles.includes(file)) problems.push(`public/${file} is missing`);
  }

  const distFiles = await listFiles(dist);
  for (const required of ["index.html", "404.html", "_headers"]) {
    if (!distFiles.includes(required)) problems.push(`dist/${required} is missing`);
  }
  const index = await readFile(path.join(dist, "index.html"), "utf8").catch(() => "");

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
  const problems = await deployProblems(path.join(web, "dist"), path.join(web, "public"));
  if (problems.length) {
    console.error(`The build must not deploy:\n${problems.map(problem => `  - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log("The build ships only allowlisted files.");
}
