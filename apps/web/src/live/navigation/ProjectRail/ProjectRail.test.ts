import { describe, expect, test } from "bun:test";
import path from "node:path";
import { cssRules, declarations, ruleFor, transitionedProperties } from "@/lint/source";
import { lineInfluence } from "./ProjectRail";

describe("ProjectRail line influence", () => {
  test("only the active dash is raised when nothing is hovered", () => {
    expect([0, 1, 2].map(i => lineInfluence(i, 1, null))).toEqual([0, 1, 0]);
  });

  test("hover swells the hovered dash most and fades over three neighbors", () => {
    expect([0, 1, 2, 3, 4, 5].map(i => lineInfluence(i, 0, 3))).toEqual([1, 1, 2, 3, 2, 1]);
  });
});

describe("ProjectRail title rendering", () => {
  test("title letters pop in without a blur and leave no filter behind once they land", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "ProjectRail.module.css")).text();
    const keyframes = css.slice(css.indexOf("@keyframes character-in"));
    expect(cssRules(keyframes).some(rule => declarations(rule.body, "filter").length > 0)).toBe(false);
    expect(declarations(ruleFor(css, ".title[data-reveal] .character").body, "animation")[0]).toMatch(/\bbackwards$/);
    expect(declarations(ruleFor(css, ".item[data-selected] .header").body, "filter")).toEqual([]);
  });
});

describe("ProjectRail pill corners", () => {
  test("the dash, the pill, and the open card share one radius, which never animates", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "ProjectRail.module.css")).text();
    expect(declarations(ruleFor(css, ".rail").body, "--open-radius")).toEqual(["calc(var(--toggle-size) / 2)"]);
    expect(declarations(ruleFor(css, ".morph").body, "border-radius")).toEqual(["var(--open-radius)"]);
    for (const selector of [".item[data-selected] .morph", ".item[data-open] .morph"]) {
      expect(declarations(ruleFor(css, selector).body, "border-radius")).toEqual([]);
    }
    expect(cssRules(css).some(rule => transitionedProperties(rule).includes("border-radius"))).toBe(false);
  });
});

describe("ProjectRail switching", () => {
  test("the pill is a full touch target", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "ProjectRail.module.css")).text();
    expect(declarations(ruleFor(css, ".rail").body, "--toggle-size")).toEqual(["44px"]);
  });

  test("title letters animate without a compositing layer each, which cost Safari frames on every switch", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "ProjectRail.module.css")).text();
    const keyframes = css.slice(css.indexOf("@keyframes character-in"));
    for (const property of ["transform", "opacity", "translate", "scale"]) {
      expect(cssRules(keyframes).some(rule => declarations(rule.body, property).length > 0)).toBe(false);
    }
  });

  test("a long title finishes revealing in a fixed time", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "ProjectRail.module.css")).text();
    expect(declarations(ruleFor(css, ".title[data-reveal] .character").body, "animation-delay")[0]).toMatch(/min\(/);
  });
});
