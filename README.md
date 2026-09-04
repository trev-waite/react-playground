# React Playground

Local playground for inventing isolated React components. **Experimental** is the studio: write an idea, play with it on a shared dock of sliders and buttons, then **Make Live**. **Live** is the published catalog — a plain component, configured as you last saw it, with no playground chrome.

This is not a WYSIWYG editor. Playground chrome lives in `apps/web/src/app/`. Portable Live components live in `apps/web/src/live/`. The Experimental studio and saved ideas live in `apps/web/src/experimental/`.

## Quick start

```bash
bun install
bun run dev
```

- UI: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001) (writes experiment files)

Hover the left edge for the component browser. Use the **Live / Experimental** toggle.

The repo pins **Bun 1.4** via `bun install` (project-local, does not change your global Bun). Prefer `bun run …` so scripts use that binary.

## Live vs Experimental

**Live** is the published catalog. Each entry is a portable component folder:

`apps/web/src/live/<group>/<Name>/`

Its `preview.tsx` only mounts the component. It has no sliders or ConfigurableShell.

**Experimental** is the WIP studio. Play on the shared dock (three sliders, three actions, Copy). **Save** (`⌘S`) writes a named project directory containing:

- `project.json` for identity and this idea’s dock labels/values
- `source.tsx` for the component (a `const SLIDERS` block is baked from the dock on Save / Copy / Make Live)

Projects live under `apps/web/src/experimental/ideas/`. Use **Open** to switch projects. **Make Live** asks which Live folder to publish into, then writes the portable component. Humans and agents may edit `source.tsx` directly, or add a new `apps/web/src/experimental/ideas/<Name>/source.tsx` folder. The app writes `project.json` if it is missing. See [Experimental Projects](docs/IDEA_PERSISTENCE.md).

## Add an experiment

Work at `/experimental`. Play on the shared dock (this idea’s JSON fills the labels and values). When the component is ready, use **Make Live**.

Do not put WIP in `apps/web/src/live/shells/`, render ConfigurableShell in Experimental, or include authoring controls in a Live component. See `apps/web/src/live/buttons/PrimaryButton/preview.tsx` for a Live preview.

## Export

Copy the Live component folder into your app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. Do not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU components also need `vgpu` and `apps/web/src/gpu/` (see [WebGPU with vgpu](docs/WEBGPU.md)).

## Layout

```
apps/web          UI (port 3000)
  src/app/            playground chrome (layout, Live catalog UI)
  src/experimental/   studio page, shared dock, ideas/
  src/live/           published catalog
apps/api          local HTTP API (port 3001)
  src/config/     ports, paths, Live registry refresh
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
| `bun run dev` | UI + API |
| `bun run sync:playground` | Rebuild the Live registry |
| `bun run test` | All package tests |
| `bun run typecheck` | Strict TypeScript checks |
| `bun run build` / `bun run start` | Production |

## Stack

Turborepo + Bun 1.4 workspaces · React 19.2 · CSS Modules · React Router · Motion · vgpu (WebGPU)
