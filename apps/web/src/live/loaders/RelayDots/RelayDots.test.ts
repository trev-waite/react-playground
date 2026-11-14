import { describe, expect, test } from "bun:test";
import path from "node:path";
import { cssRules, declarations, ruleFor, stripCssComments } from "@/lint/source";
import { DOT_COUNT, lapOffset, relaySlot } from "./RelayDots";

const css = stripCssComments(await Bun.file(path.join(import.meta.dir, "RelayDots.module.css")).text());

function keyframes(name: string): string {
  return new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? "";
}

describe("Relay Dots handoff", () => {
  test("every handoff fills each slot exactly once", () => {
    for (let step = 0; step < DOT_COUNT * 2; step++) {
      const slots = Array.from({ length: DOT_COUNT }, (_, index) => relaySlot(index, step));
      expect(slots.toSorted()).toEqual([0, 1, 2, 3]);
    }
  });

  test("the dot in front hops to the back while the rest move up one slot", () => {
    for (let index = 0; index < DOT_COUNT; index++) {
      const from = relaySlot(index, 0);
      expect(relaySlot(index, 1)).toBe(from === 0 ? DOT_COUNT - 1 : from - 1);
    }
  });

  test("a dot's place in its lap matches the slot the slide keyframes put it in", () => {
    const stops = new Map<number, string>();
    for (const rule of cssRules(keyframes("relay-slide"))) {
      for (const stop of rule.selector.split(",")) {
        stops.set(Number.parseFloat(stop), declarations(rule.body, "translate")[0]!);
      }
    }
    const pitches = (value: string) => (value.startsWith("0") ? 0 : Number(/\* (\d)/.exec(value)?.[1] ?? 1));
    for (let slot = 0; slot < DOT_COUNT; slot++) {
      const percent = (lapOffset(slot) / DOT_COUNT) * 100;
      expect(pitches(stops.get(percent)!)).toBe(slot);
    }
  });
});

describe("Relay Dots motion contract", () => {
  test("the dots move only by translate, scale, and opacity", () => {
    for (const name of ["relay-slide", "relay-hop", "relay-breathe"]) {
      const properties = new Set(
        cssRules(keyframes(name)).flatMap(rule => [...rule.body.matchAll(/([a-z-]+)\s*:/g)].map(match => match[1]!)),
      );
      for (const property of properties) expect(["translate", "scale", "opacity", "animation-timing-function"]).toContain(property);
    }
  });

  test("reduced motion holds each dot in its slot and only brightens them in turn", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(declarations(ruleFor(reduced, ".lane").body, "animation")).toEqual(["none"]);
    expect(declarations(ruleFor(reduced, ".dot").body, "animation")[0]).toStartWith("relay-breathe");
  });
});
