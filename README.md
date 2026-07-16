# React Playground

A Bun + React workspace for building, previewing, and exporting isolated web components. Edit in code; the app renders your work on a full-bleed canvas with an edge-reveal sidebar for navigation.

This is not a WYSIWYG editor. The shell provides a Figma-like preview surface; all component logic and styles live in source files under `src/playground/`.

## Quick start

```bash
bun install
bun dev
```

Open the URL printed in the terminal. Move the pointer to the left edge of the screen to open the component browser.

## Workflow

### Add an experiment

1. Create `src/playground/<group>/<Name>/`
2. Add `Name.tsx` and `Name.module.css` (CSS Modules)
3. Add `preview.tsx` with a default export

With `bun dev` running, new `preview.tsx` files are registered automatically. If an experiment does not appear, run `bun run sync:playground`.

Folder paths map directly to the sidebar and URL structure:

- `src/playground/buttons/PrimaryButton/preview.tsx` → sidebar **buttons → Primary Button** → `/buttons/PrimaryButton`

### Export to another app

Copy the experiment folder into your target project. Keep the component file(s) and `*.module.css`; omit `preview.tsx` unless you want the demo harness. Do not import from `src/shell/` or `src/lib/` — those are playground-only.

## Repository structure

```
.
├── docs/                 # Conventions, export guide, growth playbook
├── scripts/              # Registry sync and dev entry (invoked by local commands)
├── src/
│   ├── playground/       # Experiments — portable, exportable components
│   ├── shell/            # Playground UI (sidebar, canvas, routing)
│   └── lib/              # Discovery logic and generated registry
├── package.json
└── tsconfig.json
```

| Path | Description |
|------|-------------|
| [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md) | Stack conventions, experiment patterns, and guidance for adding routing, state, data fetching, and tests later. |
| `src/playground/` | One folder per experiment: component, CSS Module, and `preview.tsx`. |
| `src/shell/` | Application chrome — not intended for export. |
| `src/lib/discover.ts` | Builds the sidebar tree from the generated registry. |
| `src/lib/playground.gen.ts` | Auto-generated lazy-import map. Do not edit manually. |

### `scripts/` internals

These files are called by [local commands](#local-commands), not run directly during normal development.

| File | When it runs | What it does |
|------|--------------|--------------|
| `sync-playground.ts` | Start of `bun dev` and `bun run build`; on `preview.tsx` changes during dev; via `bun run sync:playground` | Scans `src/playground/**/preview.tsx` and writes `playground.gen.ts` |
| `dev.ts` | `bun dev` only | Syncs the registry, watches for new previews, starts the dev server |

## Local commands

| Command | Description |
|---------|-------------|
| `bun dev` | Development server with automatic registry sync |
| `bun run sync:playground` | Regenerate `playground.gen.ts` once |
| `bun run build` | Sync registry, then output a static build to `dist/` |
| `bun start` | Serve the production build (`src/index.ts`) |

## Stack

- **Runtime / bundler:** Bun
- **UI:** React 19.2
- **Experiment styles:** CSS Modules
- **Routing:** React Router (shareable experiment URLs)
- **Motion:** Motion (sidebar transitions)
