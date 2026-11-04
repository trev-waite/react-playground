# Best Practices

Stable conventions only. Versions, commands, and folder maps live in [Using the playground](USING_THE_PLAYGROUND.md) and the code.

## React

Use Effects only to synchronize with something outside React (browser APIs, subscriptions, network). Derive during render; handle user input in event handlers. Prefer that over Effect chains. Keep experiment previews lazy.

## Experiments

Author WIP in Experimental. Humans and agents may create `apps/web/src/experimental/ideas/<Name>/source.tsx` or Save from the UI. The app mints `project.json` when it is missing and reconciles digest and revision after source edits. Make Live asks for a Live folder and publishes only the portable component.

Portable components may use CSS Modules but must not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU ideas may import `@/gpu` (see [WebGPU with vgpu](WEBGPU.md)). Do not put WIP in `apps/web/src/live/shells/` or render ConfigurableShell in Experimental.

## Backend

The UI talks only to `PlaygroundApi`; do not scatter `fetch("/api/...")`. Put behavior in `apps/api/src/features/`. Keep `src/server/` limited to validation and routing.

For saved ideas, `project.json` owns metadata and `source.tsx` owns code. Publish from that saved project instead of accepting duplicate name or source data; the Live destination belongs only to the publish request.

## Motion

Use the springs in `apps/web/src/app/motion/transitions.ts` (`morph` for the Live deck and page scroll, `panel` for edge rails, `pill` for toggles) instead of one-off curves. Animate through the small in-house engine in `apps/web/src/app/motion/` (motion values, `animate`, and hooks that write styles on one shared frame loop); its springs are a faithful port of Motion's, checked against recorded Motion traces. Motion should stay interruptible: retarget a spring rather than waiting for it to finish. Honor `prefers-reduced-motion` and `prefers-reduced-transparency`. See [UI Design](standards/ui-design.md).

Hold 60 fps on integrated GPUs. Measure transitions in real Chrome (frame gaps, long animation frames, a trace) before and after a change.

- Drive per-frame values with motion values, never React state. Re-rendering a page 60 times a second costs more than the animation.
- Animate `transform` and `opacity`. Add `will-change: transform` only while something flies, and cap how far off-screen layers scale; a huge first raster stalls the whole frame.
- Do not blur (`backdrop-filter`) a surface that moves over a flat color, and keep blur radii fixed while animating.
- Mount heavy content before it animates (idle pre-warming, or wait for a ready signal), and memoize subtrees a transition re-renders.
- Pause offscreen loops (`IntersectionObserver`) and defer expensive resize work until the size settles.

`apps/web/src/lint/performance.test.ts` enforces these rules in `bun run test`. When an exception is justified, say why with a `perf-allow: <reason>` comment on the CSS rule, or on or just above the line of code.

## Checks

`bun run lint` (oxlint, configured in `.oxlintrc.json`), `bun run typecheck`, and `bun run test` must pass before work is done; CI runs all three. The lint covers React's rules (hooks, refs, no state set in Effects), accessibility, and leftovers such as unused code and `console.log`. Files listed in the `.oxlintrc.json` baseline override predate a rule; fix them when you touch them and drop them from the list, and never add new files to it.

`apps/web/src/lint/standards.test.ts` enforces the house rules no off-the-shelf linter knows: Live components stay portable, honor `prefers-reduced-motion`, and gate hover styles behind `@media (hover: hover)`; filters settle on `filter: none` rather than `blur(0)`, which Safari leaves blurred; and no commented-out code. A component's own motion contract (shared timing, compositor-only properties) lives in a test beside it, such as `MenuPill.test.ts`.

