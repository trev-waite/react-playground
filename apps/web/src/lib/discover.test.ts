import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import {
  cardFromPlan,
  cardIndexForSlug,
  catalogEntriesFromLoaders,
  familiesFromModules,
  planCards,
  slugFromPreviewPath,
  titleFromSlug,
} from "./catalog";
import { CARD_SWATCHES } from "./cardSwatches";
import type { CardSurfaces, PlaygroundEntry, PreviewMeta, PreviewModule } from "./types";

const liveRoot = path.join(import.meta.dir, "../live");
const Preview = () => null;
const loaded: Promise<PreviewModule> = Promise.resolve({ default: Preview });
const moduleFor = () => loaded;

const SURFACE: CardSurfaces = {
  light: { swatch: "paper", content: ["#111113"] },
  dark: { swatch: "blue", content: ["#111113"] },
};

function entry(slug: string, meta: PreviewMeta = { surface: SURFACE }): PlaygroundEntry {
  return { slug, title: meta?.title ?? titleFromSlug(slug), meta, load: () => loaded };
}

describe("live catalog", () => {
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
      { "../live/shaders/LightDispersion/preview.tsx": { title: "Light", size: "wide", surface: SURFACE } },
    );
    expect(entries[0]).toMatchObject({ title: "Light", meta: { title: "Light", size: "wide" } });
  });

  test("keys family metadata by Live folder", () => {
    expect(
      familiesFromModules({
        "../live/controls/family.ts": { title: "Controls", surface: SURFACE },
        "../live/controls/Switch/family.ts": { title: "Ignored", surface: SURFACE },
      }),
    ).toEqual({ controls: { title: "Controls", surface: SURFACE } });
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
      families: { controls: { title: "Controls", size: "wide", surface: SURFACE } },
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
      families: { controls: { title: "Controls", surface: SURFACE } },
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
    const surface: CardSurfaces = {
      light: { swatch: "blue", content: ["#ffffff"] },
      dark: { swatch: "green", content: ["#ffffff"] },
    };
    const card = cardFromPlan(
      {
        slug: "shaders/LightDispersion",
        entries: [entry("shaders/LightDispersion", { title: "Light", size: "wide", surface, reset: "replay" })],
      },
      moduleFor,
    );
    expect(card).toMatchObject({
      slug: "shaders/LightDispersion",
      title: "Light",
      size: "wide",
      surface: { light: CARD_SWATCHES.light.blue, dark: CARD_SWATCHES.dark.green },
      reset: "replay",
    });
    expect(card.members[0]?.module).toBe(loaded);
  });

  test("lets the family meta present a grouped card", () => {
    const surface: CardSurfaces = {
      light: { swatch: "orange", content: ["#ffffff"] },
      dark: { swatch: "orange", content: ["#ffffff"] },
    };
    const card = cardFromPlan(
      {
        slug: "controls",
        family: { title: "Controls", size: "large", surface },
        entries: [entry("controls/Stepper", { title: "Stepper" }), entry("controls/Switch", { title: "Switch" })],
      },
      moduleFor,
    );
    expect(card).toMatchObject({
      title: "Controls",
      size: "large",
      surface: { light: CARD_SWATCHES.light.orange, dark: CARD_SWATCHES.dark.orange },
    });
    expect(card.members.map(member => member.title)).toEqual(["Stepper", "Switch"]);
  });

  test("defaults to a 1×1 card titled after its slug", () => {
    const card = cardFromPlan({ slug: "buttons/Plain", entries: [entry("buttons/Plain")] }, moduleFor);
    expect(card).toMatchObject({
      title: "Plain",
      size: "small",
      surface: { light: CARD_SWATCHES.light.paper, dark: CARD_SWATCHES.dark.blue },
    });
  });

  test("refuses a lone component that never says how it looks on either site theme", () => {
    expect(() =>
      cardFromPlan({ slug: "buttons/Plain", entries: [entry("buttons/Plain", { title: "Plain" })] }, moduleFor),
    ).toThrow("buttons/Plain");
  });

  test("treats an empty surface as a missing one, with the same message", () => {
    const meta = { surface: null } as unknown as PreviewMeta;
    expect(() => cardFromPlan({ slug: "buttons/Plain", entries: [entry("buttons/Plain", meta)] }, moduleFor)).toThrow(
      "buttons/Plain: a card's meta must declare `surface`",
    );
  });

  test("names a swatch the site theme does not have, since meta is read without type checks", () => {
    const surface = { light: { swatch: "paper" }, dark: { swatch: "mist" } } as unknown as CardSurfaces;
    expect(() =>
      cardFromPlan({ slug: "buttons/Plain", entries: [entry("buttons/Plain", { surface })] }, moduleFor),
    ).toThrow('buttons/Plain: the dark site has no card swatch "mist"');
  });
});

describe("cardIndexForSlug", () => {
  const cards = [
    cardFromPlan({ slug: "buttons/PrimaryButton", entries: [entry("buttons/PrimaryButton")] }, moduleFor),
    cardFromPlan(
      { slug: "controls", family: { title: "Controls", surface: SURFACE }, entries: [entry("controls/Switch")] },
      moduleFor,
    ),
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
