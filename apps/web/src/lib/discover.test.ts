import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import {
  cardFromPlan,
  cardIndexForSlug,
  catalogEntriesFromLoaders,
  familiesFromModules,
  liveSlugFromPath,
  planCards,
  slugFromPreviewPath,
  titleFromSlug,
} from "./catalog";
import type { CardMeta, PlaygroundEntry, PreviewModule } from "./types";

const liveRoot = path.join(import.meta.dir, "../live");
const Preview = () => null;
const loaded: Promise<PreviewModule> = Promise.resolve({ default: Preview });
const moduleFor = () => loaded;

function entry(slug: string, meta?: CardMeta): PlaygroundEntry {
  return { slug, title: meta?.title ?? titleFromSlug(slug), meta, load: () => loaded };
}

describe("live catalog", () => {
  test("reads the Live slug from the URL path", () => {
    expect(liveSlugFromPath("/")).toBeNull();
    expect(liveSlugFromPath("/buttons/PrimaryButton")).toBe("buttons/PrimaryButton");
    expect(liveSlugFromPath("/buttons/PrimaryButton/")).toBe("buttons/PrimaryButton");
  });

  test("maps Vite glob paths to Live slugs", () => {
    const entries = catalogEntriesFromLoaders({
      "../live/shaders/LightDispersion/preview.tsx": async () => ({ default: Preview }),
    });
    expect(entries).toEqual([
      {
        slug: "shaders/LightDispersion",
        title: "Light Dispersion",
        load: expect.any(Function),
      },
    ]);
    expect(slugFromPreviewPath("../live/buttons/PrimaryButton/preview.tsx")).toBe(
      "buttons/PrimaryButton",
    );
    expect(titleFromSlug("buttons/PrimaryButton")).toBe("Primary Button");
  });

  test("takes titles from the static preview meta, before any component loads", () => {
    const entries = catalogEntriesFromLoaders(
      { "../live/shaders/LightDispersion/preview.tsx": () => loaded },
      { "../live/shaders/LightDispersion/preview.tsx": { title: "Light", size: "wide" } },
    );
    expect(entries[0]).toMatchObject({ title: "Light", meta: { title: "Light", size: "wide" } });
  });

  test("keys family metadata by Live folder", () => {
    expect(
      familiesFromModules({
        "../live/controls/family.ts": { title: "Controls" },
        "../live/controls/Switch/family.ts": { title: "Ignored" },
      }),
    ).toEqual({ controls: { title: "Controls" } });
  });

  test("keeps a Light Dispersion preview on disk for the Vite glob", async () => {
    const slugs: string[] = [];
    for await (const file of new Glob("**/preview.tsx").scan({
      cwd: liveRoot,
      onlyFiles: true,
    })) {
      slugs.push(file.replace(/\/preview\.tsx$/, "").replace(/\\/g, "/"));
    }
    expect(slugs).toContain("shaders/LightDispersion");
  });
});

describe("planCards", () => {
  test("gives each component its own card unless its folder is a family", () => {
    const plans = planCards({
      entries: [
        entry("buttons/PrimaryButton"),
        entry("controls/Stepper"),
        entry("controls/Switch"),
        entry("shaders/LightDispersion"),
      ],
      families: { controls: { title: "Controls", size: "wide" } },
      order: [],
    });

    expect(plans.map(plan => [plan.slug, plan.entries.map(item => item.slug)])).toEqual([
      ["buttons/PrimaryButton", ["buttons/PrimaryButton"]],
      ["controls", ["controls/Stepper", "controls/Switch"]],
      ["shaders/LightDispersion", ["shaders/LightDispersion"]],
    ]);
  });

  test("puts cards in the catalog order, then the rest alphabetically", () => {
    const plans = planCards({
      entries: [
        entry("buttons/PrimaryButton"),
        entry("controls/Switch"),
        entry("shaders/LightDispersion"),
        entry("tools/SpacingTidy"),
      ],
      families: { controls: { title: "Controls" } },
      order: ["shaders/LightDispersion", "controls", "shells/Missing"],
    });

    expect(plans.map(plan => plan.slug)).toEqual([
      "shaders/LightDispersion",
      "controls",
      "buttons/PrimaryButton",
      "tools/SpacingTidy",
    ]);
  });
});

describe("cardFromPlan", () => {
  test("reads a single component's presentation from its static meta and hands over its module", () => {
    const meta: CardMeta = { title: "Light", size: "wide", theme: "dark", reset: "replay" };
    const card = cardFromPlan(
      { slug: "shaders/LightDispersion", entries: [entry("shaders/LightDispersion", meta)] },
      moduleFor,
    );
    expect(card).toMatchObject({
      slug: "shaders/LightDispersion",
      title: "Light",
      size: "wide",
      theme: "dark",
      reset: "replay",
    });
    expect(card.members[0]?.module).toBe(loaded);
  });

  test("lets the family meta present a grouped card", () => {
    const card = cardFromPlan(
      {
        slug: "controls",
        family: { title: "Controls", size: "large", background: "#2448d8" },
        entries: [entry("controls/Stepper", { size: "tall" }), entry("controls/Switch")],
      },
      moduleFor,
    );
    expect(card).toMatchObject({ title: "Controls", size: "large", background: "#2448d8", theme: "light" });
    expect(card.members.map(member => member.title)).toEqual(["Stepper", "Switch"]);
  });

  test("defaults to a plain 1×1 card", () => {
    const card = cardFromPlan({ slug: "buttons/Plain", entries: [entry("buttons/Plain")] }, moduleFor);
    expect(card).toMatchObject({ title: "Plain", size: "small", theme: "light" });
  });
});

describe("cardIndexForSlug", () => {
  const cards = [
    cardFromPlan({ slug: "buttons/PrimaryButton", entries: [entry("buttons/PrimaryButton")] }, moduleFor),
    cardFromPlan({ slug: "controls", family: { title: "Controls" }, entries: [entry("controls/Switch")] }, moduleFor),
  ];

  test("finds a card by its own slug or a family member's", () => {
    expect(cardIndexForSlug(cards, "buttons/PrimaryButton")).toBe(0);
    expect(cardIndexForSlug(cards, "controls")).toBe(1);
    expect(cardIndexForSlug(cards, "controls/Switch")).toBe(1);
  });

  test("reports a missing slug", () => {
    expect(cardIndexForSlug(cards, null)).toBe(-1);
    expect(cardIndexForSlug(cards, "buttons/Gone")).toBe(-1);
  });
});
