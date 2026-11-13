import path from "node:path";
import { chromium, type Page } from "playwright";
import { preview } from "vite";
import { livePath, routeTitle, SITE_TITLE } from "../src/lib/liveRoutes.ts";
import { readLiveCards } from "../vite/liveCards.ts";

/**
 * Drives the built app in a browser to hold the routing to what a reader
 * expects of real URLs: a tile is a link, opening a card can be undone with
 * Back, paging does not pile up history, and every path the site answers opens
 * and shows its card. It also interrupts the camera mid-flight (paging on,
 * turning back, resizing) and repeats the basics with reduced motion. Run it
 * after `bun run build`.
 */

const VIEWPORT = { width: 1280, height: 800 };
/** Long enough for a flight to land and the page column to rest. */
const REST_MS = 1600;
/** A page is inset 16px from the viewport; allow a spring's overshoot around it. */
const PAGE_EDGE = 24;
/** How close a width must be to a tile's or a page's to count as one of them. */
const SNAP = 2;

const webRoot = path.resolve(import.meta.dirname, "..");
const cards = await readLiveCards(path.join(webRoot, "src/live"));
const [first, second] = cards;
if (!first || !second) throw new Error("The routing check needs at least two cards.");

const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
if (!origin) throw new Error("vite preview did not report a local URL.");

const browser = await chromium.launch();
const failures: string[] = [];

function expect(condition: boolean, failure: string) {
  if (!condition) failures.push(failure);
}

async function state(page: Page) {
  return page.evaluate(() => ({
    path: location.pathname,
    title: document.title,
    layout: document.querySelector("[data-layout]")?.getAttribute("data-layout"),
    flying: document.querySelector("[data-flying]") !== null,
    entries: history.length,
  }));
}

const tile = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true }).getByRole("link");

/** The card under the middle of the viewport, and where its left and right edges fall. */
async function openCard(page: Page) {
  return page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("article")).find(article => {
      const box = article.getBoundingClientRect();
      return box.top < innerHeight / 2 && box.bottom > innerHeight / 2 && box.left < innerWidth / 2 && box.right > innerWidth / 2;
    });
    const box = card?.getBoundingClientRect();
    return { label: card?.getAttribute("aria-label") ?? null, left: box?.left ?? Infinity, right: box?.right ?? 0, viewport: innerWidth };
  });
}

type OpenCard = Awaited<ReturnType<typeof openCard>>;

/** The card is the one asked for and spans the viewport as a page does. */
function isPageOf(card: OpenCard, title: string): boolean {
  return card.label === title && card.left <= PAGE_EDGE && card.right >= card.viewport - PAGE_EDGE;
}

/** Opens a tile from the grid and returns once the camera is flying, so the next step interrupts it. */
async function startFlight(page: Page, title: string) {
  await page.goto(`${origin}/`);
  await page.waitForTimeout(REST_MS);
  await tile(page, title).click();
  await page.waitForFunction(() => document.querySelector('[data-layout="flight"][data-flying]') !== null);
}

/** Clicks a control in the page's own task and reports whether the camera was still flying at that instant. */
function clickMidFlight(page: Page, label: string): Promise<boolean> {
  return page.evaluate(name => {
    const flying = document.querySelector('[data-layout="flight"][data-flying]') !== null;
    document.querySelector<HTMLElement>(`button[aria-label="${name}"]`)?.click();
    return flying;
  }, label);
}

try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  page.on("pageerror", error => failures.push(`page error: ${error.message}`));

  await page.goto(`${origin}/`);
  await page.waitForTimeout(REST_MS);
  const grid = await state(page);
  expect(grid.layout === "grid" && grid.title === SITE_TITLE, `/ should show the grid titled ${SITE_TITLE}: ${JSON.stringify(grid)}`);
  expect((await tile(page, second.title).getAttribute("href")) === livePath(second.slug), `the ${second.title} tile should link to ${livePath(second.slug)}`);

  await tile(page, second.title).click();
  await page.waitForTimeout(REST_MS);
  const opened = await state(page);
  expect(
    opened.path === livePath(second.slug) && opened.layout === "pages" && !opened.flying && opened.title === routeTitle(second) && opened.entries === grid.entries + 1,
    `a tile click should open ${livePath(second.slug)} as a new history entry: ${JSON.stringify(opened)}`,
  );
  expect(isPageOf(await openCard(page), second.title), `a tile click should fill the page with ${second.title}`);

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(REST_MS);
  const paged = await state(page);
  expect(
    paged.path === livePath(first.slug) && paged.title === routeTitle(first) && paged.entries === opened.entries,
    `paging should move the URL without adding history: ${JSON.stringify(paged)}`,
  );

  await page.goBack();
  await page.waitForTimeout(REST_MS);
  const back = await state(page);
  expect(back.path === "/" && back.layout === "grid" && back.title === SITE_TITLE, `Back should return to the grid: ${JSON.stringify(back)}`);

  await page.goForward();
  await page.waitForTimeout(REST_MS);
  const forward = await state(page);
  expect(forward.path === paged.path && forward.layout === "pages", `Forward should reopen the page: ${JSON.stringify(forward)}`);
  expect(isPageOf(await openCard(page), first.title), `Forward should fill the page with ${first.title}`);

  await page.goto(`${origin}/`);
  await page.waitForTimeout(REST_MS);
  const [tab] = await Promise.all([context.waitForEvent("page"), tile(page, first.title).click({ modifiers: ["ControlOrMeta"] })]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname === livePath(first.slug), `a modified click should open ${livePath(first.slug)} in a new tab, not ${tab.url()}`);
  expect((await state(page)).path === "/", "a modified click should leave this tab on the grid");
  await tab.close();

  // Paging on while the camera is still flying in: the page that lands must be the one asked for, whole, in every frame.
  await startFlight(page, first.title);
  await page.evaluate(() => {
    const frames: { layout: string | null; left: number; right: number }[] = [];
    Object.assign(window, { __frames: frames });
    const sample = () => {
      const card = Array.from(document.querySelectorAll("article")).find(article => {
        const box = article.getBoundingClientRect();
        return box.top < innerHeight / 2 && box.bottom > innerHeight / 2 && box.left < innerWidth / 2 && box.right > innerWidth / 2;
      });
      const box = card?.getBoundingClientRect();
      frames.push({
        layout: document.querySelector("[data-layout]")?.getAttribute("data-layout") ?? null,
        left: box?.left ?? Infinity,
        right: box?.right ?? 0,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  expect(await clickMidFlight(page, "Next component"), "the check should page on while the camera is still flying");
  await page.waitForTimeout(REST_MS);
  const landed = await state(page);
  expect(landed.path === livePath(second.slug) && landed.layout === "pages" && !landed.flying, `paging mid-flight should land on ${livePath(second.slug)}: ${JSON.stringify(landed)}`);
  expect(isPageOf(await openCard(page), second.title), `paging mid-flight should fill the page with ${second.title}`);
  const frames: { layout: string | null; left: number; right: number }[] = await page.evaluate(
    () => (window as unknown as { __frames: never[] }).__frames,
  );
  const uncovered = frames.filter(frame => frame.layout === "pages" && (frame.left > PAGE_EDGE || frame.right < VIEWPORT.width - PAGE_EDGE));
  expect(
    uncovered.length === 0,
    `paging mid-flight left the viewport uncovered for ${uncovered.length} frames after the page column took over (first: ${JSON.stringify(uncovered[0])})`,
  );

  // Turning back to the grid mid-flight.
  await startFlight(page, second.title);
  expect(await clickMidFlight(page, "Show all components"), "the check should turn back while the camera is still flying");
  await page.waitForTimeout(REST_MS);
  const reversed = await state(page);
  expect(reversed.path === "/" && reversed.layout === "grid" && !reversed.flying, `turning back mid-flight should rest on the grid: ${JSON.stringify(reversed)}`);

  // A resize mid-flight: the page lands at the new size.
  await startFlight(page, second.title);
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(REST_MS);
  const resized = await state(page);
  expect(resized.layout === "pages" && !resized.flying, `a resize mid-flight should still land the page: ${JSON.stringify(resized)}`);
  expect(isPageOf(await openCard(page), second.title), `a resize mid-flight should fill the new viewport with ${second.title}`);
  await page.setViewportSize(VIEWPORT);

  // Every path the site answers opens its card, and shows it.
  for (const card of cards) {
    for (const slug of new Set([card.slug, ...card.members.map(member => member.slug)])) {
      await page.goto(`${origin}${livePath(slug)}`);
      await page.waitForFunction(() => document.querySelector('[data-layout="pages"]') !== null, undefined, { timeout: 10_000 });
      const direct = await state(page);
      expect(direct.title === routeTitle(card), `${livePath(slug)} should be titled for ${card.title}: ${JSON.stringify(direct)}`);
      expect(isPageOf(await openCard(page), card.title), `${livePath(slug)} should fill the page with ${card.title}`);
    }
  }
  await context.close();

  // Reduced motion: the same places, and the card is only ever a tile or a page, never a size in between.
  const still = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const calm = await still.newPage();
  calm.on("pageerror", error => failures.push(`page error: ${error.message}`));
  await calm.goto(`${origin}/`);
  await calm.waitForTimeout(REST_MS);
  await calm.evaluate(title => {
    const widths: number[] = [];
    Object.assign(window, { __widths: widths });
    const card = Array.from(document.querySelectorAll("article")).find(article => article.getAttribute("aria-label") === title);
    const sample = () => {
      if (card) widths.push(Math.round(card.getBoundingClientRect().width));
      requestAnimationFrame(sample);
    };
    sample();
  }, second.title);
  await tile(calm, second.title).click();
  await calm.waitForTimeout(REST_MS);
  const calmOpened = await state(calm);
  expect(calmOpened.path === livePath(second.slug) && calmOpened.layout === "pages" && !calmOpened.flying, `with reduced motion a tile should still open its page: ${JSON.stringify(calmOpened)}`);
  expect(isPageOf(await openCard(calm), second.title), `with reduced motion the page should be filled with ${second.title}`);
  await calm.goBack();
  await calm.waitForTimeout(REST_MS);
  const calmBack = await state(calm);
  expect(calmBack.path === "/" && calmBack.layout === "grid" && !calmBack.flying, `with reduced motion Back should return to the grid: ${JSON.stringify(calmBack)}`);
  const widths: number[] = await calm.evaluate(() => (window as unknown as { __widths: number[] }).__widths);
  const tileWidth = widths[0] ?? 0;
  const pageWidth = Math.max(...widths);
  const between = widths.filter(width => Math.abs(width - tileWidth) > SNAP && Math.abs(width - pageWidth) > SNAP);
  expect(pageWidth > tileWidth * 2, `with reduced motion the card should still grow from a tile to a page: ${tileWidth}px to ${pageWidth}px`);
  expect(between.length === 0, `with reduced motion the card should jump between tile and page, but ${between.length} frames showed it in between (first: ${between[0]}px)`);
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`The Live routes misbehave in a browser:\n${failures.map(failure => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`Links, history, and direct paths work for all ${cards.length} cards.`);
