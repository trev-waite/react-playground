import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { build, preview } from "vite";
import { ogCardHtml } from "./card.ts";

const WIDTH = 1200;
const HEIGHT = 630;
const FPS = 60;
const BITRATE = 2_000_000;

const webRoot = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(webRoot, "public");
const frames = mkdtempSync(path.join(tmpdir(), "og-frames-"));

await build({ root: webRoot, logLevel: "warn" });
const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");

// Chrome rather than bundled Chromium so WebGPU cards paint.
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-webgpu", "--hide-scrollbars"] });

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
  // A fake clock steps every spring frame by frame, so the video is smooth however slow screenshots are.
  await page.clock.install();
  await page.goto(url);
  await page.clock.runFor(1500);
  await page.waitForTimeout(800);
  await page.mouse.move(WIDTH / 2, 4);

  let frame = 0;
  async function hold(seconds: number) {
    for (let i = 0; i < Math.round(seconds * FPS); i++) {
      await page.clock.runFor(1000 / FPS);
      await page.screenshot({ path: path.join(frames, `${String(frame++).padStart(5, "0")}.png`) });
    }
  }

  await hold(1);
  const grid = await page.screenshot();
  await hold(0.6);
  const pages = await page.getByRole("article").count();
  await page.getByRole("article").first().click();
  await page.mouse.move(WIDTH / 2, 4);
  await hold(1.2);
  for (let i = 1; i < Math.min(pages, 4); i++) {
    await page.keyboard.press("ArrowDown");
    await hold(1.6);
  }
  await page.getByRole("button", { name: "Show all components" }).click();
  await page.mouse.move(WIDTH / 2, 4);
  await hold(1.2);

  const favicon = readFileSync(path.join(publicDir, "favicon.svg"));
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(ogCardHtml({ favicon, grid }));
  await page.screenshot({ path: path.join(publicDir, "og.png"), scale: "css" });

  execFileSync(
    "swift",
    [path.join(import.meta.dirname, "encode.swift"), frames, path.join(publicDir, "og.mp4"), `${WIDTH}`, `${HEIGHT}`, `${FPS}`, `${BITRATE}`],
    { stdio: "inherit" },
  );
  console.log(`Wrote public/og.png and public/og.mp4 (${(frame / FPS).toFixed(1)}s).`);
} finally {
  await browser.close();
  await server.close();
  rmSync(frames, { recursive: true, force: true });
}
