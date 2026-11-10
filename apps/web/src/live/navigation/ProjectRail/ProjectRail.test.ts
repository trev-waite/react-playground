import { describe, expect, test } from "bun:test";
import path from "node:path";
import { cssRules, declarations, ruleFor } from "@/lint/source";
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
    expect(declarations(ruleFor(css, ".character").body, "animation")[0]).toMatch(/\bbackwards$/);
    expect(declarations(ruleFor(css, ".item[data-selected] .header").body, "filter")).toEqual([]);
  });
});

describe("ProjectRail pill corners", () => {
  test("the pill keeps one corner radius, half its height, as it opens into a card", async () => {
    const css = await Bun.file(path.join(import.meta.dir, "ProjectRail.module.css")).text();
    expect(declarations(ruleFor(css, ".rail").body, "--open-radius")).toEqual(["calc(var(--toggle-size) / 2)"]);
    expect(declarations(ruleFor(css, ".item[data-selected] .morph").body, "border-radius")).toEqual([
      "var(--open-radius)",
    ]);
    expect(declarations(ruleFor(css, ".item[data-open] .morph").body, "border-radius")).toEqual([]);
  });
});
