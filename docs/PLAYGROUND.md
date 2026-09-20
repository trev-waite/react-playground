# Using the playground

How to author ideas, publish Live components, and run the apps. Persistence internals: [Experimental Projects](IDEA_PERSISTENCE.md). Conventions: [BEST_PRACTICES](BEST_PRACTICES.md). GPU: [WebGPU with vgpu](WEBGPU.md).

## Experimental vs Live

**Experimental** is WIP. Hover the left edge for the browser, then toggle **Live / Experimental**. Dock labels and values live in that idea’s `project.json`. **Save** (`⌘S`) writes `apps/web/src/experimental/ideas/<Name>/` (`project.json` + `source.tsx`). **Open** switches projects. You can also drop a new `source.tsx` on disk; the app creates `project.json` if it is missing.

**Make Live** asks for a Live folder and writes a portable component with the current slider numbers baked in. Vite picks up new Live folders while `bun run dev` is running.

**Live** entries live at `apps/web/src/live/<group>/<Name>/`. `preview.tsx` should only mount the component. Do not put WIP in `apps/web/src/live/shells/`, wrap Experimental in ConfigurableShell, or ship authoring controls in Live. Example: `apps/web/src/live/buttons/PrimaryButton/preview.tsx`.

Not a WYSIWYG editor. Chrome is `apps/web/src/app/`. Ideas are `apps/web/src/experimental/`. Published components are `apps/web/src/live/`.

## Export

Copy the Live folder into another app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. Do not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU components also need `vgpu` and `apps/web/src/gpu/`.

## Layout

```
apps/web          Vite UI (3000) — app chrome, experimental studio, live catalog
apps/api          Bun HTTP (3001) — ideas + Make Live
packages/api      PlaygroundApi contract + HTTP client
```

The UI talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`).

The UI uses same-origin `/api` via Vite. Point `API_PROXY_TARGET` in `apps/web/.env` at another API port if you need to; `VITE_API_URL` skips the proxy.

## Commands

The repo pins **Bun 1.4** locally (`bun install` does not change your global Bun). Prefer `./node_modules/.bin/bun` for tests and one-off commands so you do not hit an older global install.

| Command | What it does |
|---------|----------------|
| `bun run dev` | UI + API. Author ideas and Make Live here. |
| `bun run test` | All package tests |
| `bun run typecheck` | Strict TypeScript |
| `bun run build` / `bun run start` | Production snapshot (`vite preview` + API). Rebuilds on start; new Live entries are not hot-loaded. |

## Stack

Turborepo · Vite · React 19.2 · CSS Modules · React Router · Motion · vgpu (WebGPU) · Bun API
