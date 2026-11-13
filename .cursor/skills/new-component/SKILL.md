---
name: new-component
description: Add a component to the Live catalog end to end, from an Experimental idea to a published Live card with refreshed link-preview images. Use when adding, publishing, or regrouping a Live component.
disable-model-invocation: true
---

# New Component

A thin checklist. The detail lives in the skills and docs it links.

```text
- [ ] Build it as an idea in Experimental: follow the `new-experiment` skill (and `gpu-idea` for shaders)
- [ ] Make Live into a folder under apps/web/src/live/<folder>/<Name>/ (never `shells`)
- [ ] preview.tsx renders only <Name />; its `meta` sets the card's size, description, reset, and `surface` (below)
- [ ] Write the `description` for a stranger: it is also the page's description and the text under a shared link (below)
- [ ] Grouping several components into one card? Add or update live/<folder>/family.ts
- [ ] Check it in Live, on the light and the dark site: `bun run dev`, page to the card, open the grid, and click back in; switch the system appearance (or run with `VITE_THEME_TOGGLE=on` for the theme button) to see both
- [ ] Refresh the link-preview images (below): the card's own, and the site's
- [ ] `bun run lint`, `bun run typecheck`, and `bun run test`
- [ ] Check the card's page as shipped (below): `bun run build`, then `check:deploy`, `check:routes`, and `check:phone`
```

Card `meta` and `family.ts`: [Using the playground](../../../docs/USING_THE_PLAYGROUND.md).

## Card surfaces

A card picks one swatch per site theme from the shared palette in `apps/web/src/lib/cardSwatches.ts`, so the deck stays one set of colors. Both sites offer the same five: `paper` (white), `night` (black), `orange`, `blue`, and `green`.

```tsx
surface: {
  light: { swatch: "paper", content: ["#171c25"] },
  dark: { swatch: "orange", content: ["#171c25"] },
},
```

1. List `content`: the component's main colors on the card, the ones that show its shape (a button's fill, a panel, the text). Read them from its CSS. If its color follows the card's ink, list that ink.
2. Pick the swatch for each theme where every `content` color is at least 3:1 (WCAG non-text contrast). `paper` and `night` suit a component that brings its own color or wants a stark ground, such as white letters on black, and either works on either site when it suits the component. Orange, blue, and green give the rest a backdrop; on the dark site they are mid-tones, so they hold both white and near-black components. Vary the tone from the cards beside it in `live/order.ts`.
3. Run `bun test apps/web/src/live/surfaces.test.ts`. It names any card, color, and ratio that falls short. Pick another swatch; never lower the bar or add a one-off color.

Each swatch already stands 1.2:1 apart from the site canvas and carries its footer ink at 4.5:1; the same test checks that. Changing the palette itself is a design decision: keep it at most 5 swatches per theme. A family's `family.ts` owns the surface, and its members declare only a `title`.

## The card's page and URL

Nothing registers a route. A card's URL is its Live slug: `/<folder>/<Name>` for a lone component, `/<folder>` for a family card, and each family member's `/<folder>/<Name>` opens the family card. The build reads the catalog from source (`apps/web/vite/liveCards.ts`) and writes one HTML page per route (`apps/web/vite/liveRoutesPlugin.ts`), so a new component gets its page, its place in `sitemap.xml`, and a real 404 for every path that is not a card.

Each page carries tags of its own, written from the card's `meta` (`apps/web/vite/routeHead.ts`):

| Tag | From |
| --- | --- |
| Tab title, `og:title` | `meta.title`, or the component's name with spaces |
| Page description, `og:description` | `meta.description`; without one, the site's line |
| Canonical URL, `og:url` | The card's URL, so a family member points at its family |
| `og:image` | `apps/web/public/og/<slug>.png`; without one, the site's `og.png` |

So `meta` must stay a plain literal (the build reads it without running the component), and the `description` is worth a sentence that makes sense with no card beside it. Renaming or moving a component changes its URL; the old one becomes a 404.

## Refresh the link-preview images

Two captures, both for macOS and Google Chrome (for WebGPU cards). Look at what they write before committing it.

```bash
bun run --cwd apps/web og:cards   # each card's own image, into public/og/
bun run --cwd apps/web og         # the site's og.png and og.mp4
```

- `og:cards` draws one 1200×630 image per card: its name and description beside its page. Run it when a card is added or its look, name, or description changes. Until a card has an image the build warns and its page shares the site's. Delete the image of a card you remove or rename: `check:deploy` refuses an image with no card.
- `og` re-captures `og.png` (the card beside the Live grid) and `og.mp4` (a loop through the deck), which show the whole catalog. Run it when a card is added, removed, or restyled. It encodes the video with Swift and AVFoundation.

## Check the page as shipped

```bash
bun run build
bun run --cwd apps/web check:deploy   # a page for every route, each the app with its own tags
bun run --cwd apps/web check:routes   # tile links, Back and Forward, paging, every card's path
bun run --cwd apps/web check:phone    # no preview shrinks on a phone page
```

`bun run dev` serves the same tags on the path it is asked for, so `view-source:` on `http://localhost:3000/<slug>` shows the title and link preview the build will write.
