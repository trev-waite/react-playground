---
name: new-experiment
description: Scaffolds a new playground experiment component with ConfigurableShell sliders and options. Use when creating a new experiment, prototype, playground component, or when the user wants a component they can configure with sliders.
disable-model-invocation: true
---

# New Experiment

Create one portable experiment under `apps/web/src/playground/`. Do not start writing files until you have asked the user what to build and how to control it.

## Ask first

Ask the user questions about what sliders and options they want to be able to configure about the component. Also ask anything still unknown from this list. Skip a question only if the user already answered it.

1. **Idea name** — display title (becomes the PascalCase component name).
2. **Folder** — existing Live group (`buttons`, `feedback`, …) or a new one. Never `shells` or `experimental`.
3. **Sliders** — for each: label, what it changes, min, max, step, default.
4. **Options** — toggles, variants, or actions (e.g. on/off, size, tone). For each: label and values.

If they are unsure, propose 2–4 obvious controls from the idea and confirm before scaffolding.

## Where

```
apps/web/src/playground/<folder>/<Name>/
  Name.tsx
  Name.module.css
  preview.tsx
```

- `<folder>`: lowercase, digits, hyphens (`my-shapes`).
- `<Name>`: PascalCase, starts with a letter (`MorphBlob`).
- Reserved: `shells` (ConfigurableShell), `experimental` (UI-saved WIP, gitignored, skipped by registry sync).

Do not put files in `apps/web/src/playground/experimental/` or `apps/web/src/playground/shells/`. Do not set `meta.status` to `"experimental"` — that hides the component from Live and does not show it on the Experimental page.

## Files

**`Name.tsx`** — the portable component. Props match the confirmed sliders and options. Import only its CSS Module. No imports from `apps/web/src/shell/`, `apps/web/src/lib/`, or ConfigurableShell.

**`Name.module.css`** — styles for that component only.

**`preview.tsx`** — playground harness. Wrap the component in `ConfigurableShell`. Wire sliders as `controls` with `linearScale(min, max, step)`. Wire options as `actions` (toggles/pressed) or extra controls. Pass `getExportCode` that returns the component’s current source.

Import the shell from the experiment folder:

```tsx
import { ConfigurableShell, linearScale } from "../../shells/ConfigurableShell/ConfigurableShell";
```

```tsx
export const meta = {
  title: "Idea Title",
};

export default function NamePreview() {
  // one useState per slider / option
  return (
    <ConfigurableShell
      controls={/* ShellControl[] from confirmed sliders */}
      actions={/* optional option toggles */}
      getExportCode={() => /* portable source at current values */}
    >
      <Name /* bind props */ />
    </ConfigurableShell>
  );
}
```

See `apps/web/src/playground/shells/ConfigurableShell/preview.tsx` for the control pattern and `apps/web/src/playground/buttons/PrimaryButton/` for a simple portable component.

## After creating

With `bun run dev` running, `preview.tsx` is picked up automatically. If it does not appear in the Live sidebar, run `bun run sync:playground`. URL: `/<folder>/<Name>`.

Do not modify ConfigurableShell. Experimental is its own full-bleed workbench that only shares look and feel with the shell — do not mount ConfigurableShell there, and do not fold save/switch/promote into the shell.
