import path from "node:path";
import { chromium, webkit, type Page } from "playwright";
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
const LETTERPRESS = "text/Letterpress";

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

async function checkKeyboardFocus(page: Page) {
  const title = "Gandalf’s Hat";
  const path = livePath("particles/GandalfHologram");
  for (const entry of [path, "/"]) {
    await page.goto(`${origin}${entry}`);
    if (entry === "/") {
      await tile(page, title).focus();
      await page.keyboard.press("Enter");
    }
    await settle(page, current => current.layout === "pages" && isPageOf(current, title));
    const card = page.getByRole("article", { name: title, exact: true });
    const scene = card.locator("[data-projecting], [data-still]");
    await scene.waitFor({ state: "attached" });
    const controls = await scene.locator('button[tabindex="0"]:visible').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute("aria-label")),
    );
    const reached: (string | null)[] = [];
    let code = false;
    for (let step = 0; step < 12 && !code; step++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => ({
        card: document.activeElement?.closest("article")?.getAttribute("aria-label"),
        label: document.activeElement?.getAttribute("aria-label") ?? null,
        code: document.activeElement?.getAttribute("aria-haspopup") === "dialog",
        path: location.pathname,
      }));
      if ((focused.card && focused.card !== title) || focused.path !== path) break;
      if (focused.card === title && !focused.code) reached.push(focused.label);
      code = focused.card === title && focused.code;
    }
    expect(code && JSON.stringify(reached) === JSON.stringify(controls),
      `Tab from ${entry} should reach the hat and Code without leaving the page. Reached ${JSON.stringify(reached)}, Code ${code}.`);
    const hat = scene.getByRole("button", { name: "Drop the dots" });
    if (await hat.count() === 0) continue;
    await hat.click();
    const focus = await hat.evaluate(button => ({
      active: document.activeElement === button, visible: button.matches(":focus-visible"),
    }));
    expect(focus.active && !focus.visible, `Clicking the hat from ${entry} should focus it without a focus outline.`);
    if (!focus.active) continue;
    await page.keyboard.press("ArrowUp");
    const turned = await page.waitForFunction(() => {
      const gl = document.activeElement?.querySelector("canvas")?.getContext("webgl2");
      const program = gl?.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
      if (!gl || !program) return false;
      const pitch = gl.getUniformLocation(program, "uPitch");
      return pitch !== null && (gl.getUniform(program, pitch) as Float32Array)[1]! < 0;
    }, undefined, { timeout: 2000 }).then(() => true, () => false);
    expect(turned && new URL(page.url()).pathname === path, `ArrowUp after clicking from ${entry} should tilt the hat without paging.`);
  }
}

async function checkLetterpressRouting(page: Page) {
  const route = livePath(LETTERPRESS);
  const slider = page.getByRole("slider", { name: "Scroll to assemble" });
  const letters = page.locator("[data-letter]");
  await page.locator("[data-letterpress] [data-ready]").waitFor();
  const stack = () => letters.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.zIndex).join(" "));
  const initialStack = await stack();
  const pile = await letters.evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.transform));
  const overlap = await page.addStyleTag({ content: `
    [data-letter="0"] { transform: translate(-50%, -50%) translateX(1.75em) rotate(22deg) !important; }
    [data-letter="9"] { transform: translate(-50%, -50%) translateX(1.75em) scale(1.75) !important; }
  ` });
  const stem = await letters.first().boundingBox();
  if (!stem) throw new Error("Letterpress should show the T in its pile.");
  const point = { x: stem.x + stem.width / 2, y: stem.y + stem.height / 2 };
  const covered = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-letter]")?.getAttribute("data-letter"), point);
  expect(covered === "9", "the period's transparent hit box should cover the T for the overlap check");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const held = page.locator("[data-letter][data-lifted]");
  expect(await held.getAttribute("data-letter") === "0", "pressing the visible stem of T should lift T through the period's transparent hit box");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await overlap.evaluate(node => node.parentNode?.removeChild(node));

  const heldThroughLanding = await slider.evaluate(node => {
    const port = node.closest("[data-scroll-scene]")!;
    const press = (key: string) => node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    let consumed = false;
    port.addEventListener("wheel", event => { consumed = event.defaultPrevented; }, { once: true });
    press("End");
    node.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    press("Home");
    return consumed;
  });
  expect(heldThroughLanding, "Letterpress should consume outward wheel input until its title has visibly landed");
  const track = await slider.boundingBox();
  if (!track) throw new Error("Letterpress should show its scrubber.");
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(pathname => location.pathname !== pathname ||
    Number(document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow")) > 0, route, { timeout: SETTLE_TIMEOUT_MS });
  const played = (await state(page)).path === route;
  expect(played, "a wheel step over the Letterpress scrubber should play the scene");
  if (!played) return;

  const stableStack = await page.evaluate(async initial => {
    const glyphs = Array.from(document.querySelectorAll<HTMLElement>("[data-letter]"));
    const range = document.querySelector("[data-letterpress] [role=slider]")!;
    const atPile = () => glyphs.every((glyph, index) => glyph.style.transform === initial[index]);
    const readStack = () => glyphs.map(glyph => glyph.style.zIndex).join(" ");
    const stack = readStack();
    const clock = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const press = (key: string) => range.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    async function reach(value: number, ready: () => boolean) {
      const reached = () => Number(range.getAttribute("aria-valuenow")) === value && ready();
      const deadline = performance.now() + 2000;
      while (!reached() && performance.now() < deadline) await clock();
      return reached();
    }
    press("Home");
    if (!(await reach(0, atPile))) return false;
    press("ArrowRight");
    press("ArrowRight");
    if (!(await reach(2, atPile))) return false;
    let stable = true;
    const observer = new MutationObserver(() => { stable &&= readStack() === stack; });
    glyphs.forEach(glyph => observer.observe(glyph, { attributeFilter: ["style"] }));
    press("ArrowRight");
    const departed = await reach(3, () => !atPile());
    press("ArrowLeft");
    const rewound = await reach(2, atPile);
    observer.disconnect();
    return departed && rewound && stable && readStack() === stack;
  }, pile);
  expect(stableStack, "Letterpress should keep the same stacking order over the first departure and reverse");

  const playback = page.locator("[data-playback]");
  const buttonLabel = () => playback.getAttribute("aria-label");
  const progress = () => slider.getAttribute("aria-valuenow");
  const tableOpacity = () => page.locator("[data-pile-plate]").evaluate(node => getComputedStyle(node).opacity);
  await playback.press("Enter");
  await page.waitForFunction(() => Number(document.querySelector("[role=slider]")?.getAttribute("aria-valuenow")) > 10);
  await playback.click();
  const paused = await progress();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(paused === await progress() && await buttonLabel() === "Play animation", "pausing Letterpress should hold the current frame");
  expect(await tableOpacity() === "1", "Letterpress should keep the tabletop opaque during the reveal");
  await playback.click();
  await page.getByRole("button", { name: "Replay animation" }).waitFor();
  expect(await progress() === "100" && await page.locator("[data-letter][data-home]").count() === 10,
    "playing Letterpress should reach the assembled title without scrolling the page");
  expect(await tableOpacity() === "1", "Letterpress should keep the tabletop visible behind the assembled title");
  const startReplay = () => playback.evaluate(button => {
    (button as HTMLButtonElement).click();
    return button.closest("[data-letterpress]")?.querySelector("[role=slider]")?.getAttribute("aria-valuenow");
  });
  expect(await startReplay() === "100", "starting replay should keep the scrubber with the assembled title");
  await page.waitForFunction(() => Number(document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow")) < 65);
  await playback.press("Enter");
  const pausedRewind = Number(await progress());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(pausedRewind > 10 && pausedRewind === Number(await progress()) && await buttonLabel() === "Play animation",
    "pausing replay should hold both the rewind and the scrubber");
  await playback.press("Enter");
  await page.waitForFunction(pausedAt => Number(document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow")) < pausedAt - 8,
    pausedRewind, { timeout: 1000 });
  await page.waitForFunction(() => document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow") === "0");
  await page.waitForFunction(() => Number(document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow")) > 10);
  await slider.press("Home");
  expect(await buttonLabel() !== "Pause animation", "using the scrubber should stop Letterpress playback");

  const waitForPile = () => page.waitForFunction(initial =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-letter]")).every((letter, index) => letter.style.transform === initial[index]),
    pile, { timeout: SETTLE_TIMEOUT_MS });
  await waitForPile();
  for (const letter of await letters.all()) {
    await letter.press("Space");
    await letter.press("Space");
  }
  await page.waitForFunction(() => document.querySelectorAll("[data-letter][data-home]").length === 10);
  expect(await progress() === "0" && await buttonLabel() === "Replay animation",
    "completing the title by hand should offer Replay while the scrubber is still at the start");
  expect(await startReplay() === "100", "replaying a hand-assembled title should rewind from the assembled position");
  await waitForPile();

  await letters.first().focus();
  await slider.focus();
  await page.keyboard.press("End");
  await page.waitForFunction(() => !document.querySelector("[data-letter]:not([data-home])"), undefined, { timeout: SETTLE_TIMEOUT_MS });
  expect(await stack() === initialStack, "scrolling Letterpress should keep overlapping letters in the same depth order");

  const firstLetter = letters.first();
  const restPose = await firstLetter.evaluate(node => (node as HTMLElement).style.transform);
  await firstLetter.hover();
  await page.mouse.down();
  await held.waitFor();
  await page.mouse.wheel(0, 120);
  expect((await state(page)).path === route, "a wheel step during a Letterpress grab should keep the deck in place");
  await page.keyboard.press("Escape");
  expect(await held.count() === 0, "Escape should release the Letterpress pointer even while the scrubber has focus");
  await page.mouse.up();

  const waitForRest = () => page.waitForFunction(pose =>
    document.querySelector<HTMLElement>('[data-letter="0"]')?.style.transform === pose, restPose, { timeout: SETTLE_TIMEOUT_MS });
  await waitForRest();
  await firstLetter.evaluate(node => {
    node.addEventListener("pointerdown", event => {
      if (event instanceof PointerEvent) node.dataset.testPointer = [event.pointerId, event.clientX, event.clientY].join(",");
    }, { once: true });
  });
  await firstLetter.hover();
  await page.mouse.down();
  const releaseShift = await firstLetter.evaluate(node => {
    const before = node.getBoundingClientRect();
    const [pointerId, x, y] = (node.dataset.testPointer ?? "").split(",").map(Number);
    node.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId,
      clientX: x! + 40,
      clientY: y,
    }));
    const after = node.getBoundingClientRect();
    return after.left + after.width / 2 - before.left - before.width / 2;
  });
  expect(Math.abs(releaseShift - 40) < 3, `Letterpress should spring from the release coordinates, shifting 40px here: ${releaseShift.toFixed(2)}px`);
  await page.mouse.up();

  await waitForRest();
  const slot = await firstLetter.boundingBox();
  if (!slot) throw new Error("Letterpress should show the first letter in its slot.");
  await slider.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  expect(await firstLetter.evaluate(node => node.matches(":focus-visible")), "the first Letterpress letter should retain its keyboard focus ring");
  const visibleDepth = () => letters.evaluateAll(nodes => nodes.slice(0, 2).map(node => Number(getComputedStyle(node).zIndex)));
  await letters.nth(1).hover();
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 4 });
  const liftedDepths = await visibleDepth();
  expect(liftedDepths[1]! > liftedDepths[0]!, "a held Letterpress letter should stay in front of the focused letter");
  await page.mouse.up();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const depths = await visibleDepth();
  expect(depths[1]! > depths[0]!, "the latest overlapping drop should stay in front of the focused letter");
  await page.mouse.down();
  expect(await held.getAttribute("data-letter") === "1", "re-grabbing a visible returning letter should keep that letter");
  await page.mouse.up();

  const scene = page.locator("[data-letterpress]");
  const handOff = async (delta: number, neighbor: string, edge: string) => {
    const bounds = await scene.boundingBox();
    if (!bounds) throw new Error("Letterpress should show its scene at the wheel boundary.");
    await page.mouse.move(bounds.x + bounds.width / 4, bounds.y + bounds.height / 3);
    await page.mouse.wheel(0, delta);
    await page.waitForFunction(({ route, edge }) => location.pathname !== route ||
      document.querySelector("[data-letterpress] [role=slider]")?.getAttribute("aria-valuenow") !== edge,
    { route, edge }, { timeout: SETTLE_TIMEOUT_MS });
    expect((await state(page)).path === neighbor, `a fresh outward wheel step should page from Letterpress to ${neighbor}`);
    expect(await scene.locator("[role=slider]").getAttribute("aria-valuenow") === edge, "paging should leave Letterpress at the same boundary");
  };
  const index = cards.findIndex(card => card.slug === LETTERPRESS);
  await handOff(120, livePath(cards[index + 1]!.slug), "100");
  await page.goto(`${origin}${route}`);
  await settle(page, current => current.path === route && isPageOf(current, "Letterpress"));
  await scene.locator("[data-ready]").waitFor();
  await handOff(-120, livePath(cards[index - 1]!.slug), "0");
}

async function checkLetterpressInWebKit() {
  const engine = await webkit.launch();
  try {
    const page = await engine.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    const route = livePath(LETTERPRESS);
    await page.goto(`${origin}${route}`);
    await settle(page, current => current.path === route && isPageOf(current, "Letterpress"));
    await page.locator("[data-letterpress] [data-ready]").waitFor();
    for (const [x, y, glyph] of [[553.5, 509.5, "7"], [603.5, 465.5, "0"]] as const) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      const lifted = await page.locator("[data-lifted]").evaluateAll(nodes => nodes[0]?.getAttribute("data-letter"));
      expect(lifted === glyph, `the visible glyph at (${x}, ${y}) should lift in WebKit; expected ${glyph}, picked ${lifted}`);
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
  } finally {
    await engine.close();
  }
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
      if (slug === LETTERPRESS) await checkLetterpressRouting(page);
    }
  }
  await checkKeyboardFocus(page);
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
  if (process.argv.includes("--webkit")) await checkLetterpressInWebKit();
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`The Live routes misbehave in a browser:\n${failures.map(failure => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`Links, history, and direct paths work for all ${cards.length} cards.`);
