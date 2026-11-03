# Using the playground

Persistence: [Experimental Projects](IDEA_PERSISTENCE.md). Conventions: [BEST_PRACTICES](BEST_PRACTICES.md). GPU: [WebGPU with vgpu](WEBGPU.md).

## Experimental vs Live

**Experimental** is WIP and runs only under `bun run dev`. Hover the left edge for the browser, then toggle **Live / Experimental**. **Save** (`⌘S`) writes `apps/web/src/experimental/ideas/<Name>/` (`project.json` + `source.tsx`); dropping a `source.tsx` there on disk works too. **Make Live** asks for a Live folder and writes a portable component with the current slider numbers baked in.

**Live** entries live at `apps/web/src/live/<group>/<Name>/`. `preview.tsx` only mounts the component (see `buttons/PrimaryButton`). Do not put WIP in `live/shells/` or ship authoring controls in Live.

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
| `bun run build` / `bun run start` | Build and preview the deployable Live app |

## Deploy

Host `apps/web/dist` as a static site with an SPA fallback to `index.html`. Make Live writes source files, so commit and rebuild to update it.

## Stack

Turborepo · Vite · React 19.2 · CSS Modules · React Router · Motion · vgpu (WebGPU) · Bun API
