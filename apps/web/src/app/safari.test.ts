import { describe, expect, test } from "bun:test";
import path from "node:path";

const web = path.join(import.meta.dir, "../..");
const read = (file: string) => Bun.file(path.join(web, file)).text();

/** The declarations of the first rule whose selector is exactly `selector`. */
async function rule(file: string, selector: string): Promise<string> {
  const css = await read(file);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`${file} has no rule for ${selector}`);
  return match[1]!;
}

describe("Safari on phones", () => {
  test("the page runs under the toolbars, so they can be glass", async () => {
    expect(await read("index.html")).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  test("phones scroll the document, never the deck's own scroller", async () => {
    const unlocked = await rule(
      "src/app/app.css",
      ':root[data-scroll="document"],\n:root[data-scroll="document"] body,\n:root[data-scroll="document"] #root',
    );
    expect(unlocked).toContain("overflow: visible");
    expect(await read("src/app/deck/CardDeck.module.css")).toMatch(
      /:global\(:root\[data-scroll="document"\]\):has\([^)]*data-layout="pages"[^{]*\{\s*scroll-snap-type: y mandatory/,
    );
  });

  test("only the deployed Live app opts into document scrolling", async () => {
    expect(await read("src/app/LiveApp.tsx")).toMatch(/<LivePage[^>]*documentScroll/);
    expect(await read("src/studio/StudioApp.tsx")).not.toContain("documentScroll");
  });

  test("the fixed bar at the top edge stays transparent; its glass is on a child or pseudo-element", async () => {
    const chrome = "src/app/deck/DeckChrome.module.css";
    const bar = await rule(chrome, ".bar");
    expect(bar).toContain("position: fixed");
    expect(bar).not.toMatch(/background|backdrop-filter|opacity/);
    const fill = /^\s*(?:background|backdrop-filter)\s*:/m;
    expect(await rule(chrome, ".backPill")).not.toMatch(fill);
    expect(await rule(chrome, ".glassCircle")).not.toMatch(fill);
    expect(await rule(chrome, ".pager,\n.glass,\n.glassCircle::before")).toContain("backdrop-filter");
  });

  test("a jump to a page turns snapping off until Safari has painted the page there", async () => {
    const deck = await read("src/app/deck/CardDeck.tsx");
    expect(await rule("src/app/deck/CardDeck.module.css", '.scroller[data-layout="pages"][data-gliding]')).toContain(
      "scroll-snap-type: none",
    );
    expect(deck).toMatch(/setAttribute\("data-gliding", ""\);\s*host\.scrollTop = top;\s*resumeSnap\(\);/);
    expect(deck).toMatch(/frameLoop\.render\(\(\) =>\s*frameLoop\.render\(\(\) => \{[^}]*removeAttribute\("data-gliding"\)/);
  });

  test("a flight holds the page still with a cancelled touchmove, which Safari never leaves behind", async () => {
    const deck = await read("src/app/deck/CardDeck.tsx");
    expect(deck).toContain('window.addEventListener("touchmove", holdTouch, { passive: false })');
    expect(deck).toContain('window.removeEventListener("touchmove", holdTouch)');
  });

  test("sideways sliders claim a finger in a cancelable touchmove, since pan-y still pans a diagonal swipe", async () => {
    const control = await read("src/live/shells/ConfigurableShell/ProximityControl.tsx");
    expect(control).toContain('addEventListener("touchmove", onTouchMove, { passive: false })');
    expect(control).toMatch(/touchIntent\([^)]*\)[\s\S]*event\.preventDefault\(\)/);
  });

  test("the chrome and the cards keep clear of the notch and the home indicator", async () => {
    expect(await rule("src/app/deck/DeckChrome.module.css", ".bar")).toContain("var(--safe-top)");
    expect(await rule("src/app/deck/DeckCard.module.css", ".footer")).toContain("var(--safe-bottom)");
    expect(await rule("src/app/deck/CardDeck.module.css", ".probe")).toMatch(
      /padding: var\(--safe-top\) var\(--safe-right\) var\(--safe-bottom\) var\(--safe-left\)/,
    );
  });
});

describe("Safari frame rate", () => {
  test("every card is composited while the camera flies, and the opening card drops its soft shadow", async () => {
    const deck = "src/app/deck/CardDeck.module.css";
    expect(await rule(deck, ".scroller[data-flying] .content > *")).toContain("will-change: transform");
    expect(await rule(deck, ".scroller[data-flying] .content > [data-raised]")).toContain(
      "box-shadow: var(--card-shadow-contact)",
    );
  });

  test("previews give up their own layers and blurs in flight, which split the shell into dozens repainted per frame", async () => {
    const flying = await rule(
      "src/app/deck/CardDeck.module.css",
      ".scroller[data-flying] .content > * *,\n.scroller[data-flying] .content > * *::before,\n.scroller[data-flying] .content > * *::after",
    );
    expect(flying).toContain("will-change: auto !important");
    expect(flying).toContain("backdrop-filter: none !important");
    expect(flying).toContain("-webkit-backdrop-filter: none !important");
  });

  test("previews blend their tile and page layouts as the card flies, so an elastic preview never pops", async () => {
    const card = await read("src/app/deck/DeckCard.tsx");
    expect(card).toMatch(/<FitStage[^>]*progress=\{chrome\}/);
    expect(card).toContain("observeFit(area, content, progress)");
  });

  test("paging never moves the raise between page cards, which made Safari repaint both", async () => {
    expect(await read("src/app/deck/CardDeck.tsx")).toMatch(/raised=\{layout !== "pages" && index === activeIndex\}/);
  });

  test("drawings redrawn every frame have their own layer", async () => {
    expect(await rule("src/live/shells/ConfigurableShell/ExamplePreview.module.css", ".svg")).toContain(
      "will-change: transform",
    );
    for (const file of ["src/live/svgs/BlobPet/BlobPet.tsx", "src/experimental/ideas/BlobPet/source.tsx"]) {
      expect(await read(file)).toContain('willChange: "transform"');
    }
  });
});
