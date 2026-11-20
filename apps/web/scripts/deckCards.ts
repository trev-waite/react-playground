import type { Page } from "playwright";

/**
 * How the browser checks find a deck card. The deck marks its own parts with `data-deck-*` attributes
 * (card, fit, members, loading, error), so markup inside a preview, such as its own article, never
 * stands in for them. A card's marker holds its slug, its one unique name: titles are only display
 * text and may repeat, so every check finds a card by slug.
 */
export function deckCard(page: Page, slug: string) {
  return page.locator(`article[data-deck-card=${JSON.stringify(slug)}]`);
}
