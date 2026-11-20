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
  type TouchPoint = { x: number; y: number; id?: number };
  const send = (type: "touchStart" | "touchMove" | "touchEnd", ...points: TouchPoint[]) =>
    touch.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((point, index) => ({ ...point, id: point.id ?? index })) });
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

  await page.addInitScript(() => { Math.random = () => 0; });
  for (const [width, height] of [[320, 320], [360, 360], [667, 375], [375, 375], [390, 390]] as const) {
    await page.setViewportSize({ width, height });
    const scene = await openPage(page, "Letterpress");
    const { hints, rail, play } = await scene.locator("[data-letterpress]").evaluate((stage: HTMLElement) => {
      const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
      const hints = Array.from(stage.querySelectorAll<HTMLElement>("[data-compact-hint]"))
        .filter(hint => hint.getClientRects().length > 0)
        .map(hint => Number.parseFloat(getComputedStyle(hint).fontSize) * scale);
      const rail = stage.querySelector("[role=slider]")!.getBoundingClientRect().height;
      const playback = stage.querySelector("[data-playback]")!.getBoundingClientRect();
      return { hints, rail, play: Math.min(playback.width, playback.height) };
    });
    if (hints.length !== 1 || hints.some(size => size < 11.5) || rail < 44) {
      failures.push(`Letterpress at ${width}×${height} needs readable hints and a 44px scrubber. Measured ${hints.map(size => size.toFixed(1)).join(", ")}px hints and a ${rail.toFixed(1)}px scrubber.`);
    }
    if (play < 43.9) failures.push(`Letterpress needs a 44px playback target at ${width}×${height}; the button measured ${play.toFixed(1)}px.`);
    if (width === 320) {
      const clipped = await scene.locator("[data-letterpress]").evaluate(stage => {
        const art = Array.from(stage.querySelectorAll("[data-glyph-art]"));
        const port = stage.closest("[data-scroll-scene]")!;
        const start = performance.now();
        let worst = 0;
        port.scrollTop = port.scrollHeight;
        return new Promise<number>(resolve => {
          function sample(now: number) {
            const bounds = stage.getBoundingClientRect();
            for (const artwork of art) {
              const glyph = artwork.getBoundingClientRect();
              worst = Math.max(worst, bounds.top - glyph.top, glyph.bottom - bounds.bottom);
            }
            if (now - start < 1000) requestAnimationFrame(sample);
            else resolve(worst);
          }
          requestAnimationFrame(sample);
        });
      });
      if (clipped > 1) failures.push(`Letterpress clips its letters by ${clipped.toFixed(1)}px during the 320×320 reveal.`);
      const target = await scene.locator("[data-letter]").evaluateAll(letters => Math.min(...letters.flatMap(letter => {
        const { width, height } = letter.getBoundingClientRect();
        return [width, height];
      })));
      if (target < 43.9) failures.push(`Letterpress needs 44px press areas at 320×320. The smallest measured ${target.toFixed(1)}px.`);
    }
  }
  const letterpress = page.getByRole("article", { name: "Letterpress" });
  const scrubber = letterpress.getByRole("slider", { name: "Scroll to assemble" });
  await scrubber.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(() => !document.querySelector("[data-letter]:not([data-home])"), undefined, { timeout: SETTLE_TIMEOUT_MS });
  const letter = await letterpress.getByRole("button", { name: "Letter k", exact: true }).boundingBox();
  if (!letter) throw new Error("Letterpress should show the letter k.");
  await send("touchStart", { x: letter.x + letter.width / 2 - 6, y: letter.y + letter.height / 2 });
  const lifted = letterpress.locator("[data-letter][data-lifted]");
  await lifted.waitFor({ timeout: SETTLE_TIMEOUT_MS });
  if (await lifted.getAttribute("aria-label") !== "Letter k") failures.push("Touching the left side of k should lift k in compact Letterpress.");
  await send("touchEnd");

  await page.setViewportSize(PHONE.viewport);
  await page.clock.install();
  const tallCard = await openPage(page, "Letterpress");
  const stage = tallCard.locator("[data-letterpress]");
  const rail = tallCard.getByRole("slider");
  const tee = tallCard.getByRole("button", { name: "Letter T", exact: true });
  const allLanded = () => page.waitForFunction(() => !document.querySelector("[data-letter]:not([data-home])"), undefined, { timeout: SETTLE_TIMEOUT_MS });
  const teeCenter = async () => {
    const box = await tee.boundingBox();
    if (!box) throw new Error("Letterpress should show the letter T.");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  await rail.focus();
  await page.keyboard.press("End");
  await allLanded();
  const tallLifted = tallCard.locator("[data-lifted]");
  for (const alreadyLifted of [false, true]) {
    const first = await teeCenter();
    await send("touchStart", first);
    if (alreadyLifted) await tallLifted.waitFor({ timeout: SETTLE_TIMEOUT_MS });
    await send("touchStart", first, { x: first.x + 60, y: 38 });
    if (!alreadyLifted) await page.waitForTimeout(200);
    if (await tallLifted.count() > 0) failures.push("A second touch should cancel a Letterpress hold.");
    await send("touchEnd");
    if (await tallCard.locator("[data-placed]").count() > 0) failures.push("A two-finger gesture should leave the letter in its original slot.");
    await allLanded();
  }
  const dragStart = await teeCenter();
  const dragPause = { x: dragStart.x + 72, y: dragStart.y };
  const dragEnd = { x: dragStart.x + 96, y: dragStart.y };
  await send("touchStart", dragStart);
  await send("touchMove", dragPause);
  await tee.and(tallLifted).waitFor({ timeout: SETTLE_TIMEOUT_MS });
  await page.waitForTimeout(260);
  await send("touchMove", dragEnd);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const heldCenter = await teeCenter();
  const contactError = Math.hypot(heldCenter.x - dragEnd.x, heldCenter.y - dragEnd.y);
  if (contactError > 12) {
    failures.push(`A horizontal Letterpress drag drifted ${contactError.toFixed(1)}px from the finger after the hold timer expired.`);
  }
  await send("touchEnd");
  await allLanded();
  const teeStart = await teeCenter();
  await send("touchStart", teeStart);
  await tee.and(tallLifted).waitFor({ timeout: SETTLE_TIMEOUT_MS });
  await send("touchMove", { x: teeStart.x + 120, y: teeStart.y + 60 });
  await page.clock.pauseAt(Date.now() + 1000);
  try {
    await send("touchEnd");
    await page.clock.runFor(32);
    const contact = await teeCenter();
    await send("touchStart", contact);
    await page.clock.runFor(200);
    const regrabbed = await teeCenter();
    if (!await tee.and(tallLifted).count() || Math.hypot(regrabbed.x - contact.x, regrabbed.y - contact.y) > 18) {
      failures.push("A touch re-grab should lift the returning letter under the original contact.");
    }
    await send("touchEnd");
  } finally {
    await page.clock.resume();
  }

  await openPage(page, "Letterpress");
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error("Letterpress should show a stage.");
  const swipeFrom = { x: bounds.x + bounds.width * 0.24, y: bounds.y + bounds.height * 0.88 };
  const scrollTop = () => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
  async function swipe(distance: number, staggerRelease = false) {
    await send("touchStart", swipeFrom);
    for (let step = 1; step <= 8; step++) {
      await send("touchMove", { x: swipeFrom.x, y: swipeFrom.y - distance * step / 8 });
    }
    const beforeRelease = await scrollTop();
    if (staggerRelease) {
      const inside = { x: swipeFrom.x, y: swipeFrom.y - distance, id: 0 };
      const outside = { x: swipeFrom.x + 60, y: 38, id: 1 };
      await send("touchStart", inside, outside);
      await send("touchEnd", inside);
      await send("touchEnd", outside);
    } else {
      await send("touchEnd");
    }
    return beforeRelease;
  }
  const play = stage.locator("[data-playback]");
  const playBox = await play.boundingBox();
  if (!playBox) throw new Error("Letterpress should show its playback control.");
  await send("touchStart", { x: playBox.x + playBox.width / 2, y: playBox.y + playBox.height / 2 });
  await send("touchEnd");
  const playbackProgress = async () => Number(await rail.getAttribute("aria-valuenow"));
  await page.waitForFunction(() => Number(document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow")) > 35);
  const beforeManualProgress = await playbackProgress();
  const beforeManualSwipe = await scrollTop();
  const duringManualSwipe = await swipe(90);
  if (await play.getAttribute("data-playing") !== null || duringManualSwipe !== beforeManualSwipe ||
      await playbackProgress() <= beforeManualProgress) {
    failures.push("A phone swipe during playback should advance from the current Letterpress frame.");
  }
  await openPage(page, "Letterpress");
  const deckStart = await scrollTop();
  await swipe(575);
  const duringSecond = await swipe(275, true);
  await allLanded();
  if (Math.abs(duringSecond - deckStart) > 1 || Math.abs(await scrollTop() - deckStart) > 1) {
    failures.push("A touch swipe should stay on Letterpress until the title lands.");
  }
  const duringFresh = await swipe(525);
  if (duringFresh === deckStart) failures.push("The first fresh swipe after a split touch release should move to the next card.");
  else await page.waitForURL("**/inputs/StretchSlider", { timeout: SETTLE_TIMEOUT_MS });
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`On a ${PHONE.viewport.width}px phone:\n${failures.map(line => `  ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(`Every card fits its ${PHONE.viewport.width}px phone page, and touch targeting works in Spacing Tidy and Letterpress.`);
