# React Playground

A minimal Bun + React playground for iterating on isolated web components and exporting them into real apps.

Edits are in code — this is not a WYSIWYG editor. The UI is a Figma-like stage with an edge-reveal sidebar so canvas space stays maximized.

## Quick start

```bash
bun install
bun dev
```

Open the URL printed in the terminal. Move the pointer to the **left edge** to open the component browser.

| Script | Purpose |
|--------|---------|
| `bun dev` | Dev server (full page reload on save) |
| `bun run build` | Static build → `dist/` |
| `bun start` | Serve production build |

## Layout

```
src/
  playground/     ← your experiments (exportable)
  shell/          ← playground chrome (not for export)
  lib/discover.ts ← builds sidebar tree from playground.gen.ts
  (scripts/sync-playground.ts scans folders → playground.gen.ts)
```

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
