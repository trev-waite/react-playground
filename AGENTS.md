# AGENTS.md

React Playground is a personal studio for learning React by building isolated components. A component is written straight into Live (`apps/web/src/live/`) or starts as an idea in Experimental (`apps/web/src/experimental/`), a local-only studio with a shared dock of sliders, where Make Live writes the tuned, portable component into Live; a Live component can be brought back into Experimental to tune. Live is the deployable static catalog (`apps/web/src/app/`); it never imports the studio or Experimental, and `vite build` ships only Live. Shared libraries live in `packages/` (such as `@react-playground/layout-sheet`), and both Live and Experimental may import them.

Favor sound engineering judgment over rigid rules, and see below for the software engineering principles.

Start with the [README](README.md) for setup, commands, and workflows. Read the standard that fits the change:

- [Architecture](docs/standards/architecture.md): domain modeling, module boundaries, dependency direction, and when an abstraction is earned.
- [Engineering Principles](docs/standards/engineering-principles.md): designing from first principles, simplicity, cohesion, and removing what an old design left behind.
- [Working Approach](docs/standards/working-approach.md): understanding before changing, solving root causes, and keeping changes focused.
- [Quality & Verification](docs/standards/quality-and-verification.md): testing behavior, validating at the right scope, and reporting what was not verified.
- [UI Design](docs/standards/ui-design.md): spacing, type, contrast, interaction, and motion rules every screen should pass.

Consult deeper documentation only when the task warrants it, rather than loading everything for every change.

For UI defaults, use the `ui-golden-rules` skill when available.

Adding a component, an experiment, or a shader? Follow the matching checklist in `.cursor/skills/`: `new-component`, `new-experiment`, or `gpu-idea`.

## Boundaries

- Never expose secrets, credentials, or sensitive data.
- Do not add code comments unless the context is absolutely necessary and the code cannot fully explain the reason for it.
- Clean up unused code and unneeded additional docs after all code changes
- Finish only when `bun run lint`, `bun run typecheck`, and `bun run test` pass. Fix what they flag rather than adding exceptions; see [Best Practices](docs/BEST_PRACTICES.md#checks).
- Organize for findability: group related files in folders named by feature or layer, give each distinct set of content or concern its own clearly named file where appropriate.
