# Best Practices

> Generated **2026-08-23**. Reflects guidance and versions as of that date. Re-run the research pass (or regenerate this file) if the project sits untouched for a long time, or before adding a major dependency — versions and official guidance drift.

This playground is intentionally minimal: Bun + React, CSS Modules for experiments, React Router for shareable URLs, and Motion for the edge-reveal sidebar. Live experiments under `apps/web/src/playground/<group>/<Name>/` are the exportable unit of work. `apps/web/src/shell/` is chrome, not product. Persistence goes through `PlaygroundApi` (`packages/api`) to `apps/api`.

---

## Current state

### React

- **Version:** `react` / `react-dom` `^19.2.8` ([React versions](https://react.dev/versions))
- Stable 19.2 line; use the Latest release channel for app work.

### `useEffect`

Official guidance ([You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [`useEffect` reference](https://react.dev/reference/react/useEffect)):

- Use Effects to **synchronize with an external system** (browser APIs, subscriptions, third-party widgets, network).
- Do **not** use Effects to derive state from props/state, transform data for render, or handle user events — do those during render or in event handlers.
- In this app, the sidebar’s `pointermove` / `keydown` listeners are a valid Effect: they sync React UI to the browser’s pointer and keyboard.

### Bun + React

- Scaffold: `bun init --react` ([Bun React guide](https://bun.com/docs/guides/ecosystem/react))
- Scripts:
  - `bun run dev` — Turbo starts the UI (`apps/web`) and local API (`apps/api`)
  - `bun run build` — static assets to `dist/`
  - `bun run start` — production serve
- CSS Modules (`.module.css`) are supported by Bun’s bundler with zero config ([CSS Modules](https://bun.com/docs/bundler/css#css-modules)).
- **Dev note:** Bun’s browser HMR currently omits CSS Module export objects (`ReferenceError: import_*_module`). This project runs with `hmr: false` in [`apps/web/src/index.ts`](../apps/web/src/index.ts) so Modules work; saves still trigger a full page reload. Revisit when upgrading Bun.

### Libraries in this project

| Library | Version (approx) | Role |
|---------|------------------|------|
| `react` / `react-dom` | ^19.2.8 | UI |
| `react-router` | ^8.3.0 | SPA routes for experiments |
| `motion` | ^13.1.1 | Interruptible sidebar springs (`motion/react`) |
| `bun` | 1.4.0 | Project-local runtime (does not replace a global Bun install) |

### Vercel React best practices

Vercel publishes performance-oriented React guidance as [react-best-practices](https://vercel.com/blog/introducing-react-best-practices) / [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills). Highest impact for this repo:

- Avoid async waterfalls when you add data fetching later.
- Keep experiment previews lazy-loaded (via generated registry + `React.lazy`) to limit bundle cost as the playground grows.
- Prefer calculating during render over Effect chains.

### Architecture conventions

- **`apps/web/src/playground/<group>/<Name>/`** — Live experiments. Folder tree = sidebar tree. Each leaf has `preview.tsx` (canvas entry) + co-located component + `.module.css`. Reserved: `shells/` (ConfigurableShell), `experimental/` (UI-saved WIP, gitignored, skipped by registry sync).
- **`apps/web/src/shell/`** — playground chrome (Live canvas, Experimental studio, sidebar). Do not export it. Experimental and ConfigurableShell share look and feel only — do not render `<ConfigurableShell>` in Experimental.
- **`apps/web/src/lib/discover.ts`** — builds the sidebar tree from the generated registry.
- **`apps/web/src/lib/playgroundApi.ts`** — the only UI binding to the backend (`PlaygroundApi`).
- **`apps/web/scripts/sync-playground.ts`** — scans Live `preview.tsx` files with `Bun.Glob` and writes `playground.gen.ts`. Runs on `bun run dev` / `bun run build`.

---

## Adding a new experiment

1. Create a folder under `apps/web/src/playground/`, e.g. `apps/web/src/playground/forms/TextField/`.
2. Add the portable component + CSS Module:
   - `TextField.tsx`
   - `TextField.module.css`
3. Add `preview.tsx` with a default export (and optional `meta`):

```tsx
import { TextField } from "./TextField";

export const meta = { title: "Text Field" };

export default function TextFieldPreview() {
  return <TextField label="Email" />;
}
```

4. Save — `bun run dev` watches for new `preview.tsx` files and regenerates the registry. Open the left edge sidebar; the folder path appears as a collapsible group. URL: `/forms/TextField`.

If a brand-new experiment does not appear immediately, run `bun run sync:playground` (or restart `bun run dev`).

For WIP in the Experimental view, use **Save** in the UI. Do not scaffold files into `experimental/` or `shells/`.

---

## Exporting an experiment

1. Copy the experiment folder from `apps/web/src/playground/...` into the target app.
2. Keep the component file(s) and `*.module.css`.
3. Drop `preview.tsx` unless the target app wants the same demo harness.
4. Ensure the target bundler supports CSS Modules (Vite, Bun, webpack `css-loader` modules, etc.).
5. Adjust any relative imports; there should be no imports from `apps/web/src/shell/` or `apps/web/src/lib/`.

---

## Adding this later

### Routing

**Already included.** React Router powers `/` and `/:slug*` experiment URLs. When adding more app-level pages outside experiments, nest routes under `App.tsx` alongside the playground shell, or split a separate layout — only once you have real non-playground pages.

### Global state (Zustand)

**When warranted:** auth/session, or UI state shared across unrelated areas (not parent→child props).

**Not warranted yet:** sidebar open state and folder expand state stay local.

```bash
bun add zustand
```

Check current version at install time. Minimal pattern:

```ts
// apps/web/src/state/ui.ts
import { create } from "zustand";

type UiState = { theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void };

export const useUiStore = create<UiState>(set => ({
  theme: "light",
  setTheme: theme => set({ theme }),
}));
```

Keep stores small and focused. Prefer `useState` / `useReducer` for local UI.

### Data-fetching library (TanStack Query)

**When warranted:** caching, retries, shared server state, avoiding ad-hoc `useEffect` fetch chains.

```bash
bun add @tanstack/react-query
```

Wrap the app in `QueryClientProvider`, then use `useQuery` / `useMutation` in previews or shell. Prefer parallel queries over sequential Effect waterfalls ([Vercel: eliminate waterfalls](https://vercel.com/blog/introducing-react-best-practices)).

### Testing

**When warranted:** you care about regression coverage for portable components.

Bun includes a test runner:

```bash
bun test
```

Suggested layout: co-locate `PrimaryButton.test.tsx` next to the component, or use `apps/web/src/playground/**/__tests__/`. Add `@testing-library/react` + `happy-dom` / `jsdom` when you start writing component tests — look up current versions at that time.

### Feature-folder structure

**When warranted:** roughly 2+ distinct product features beyond the playground itself.

Migrate gradually: move a domain into `apps/web/src/features/<name>/` with its own components and styles. Keep `apps/web/src/playground/` as the experiment surface that imports from features when you want demos of real modules.

### Tailwind (shell only)

**When warranted:** you want utility-speed styling for chrome only. Prefer keeping **experiments on CSS Modules** so export stays portable. If adding Tailwind, scope it to `apps/web/src/shell/` and avoid requiring Tailwind inside `apps/web/src/playground/` components you plan to export.

```bash
# look up current Bun + Tailwind setup in Bun docs at the time
bun init --react=tailwind   # only for greenfield; mid-project follow Bun Tailwind guide
```

---

## Motion / sidebar feel

Sidebar uses critically damped springs (`bounce: 0`, `duration: ~0.35`) so open/close is interruptible. With `prefers-reduced-motion`, it cross-fades instead of sliding. With `prefers-reduced-transparency`, the panel drops blur and uses a solid surface.
