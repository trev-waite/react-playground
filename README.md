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

**Live** — published experiments in the sidebar. Each one is a folder:

`apps/web/src/playground/<group>/<Name>/`

**Experimental** — playground chrome, not ConfigurableShell. Sketch in the studio, **Save** (`⌘S`) to `apps/web/src/playground/experimental/` (gitignored), switch saved ideas, then **Make Live** into a group. Make Live copies the files into Live and deletes the experimental copy.

Do not create files by hand in `experimental/` or `shells/`.

## Add a Live experiment

1. Create `apps/web/src/playground/<group>/<Name>/`
2. Add `Name.tsx` and `Name.module.css`
3. Add `preview.tsx` with a default export (wrap in ConfigurableShell if you want sliders)

With `bun run dev`, new `preview.tsx` files register automatically. If one is missing, run `bun run sync:playground`.

Example: `apps/web/src/playground/buttons/PrimaryButton/preview.tsx` → sidebar **buttons → Primary Button** → `/buttons/PrimaryButton`

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
