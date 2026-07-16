# React Playground

A minimal Bun + React playground for iterating on isolated web components and exporting them into real apps.

Edits are in code — this is not a WYSIWYG editor. The UI is a Figma-like stage with an edge-reveal sidebar so canvas space stays maximized.

## Quick start

```bash
bun install
bun dev
```

Open the URL printed in the terminal. Move the pointer to the **left edge** to open the component browser.

## Layout

```
.
├── docs/                    # Project guidance and growth playbook
├── scripts/                 # Dev tooling (registry sync + dev entry)
├── src/
│   ├── playground/          # Experiments — copy these into real apps
│   ├── shell/               # Playground chrome (sidebar, canvas)
│   └── lib/                 # Discovery + generated registry
├── package.json
└── tsconfig.json
```

**`docs/`** — [BEST_PRACTICES.md](docs/BEST_PRACTICES.md): current stack conventions, how to add/export experiments, and a playbook for optional additions (routing, state, data fetching, tests).

**`scripts/`** — Bun helpers that keep the sidebar in sync with the filesystem:

| File | Purpose |
|------|---------|
| `sync-playground.ts` | Scans `src/playground/**/preview.tsx` and writes `src/lib/playground.gen.ts` |
| `dev.ts` | Runs sync, watches for new previews, then starts the dev server |

**`src/playground/`** — One folder per experiment: component + CSS Module + `preview.tsx`. Folder paths become sidebar groups and URL slugs.

**`src/shell/`** — Figma-like stage, edge-reveal sidebar, routing glue. Not meant for export.

**`src/lib/`** — `discover.ts` builds the sidebar tree; `playground.gen.ts` is auto-generated — don’t edit by hand.

## Scripts

| Command | Purpose |
|---------|---------|
| `bun dev` | Sync registry, watch for new `preview.tsx` files, start dev server |
| `bun run sync:playground` | Regenerate `playground.gen.ts` once (useful if an experiment doesn’t appear) |
| `bun run build` | Sync registry, then bundle static assets to `dist/` |
| `bun start` | Serve the production build |

Folder structure under `playground/` becomes the sidebar tree. Example:

- `playground/buttons/PrimaryButton/preview.tsx` → sidebar **buttons → Primary Button** → `/buttons/PrimaryButton`

## Add an experiment

1. Create `src/playground/<group>/<Name>/`
2. Add `Name.tsx` + `Name.module.css` (CSS Modules)
3. Add `preview.tsx` with a default export
4. With `bun dev` running, new `preview.tsx` files are picked up automatically (or run `bun run sync:playground`)

See [docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md) for the full convention, export checklist, and “add later” playbook (Zustand, TanStack Query, tests, etc.).

## Export

Copy the experiment folder into another app. Keep the component + `.module.css`; drop `preview.tsx` if you don’t need the demo harness. Do not depend on `src/shell/`.

## Stack

- React 19.2 + Bun
- CSS Modules for experiments
- React Router for shareable experiment URLs
- Motion for the interruptible sidebar
