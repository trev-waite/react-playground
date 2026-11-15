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
 *
 * Every step waits for the page to come to rest where it should, never for a
 * fixed time, and the mid-flight steps run on a page clock only the check
 * moves: a slow runner takes longer, but sees the same frames.
 */

const VIEWPORT = { width: 1280, height: 800 };
/** How long a step may take to come to rest, in real time or on a stopped clock. Generous: a slow runner is slow, not wrong. */
const SETTLE_TIMEOUT_MS = 10_000;
const POLL_MS = 50;
/** How far the stopped clock runs into a flight before a step interrupts it: well before the morph lands. */
const MID_FLIGHT_MS = 160;
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

/** Where the page is, and the card under the middle of the viewport with where its left and right edges fall. */
async function state(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector("[data-layout]");
    const card = Array.from(document.querySelectorAll("article")).find(article => {
      const box = article.getBoundingClientRect();
      return box.top < innerHeight / 2 && box.bottom > innerHeight / 2 && box.left < innerWidth / 2 && box.right > innerWidth / 2;
    });
    const box = card?.getBoundingClientRect();
    return {
      path: location.pathname,
      title: document.title,
      layout: scroller?.getAttribute("data-layout"),
      flying: scroller?.hasAttribute("data-flying") ?? false,
      gliding: scroller?.hasAttribute("data-gliding") ?? false,
      entries: history.length,
      card: { label: card?.getAttribute("aria-label") ?? null, left: box?.left ?? Infinity, right: box?.right ?? 0, viewport: innerWidth },
    };
  });
}

type State = Awaited<ReturnType<typeof state>>;

/** Pages whose clock is stopped: their time passes only when the check runs the clock. */
const stopped = new WeakSet<Page>();

/** The page once the camera and the page column are at rest where `done` holds, or as it is when that never happens. */
async function settle(page: Page, done: (current: State) => boolean): Promise<State> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  for (let waited = 0; ; waited += POLL_MS) {
    const current = await state(page);
    const resting = current.layout !== "flight" && !current.flying && !current.gliding;
    if (resting && done(current)) return current;
    if (stopped.has(page) ? waited >= SETTLE_TIMEOUT_MS : Date.now() > deadline) return current;
    await (stopped.has(page) ? page.clock.runFor(POLL_MS) : Bun.sleep(POLL_MS));
  }
}

const tile = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true }).getByRole("link");

/** The card is the one asked for and spans the viewport as a page does. */
function isPageOf(current: State, title: string): boolean {
  const { card } = current;
  return card.label === title && card.left <= PAGE_EDGE && card.right >= card.viewport - PAGE_EDGE;
}

const tabs = await browser.newBrowserCDPSession();
await tabs.send("Target.setDiscoverTargets", { discover: true });

/**
 * The address of the tab `open` makes the browser open, once it has left
 * about:blank, or null. Read from the browser's own targets: Playwright can
 * miss a tab the page opens itself when it is busy as the tab starts loading.
 */
async function openedTab(open: () => Promise<void>): Promise<string | null> {
  const { targetInfos } = await tabs.send("Target.getTargets");
  const known = new Set(targetInfos.map(target => target.targetId));
  let onTarget = (_event: { targetInfo: { targetId: string; type: string; url: string } }) => {};
  const opened = new Promise<{ id: string; url: string }>(resolve => {
    onTarget = ({ targetInfo: { targetId, type, url } }) => {
      if (type === "page" && !known.has(targetId) && url !== "" && url !== "about:blank") resolve({ id: targetId, url });
    };
  });
  tabs.on("Target.targetCreated", onTarget).on("Target.targetInfoChanged", onTarget);
  try {
    await open();
    const tab = await Promise.race([opened, Bun.sleep(SETTLE_TIMEOUT_MS).then(() => null)]);
    if (tab) await tabs.send("Target.closeTarget", { targetId: tab.id });
    return tab?.url ?? null;
  } finally {
    tabs.off("Target.targetCreated", onTarget).off("Target.targetInfoChanged", onTarget);
  }
}

/** Opens a tile from the grid on a stopped clock and runs the clock into the flight, so the next step interrupts it mid-air. */
async function startFlight(page: Page, title: string) {
  await page.goto(`${origin}/`);
  await settle(page, current => current.layout === "grid");
  await tile(page, title).click();
  await page.clock.runFor(MID_FLIGHT_MS);
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
  const grid = await settle(page, current => current.layout === "grid");
  expect(grid.layout === "grid" && grid.title === SITE_TITLE, `/ should show the grid titled ${SITE_TITLE}: ${JSON.stringify(grid)}`);
  expect((await tile(page, second.title).getAttribute("href")) === livePath(second.slug), `the ${second.title} tile should link to ${livePath(second.slug)}`);

  await tile(page, second.title).click();
  const opened = await settle(page, current => current.layout === "pages" && isPageOf(current, second.title));
  expect(
    opened.path === livePath(second.slug) && opened.layout === "pages" && !opened.flying && opened.title === routeTitle(second) && opened.entries === grid.entries + 1,
    `a tile click should open ${livePath(second.slug)} as a new history entry: ${JSON.stringify(opened)}`,
  );
  expect(isPageOf(opened, second.title), `a tile click should fill the page with ${second.title}`);

  await page.keyboard.press("ArrowUp");
  const paged = await settle(page, current => isPageOf(current, first.title));
  expect(
    paged.path === livePath(first.slug) && paged.title === routeTitle(first) && paged.entries === opened.entries,
    `paging should move the URL without adding history: ${JSON.stringify(paged)}`,
  );

  await page.goBack();
  const back = await settle(page, current => current.layout === "grid");
  expect(back.path === "/" && back.layout === "grid" && back.title === SITE_TITLE, `Back should return to the grid: ${JSON.stringify(back)}`);

  await page.goForward();
  const forward = await settle(page, current => current.layout === "pages" && isPageOf(current, first.title));
  expect(forward.path === paged.path && forward.layout === "pages", `Forward should reopen the page: ${JSON.stringify(forward)}`);
  expect(isPageOf(forward, first.title), `Forward should fill the page with ${first.title}`);

  await page.goto(`${origin}/`);
  await settle(page, current => current.layout === "grid");
  const tab = await openedTab(() => tile(page, first.title).click({ modifiers: ["ControlOrMeta"] }));
  expect(tab !== null && new URL(tab).pathname === livePath(first.slug), `a modified click should open ${livePath(first.slug)} in a new tab, not ${tab}`);
  expect((await state(page)).path === "/", "a modified click should leave this tab on the grid");

  // Every path the site answers opens its card, and shows it.
  for (const card of cards) {
    for (const slug of new Set([card.slug, ...card.members.map(member => member.slug)])) {
      await page.goto(`${origin}${livePath(slug)}`);
      const direct = await settle(page, current => current.layout === "pages" && isPageOf(current, card.title));
      expect(direct.title === routeTitle(card), `${livePath(slug)} should be titled for ${card.title}: ${JSON.stringify(direct)}`);
      expect(isPageOf(direct, card.title), `${livePath(slug)} should fill the page with ${card.title}`);
    }
  }
  await context.close();

  // The camera interrupted mid-flight, on a clock stopped before the page loads.
  const flights = await browser.newContext({ viewport: VIEWPORT });
  const start = Date.now();
  await flights.clock.install({ time: start });
  await flights.clock.pauseAt(start + 1000);
  const flight = await flights.newPage();
  stopped.add(flight);
  flight.on("pageerror", error => failures.push(`page error: ${error.message}`));

  // Paging on while the camera is still flying in: the page that lands must be the one asked for, whole, in every frame.
  await startFlight(flight, first.title);
  await flight.evaluate(() => {
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
  expect(await clickMidFlight(flight, "Next component"), "the check should page on while the camera is still flying");
  const landed = await settle(flight, current => current.layout === "pages" && isPageOf(current, second.title));
  expect(landed.path === livePath(second.slug) && landed.layout === "pages" && !landed.flying, `paging mid-flight should land on ${livePath(second.slug)}: ${JSON.stringify(landed)}`);
  expect(isPageOf(landed, second.title), `paging mid-flight should fill the page with ${second.title}`);
  const frames: { layout: string | null; left: number; right: number }[] = await flight.evaluate(
    () => (window as unknown as { __frames: never[] }).__frames,
  );
  const uncovered = frames.filter(frame => frame.layout === "pages" && (frame.left > PAGE_EDGE || frame.right < VIEWPORT.width - PAGE_EDGE));
  expect(
    uncovered.length === 0,
    `paging mid-flight left the viewport uncovered for ${uncovered.length} frames after the page column took over (first: ${JSON.stringify(uncovered[0])})`,
  );

  // Turning back to the grid mid-flight.
  await startFlight(flight, second.title);
  expect(await clickMidFlight(flight, "Show all components"), "the check should turn back while the camera is still flying");
  const reversed = await settle(flight, current => current.layout === "grid");
  expect(reversed.path === "/" && reversed.layout === "grid" && !reversed.flying, `turning back mid-flight should rest on the grid: ${JSON.stringify(reversed)}`);

  // A resize mid-flight: the page lands at the new size.
  await startFlight(flight, second.title);
  expect((await state(flight)).layout === "flight", "the check should resize while the camera is still flying");
  await flight.setViewportSize({ width: 1100, height: 700 });
  const resized = await settle(flight, current => current.layout === "pages" && isPageOf(current, second.title));
  expect(resized.layout === "pages" && !resized.flying, `a resize mid-flight should still land the page: ${JSON.stringify(resized)}`);
  expect(isPageOf(resized, second.title), `a resize mid-flight should fill the new viewport with ${second.title}`);
  await flights.close();

  // Reduced motion: the same places, and the card is only ever a tile or a page, never a size in between.
  const still = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const calm = await still.newPage();
  calm.on("pageerror", error => failures.push(`page error: ${error.message}`));
  await calm.goto(`${origin}/`);
  await settle(calm, current => current.layout === "grid");
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
  const calmOpened = await settle(calm, current => current.layout === "pages" && isPageOf(current, second.title));
  expect(calmOpened.path === livePath(second.slug) && calmOpened.layout === "pages" && !calmOpened.flying, `with reduced motion a tile should still open its page: ${JSON.stringify(calmOpened)}`);
  expect(isPageOf(calmOpened, second.title), `with reduced motion the page should be filled with ${second.title}`);
  await calm.goBack();
  const calmBack = await settle(calm, current => current.layout === "grid");
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
