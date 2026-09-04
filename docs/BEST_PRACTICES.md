# Best Practices

Stable conventions only. Versions, commands, and folder maps live in the README and the code.

## React

Use Effects only to synchronize with something outside React (browser APIs, subscriptions, network). Derive during render; handle user input in event handlers. Prefer that over Effect chains. Keep experiment previews lazy.

## Experiments

Author WIP in Experimental. Humans and agents may create `apps/web/src/experimental/ideas/<Name>/source.tsx` or Save from the UI. The app mints `project.json` when it is missing and reconciles digest and revision after source edits. Make Live asks for a Live folder and publishes only the portable component.

Portable components may use CSS Modules but must not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU ideas may import `@/gpu` (see [WebGPU with vgpu](WEBGPU.md)). Do not put WIP in `apps/web/src/live/shells/` or render ConfigurableShell in Experimental.

## Backend

The UI talks only to `PlaygroundApi`; do not scatter `fetch("/api/...")`. Put behavior in `apps/api/src/features/`. Keep `src/server/` limited to validation and routing.

For saved ideas, `project.json` owns metadata and `source.tsx` owns code. Publish from that saved project instead of accepting duplicate name or source data; the Live destination belongs only to the publish request.

## Motion

Sidebar motion should stay interruptible. Honor `prefers-reduced-motion` and `prefers-reduced-transparency`.
