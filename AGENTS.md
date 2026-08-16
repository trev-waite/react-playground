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
