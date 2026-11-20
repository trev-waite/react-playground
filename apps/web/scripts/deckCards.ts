import type { Page } from "playwright";

/**
 * How the browser checks find a deck card. The deck marks its own parts with `data-deck-*` attributes
 * (card, fit, members, loading), so markup inside a preview, such as its own article, never stands in for them.
 */
const DECK_CARD = "article[data-deck-card]";

/** The deck card titled `title`, never an article a preview renders under the same name. */
export function deckCard(page: Page, title: string) {
  return page.locator(`${DECK_CARD}[aria-label=${JSON.stringify(title)}]`);
}
