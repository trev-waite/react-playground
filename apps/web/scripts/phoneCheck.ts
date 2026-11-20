import path from "node:path";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chromium, type Locator, type Page } from "playwright";
import { preview } from "vite";
import type { SourceFile } from "../src/lib/types.ts";
import { FRONT_PITCH, FRONT_YAW, orbitRadiansPerPixel } from "../src/live/particles/GandalfHologram/orbit.ts";

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

async function checkPortableHologram(page: Page) {
  const slug = "particles/GandalfHologram";
  const sources = await Bun.file(path.join(webRoot, "dist/code", slug + ".json")).json() as SourceFile[];
  const [source] = sources;
  if (sources.length !== 1 || !source) throw new Error("Gandalf’s Hat must be exported as one file.");
  const directory = await mkdtemp(path.join(tmpdir(), "portable-hologram-"));
  try {
    const dependencies = path.join(directory, "node_modules");
    await mkdir(dependencies);
    await Promise.all(["react", "react-dom"].map(name =>
      symlink(path.join(webRoot, "node_modules", name), path.join(dependencies, name), "dir"),
    ));
    const entry = path.join(directory, "GandalfHologram.tsx");
    const mount = 'import { createRoot } from "react-dom/client"; createRoot(document.querySelector("#root")!).render(<GandalfHologram />);';
    await Bun.write(entry, source.code + "\n" + mount);
    const bundle = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const script = bundle.outputs[0];
    if (!script) throw new Error("The downloaded hat component did not bundle.");
    await page.goto("about:blank");
    await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><div id="root" style="width:360px"></div>');
    await page.addScriptTag({ content: await script.text(), type: "module" });
    const canvas = page.locator("#root canvas");
    await canvas.waitFor({ state: "attached" });
    const size = await canvas.boundingBox();
    if (!size || size.height < 200) failures.push("The downloaded hat component collapses inside an auto-height host.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function checkTouchRelease(canvas: Locator) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The landscape hologram has no canvas for the touch check.");
  const page = canvas.page();
  const input = await page.context().newCDPSession(page);
  const pose = () => canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
    const heading = gl.getUniform(program, gl.getUniformLocation(program, "uYaw")!) as Float32Array;
    const tilt = gl.getUniform(program, gl.getUniformLocation(program, "uPitch")!) as Float32Array;
    const drop = gl.getUniform(program, gl.getUniformLocation(program, "uDrop")!) as number;
    return { yaw: Math.atan2(heading[1]!, heading[0]!), pitch: Math.atan2(tilt[1]!, tilt[0]!), drop };
  });
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", xOffset = 0, yOffset = 0) =>
    input.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: box.x + box.width / 2 + xOffset, y: box.y + box.height / 2 + yOffset }],
    });

  await page.touchscreen.tap(box.x + 3, box.y + 3);
  if ((await pose()).drop >= 0) failures.push("Tapping outside the hat made the dots fall.");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  for (const falling of [true, false]) {
    await canvas.evaluate((element, falling) => new Promise<void>((resolve, reject) => {
      const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
      const drop = gl.getUniformLocation(program, "uDrop")!;
      const start = performance.now();
      const check = () => {
        if ((gl.getUniform(program, drop) >= 0) === falling) resolve();
        else if (performance.now() - start > 4500) reject(new Error(falling ? "The hat did not fall on tap." : "The hat did not reform."));
        else requestAnimationFrame(check);
      };
      check();
    }), falling);
  }

  const route = page.url();
  await touch("touchStart");
  for (const offset of [4, 9, 16, 24, 34]) await touch("touchMove", 0, offset);
  await touch("touchEnd");
  await page.waitForTimeout(450);
  const vertical = await pose();
  if (vertical.pitch < FRONT_PITCH + 0.5 || Math.abs(vertical.yaw - FRONT_YAW) > 0.01 || vertical.drop >= 0 || page.url() !== route) {
    failures.push("A vertical drag starting on the hat should tilt it without paging or dropping the dots.");
  }
  await page.getByRole("button", { name: "Drop the dots" }).press("Home");
  await page.waitForTimeout(600);
  const reset = await pose();
  if (Math.abs(reset.pitch - FRONT_PITCH) > 0.01 || Math.abs(reset.yaw - FRONT_YAW) > 0.01) {
    failures.push("Home should return both rotation axes of the hat to the front.");
  }

  for (const [label, offsets, pace] of [
    ["slow touch", [1, 2, 3, 4, 5, 6, 7, 8], 100],
    ["slow orbit", [8, 11, 14, 17, 20], 120],
    ["flick", [8, 15, 22, 34], 0],
  ] as const) {
    const start = (await pose()).yaw;
    await touch("touchStart");
    for (const offset of offsets) {
      if (pace) await page.waitForTimeout(pace);
      await touch("touchMove", offset);
    }
    await touch("touchEnd");
    await page.waitForTimeout(450);
    const drag = offsets.at(-1)! * orbitRadiansPerPixel(box.width, box.height);
    const released = await pose();
    const coast = released.yaw - start - drag;
    if (released.drop >= 0) failures.push(`The hat fell during ${label}.`);
    if (pace ? Math.abs(coast) > 0.035 : coast < 0.04) {
      failures.push(`The hat's ${label} coasted ${coast.toFixed(2)} rad beyond the held drag.`);
    }
  }
}

async function checkHologramStage(card: Locator, width: number, height: number) {
  const scene = card.locator("[data-projecting], [data-still]");
  await scene.waitFor({ state: "attached" });
  const live = await scene.evaluate(element => element.hasAttribute("data-projecting"));
  const canvas = scene.locator("canvas");
  const artwork = await canvas.boundingBox();
  if (!artwork || artwork.height < 64) {
    failures.push(`The hat’s artwork is too short at ${width}×${height}.`);
  }
  if (live) {
    const target = scene.getByRole("button", { name: "Drop the dots" });
    const usable = await target.evaluate(button => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return width >= 44 && height >= 44 && button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    });
    if (!usable) failures.push(`The hat does not receive input at ${width}×${height}.`);
  }
  return live ? canvas : null;
}

async function checkCompactHologram() {
  const sizes = [
    [320, 280], [320, 310], [375, 320], [375, 321], [375, 374], [375, 375], [375, 376],
    [450, 280], [450, 320], [480, 320], [568, 320], [667, 375], [874, 402],
  ] as const;
  for (const [width, height] of sizes) {
    const viewport = { width, height };
    const context = await browser.newContext({ ...PHONE, viewport });
    const card = await openPage(await context.newPage(), "Gandalf’s Hat");
    const canvas = await checkHologramStage(card, width, height);
    if (canvas && width === 450 && height === 320) await checkTouchRelease(canvas);
    await context.close();
  }
}

async function checkLargeText() {
  const largeText = await chromium.launch({ args: ["--blink-settings=defaultFontSize=32"] });
  try {
    for (const [width, height] of [[320, 280], [375, 375]] as const) {
      const page = await largeText.newPage({ ...PHONE, viewport: { width, height } });
      const card = await openPage(page, "Gandalf’s Hat");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const rootFont = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      if (rootFont !== "32px") failures.push(`The large-text check ran at ${rootFont} instead of 32px.`);
      await checkHologramStage(card, width, height);
      const caption = card.getByRole("region", { name: "Gandalf’s Hat" });
      const thumb = card.locator("[data-caption-scroll] > span");
      const thumbBefore = await thumb.count() ? await thumb.boundingBox() : null;
      const route = page.url();
      if (await caption.count()) {
        await caption.focus();
        await page.keyboard.press("PageDown");
        const scrolled = await page.waitForFunction(() => (document.activeElement?.scrollTop ?? 0) > 0, undefined, { timeout: 2000 })
          .then(() => true, () => false);
        const thumbAfter = thumbBefore && await thumb.boundingBox();
        if (!thumbBefore || !thumbAfter || thumbAfter.y <= thumbBefore.y) {
          failures.push(`At ${width}×${height} with a 32px default font, the caption should show its scroll position.`);
        }
        await page.keyboard.press("Tab");
        const codeFocused = await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup") === "dialog");
        if (scrolled && codeFocused && page.url() === route) {
          await page.close();
          continue;
        }
      }
      failures.push(`At ${width}×${height} with a 32px default font, the caption should scroll by keyboard and keep Code reachable.`);
      await page.close();
    }
  } finally {
    await largeText.close();
  }
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
    const fit = card.locator('[class*="_fit_"]');
    const transform = await fit.evaluate(element => (element as HTMLElement).style.transform);
    const scale = /scale\(([\d.]+)\)/.exec(transform)?.[1];
    if (scale && Number(scale) < MIN_SCALE) {
      failures.push(
        `${title} is scaled to ${Math.round(Number(scale) * 100)}% to fit the page. ` +
          "Give it a phone layout (a `@media (max-width: 48rem)` rule) so it fits unscaled.",
      );
    }
    if (title === "Gandalf’s Hat") {
      const stage = await fit.boundingBox();
      const portrait = await fit.locator("canvas").boundingBox();
      if (!stage || !portrait || portrait.x < stage.x - 1 || portrait.x + portrait.width > stage.x + stage.width + 1) {
        failures.push("Gandalf Hologram extends beyond its phone stage.");
      }
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
  await checkPortableHologram(page);
  await checkCompactHologram();
  await checkLargeText();
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`Phone or standalone checks failed.\n${failures.map(line => `  ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(`Every card fits its ${PHONE.viewport.width}px phone page, a finger drags Spacing Tidy, and the hologram fits compact screens, large text, and a standalone host.`);
