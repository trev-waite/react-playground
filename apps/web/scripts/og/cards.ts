import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator } from "playwright";
import { build, preview } from "vite";
import { livePath } from "../../src/lib/liveRoutes.ts";
import { readLiveCards, type BuildCard } from "../../vite/liveCards.ts";
import { cardImagePath } from "../../vite/routeHead.ts";
import { ogComponentHtml } from "./card.ts";
import { deckCard } from "../deckCards.ts";

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
/** An entrance chains a few animations at most; past this many rounds, it is a loop, not an entrance. */
const ENTRANCE_ROUNDS = 4;
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

/**
 * Waits out a preview's entrance: every finite animation still running in it, then any that one
 * starts as it ends (a quote's words rise, and then its magnifier arrives). Endless ones are scenery.
 */
async function entranceOver(article: Locator) {
  for (let round = 0; round < ENTRANCE_ROUNDS; round++) {
    const ran = await article.evaluate(async element => {
      const finite = element.getAnimations({ subtree: true }).filter(animation =>
        animation.playState === "running" && Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity));
      await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return finite.length;
    });
    if (ran === 0) return;
  }
}

// Chrome rather than bundled Chromium so WebGPU cards paint.
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-webgpu", "--hide-scrollbars"] });

try {
  const favicon = await readFile(path.join(publicDir, "favicon.svg"));
  const page = await browser.newPage({ viewport: { width: PAGE_VIEWPORT, height: PAGE_VIEWPORT }, deviceScaleFactor: 2 });
  const composer = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const card of cards) {
    await page.goto(new URL(livePath(card.slug), url).href);
    await page.addStyleTag({ content: PAGE_ONLY });
    const article = deckCard(page, card.slug);
    await article.locator("[data-deck-members]").first().waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await entranceOver(article);
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
