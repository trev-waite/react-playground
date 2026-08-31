## Coding Standards

- Prefer simple, direct solutions. Use KISS and DRY as guidance - not rigid rules.
- Follow framework best practices and patterns already established in this repository.
- Match the existing architecture, naming, formatting, and file organization. Improvements are welcomed if they make sense.
- Prioritize maintainability, readability, correctness, and reasonable extensibility.
- Keep changes focused. Do not refactor unrelated code unless necessary.
- Reuse existing utilities, components, types, and patterns before creating new ones.
- Avoid unnecessary abstractions, dependencies, redundant computation, and duplicated logic.
- Do not add third-party libraries for trivial functionality.
- Write self-explanatory code. Add comments only for non-obvious intent, constraints, or tradeoffs.
- Preserve or improve type safety. Avoid broad casts and suppression directives unless justified.
- Handle errors intentionally. Do not silently swallow failures.
- Update or add tests when behavior changes.
- Never hardcode, expose, log, or commit secrets or sensitive values.

## Experimental view vs ConfigurableShell

These are separate surfaces that share look and feel, not one component used twice.

- **ConfigurableShell** (`apps/web/src/live/shells/ConfigurableShell/`) is a portable Live catalog card. Keep it self-contained. Do not add save/switch/promote, idea exporters, or Experimental layout to it. Do not reuse it as the experiment host.
- **Experimental view** (`apps/web/src/experimental/`) is the studio: page, shared dock, and `ideas/` projects. Echo ConfigurableShell's visual language in Experimental's own CSS and layout. Do not render `<ConfigurableShell>` in Experimental, and do not import `ConfigurableShell.module.css`.
- **`apps/web/src/app/`** is playground chrome (layout, Live catalog UI). It is not ConfigurableShell.

Experimental may import `ProximityControl`, `linearScale`, and icons so the controls feel the same. It must not import the `ConfigurableShell` component. GPU ideas import `@/gpu` and use `vgpu`. See `docs/WEBGPU.md`.

**Workflow:** create and play in Experimental (dock sliders/buttons are studio-only). Add `apps/web/src/experimental/ideas/<Name>/source.tsx` on disk or via Save. Make Live asks for a Live folder, then writes only the portable component — current slider numbers baked in, no dock or mocks — into `apps/web/src/live/<folder>/<Name>/`. Live `preview.tsx` renders `<Name />` and nothing else.

## Naming

Follow the language and framework conventions used by the repository.

For TypeScript and JavaScript:

- `camelCase` for variables and functions.
- `PascalCase` for components, classes, and types.
- `UPPER_SNAKE_CASE` for true constants.
- Prefer descriptive names over vague abbreviations.

```typescript
// Avoid
const max_count = 5;
let UserName = "trev";

// Prefer
const MAX_RETRY_COUNT = 5;
let userName = "trev";
```
