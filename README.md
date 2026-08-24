# React Playground

A Bun + React + Turborepo workspace for building, previewing, and exporting isolated web components. The UI is a local SPA; a dedicated TypeScript API writes experiment files on disk.

This is not a WYSIWYG editor. The shell provides a Figma-like preview surface; all component logic and styles live in source files under `apps/web/src/playground/`.

## Quick start

```bash
bun install
bun run dev
```

`bun install` also drops **Bun 1.4.0** into `node_modules/.bin` for this repo only. It does not change your global Bun (`bun upgrade` would). After install, prefer `bun run …` so scripts pick up that local binary.

Turbo starts both apps:

- UI: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001)

Move the pointer to the left edge of the screen to open the component browser.

## Workflow

### Add an experiment

1. Create `apps/web/src/playground/<group>/<Name>/`
2. Add `Name.tsx` and `Name.module.css` (CSS Modules)
3. Add `preview.tsx` with a default export

With `bun dev` running, new `preview.tsx` files are registered automatically. If an experiment does not appear, run `bun run sync:playground`.

Folder paths map directly to the sidebar and URL structure:

- `apps/web/src/playground/buttons/PrimaryButton/preview.tsx` → sidebar **buttons → Primary Button** → `/buttons/PrimaryButton`

### Export to another app

Copy the experiment folder into your target project. Keep the component file(s) and `*.module.css`; omit `preview.tsx` unless you want the demo harness. Do not import from `apps/web/src/shell/` or `apps/web/src/lib/` — those are playground-only.

## Repository structure

```
.
├── apps/
│   ├── web/              # React playground UI
│   └── api/              # Local TypeScript API (disk persistence)
├── packages/
│   └── api/              # @react-playground/api — PlaygroundApi contract
├── docs/
├── package.json          # Bun workspaces + turbo
└── turbo.json
```

| Path | Description |
|------|-------------|
| [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md) | Stack conventions and experiment patterns |
| `apps/web/src/playground/` | One folder per experiment: component, CSS Module, and `preview.tsx` |
| `apps/web/src/shell/` | Application chrome — not intended for export |
| `apps/web/src/lib/playgroundApi.ts` | Single backend binding (`PlaygroundApi`) |
| `apps/api/` | HTTP server that writes playground files |
| `packages/api/` | Types, interface, and HTTP client |

The UI depends on `PlaygroundApi` only. Swap `createHttpPlaygroundApi` in `playgroundApi.ts` when replacing this local API.

## Local commands

| Command | Description |
|---------|-------------|
| `bun run dev` | UI + API via Turbo |
| `bun run sync:playground` | Regenerate `playground.gen.ts` once |
| `bun run build` | Build all packages |
| `bun run test` | Run all package tests |
| `bun run start` | Production start (UI + API) |

## Stack

- **Monorepo:** Turborepo + Bun workspaces
- **Runtime / bundler:** Bun 1.4 (pinned in `.bun-version` and the `bun` devDependency)
- **UI:** React 19.2
- **API:** Bun.serve TypeScript server
- **Experiment styles:** CSS Modules
- **Routing:** React Router (shareable experiment URLs)
- **Motion:** Motion (sidebar transitions)
