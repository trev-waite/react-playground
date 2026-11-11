import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import { previewMeta } from "../../vite/previewMetaPlugin";
import { CARD_SWATCHES, cardSwatch, type CardSwatch } from "../lib/cardSwatches";
import type { CardTheme, FamilyMeta, HexColor, SiteTheme } from "../lib/types";

/** WCAG 1.4.11: what identifies a component stands 3:1 apart from what is next to it. */
const COMPONENT_CONTRAST = 3;
/** WCAG AA for the footer's body text. */
const TEXT_CONTRAST = 4.5;
/** A card reads as its own surface on the canvas, not only through its shadow. */
const CANVAS_CONTRAST = 1.2;
/** Enough tones to tell cards apart, few enough that the deck reads as one set. */
const MAX_SWATCHES = 5;

const liveRoot = import.meta.dir;
const web = path.join(liveRoot, "../..");
const SITE_THEMES: SiteTheme[] = ["light", "dark"];

type Card = { name: string; surface: unknown };
type Footer = { ink: string; bar: { color: string; alpha: number } };

async function families(): Promise<Map<string, FamilyMeta>> {
  const found = new Map<string, FamilyMeta>();
  for await (const file of new Glob("*/family.ts").scan({ cwd: liveRoot })) {
    const { meta } = (await import(path.join(liveRoot, file))) as { meta: FamilyMeta };
    found.set(path.dirname(file), meta);
  }
  return found;
}

async function previews(): Promise<{ slug: string; folder: string; meta: Record<string, unknown> }[]> {
  const found = [];
  for await (const file of new Glob("**/preview.tsx").scan({ cwd: liveRoot })) {
    const fullPath = path.join(liveRoot, file);
    const meta = previewMeta(await Bun.file(fullPath).text(), fullPath) as Record<string, unknown> | undefined;
    const slug = path.dirname(file);
    found.push({ slug, folder: slug.split("/")[0]!, meta: meta ?? {} });
  }
  return found;
}

/** Every card on the deck: each family, and each component outside one. */
async function cards(): Promise<Card[]> {
  const familyMetas = await families();
  const lone = (await previews()).filter(preview => !familyMetas.has(preview.folder));
  return [
    ...[...familyMetas].map(([folder, meta]) => ({ name: `${folder}/family.ts`, surface: meta.surface })),
    ...lone.map(preview => ({ name: `${preview.slug}/preview.tsx`, surface: preview.meta.surface })),
  ];
}

function declaration(css: string, selector: RegExp, property: string): string {
  const rule = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1];
  const value = rule?.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1]?.trim();
  if (!value) throw new Error(`No ${property} in the rule for ${selector.source}`);
  return value;
}

/** The site canvas behind the cards, read from the theme tokens. */
async function canvases(): Promise<Record<SiteTheme, string>> {
  const app = await Bun.file(path.join(web, "src/app/app.css")).text();
  return {
    light: declaration(app, /:root,\s*\[data-theme="light"\]/, "--shell-bg"),
    dark: declaration(app, /\n\[data-theme="dark"\]/, "--shell-bg"),
  };
}

/** The footer text and the frosted bar under it, for each card theme. */
async function footers(): Promise<Record<CardTheme, Footer>> {
  const app = await Bun.file(path.join(web, "src/app/app.css")).text();
  const card = await Bun.file(path.join(web, "src/app/deck/DeckCard.module.css")).text();
  const bar = (value: string) => {
    const [r, g, b, alpha] = value.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];
    return { color: `#${[r, g, b].map(c => c.toString(16).padStart(2, "0")).join("")}`, alpha };
  };
  return {
    light: {
      ink: declaration(app, /:root,\s*\[data-theme="light"\]/, "--shell-ink"),
      bar: bar(declaration(card, /(?:^|\n)\.card/, "--card-bar")),
    },
    dark: {
      ink: declaration(card, /\.card\[data-theme="dark"\]/, "--card-ink"),
      bar: bar(declaration(card, /\.card\[data-theme="dark"\]/, "--card-bar")),
    },
  };
}

const channels = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `top` at `alpha` over `bottom`, blended in sRGB as the browser paints it. */
function over(bottom: string, top: string, alpha: number): string {
  const topChannels = channels(top);
  const mixed = channels(bottom).map((c, index) => Math.round((c * (1 - alpha) + topChannels[index]! * alpha) * 255));
  return `#${mixed.map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** One card on one site theme: its resolved swatch and the colors its component shows on it. */
type Surface = { card: string; label: string; site: SiteTheme; swatch: CardSwatch; content: HexColor[] };

/** Each card's surface on each site theme, or the reason it has none. */
async function surfaces(): Promise<{ surfaces: Surface[]; problems: string[] }> {
  const found: Surface[] = [];
  const problems: string[] = [];
  for (const card of await cards()) {
    for (const site of SITE_THEMES) {
      const label = `${card.name} ${site}`;
      const declared = (card.surface as Record<string, { swatch?: unknown; content?: unknown }> | undefined)?.[site];
      const swatch = cardSwatch(site, String(declared?.swatch));
      const content = declared?.content;
      if (!swatch) problems.push(`${label}: swatch "${String(declared?.swatch)}" is not in CARD_SWATCHES.${site}`);
      else if (!Array.isArray(content) || content.length === 0 || !content.every(color => HEX.test(String(color)))) {
        problems.push(`${label}: content must list the component's #rrggbb colors`);
      } else found.push({ card: card.name, label, site, swatch, content: content as HexColor[] });
    }
  }
  return { surfaces: found, problems };
}

const palette = SITE_THEMES.flatMap(site =>
  Object.entries(CARD_SWATCHES[site]).map(([name, swatch]: [string, CardSwatch]) => ({ label: `${site}.${name}`, site, swatch })),
);

describe("Card swatches", () => {
  test(`each site theme offers at most ${MAX_SWATCHES} swatches`, () => {
    for (const site of SITE_THEMES) expect(Object.keys(CARD_SWATCHES[site]).length).toBeLessThanOrEqual(MAX_SWATCHES);
  });

  test(`every swatch stands ${CANVAS_CONTRAST}:1 apart from the site canvas`, async () => {
    const canvas = await canvases();
    const blended = palette.flatMap(({ label, site, swatch }) => {
      const ratio = contrast(swatch.background, canvas[site]);
      return ratio < CANVAS_CONTRAST ? [`${label}: ${swatch.background} on ${canvas[site]} is ${ratio.toFixed(2)}:1`] : [];
    });
    expect(blended).toEqual([]);
  });

  test(`footer text reads at ${TEXT_CONTRAST}:1 on every swatch's bar`, async () => {
    const footer = await footers();
    const unreadable = palette.flatMap(({ label, swatch }) => {
      const { ink, bar } = footer[swatch.theme];
      const ratio = contrast(ink, over(swatch.background, bar.color, bar.alpha));
      return ratio < TEXT_CONTRAST ? [`${label}: ${ratio.toFixed(2)}:1`] : [];
    });
    expect(unreadable).toEqual([]);
  });
});

describe("Live card surfaces", () => {
  test("every card picks a swatch and lists its component's colors for both site themes", async () => {
    expect((await surfaces()).problems).toEqual([]);
  });

  test("a family member leaves the card's look to its family", async () => {
    const familyFolders = new Set((await families()).keys());
    const members = (await previews()).filter(preview => familyFolders.has(preview.folder));
    expect(members.filter(member => "surface" in member.meta).map(member => member.slug)).toEqual([]);
  });

  test(`the component stands ${COMPONENT_CONTRAST}:1 apart from its swatch`, async () => {
    const faint = (await surfaces()).surfaces.flatMap(({ label, swatch, content }) =>
      content
        .map(color => ({ color, ratio: contrast(color, swatch.background) }))
        .filter(({ ratio }) => ratio < COMPONENT_CONTRAST)
        .map(({ color, ratio }) => `${label}: ${color} on ${swatch.background} is ${ratio.toFixed(2)}:1`),
    );
    expect(faint).toEqual([]);
  });

  test("a light card on the light site is darker on the dark one", async () => {
    const byCard = Map.groupBy((await surfaces()).surfaces, surface => surface.card);
    const lighter = [...byCard].filter(([, both]) => {
      const light = both.find(surface => surface.site === "light")?.swatch;
      const dark = both.find(surface => surface.site === "dark")?.swatch;
      return light?.theme === "light" && dark && luminance(dark.background) >= luminance(light.background);
    });
    expect(lighter.map(([name]) => name)).toEqual([]);
  });
});
