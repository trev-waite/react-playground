# React Playground

Local playground for isolated React components. **Live** is the published catalog. **Experimental** is a full-bleed studio for WIP — save, switch ideas, then Make Live.

This is not a WYSIWYG editor. Preview chrome lives in `apps/web/src/shell/`. Portable Live components live in `apps/web/src/live/`. WIP ideas live in `apps/web/src/experimental/`.

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

**Experimental** is the WIP studio. **Save** (`⌘S`) creates a named project directory containing:

- `project.json` for app-managed metadata
- `source.tsx` for canonical, editable component code

Use **Open** to switch projects. **Make Live** asks which Live folder to publish into, then writes the portable component. The WIP project remains after publishing. Humans and agents may edit `source.tsx` directly; let the app manage `project.json`. See [Experimental Projects](docs/IDEA_PERSISTENCE.md).

## Add an experiment

Work at `/experimental`. Put authoring controls in the Experimental dock. When the component is ready, use **Make Live**.

Do not put WIP in `apps/web/src/live/shells/`, render ConfigurableShell in Experimental, or include authoring controls in a Live component. See `apps/web/src/live/buttons/PrimaryButton/preview.tsx` for a Live preview.

## Export

Copy the Live component folder into your app. Keep the component and `*.module.css`; drop `preview.tsx` unless you want the demo. Do not import from `apps/web/src/shell/` or `apps/web/src/lib/`.

## Layout

```
apps/web          UI (port 3000)
  src/live/       published catalog
  src/experimental/  saved WIP ideas
  src/shell/      app chrome
apps/api          local HTTP API (port 3001)
  src/config/     ports, paths, Live registry refresh
  src/server/     Bun.serve routes + CORS
  src/features/   business logic
    ideas/        project validation, atomic storage, revisions, migration
    promote/      atomic and retryable Make Live artifacts
packages/api      PlaygroundApi contract + HTTP client
```

The UI talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`). Runtime parsers validate both sides. See [Experimental Projects](docs/IDEA_PERSISTENCE.md) for the storage and publishing rules.

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
