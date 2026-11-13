export const SITE_TITLE = "Trev’s Studio";
export const SITE_DESCRIPTION = "Small React components, built and tuned one at a time.";

/** What a route needs to know of a card: enough to address it and to title its page. */
export type RouteCard = {
  slug: string;
  title: string;
  description?: string;
  members: readonly { slug: string }[];
};

/** A path the Live app answers. The grid is `/`; every other route opens `card` as a page. */
export type LiveRoute = {
  path: string;
  card: RouteCard | null;
};

/** A card's page is its slug as a path; no slug is the grid. */
export function livePath(slug: string | null): string {
  return slug ? `/${slug}` : "/";
}

export function liveSlugFromPath(pathname: string): string | null {
  return pathname.replace(/^\/+|\/+$/g, "") || null;
}

/**
 * The grid, each card, and each component on a family card, which opens that
 * card. The build writes one HTML page per route, so these are the only paths
 * the deployed site answers.
 */
export function liveRoutes(cards: readonly RouteCard[]): LiveRoute[] {
  const routes = new Map<string, LiveRoute>([["/", { path: "/", card: null }]]);
  for (const card of cards) {
    for (const slug of [card.slug, ...card.members.map(member => member.slug)]) {
      const path = livePath(slug);
      if (!routes.has(path)) routes.set(path, { path, card });
    }
  }
  return [...routes.values()];
}

/** The tab title: an open card leads with its own name. */
export function routeTitle(card: Pick<RouteCard, "title"> | null): string {
  return card ? `${card.title} · ${SITE_TITLE}` : SITE_TITLE;
}
