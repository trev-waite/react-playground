import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { build, preview } from "vite";
import { livePath } from "../../src/lib/liveRoutes.ts";
import { readLiveCards, type BuildCard } from "../../vite/liveCards.ts";
import { cardImagePath } from "../../vite/routeHead.ts";
import { ogComponentHtml } from "./card.ts";

/**
 * Draws each card's link-preview image into public/og/, where the build finds
 * it and names it as that page's og:image. Run it after adding a card or
 * changing how one looks; a card without an image shares the site's. Name
 * slugs to draw only those cards (a family member's slug draws its family).
 */

const WIDTH = 1200;
const HEIGHT = 630;
/** The page is shot square, 16px inside this viewport, and shown at the same size on the card. */
const PAGE_VIEWPORT = 576;
const SETTLE_MS = 2500;
/** The card says its name and line beside the page, so the page drops its own caption and the site's bar. */
const PAGE_ONLY = '[class*="_bar_"], [class*="_pager_"], article > footer { visibility: hidden !important; }';

const webRoot = path.resolve(import.meta.dirname, "../..");
const publicDir = path.join(webRoot, "public");
const catalog = await readLiveCards(path.join(webRoot, "src/live"));
const requested = process.argv.slice(2);
const unknown = requested.filter(slug => !catalog.some(card => cardAnswers(card, slug)));
if (unknown.length > 0) {
  throw new Error(`No card for ${unknown.join(", ")}. Cards: ${catalog.map(card => card.slug).join(", ")}`);
}
const cards = requested.length === 0 ? catalog : catalog.filter(card => requested.some(slug => cardAnswers(card, slug)));

function cardAnswers(card: BuildCard, slug: string): boolean {
  return card.slug === slug || card.members.some(member => member.slug === slug);
}

await build({ root: webRoot, logLevel: "warn" });
const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");

// Chrome rather than bundled Chromium so WebGPU cards paint.
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-webgpu", "--hide-scrollbars"] });

try {
  const favicon = await readFile(path.join(publicDir, "favicon.svg"));
  const page = await browser.newPage({ viewport: { width: PAGE_VIEWPORT, height: PAGE_VIEWPORT }, deviceScaleFactor: 2 });
  const composer = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const card of cards) {
    await page.goto(new URL(livePath(card.slug), url).href);
    await page.addStyleTag({ content: PAGE_ONLY });
    const article = page.getByRole("article", { name: card.title, exact: true });
    await article.locator('[class*="_fit_"] > :not([class*="_loading_"])').first().waitFor();
    await page.waitForTimeout(SETTLE_MS);
    const shot = await article.screenshot();

    const file = path.join(publicDir, cardImagePath(card.slug));
    await mkdir(path.dirname(file), { recursive: true });
    await composer.setContent(ogComponentHtml({ favicon, shot, title: card.title, description: card.description }));
    await composer.screenshot({ path: file });
    console.log(`Wrote public/${cardImagePath(card.slug)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
