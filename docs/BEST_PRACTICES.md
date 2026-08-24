# Best Practices

Stable conventions only. Versions, commands, and folder maps live in the README and the code.

## React

Use Effects only to synchronize with something outside React (browser APIs, subscriptions, network). Derive during render; handle user input in event handlers. Prefer that over Effect chains. Keep experiment previews lazy.

## Experiments

CSS Modules on portable components. No imports from `apps/web/src/shell/` or `apps/web/src/lib/`. Do not put WIP by hand in `experimental/` or `shells/` — Save in Experimental, or add a Live folder with `preview.tsx`.

## Backend

The UI talks only to `PlaygroundApi` (`apps/web/src/lib/playgroundApi.ts`). Do not scatter `fetch("/api/...")`. Put API behavior in `apps/api/src/features/`; `src/server/` only wires routes.

## Motion

Sidebar motion should stay interruptible. Honor `prefers-reduced-motion` and `prefers-reduced-transparency`.
