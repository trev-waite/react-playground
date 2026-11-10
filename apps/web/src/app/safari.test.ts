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

  test("the fixed bar at the top edge stays transparent; its button's glass is on a pseudo-element", async () => {
    const chrome = "src/app/deck/DeckChrome.module.css";
    const bar = await rule(chrome, ".bar");
    expect(bar).toContain("position: fixed");
    expect(bar).not.toMatch(/background|backdrop-filter|opacity/);
    expect(await rule(chrome, ".viewButton")).toContain("background: transparent");
    expect(await rule(chrome, ".pager,\n.viewButton::before")).toContain("backdrop-filter");
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

  test("drawings redrawn every frame have their own layer", async () => {
    expect(await rule("src/live/shells/ConfigurableShell/ExamplePreview.module.css", ".svg")).toContain(
      "will-change: transform",
    );
    for (const file of ["src/live/svgs/BlobPet/BlobPet.tsx", "src/experimental/ideas/BlobPet/source.tsx"]) {
      expect(await read(file)).toContain('willChange: "transform"');
    }
  });
});
