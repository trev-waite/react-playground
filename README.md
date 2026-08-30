# React Playground

Local playground for isolated React components. **Live** is the published catalog. **Experimental** is a full-bleed studio for WIP — save, switch ideas, then Make Live.

This is not a WYSIWYG editor. Preview chrome lives in `apps/web/src/shell/`. Portable components live in `apps/web/src/playground/`.

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

**Live** — published catalog in the sidebar. Each entry is a portable component folder:

`apps/web/src/playground/<group>/<Name>/`

Live `preview.tsx` only mounts the component. No sliders, no ConfigurableShell.

**Experimental** — full-bleed studio for WIP, not ConfigurableShell. Sketch in the studio, **Save** (`⌘S`) to `apps/web/src/playground/experimental/` (gitignored), **Open** to switch saved projects, then **Make Live** into a group. Make Live writes the component (and a mount-only preview) into Live. The experimental copy stays so you can keep iterating.

Do not create files by hand in `experimental/` or `shells/`. Do not wrap new ideas in ConfigurableShell.

## Add an experiment

Work in **Experimental** (`/experimental`). Wire sliders and actions on the Experimental dock. When it is ready, **Make Live**.

Do not add a Live folder with ConfigurableShell. Published Live examples: `apps/web/src/playground/buttons/PrimaryButton/preview.tsx`.

## Export

Copy the experiment folder into your app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. Do not import from `apps/web/src/shell/` or `apps/web/src/lib/`.

## Layout

```
apps/web          UI (port 3000)
apps/api          local HTTP API (port 3001)
  src/config/     ports, paths, Live registry refresh
  src/server/     Bun.serve routes + CORS
  src/features/   business logic
    ideas/        save / load Experimental WIP
    promote/      Make Live
packages/api      PlaygroundApi contract + HTTP client
```

The UI talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`). Swap that one binding to replace the local API.

More conventions: [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md)

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | UI + API |
| `bun run sync:playground` | Rebuild the Live registry |
| `bun run test` | All package tests |
| `bun run build` / `bun run start` | Production |

## Stack

Turborepo + Bun 1.4 workspaces · React 19.2 · CSS Modules · React Router · Motion
