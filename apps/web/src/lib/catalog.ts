import type {
  CardMeta,
  CardSize,
  CardTheme,
  FamilyMeta,
  LiveCatalog,
  PlaygroundEntry,
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
  metas: Record<string, CardMeta | undefined> = {},
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
  background?: string;
  theme: CardTheme;
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
  const meta: CardMeta = plan.family ?? plan.entries[0]?.meta ?? {};

  return {
    slug: plan.slug,
    title: meta.title ?? members[0]?.title ?? titleFromSlug(plan.slug),
    description: meta.description,
    size: meta.size ?? "small",
    background: meta.background,
    theme: meta.theme ?? "light",
    reset: meta.reset,
    members,
  };
}

/** The card that shows `slug`, whether it is the card itself or a family member. */
export function cardIndexForSlug(cards: LiveCard[], slug: string | null): number {
  if (!slug) return -1;
  return cards.findIndex(
    card => card.slug === slug || card.members.some(member => member.slug === slug),
  );
}
