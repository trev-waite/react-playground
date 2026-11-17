import { beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { placeUnseen } from "./placeUnseen";

/** Stands in for the frame loop: holds what was asked for and runs it a frame at a time, as a browser would. */
let pending: (() => void)[] = [];
const onFrame = (callback: () => void) => void pending.push(callback);
function nextFrame() {
  const callbacks = pending;
  pending = [];
  for (const callback of callbacks) callback();
}

function scroller() {
  const attributes = new Map<string, string>();
  const element = {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => void attributes.delete(name),
  };
  return {
    place: () => placeUnseen(element as unknown as HTMLElement, onFrame),
    set: element.setAttribute,
    placing: () => attributes.has("data-placing"),
  };
}

describe("placeUnseen", () => {
  beforeEach(() => {
    pending = [];
  });

  test("hides the pages for the frame they are placed in and shows them on the next", () => {
    const deck = scroller();
    deck.place();
    expect(deck.placing()).toBe(true);
    nextFrame();
    expect(deck.placing()).toBe(true);
    nextFrame();
    expect(deck.placing()).toBe(false);
    expect(pending).toEqual([]);
  });

  test("a placement made while the pages are unseen keeps them so for its own frame, then shows them", () => {
    const deck = scroller();
    deck.place();
    nextFrame();
    deck.place();
    nextFrame();
    expect(deck.placing()).toBe(true);
    nextFrame();
    expect(deck.placing()).toBe(false);
  });

  test("shows the pages again whatever the deck does next, such as flying back out before they were seen", () => {
    const deck = scroller();
    deck.place();
    deck.set("data-layout", "flight");
    deck.set("data-flying", "");
    nextFrame();
    nextFrame();
    expect(deck.placing()).toBe(false);
  });
});

describe("the pages a landing hides", () => {
  const read = (file: string) => readFile(path.resolve(import.meta.dirname, file), "utf8");

  test("are every card but the open one, which is marked as current", async () => {
    expect(await read("CardDeck.module.css")).toMatch(
      /\.scroller\[data-placing\] \.content > :not\(\[data-current\]\) \{\s*visibility: hidden;\s*\}/,
    );
    expect(await read("DeckCard.tsx")).toContain("data-current={current || undefined}");
  });

  test("are hidden only when a flight lands, as the pages are placed", async () => {
    const deck = await read("CardDeck.tsx");
    expect(deck.match(/placeUnseen\(/g)).toHaveLength(1);
    expect(deck).toMatch(/const landPages = \(\) => \{\s*placeUnseen\(scroller\);/);
  });
});
