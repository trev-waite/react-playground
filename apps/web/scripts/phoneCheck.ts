import path from "node:path";
import { chromium, type Page } from "playwright";
import { preview } from "vite";

/**
 * Opens every card as a page on a phone-sized screen and fails when a preview
 * had to be scaled down to fit it. A preview wider than the phone page should
 * reflow there, not shrink: shrunk words and touch targets fall under the UI
 * standards. Then drags a Spacing Tidy square with a finger, which must follow
 * it. Run it after `bun run build`.
 */

const PHONE = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SETTLE_TIMEOUT_MS = 10_000;
/** Text sets in the runner's fallback font, a few percent wider than a phone's, so only a real shrink fails. */
const MIN_SCALE = 0.9;
const DRAG = { x: 40, y: 30 };

const webRoot = path.resolve(import.meta.dirname, "..");
const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");

const browser = await chromium.launch();
const failures: string[] = [];

/** Opens a card from the grid and waits until its page has landed and its preview has loaded. */
async function openPage(page: Page, title: string) {
  await page.goto(url!);
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
  return card;
}

try {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(url);
  const titles = await page
    .getByRole("article")
    .evaluateAll(cards => cards.map(card => card.getAttribute("aria-label") ?? ""));
  if (titles.length === 0) throw new Error("The deck rendered no cards.");

  for (const title of titles) {
    const card = await openPage(page, title);
    const transform = await card.locator('[class*="_fit_"]').evaluate(fit => (fit as HTMLElement).style.transform);
    const scale = /scale\(([\d.]+)\)/.exec(transform)?.[1];
    if (scale && Number(scale) < MIN_SCALE) {
      failures.push(
        `${title} is scaled to ${Math.round(Number(scale) * 100)}% to fit the page. ` +
          "Give it a phone layout (a `@media (max-width: 48rem)` rule) so it fits unscaled.",
      );
    }
  }

  // A square holds an SVG, so the finger lands on a child of the draggable item.
  const tidy = await openPage(page, "Spacing Tidy");
  const square = tidy.getByRole("button", { name: "Square 1", exact: true });
  const box = await square.boundingBox();
  if (!box) throw new Error("Spacing Tidy has no Square 1 on its page.");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const touch = await context.newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", at?: { x: number; y: number }) =>
    touch.send("Input.dispatchTouchEvent", { type, touchPoints: at ? [at] : [] });
  await send("touchStart", start);
  for (let step = 1; step <= 10; step++) {
    await send("touchMove", { x: start.x + (DRAG.x * step) / 10, y: start.y + (DRAG.y * step) / 10 });
  }
  await send("touchEnd");
  const moved = await square.boundingBox();
  if (!moved || Math.abs(moved.x - box.x - DRAG.x) > 2 || Math.abs(moved.y - box.y - DRAG.y) > 2) {
    failures.push(
      `A finger dragged a Spacing Tidy square by ${DRAG.x}, ${DRAG.y} but it moved by ` +
        `${Math.round((moved?.x ?? box.x) - box.x)}, ${Math.round((moved?.y ?? box.y) - box.y)}.`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`On a ${PHONE.viewport.width}px phone:\n${failures.map(line => `  ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(`Every card fits its ${PHONE.viewport.width}px phone page, and a finger drags Spacing Tidy.`);
