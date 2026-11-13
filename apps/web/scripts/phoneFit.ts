import path from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

/**
 * Opens every card as a page on a phone-sized screen and fails when a preview
 * had to be scaled down to fit it. A preview wider than the phone page should
 * reflow there, not shrink: shrunk words and touch targets fall under the UI
 * standards. Run it after `bun run build`.
 */

const PHONE = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SETTLE_TIMEOUT_MS = 10_000;
/** Text sets in the runner's fallback font, a few percent wider than a phone's, so only a real shrink fails. */
const MIN_SCALE = 0.9;

const webRoot = path.resolve(import.meta.dirname, "..");
const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");

const browser = await chromium.launch();
const shrunk: string[] = [];

try {
  const page = await browser.newPage(PHONE);
  await page.goto(url);
  const titles = await page
    .getByRole("article")
    .evaluateAll(cards => cards.map(card => card.getAttribute("aria-label") ?? ""));
  if (titles.length === 0) throw new Error("The deck rendered no cards.");

  for (const title of titles) {
    await page.goto(url);
    const card = page.getByRole("article", { name: title, exact: true });
    await card.locator(":scope > a").click();
    await page.waitForFunction(
      name => {
        const scroller = document.querySelector('[data-layout="pages"]:not([data-flying])');
        const article = Array.from(document.querySelectorAll("article")).find(a => a.getAttribute("aria-label") === name);
        return scroller !== null && article !== undefined && article.querySelector('[class*="_loading_"]') === null;
      },
      title,
      { timeout: SETTLE_TIMEOUT_MS },
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const transform = await card.locator('[class*="_fit_"]').evaluate(fit => (fit as HTMLElement).style.transform);
    const scale = /scale\(([\d.]+)\)/.exec(transform)?.[1];
    if (scale && Number(scale) < MIN_SCALE) shrunk.push(`${title} is scaled to ${Math.round(Number(scale) * 100)}%`);
  }
} finally {
  await browser.close();
  await server.close();
}

if (shrunk.length > 0) {
  console.error(
    `On a ${PHONE.viewport.width}px phone, these previews are wider or taller than the page and were shrunk to fit:\n` +
      shrunk.map(line => `  ${line}`).join("\n") +
      "\nGive them a phone layout (a `@media (max-width: 48rem)` rule) so they fit unscaled.",
  );
  process.exit(1);
}
console.log(`Every card fits its ${PHONE.viewport.width}px phone page without shrinking.`);
