# Using the playground

Persistence: [Experimental Projects](IDEA_PERSISTENCE.md). Conventions: [BEST_PRACTICES](BEST_PRACTICES.md). GPU: [WebGPU with vgpu](WEBGPU.md).

## Experimental vs Live

**Experimental** is WIP and runs only under `bun run dev`. Toggle **Live / Experimental** at the top. **Save** (`⌘S`) writes `apps/web/src/experimental/ideas/<Name>/` (`project.json` + `source.tsx`); dropping a `source.tsx` there on disk works too. **Make Live** asks for a Live folder and writes a portable component with the current slider numbers baked in.

**Live** shows one component per page. Scroll, swipe, use the arrow keys, or use the pager to move to the next one. The grid button shrinks the page into its tile and pulls the rest of the catalog in around it; click a tile, or press Esc, to zoom back in. It sits beside the Live / Experimental toggle locally and alone at the top center when deployed.

**Live** entries live at `apps/web/src/live/<group>/<Name>/`. `preview.tsx` only mounts the component (see `buttons/PrimaryButton`). Do not put WIP in `live/shells/` or ship authoring controls in Live.

### Cards

Each card is unopinionated apart from its size. `preview.tsx` exports `meta` to style it:

```tsx
export const meta: CardMeta = {
  title: "Primary Button",
  size: "tall", // small 1×1 (default), wide 2×1, tall 1×2, large 2×2
  background: "#ff9f1c", // any CSS background; white by default
  theme: "dark", // which ink reads on that background
  description: "Digits roll to the new count on every press.",
  reset: "reset", // or "replay": a footer button that remounts the card
};
```

With neither `description` nor `reset`, the card has no footer.

**Families.** Add `apps/web/src/live/<group>/family.ts` exporting a `FamilyMeta` (`title` plus the same fields) to show every component in that folder together on one card, as in `apps/web/src/live/controls/`. Member slugs such as `/controls/Switch` open the family card.

## Export

Copy the Live folder into another app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. GPU components also need `vgpu` and `apps/web/src/gpu/`.

## Layout

```
apps/web/src/
  main.tsx        dev server → StudioApp, build → LiveApp
  app/            Live app (deployable)
  studio/         dev-only shell: Live + Experimental
  experimental/   Experimental page and ideas
  live/           published components
apps/api          Bun HTTP (3001), local only: ideas + Make Live
packages/api      PlaygroundApi contract + HTTP client
```

The studio talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`) through the dev server's `/api` proxy (`API_PROXY_TARGET`, or `VITE_API_URL` to skip it).

## Commands

The repo pins **Bun 1.4**. Prefer `./node_modules/.bin/bun` for tests and one-off commands.

| Command | What it does |
|---------|----------------|
| `bun run dev` | Studio + local API |
| `bun run test` | All package tests |
| `bun run typecheck` | Strict TypeScript |
| `bun run lint` | oxlint: React, accessibility, and leftover-code rules |
| `bun run build` / `bun run start` | Build and preview the deployable Live app |

## Deploy

Merging to `main` deploys Live to Cloudflare; see [Deployment](DEPLOYMENT.md). Make Live writes source files, so commit them to publish.

Builds use `SITE_URL` for absolute `og:image` and `og:video` URLs; CI sets it to the production origin. The preview assets are `apps/web/public/og.png` (1200×630) and `og.mp4`, a short loop of the Live deck. Re-capture both with `bun run --cwd apps/web og` when the catalog changes (macOS and Google Chrome).

## Stack

Turborepo · Vite · Cloudflare Workers · React 19.2 · CSS Modules · React Router · vgpu (WebGPU) · Bun API
