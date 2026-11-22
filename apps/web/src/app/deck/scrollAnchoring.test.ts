import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const css = readFileSync(path.join(import.meta.dir, "CardDeck.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The selectors of every rule that declares `overflow-anchor: none`. */
function optedOut(): string[] {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter(([, , body]) => /(^|;)\s*overflow-anchor\s*:\s*none\s*(;|$)/.test(body!))
    .flatMap(([, selectors]) => selectors!.split(",").map(selector => selector.trim()));
}

describe("the deck's scroll", () => {
  // Safari anchors the scroll to a card once the reader has scrolled, and moves the scroll to hold
  // that card still while a flight moves it: the page lands short of its place, then jumps.
  test("opts out of scroll anchoring wherever the deck scrolls: its own scroller, and the document on phones", () => {
    expect(optedOut()).toEqual(expect.arrayContaining([".scroller", ':global(:root[data-scroll="document"])']));
  });
});
