# Best Practices

Stable conventions only. Versions, commands, and folder maps live in the README and the code.

## React

Use Effects only to synchronize with something outside React (browser APIs, subscriptions, network). Derive during render; handle user input in event handlers. Prefer that over Effect chains. Keep experiment previews lazy.

## Experiments

Author WIP in Experimental. Let the app create project directories and manage `project.json`; humans and agents may edit `source.tsx`. Make Live asks for a Live folder and publishes only the portable component.

Portable components may use CSS Modules but must not import from `apps/web/src/shell/` or `apps/web/src/lib/`. Do not put WIP in `apps/web/src/live/shells/` or render ConfigurableShell in Experimental.

## Backend

The UI talks only to `PlaygroundApi`; do not scatter `fetch("/api/...")`. Put behavior in `apps/api/src/features/`. Keep `src/server/` limited to validation and routing.

For saved ideas, `project.json` owns metadata and `source.tsx` owns code. Publish from that saved project instead of accepting duplicate name, folder, or source data.

## Motion

Sidebar motion should stay interruptible. Honor `prefers-reduced-motion` and `prefers-reduced-transparency`.
