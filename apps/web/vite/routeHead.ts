import { livePath, routeTitle, SITE_DESCRIPTION, SITE_TITLE, type LiveRoute } from "../src/lib/liveRoutes.ts";

/** Where index.html leaves room for a route's own tags. */
export const HEAD_SLOT = "<!--route-head-->";

const OG_IMAGE_SIZE = { width: 1200, height: 630 };

export type HeadTag =
  | { tag: "title"; text: string }
  | { tag: "meta" | "link"; attrs: Record<string, string> };

export type HeadContext = {
  /** The deployed origin, without a trailing slash. Without one, URLs stay root-relative and no canonical is written. */
  siteUrl: string | null;
  /** Slugs of the cards that have their own link-preview image; the rest share the site's. */
  cardImages: ReadonlySet<string>;
};

/** A card's own link-preview image, under public/. `bun run og:cards` draws them. */
export function cardImagePath(slug: string): string {
  return `og/${slug}.png`;
}

/**
 * Everything in `<head>` that differs from one route to the next: the title,
 * the description, the canonical URL, and the link preview. A component on a
 * family card is another way in to that card's page, so it shares the card's
 * tags and names the card's URL as canonical.
 */
export function routeHead({ card }: LiveRoute, { siteUrl, cardImages }: HeadContext): HeadTag[] {
  const origin = siteUrl ?? "";
  const url = `${origin}${livePath(card?.slug ?? null)}`;
  const description = card?.description ?? SITE_DESCRIPTION;
  const ownImage = card !== null && cardImages.has(card.slug);
  const meta = (key: "name" | "property", name: string, content: string): HeadTag => ({
    tag: "meta",
    attrs: { [key]: name, content },
  });

  return [
    { tag: "title", text: routeTitle(card) },
    meta("name", "description", description),
    ...(siteUrl ? [{ tag: "link", attrs: { rel: "canonical", href: url } } as const] : []),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", SITE_TITLE),
    meta("property", "og:title", card?.title ?? SITE_TITLE),
    meta("property", "og:description", description),
    meta("property", "og:url", url),
    meta("property", "og:image", `${origin}/${ownImage ? cardImagePath(card.slug) : "og.png"}`),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", String(OG_IMAGE_SIZE.width)),
    meta("property", "og:image:height", String(OG_IMAGE_SIZE.height)),
    meta(
      "property",
      "og:image:alt",
      ownImage
        ? `${card.title}, a component in ${SITE_TITLE}.`
        : `${SITE_TITLE}: the Live catalog pulled back to a bento grid of component cards.`,
    ),
    // The video tours the whole catalog, so only the grid's page offers it.
    ...(card
      ? []
      : [
          meta("property", "og:video", `${origin}/og.mp4`),
          meta("property", "og:video:type", "video/mp4"),
          meta("property", "og:video:width", String(OG_IMAGE_SIZE.width)),
          meta("property", "og:video:height", String(OG_IMAGE_SIZE.height)),
        ]),
    meta("name", "twitter:card", "summary_large_image"),
  ];
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as const;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, character => ENTITIES[character as keyof typeof ENTITIES]);
}

/** Reads back text that `renderHead` wrote. */
export function unescapeHtml(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot);/g, entity => Object.entries(ENTITIES).find(([, escaped]) => escaped === entity)![0]);
}

export function renderHead(tags: readonly HeadTag[]): string {
  return tags
    .map(tag => {
      if (tag.tag === "title") return `<title>${escapeHtml(tag.text)}</title>`;
      const attrs = Object.entries(tag.attrs).map(([name, value]) => `${name}="${escapeHtml(value)}"`);
      return `<${tag.tag} ${attrs.join(" ")} />`;
    })
    .join("\n    ");
}

/** Writes a route's tags into the page template, which must have exactly one slot for them. */
export function stampHead(template: string, tags: readonly HeadTag[]): string {
  const [before, after, ...rest] = template.split(HEAD_SLOT);
  if (after === undefined || rest.length > 0) {
    throw new Error(`The page template needs exactly one ${HEAD_SLOT} for each route's title and link preview.`);
  }
  return `${before}${renderHead(tags)}${after}`;
}

/** The pages worth a crawler's visit: the grid and each card's canonical page, not the other ways in to a card. */
export function sitemap(routes: readonly LiveRoute[], siteUrl: string): string {
  const paths = [...new Set(routes.map(route => livePath(route.card?.slug ?? null)))];
  const urls = paths.map(path => `  <url><loc>${escapeHtml(`${siteUrl}${path}`)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function robots(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}
