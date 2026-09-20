# React Playground

Studio for isolated React components. Write an idea in **Experimental**, tune it on the shared dock, then **Make Live**. Live is the published catalog: the component as you last configured it, no playground chrome.

Not a WYSIWYG editor. Chrome is `apps/web/src/app/`. Ideas are `apps/web/src/experimental/`. Published components are `apps/web/src/live/`.

## Quick start

```bash
bun install
bun run dev
```

- UI: http://localhost:3000
- API: http://localhost:3001 (file writes). The UI uses same-origin `/api` via Vite. Point `API_PROXY_TARGET` in `apps/web/.env` at another API port if you need to; `VITE_API_URL` skips the proxy.

Hover the left edge for the browser. Toggle **Live / Experimental**.

The repo pins **Bun 1.4** locally (`bun install` does not change your global Bun). Prefer `./node_modules/.bin/bun` for tests and one-off commands so you do not hit an older global install.

## Workflow

**Experimental** (`/experimental`) is WIP. Dock labels and values live in that idea’s `project.json`. **Save** (`⌘S`) writes `apps/web/src/experimental/ideas/<Name>/` (`project.json` + `source.tsx`). **Open** switches projects. You can also drop a new `source.tsx` on disk; the app will create `project.json` if it is missing.

**Make Live** asks for a Live folder and writes a portable component with the current slider numbers baked in. Vite picks up new Live folders while `bun run dev` is running.

**Live** entries live at `apps/web/src/live/<group>/<Name>/`. `preview.tsx` should only mount the component. Do not put WIP in `apps/web/src/live/shells/`, wrap Experimental in ConfigurableShell, or ship authoring controls in Live. Example: `apps/web/src/live/buttons/PrimaryButton/preview.tsx`.

Storage and publish rules: [Experimental Projects](docs/IDEA_PERSISTENCE.md).

## Export

Copy the Live folder into your app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. Do not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU components also need `vgpu` and `apps/web/src/gpu/` — see [WebGPU with vgpu](docs/WEBGPU.md).

## Layout

```
apps/web          Vite UI (3000) — app chrome, experimental studio, live catalog
apps/api          Bun HTTP (3001) — ideas + Make Live
packages/api      PlaygroundApi contract + HTTP client
```

The UI talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`). Conventions: [BEST_PRACTICES](docs/BEST_PRACTICES.md).

## Commands

| Command | What it does |
|---------|----------------|
| `bun run dev` | UI + API. Author ideas and Make Live here. |
| `bun run test` | All package tests |
| `bun run typecheck` | Strict TypeScript |
| `bun run build` / `bun run start` | Production snapshot (`vite preview` + API). Rebuilds on start; new Live entries are not hot-loaded. |

## Stack

Turborepo · Vite · React 19.2 · CSS Modules · React Router · Motion · vgpu (WebGPU) · Bun API
