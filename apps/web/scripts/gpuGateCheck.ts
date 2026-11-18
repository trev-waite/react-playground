import { readdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { preview } from "vite";

/**
 * Checks the split `src/gpu/vgpuGate.ts` promises: the GPU library is fetched
 * only where `navigator.gpu` exists, and a GPU preview opens either way.
 * Run it after `bun run build`.
 */

const SETTLE_TIMEOUT_MS = 15_000;

const webRoot = path.resolve(import.meta.dirname, "..");
const library = (await readdir(path.join(webRoot, "dist/assets"))).filter(file => /^vgpuLibrary-.+\.js$/.test(file));
if (library.length !== 1) {
  console.error(`The build should hold the GPU library in one script of its own (vgpuLibrary-*.js); it has ${library.length}.`);
  process.exit(1);
}

const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");

const failures: string[] = [];

async function load(browser: Browser, webGpu: boolean) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  // The gate checks only that navigator.gpu exists; CI's browser lacks it, so it gets one with no adapter.
  await page.addInitScript(present => {
    if (!present) {
      Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true });
    } else if (!("gpu" in navigator)) {
      const gpu = { requestAdapter: async () => null, getPreferredCanvasFormat: () => "bgra8unorm" };
      Object.defineProperty(Navigator.prototype, "gpu", { get: () => gpu, configurable: true });
    }
  }, webGpu);
  const errors: string[] = [];
  let fetched = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (new URL(request.url()).pathname === `/assets/${library[0]}`) fetched = true;
  });
  await page.goto(new URL("/buttons/PrimaryButton", url).href);
  const preview = (title: string) => page.getByRole("article", { name: title, exact: true })
    .locator('[class*="_fit_"] > :not([class*="_loading_"])').first();
  await preview("Primary Button").waitFor();
  if (fetched) failures.push("The button page requested the GPU library before showing a GPU card.");
  await page.getByRole("button", { name: "Show all components" }).click();
  await page.getByRole("article", { name: "Light Dispersion" }).getByRole("link").click();
  await preview("Light Dispersion").waitFor();
  if (webGpu) {
    await page.waitForFunction(() => performance.getEntriesByType("resource")
      .some(entry => entry.name.includes("/vgpuLibrary-")), null, { timeout: SETTLE_TIMEOUT_MS });
  }
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll('article [role="alert"]'), alert => alert.textContent ?? ""),
  );
  return { broken, fetched, errors };
}

const browser = await chromium.launch();
try {
  const withGpu = await load(browser, true);
  if (!withGpu.fetched) {
    failures.push(`A browser with WebGPU never fetched ${library[0]}: GPU components have no library to draw with.`);
  }
  const without = await load(browser, false);
  if (without.fetched) failures.push(`A browser without WebGPU fetched ${library[0]}, which it cannot use.`);
  for (const [name, result] of [["with WebGPU", withGpu], ["without WebGPU", without]] as const) {
    if (result.broken.length > 0) failures.push(`${name}, a card failed to load: ${result.broken.join("; ")}`);
    if (result.errors.length > 0) failures.push(`${name}, the page threw: ${result.errors.join("; ")}`);
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`The GPU library:\n${failures.map(line => `  ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(`${library[0]} is fetched only where WebGPU exists, and a GPU preview opens either way.`);
