import { describe, expect, test } from "bun:test";
import path from "node:path";
import { cssRules, declarations, ruleFor, splitTopLevel, stripCssComments } from "@/lint/source";

const css = await Bun.file(path.join(import.meta.dir, "MenuPill.module.css")).text();
const component = await Bun.file(path.join(import.meta.dir, "MenuPill.tsx")).text();

/** The duration, easing and delay a rule's `transition` gives one property. */
function timingOf(selector: string, property: string): string {
  const parts = declarations(ruleFor(css, selector).body, "transition").flatMap(splitTopLevel);
  const part = parts.find(entry => entry.split(/\s+/)[0] === property);
  if (!part) throw new Error(`"${selector}" does not transition ${property}`);
  return part.slice(property.length).trim();
}

function revealProperties(selector: string): string[] {
  const [value] = declarations(ruleFor(css, selector).body, "--reveal-transition");
  return splitTopLevel(value ?? "").map(part => part.split(/\s+/)[0]!);
}

describe("MenuPill motion contract", () => {
  test("the word clip opens and closes on the pill's own duration and curve", () => {
    expect(timingOf(".root[data-open] .links", "clip-path")).toBe(timingOf(".root[data-open] .pill", "width"));
    expect(timingOf(".links", "clip-path")).toBe(timingOf(".pill", "width"));
  });

  test("open and close timing has one source, revealTiming.ts", () => {
    for (const name of ["--open-duration", "--close-duration", "--open-ease", "--close-ease", "--pill-closed-width"]) {
      expect(stripCssComments(css)).not.toContain(`${name}:`);
      expect(component).toContain(`"${name}"`);
    }
  });

  test("words fade in on their measured stagger and animate only compositor properties", () => {
    expect(revealProperties(".links > *")).toEqual(["opacity", "translate"]);
    expect(revealProperties(".root[data-open] .links > *")).toEqual(["opacity", "translate"]);
    expect(declarations(ruleFor(css, ".root[data-open] .links > *").body, "--reveal-transition")[0]).toContain(
      "var(--reveal-delay",
    );
  });

  test("reduced motion stops the pill, the clip and every word", () => {
    const reduced = cssRules(css).filter(rule => declarations(rule.body, "transition").includes("none"));
    const selectors = reduced.flatMap(rule => rule.selector.split(",").map(part => part.trim()));
    for (const selector of [".pill", ".links", ".links > *", ".item", ".trigger"]) expect(selectors).toContain(selector);
  });
});
