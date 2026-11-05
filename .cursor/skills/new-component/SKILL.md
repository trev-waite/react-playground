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
- [ ] preview.tsx renders only <Name />; its `meta` sets the card's size, background, theme, description, and reset
- [ ] Grouping several components into one card? Add or update live/<folder>/family.ts
- [ ] Check it in Live: `bun run dev`, page to the card, then open the grid and click back in
- [ ] Refresh the link-preview images (below)
- [ ] `bun run typecheck` and `bun run test`
```

Card `meta` and `family.ts`: [Using the playground](../../../docs/USING_THE_PLAYGROUND.md).

## Refresh the link-preview images

`apps/web/public/og.png` (1200×630 card) and `og.mp4` (a loop through the Live deck) show the catalog as it is when captured. Re-capture them whenever a card is added, removed, or restyled:

```bash
bun run --cwd apps/web og
```

The script builds Live, pages through the first cards, pulls back to the grid, and writes both files. It needs macOS (it encodes the video with Swift and AVFoundation) and Google Chrome (for WebGPU cards). Look at `og.png` and play `og.mp4` before committing them.
