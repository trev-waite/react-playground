import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";
import { judgeIdle, previewChunks, sourceOf, type IdleRecord } from "./idle/judge.ts";

/**
 * The deck keeps every card mounted, so a card's own work must stop while it is off screen. This opens
 * a still card's page, waits until every card has mounted, then records which code schedules animation
 * frames or short timers for a few seconds. Anything that keeps running is a card working off screen,
 * however its loop is written; the lint steers authors to visibleLoop, and this proves the result.
 * Run it after `bun run build`.
 */

const STILL_CARD = "/buttons/PrimaryButton";
const WATCH_MS = 4000;
const SETTLE_MS = 2500;
const WARM_TIMEOUT_MS = 60_000;

const webRoot = path.resolve(import.meta.dirname, "..");
const assets = path.join(webRoot, "dist", "assets");
const entry = (await readdir(assets)).find(file => /^index-[\w-]+\.js$/.test(file));
if (!entry) throw new Error("No built entry chunk in dist/assets; run `bun run build` first.");
const chunkToCard = previewChunks(await readFile(path.join(assets, entry), "utf8"));

const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");
const browser = await chromium.launch();

let records: { kind: IdleRecord["kind"]; stack: string }[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    const idle: { on: boolean; seen: { kind: string; stack: string }[] } = { on: false, seen: [] };
    (window as unknown as { __idle: typeof idle }).__idle = idle;
    const frame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const stack = new Error().stack ?? "";
      return frame(time => {
        if (idle.on) idle.seen.push({ kind: "frame", stack });
        callback(time);
      });
    };
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof handler !== "function" || (delay ?? 0) >= 1000) return timeout(handler, delay, ...args);
      const stack = new Error().stack ?? "";
      return timeout(() => {
        if (idle.on) idle.seen.push({ kind: "timer", stack });
        handler(...args);
      }, delay);
    }) as typeof window.setTimeout;
    const interval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") return interval(handler, delay, ...args);
      const stack = new Error().stack ?? "";
      return interval(() => {
        if (idle.on) idle.seen.push({ kind: "timer", stack });
        handler(...args);
      }, delay);
    }) as typeof window.setInterval;
  });
  await page.goto(new URL(STILL_CARD, url).href);
  await page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll("article"));
      return document.querySelector('[data-layout="pages"]:not([data-flying])') !== null &&
        cards.length > 1 && cards.every(card => card.querySelector('[class*="_loading_"]') === null);
    },
    undefined,
    { timeout: WARM_TIMEOUT_MS, polling: 200 },
  );
  await page.waitForTimeout(SETTLE_MS);
  records = await page.evaluate(async watch => {
    const idle = (window as unknown as { __idle: { on: boolean; seen: { kind: "frame" | "timer"; stack: string }[] } }).__idle;
    idle.seen = [];
    idle.on = true;
    await new Promise(resolve => setTimeout(resolve, watch));
    idle.on = false;
    return idle.seen;
  }, WATCH_MS);
} finally {
  await browser.close();
  await server.close();
}

const verdict = judgeIdle(
  records.map(({ kind, stack }) => ({ kind, source: sourceOf(stack, chunkToCard) })),
  WATCH_MS / 1000,
);
if (!verdict.ok) {
  console.error(
    `With every card mounted and only ${STILL_CARD} on screen, work kept running off screen:\n` +
      verdict.offenders.map(({ source, kind, perSecond }) => `  ${source}: ${perSecond.toFixed(1)} ${kind}s a second`).join("\n") +
      "\nRun it on visibleLoop from @/live/kit/visibleLoop, which sleeps while its card is off screen.",
  );
  process.exit(1);
}
console.log(`With every card mounted and one still card on screen, nothing kept running off screen (${records.length} one-off callbacks in ${WATCH_MS / 1000}s).`);
