import type { Page } from "playwright";

/**
 * How the browser checks find a deck card. The deck marks its own parts with `data-deck-*` attributes
 * (card, fit, members, loading, error), so markup inside a preview, such as its own article, never
 * stands in for them. A card's marker holds its slug.
 */
const DECK_CARD = "article[data-deck-card]";

/** A card the check names by its title, or any card by its slug when the check walks the catalog, since titles need not be unique. */
export type CardKey = string | { slug: string };

export function deckCard(page: Page, key: CardKey) {
  return page.locator(
    typeof key === "string" ? `${DECK_CARD}[aria-label=${JSON.stringify(key)}]` : `${DECK_CARD}[data-deck-card=${JSON.stringify(key.slug)}]`,
  );
}
