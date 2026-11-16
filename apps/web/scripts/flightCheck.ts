import path from "node:path";
import { chromium, type Page } from "playwright";
import { preview } from "vite";
import { judgeFlight } from "./flight/judge.ts";
import { installFlightRecorder, type Flight, type FlightRecorder } from "./flight/recorder.ts";

/**
 * Flies cards between the grid and their pages in the built app and holds the
 * flight to what the eye expects of it: a preview arrives at the size it rests
 * at, with nothing left to lay out; and the browser scores no layout shift
 * for the cards around the one flying. One card is opened after the window has changed height in the grid,
 * which changes its page but resizes nothing on screen. On a small phone a
 * canvas card flies twice, the second time in steps, with a single stop
 * between its layouts. Last, on both, a flight is turned back in the very
 * frame its landing hides the pages it places, and every card must be showing
 * again in the grid. Run it after `bun run build`.
 */

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const SHORTER = { width: 1280, height: 560 };
const PHONE = { viewport: { width: 400, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** A canvas that resizes with its stage: its first flight is how the deck finds that out, and from the second it steps. */
const STEPPED = "Moon Phase";
const SETTLE_TIMEOUT_MS = 15_000;
/** A family, a control, a navigation bar, and a canvas that redraws when it is resized. */
const CARDS = ["Controls", "Profile Button", "Menu Pill", "Moon Phase"];
const AFTER_RESIZE = ["Controls", "Spacing Tidy"];
const BACK = "Show all components";

type InPage = { flightRecorder: FlightRecorder; turnedBack?: boolean };

const webRoot = path.resolve(import.meta.dirname, "..");
const server = await preview({ root: webRoot, preview: { port: 0 }, logLevel: "warn" });
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite preview did not report a local URL.");

const browser = await chromium.launch();
const failures: string[] = [];
/** Every flight's layout shift, the flying card's own included: not judged, since it depends on how fast the runner draws. */
let shiftInAll = 0;

async function atRest(page: Page, layout: "pages" | "grid") {
  await page.waitForFunction(
    name => {
      const cards = Array.from(document.querySelectorAll("article"));
      const loaded = cards.every(card => card.querySelector('[class*="_fit_"] > :not([class*="_loading_"])') !== null);
      return loaded && document.querySelector(`[data-layout="${name}"]:not([data-flying])`) !== null;
    },
    layout,
    { timeout: SETTLE_TIMEOUT_MS },
  );
}

const tileOf = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true }).getByRole("link");

/** Records `title`'s card through `action` until the deck rests in `layout`, and for a few frames after. */
async function fly(page: Page, title: string, action: () => Promise<unknown>, layout: "pages" | "grid"): Promise<Flight> {
  await page.evaluate(name => (window as unknown as InPage).flightRecorder.record(name), title);
  await action();
  // Off the deck, so the page that lands is not hovered: a control that grows under the pointer is not a jump.
  await page.mouse.move(1, 1);
  await atRest(page, layout);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  return page.evaluate(() => (window as unknown as InPage).flightRecorder.stop());
}

async function roundTrip(page: Page, title: string, note = "") {
  const tile = tileOf(page, title);
  await tile.scrollIntoViewIfNeeded();
  const opened = await fly(page, title, () => tile.click(), "pages");
  const back = page.getByRole("button", { name: BACK });
  const closed = await fly(page, title, () => back.click(), "grid");
  failures.push(...judgeFlight(`Opening ${title}${note}`, opened), ...judgeFlight(`Closing ${title}${note}`, closed));
  shiftInAll += opened.shiftInAll + closed.shiftInAll;
}

/** Opens `title` and goes back to the grid the moment its landing hides the pages around it. */
async function turnBackWhilePlacing(page: Page, title: string, where: string) {
  await page.evaluate(back => {
    const scroller = document.querySelector("[data-layout]")!;
    const placing = new MutationObserver(() => {
      if (!scroller.hasAttribute("data-placing")) return;
      placing.disconnect();
      document.querySelector<HTMLElement>(`button[aria-label="${back}"]`)?.click();
      (window as unknown as InPage).turnedBack = true;
    });
    placing.observe(scroller, { attributes: true, attributeFilter: ["data-placing"] });
  }, BACK);
  await tileOf(page, title).click();
  await atRest(page, "grid").catch(() => {});
  if (!(await page.evaluate(() => (window as unknown as InPage).turnedBack === true))) {
    failures.push(`${where}, ${title} landed without hiding the pages it placed, so there was no moment to turn back in.`);
    return;
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const hidden = await page.evaluate(() => ({
    placing: document.querySelector("[data-placing]") !== null,
    cards: Array.from(document.querySelectorAll("article"))
      .filter(card => getComputedStyle(card).visibility !== "visible")
      .map(card => card.getAttribute("aria-label")),
  }));
  if (hidden.placing || hidden.cards.length > 0) {
    failures.push(
      `${where}, turning back as ${title} landed left ${hidden.cards.length > 0 ? hidden.cards.join(", ") : "the pages"} hidden in the grid.`,
    );
  }
}

try {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.addInitScript(installFlightRecorder);
  await page.goto(url);
  await atRest(page, "grid");
  for (const title of CARDS) await roundTrip(page, title);

  await page.setViewportSize(SHORTER);
  await page.waitForFunction(height => document.querySelector("[data-layout]")?.clientHeight === height, SHORTER.height, {
    timeout: SETTLE_TIMEOUT_MS,
  });
  await atRest(page, "grid");
  for (const title of AFTER_RESIZE) await roundTrip(page, title, " after the window grew shorter in the grid");
  await turnBackWhilePlacing(page, "Controls", "On a desktop");

  const phone = await (await browser.newContext(PHONE)).newPage();
  await phone.addInitScript(installFlightRecorder);
  await phone.goto(url);
  await atRest(phone, "grid");
  await roundTrip(phone, STEPPED, " on a phone");
  await roundTrip(phone, STEPPED, " on a phone, in steps");
  await turnBackWhilePlacing(phone, "Controls", "On a phone");
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`Flights between the grid and a page:\n${failures.map(line => `  ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${CARDS.length + AFTER_RESIZE.length} cards on a desktop and one on a phone fly to their pages and back without a jump, a late layout, or a layout shift for the cards around them, and a flight turned back as it lands leaves nothing hidden. In all, with the flying cards' own motion, the browser scored a layout shift of ${shiftInAll.toFixed(3)}.`,
);
