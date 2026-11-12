import { cardSwatch } from "./cardSwatches";
import type {
  CardColors,
  CardMeta,
  CardSize,
  CardSurfaces,
  SiteTheme,
  FamilyMeta,
  LiveCatalog,
  PlaygroundEntry,
  PreviewMeta,
  PreviewModule,
} from "./types";

export function slugFromPreviewPath(filePath: string): string | null {
  const match = filePath.replace(/\\/g, "/").match(/\/live\/(.+)\/preview\.tsx$/);
  return match?.[1] ?? null;
}

export function liveSlugFromPath(pathname: string): string | null {
  return pathname.replace(/^\/+|\/+$/g, "") || null;
}

export function folderFromFamilyPath(filePath: string): string | null {
  const match = filePath.replace(/\\/g, "/").match(/\/live\/([^/]+)\/family\.ts$/);
  return match?.[1] ?? null;
}

export function titleFromSlug(slug: string): string {
  const leaf = slug.split("/").pop() ?? slug;
  return leaf.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function catalogEntriesFromLoaders(
  loaders: Record<string, PlaygroundEntry["load"]>,
  metas: Record<string, PreviewMeta | undefined> = {},
): PlaygroundEntry[] {
  return Object.entries(loaders)
    .flatMap(([filePath, load]) => {
      const slug = slugFromPreviewPath(filePath);
      if (!slug) return [];
      const meta = metas[filePath];
      return [{ slug, title: meta?.title ?? titleFromSlug(slug), meta, load }];
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function familiesFromModules(
  modules: Record<string, FamilyMeta>,
): Record<string, FamilyMeta> {
  const families: Record<string, FamilyMeta> = {};
  for (const [filePath, meta] of Object.entries(modules)) {
    const folder = folderFromFamilyPath(filePath);
    if (folder) families[folder] = meta;
  }
  return families;
}

/** Which entries share a card, before any preview module has loaded. */
export type CardPlan = {
  slug: string;
  family?: FamilyMeta;
  entries: PlaygroundEntry[];
};

export function planCards({ entries, families, order }: LiveCatalog): CardPlan[] {
  const plans: CardPlan[] = [];
  const byFamily = new Map<string, CardPlan>();

  for (const entry of entries) {
    const folder = entry.slug.split("/")[0] ?? "";
    const family = families[folder];
    if (!family) {
      plans.push({ slug: entry.slug, entries: [entry] });
      continue;
    }
    let plan = byFamily.get(folder);
    if (!plan) {
      plan = { slug: folder, family, entries: [] };
      byFamily.set(folder, plan);
      plans.push(plan);
    }
    plan.entries.push(entry);
  }

  const rank = (slug: string) => {
    const index = order.indexOf(slug);
    return index === -1 ? order.length : index;
  };
  return plans.sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));
}

export type LiveCardMember = {
  slug: string;
  title: string;
  /** Settles on its own, so each card shows as soon as its component arrives. */
  module: Promise<PreviewModule>;
};

export type LiveCard = {
  slug: string;
  title: string;
  description?: string;
  size: CardSize;
  surface: CardColors;
  reset?: CardMeta["reset"];
  members: LiveCardMember[];
};

export function cardFromPlan(
  plan: CardPlan,
  moduleFor: (entry: PlaygroundEntry) => Promise<PreviewModule>,
): LiveCard {
  const members = plan.entries.map(
    (entry): LiveCardMember => ({ slug: entry.slug, title: entry.title, module: moduleFor(entry) }),
  );
  const meta = cardMeta(plan);

  return {
    slug: plan.slug,
    title: meta.title ?? members[0]?.title ?? titleFromSlug(plan.slug),
    description: meta.description,
    size: meta.size ?? "small",
    surface: cardColors(plan.slug, meta.surface),
    reset: meta.reset,
    members,
  };
}

/** The family's meta, or a lone component's, which must then present a whole card. */
function cardMeta(plan: CardPlan): CardMeta {
  const meta = plan.family ?? plan.entries[0]?.meta;
  if (meta && isCardMeta(meta)) return meta;
  throw new Error(
    `${plan.slug}: a card's meta must declare \`surface\`, with a background for both the light and the dark site.`,
  );
}

function isCardMeta(meta: PreviewMeta): meta is CardMeta {
  return "surface" in meta && typeof meta.surface === "object" && meta.surface !== null;
}

/** Meta is read from source without type checks, so a mistyped swatch is caught here, by name. */
function cardColors(slug: string, surface: CardSurfaces): CardColors {
  const resolve = (theme: SiteTheme) => {
    const name = String(surface[theme]?.swatch);
    const swatch = cardSwatch(theme, name);
    if (!swatch) throw new Error(`${slug}: the ${theme} site has no card swatch "${name}".`);
    return swatch;
  };
  return { light: resolve("light"), dark: resolve("dark") };
}

/** The card that shows `slug`, whether it is the card itself or a family member. */
export function cardIndexForSlug(cards: LiveCard[], slug: string | null): number {
  if (!slug) return -1;
  return cards.findIndex(
    card => card.slug === slug || card.members.some(member => member.slug === slug),
  );
}
