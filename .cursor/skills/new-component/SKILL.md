---
name: new-component
description: Add a component to the Live catalog end to end, written straight into Live or published from an Experimental idea, to a Live card with refreshed link-preview images. Use when adding, publishing, or regrouping a Live component.
disable-model-invocation: true
---

# New Component

A thin checklist. The detail lives in the skills and docs it links.

```text
- [ ] Read the Live house rules before writing: Motion and Checks in docs/BEST_PRACTICES.md. The lint fails a component that skips them
- [ ] Pick a route (below): straight into Live, or an idea in Experimental first
- [ ] Straight in: write apps/web/src/live/<folder>/<Name>/<Name>.tsx and its preview.tsx (never `shells`)
- [ ] As an idea: follow the `new-experiment` skill (and `gpu-idea` for shaders), then Make Live into apps/web/src/live/<folder>/<Name>/; after that, change the component in the idea and Update Live (below)
- [ ] preview.tsx renders only <Name />; its `meta` sets the card's size, description, reset, and `surface` (below)
- [ ] Write the `description` for a stranger: it is also the page's description and the text under a shared link
- [ ] Pick a `size` and a place in live/order.ts where the grid still packs, and make it fit a phone page (below)
- [ ] Grouping several components into one card? Add or update live/<folder>/family.ts
- [ ] Logic worth trusting (math, layout, timing) gets a test beside the component
- [ ] Look at it in every state a visitor can reach (below)
- [ ] Refresh the link-preview images (below): the card's own, and the site's
- [ ] `bun run lint`, `bun run typecheck`, and `bun run test`
- [ ] Check the card's page as shipped (below): `bun run build`, then `check:deploy`, `check:routes`, and `check:phone`
```

Card `meta` and `family.ts`: [Using the playground](../../../docs/USING_THE_PLAYGROUND.md).

## Straight into Live, or an idea first

Either route ships the same Live folder, and either can switch later.

- **Straight into Live** when you know what it should be: a component with real props, several files from the start, or no values worth a slider. Write `<Name>.tsx` and a `preview.tsx` (copy one beside it) and go on with the checklist.
- **An idea first** when the look is still open and you want to tune it on the dock: timing, density, color.
- **Later**, a Live component moves into Experimental in a few steps when you want to play with part of it: the `new-experiment` skill's "Bring a Live component into Experimental".

## When it has an idea, the idea owns the component

Make Live writes the idea's `source.tsx` to `<Name>.tsx` and a starting `preview.tsx`. From then on:

- **Update Live** rewrites `<Name>.tsx` and nothing else. Change the component in the idea, never in `<Name>.tsx`: a hand edit there is replaced on the next update.
- Everything else in the folder is yours and survives every update: the tuned `preview.tsx`, a `<Name>Preview.module.css`, tests, helpers.
- Export the pure functions a test needs from `source.tsx`; they arrive in `<Name>.tsx`, where `<Name>.test.ts` imports them.

Without the studio open, publish through the local API that `bun run dev` starts. The first call also adopts a new idea folder and mints its `project.json`:

```bash
curl -s localhost:3001/api/ideas    # each idea's id and revision
curl -s -X POST localhost:3001/api/ideas/<id>/publish \
  -H 'content-type: application/json' \
  -d '{"expectedRevision": <revision>, "targetFolder": "<folder>"}'
```

## Fit the card

A preview is laid out in the card's box, never the viewport, so size from that box (`100%`, or `cqw`/`cqh` under `container-type: size`).

- **As a page**, the box is the card less its padding and footer. On the 402px phone page that is about 322px wide. A component with a fixed size wider than that needs a `@media (max-width: 48rem)` layout; `check:phone` fails one that had to shrink.
- **As a grid tile**, the preview is laid out at 320px or more and scaled down, and takes no input.
- **In the grid**, cards pack into 2, 3, or 4 columns, each in the first cell it fits (`gridLayout` in `app/deck/deckLayout.ts`). Choose `size` and the position in `live/order.ts`, then run `bun test apps/web/src/live/order.test.ts`: it lays out the real catalog at 2, 3, and 4 columns and names each hole: an empty cell above the last row, or one in it with a card to its right. Move cards in the order until it passes; at 3 columns every wide card needs a small card, or half a tall one, beside it.

## Card surfaces

A card picks one swatch per site theme from the shared palette in `apps/web/src/lib/cardSwatches.ts`, so the deck stays one set of colors. Both sites offer the same five: `paper` (white), `night` (black), `orange`, `blue`, and `green`.

```tsx
surface: {
  light: { swatch: "paper", content: ["#171c25"] },
  dark: { swatch: "orange", content: ["#171c25"] },
},
```

1. List `content`: the component's main colors on the card, the ones that show its shape (a button's fill, a panel, the text). Read them from its CSS or source. If its color follows the card's ink, list that ink.
2. Pick the swatch for each theme where every `content` color is at least 3:1 (WCAG non-text contrast). `paper` and `night` suit a component that brings its own color or wants a stark ground, such as white letters on black, and either works on either site when it suits the component. Orange, blue, and green give the rest a backdrop; on the dark site they are mid-tones, so they hold both white and near-black components. Vary the tone from the cards beside it in `live/order.ts`.
3. Run `bun test apps/web/src/live/surfaces.test.ts`. It names any card, color, and ratio that falls short. Pick another swatch; never lower the bar or add a one-off color.

A component drawn in the card's ink turns near-black on the dark site's orange, blue, and green, which carry dark ink. To keep it white there, set its color in the preview and list that color.

Each swatch already stands 1.2:1 apart from the site canvas and carries its footer ink at 4.5:1; the same test checks that. Changing the palette itself is a design decision: keep it at most 5 swatches per theme. A family's `family.ts` owns the surface, and its members declare only a `title`.

## The card's page and URL

Nothing registers a route. A card's URL is its Live slug: `/<folder>/<Name>` for a lone component, `/<folder>` for a family card, and each family member's `/<folder>/<Name>` opens the family card. Renaming or moving a component changes its URL; the old one becomes a 404.

The build reads `meta` without running the component and writes each page's title, description, and link preview from it (`apps/web/vite/routeHead.ts`). So `meta` must stay a plain literal, and the `description` is worth a sentence that makes sense with no card beside it.

## Look at it

`bun run dev`, then open `/<slug>`. See each of these before calling it done:

- The page and the grid tile (open the grid, click back in).
- The light and the dark site: switch the system appearance, or run with `VITE_THEME_TOGGLE=on` for the theme button.
- A 402×874 phone.
- Reduced motion: it should hold still and still show what it is.
- Its input: pointer, touch, and keys where it takes them.

An agent can drive all of this with Playwright, a dev dependency of `apps/web`: `colorScheme`, `reducedMotion`, and a phone `viewport` on the browser context cover the states above. Headless Chromium has no WebGPU, so the GPU cards log an adapter error there; that is not your component.

## Refresh the link-preview images

Two captures, both for macOS and Google Chrome (for WebGPU cards). Look at what they write before committing it.

```bash
bun run --cwd apps/web og:cards <slug>…   # the named cards' own images, into public/og/
bun run --cwd apps/web og         # the site's og.png and og.mp4
```

- `og:cards` draws one 1200×630 image per card: its name and description beside its page. Run it when a card is added or its look, name, or description changes, and name the cards you changed (a family member's slug draws its family). With no slug it redraws every card, and a moving one differs from run to run. Until a card has an image the build warns and its page shares the site's. Delete the image of a card you remove or rename: `check:deploy` refuses an image with no card.
- `og` re-captures `og.png` (the card beside the top of the Live grid) and `og.mp4` (a loop through the deck). Run it when a card is added, removed, or restyled; `og.png` only changes when the first rows of the grid do. It encodes the video with Swift and AVFoundation.

## Check the page as shipped

```bash
bun run build
bun run --cwd apps/web check:deploy   # a page for every route, each the app with its own tags
bun run --cwd apps/web check:routes   # tile links, Back and Forward, paging, every card's path
bun run --cwd apps/web check:phone    # no preview shrinks on a phone page
```

`bun run dev` serves the same tags on the path it is asked for, so `view-source:` on `http://localhost:3000/<slug>` shows the title and link preview the build will write.
