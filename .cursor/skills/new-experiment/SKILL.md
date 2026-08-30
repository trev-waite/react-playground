---
name: new-experiment
description: Author a playground idea in Experimental view, then Make Live as a portable component with no shell or sliders. Use when creating a new experiment, prototype, or configurable playground idea.
disable-model-invocation: true
---

# New Experiment

Author in **Experimental view**. Do not wrap ideas in ConfigurableShell. Live publishes the portable component only.

Do not start writing files until you have asked the user what to build and how to control it.

## Ask first

Ask anything still unknown from this list. Skip a question only if the user already answered it.

1. **Idea name** — display title (becomes the PascalCase component name on Make Live).
2. **Live folder** — existing group (`buttons`, `feedback`, …) or a new one. Used later by Make Live. Never `shells` or `experimental`.
3. **Sliders** — for each: label, what it changes, min, max, step, default. These belong on the Experimental dock, not in Live.
4. **Options** — toggles, variants, or actions (Build, Dissolve, Construct, …). For each: label and values.

If they are unsure, propose 2–4 obvious controls from the idea and confirm before implementing.

## Where to work

Experimental chrome:

- `apps/web/src/shell/ExperimentalPage.tsx`
- `apps/web/src/shell/IdeaWorkbench.tsx`
- Specimen files under `apps/web/src/shell/workbench/<Name>/` when the idea needs its own modules

Save (`⌘S`) writes WIP under `playground/experimental/`. **Open** switches saved projects. Do **not** create Live files yet. Do **not** write into `apps/web/src/playground/experimental/` or `apps/web/src/playground/shells/` by hand.

## Do not use ConfigurableShell

ConfigurableShell is a separate Live catalog card. Experiments only echo its look.

- Do not import or render `ConfigurableShell`.
- Do not import `ConfigurableShell.module.css`.
- Experimental may import `ProximityControl`, `linearScale`, and icons so the dock feels the same.

## Experimental dock

Wire confirmed sliders to `ProximityControl` + `linearScale` in `IdeaWorkbench`. Wire options as dock buttons (Build / Dissolve / Construct / Copy, or whatever the idea needs). Register `registerIdeaExporter` with **portable component source** — no shell, no sliders, no workbench chrome.

## Make Live (later)

The user saves in Experimental, then **Make Live**. That writes the portable component into Live. The experimental copy stays so they can keep iterating.

```
apps/web/src/playground/<folder>/<Name>/
  Name.tsx          ← exported component only
  preview.tsx       ← `return <Name />` only
```

Live `preview.tsx` must not include sliders, actions, or ConfigurableShell. See `apps/web/src/playground/buttons/PrimaryButton/preview.tsx`.

Do not add a Live `preview.tsx` yourself unless the user explicitly asked to publish. Do not set `meta.status` to `"experimental"`.

## After implementing

Open **Experimental** (`/experimental`), not a Live slug. Confirm the dock controls the specimen. Run the repository’s existing checks.
