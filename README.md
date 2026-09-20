# React Playground

Local playground for inventing isolated React components. **Experimental** is the studio: write an idea, play with it on a shared dock of sliders and buttons, then **Make Live**. **Live** is the published catalog — a plain component, configured as you last saw it, with no playground chrome.

This is not a WYSIWYG editor. Playground chrome lives in `apps/web/src/app/`. Portable Live components live in `apps/web/src/live/`. The Experimental studio and saved ideas live in `apps/web/src/experimental/`.

## Quick start

```bash
bun install
bun run dev
```

- UI: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001) (writes experiment files). The UI uses same-origin `/api`, proxied by Vite in both dev and preview. Set `API_PROXY_TARGET` in `apps/web/.env` if the API uses another port; `VITE_API_URL` optionally bypasses the proxy.

Hover the left edge for the component browser. Use the **Live / Experimental** toggle.

The repo pins **Bun 1.4** via `bun install` (project-local, does not change your global Bun). Workspace scripts resolve that binary through the local `node_modules/.bin`. For direct tests and commands, use `./node_modules/.bin/bun` rather than a potentially older global `bun`. Check it with `./node_modules/.bin/bun --version`.

## Live vs Experimental

**Live** is the published catalog. Each entry is a portable component folder:

`apps/web/src/live/<group>/<Name>/`

Its `preview.tsx` only mounts the component. It has no sliders or ConfigurableShell.

**Experimental** is the WIP studio. Play on the shared dock (three sliders, three actions, Copy). **Save** (`⌘S`) writes a named project directory containing:

- `project.json` for identity and this idea’s dock labels/values
- `source.tsx` for the component (a `const SLIDERS` block is baked from the dock on Save / Copy / Make Live)

Projects live under `apps/web/src/experimental/ideas/`. Use **Open** to switch projects. **Make Live** asks which Live folder to publish into, then writes the portable component. Humans and agents may edit `source.tsx` directly, or add a new `apps/web/src/experimental/ideas/<Name>/source.tsx` folder. The app writes `project.json` if it is missing. See [Experimental Projects](docs/IDEA_PERSISTENCE.md).

## Add an experiment

Work at `/experimental` under `bun run dev`. Play on the shared dock (this idea’s JSON fills the labels and values). When the component is ready, use **Make Live**. Vite will pick up the new Live folder while the dev server is running.

Do not put WIP in `apps/web/src/live/shells/`, render ConfigurableShell in Experimental, or include authoring controls in a Live component. See `apps/web/src/live/buttons/PrimaryButton/preview.tsx` for a Live preview.

## Export

Copy the Live component folder into your app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. Do not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU components also need `vgpu` and `apps/web/src/gpu/` (see [WebGPU with vgpu](docs/WEBGPU.md)).

## Layout

```
apps/web          Vite React app (port 3000)
  index.html
  src/main.tsx        React entry
  src/app/            playground chrome (layout, Live catalog UI)
  src/experimental/   studio page, shared dock, ideas/
  src/live/           published catalog
apps/api          Bun HTTP API (port 3001)
  src/config/     ports, paths to idea and Live folders
  src/server/     Bun.serve routes + CORS
  src/features/   business logic
    ideas/        project validation, atomic storage, revisions, migration
    promote/      atomic and retryable Make Live artifacts
packages/api      PlaygroundApi contract + HTTP client
```

The UI talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`). Runtime parsers validate both sides. See [Experimental Projects](docs/IDEA_PERSISTENCE.md) for the storage and publishing rules.

More conventions: [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md). WebGPU ideas: [`docs/WEBGPU.md`](docs/WEBGPU.md)

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Vite UI + Bun API. Author ideas and Make Live here. |
| `bun run test` | All package tests |
| `bun run typecheck` | Strict TypeScript checks |
| `bun run build` / `bun run start` | Production snapshot (`vite preview` + API). Rebuilds on start; new Live entries are not hot-loaded. |

## Stack

Turborepo · Vite · React 19.2 · CSS Modules · React Router · Motion · vgpu (WebGPU) · Bun API
