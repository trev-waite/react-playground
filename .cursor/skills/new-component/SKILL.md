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
- [ ] Grouping several components into one card? Add or update live/<folder>/family.ts
- [ ] Check it in Live, on the light and the dark site: `bun run dev`, page to the card, open the grid, and click back in; switch the system appearance (or run with `VITE_THEME_TOGGLE=on` for the theme button) to see both
- [ ] Refresh the link-preview images (below)
- [ ] `bun run typecheck` and `bun run test`
```

Card `meta` and `family.ts`: [Using the playground](../../../docs/USING_THE_PLAYGROUND.md).

## Card surfaces

A card picks one swatch per site theme from the shared palette in `apps/web/src/lib/cardSwatches.ts`, so the deck stays one set of colors:

| Site | Swatches |
|---|---|
| light | `paper`, `orange`, `blue`, `green` |
| dark | `night`, `orange`, `blue`, `green`, `mist` |

```tsx
surface: {
  light: { swatch: "paper", content: ["#171c25"] },
  dark: { swatch: "orange", content: ["#171c25"] },
},
```

1. List `content`: the component's main colors on the card, the ones that show its shape (a button's fill, a panel, the text). Read them from its CSS. If its color follows the card's ink, list that ink.
2. Pick the swatch for each theme where every `content` color is at least 3:1 (WCAG non-text contrast). `paper` (light site) and `night` (dark site) suit a component that brings its own color; orange, blue, and green give the rest a backdrop. On the dark site those three are mid-tones, so they hold both white and near-black components; a near-black component cannot sit on `night`. Use `mist` only when nothing else works. Vary the tone from the cards beside it in `live/order.ts`.
3. Run `bun test apps/web/src/live/surfaces.test.ts`. It names any card, color, and ratio that falls short. Pick another swatch; never lower the bar or add a one-off color.

Each swatch already stands 1.2:1 apart from the site canvas and carries its footer ink at 4.5:1; the same test checks that. Changing the palette itself is a design decision: keep it at most 5 swatches per theme. A family's `family.ts` owns the surface, and its members declare only a `title`.

## Refresh the link-preview images

`apps/web/public/og.png` (1200×630 card) and `og.mp4` (a loop through the Live deck) show the catalog as it is when captured. Re-capture them whenever a card is added, removed, or restyled:

```bash
bun run --cwd apps/web og
```

The script builds Live, pages through the first cards, pulls back to the grid, and writes both files. It needs macOS (it encodes the video with Swift and AVFoundation) and Google Chrome (for WebGPU cards). Look at `og.png` and play `og.mp4` before committing them.
