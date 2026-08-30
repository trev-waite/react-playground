---
name: new-experiment
description: Create or edit a playground idea in Experimental, then optionally publish it as a portable Live component. Use for experiments, prototypes, saved ideas, or Experimental authoring controls.
disable-model-invocation: true
---

# New Experiment

Build ideas in Experimental. Keep Experimental, Live components, and ConfigurableShell separate.

## Choose the workflow

### Edit one saved idea

Use this when the project already exists under:

```text
apps/web/src/experimental/<IdeaName>/
├── project.json
└── source.tsx
```

- Edit `source.tsx`.
- Let the app manage `project.json`, including its id, revision, and source digest.
- Keep exactly one `export function Example` declaration.
- Keep the source portable: no imports from `apps/web/src/shell/` or `apps/web/src/lib/`.
- Do not rename the project directory by hand. The app names it from the idea and may rename it when the idea is renamed.

The app adopts a valid direct source edit the next time it reads the project.

### Extend the Experimental authoring tool

Use this when adding or changing the stage, dock, controls, or generated source:

- `apps/web/src/shell/ExperimentalPage.tsx` — save, open, and Make Live (folder picker)
- `apps/web/src/shell/FolderEditor.tsx` — Live folder select used by Make Live
- `apps/web/src/shell/IdeaWorkbench.tsx` — stage and dock controls
- `apps/web/src/shell/workbench/<Name>/` — idea-specific rendering and source generation

Report a versioned `IdeaDraft` through `onDraftChange`. Its `portableSourceTemplate` must follow the same portable source rules as a saved `source.tsx`.

Do not create or hand-edit `project.json`. Let the running app create saved project directories.

## Keep ConfigurableShell separate

ConfigurableShell is a portable Live catalog card. It is not the Experimental host.

- Do not render or import `ConfigurableShell` in Experimental.
- Do not import `ConfigurableShell.module.css`.
- Do not add Experimental save, open, switch, or Make Live behavior to ConfigurableShell.
- Experimental may reuse `ProximityControl`, `linearScale`, and icons to share its visual language.

## Define the idea

Before implementation, determine any details the user has not supplied:

- Idea name
- Live destination folder; never `shells` or `experimental`. The user picks this during Make Live.
- Controls and their labels, ranges, steps, and defaults
- Options, variants, and actions

When details are open-ended, propose a small sensible set instead of blocking on every choice.

## Make Live

Only publish when the user asks or uses **Make Live**. Publishing creates:

```text
apps/web/src/live/<folder>/<Name>/
├── <Name>.tsx
└── preview.tsx
```

`<Name>.tsx` contains only the portable component. `preview.tsx` only renders `<Name />`. Neither file may contain Experimental controls, shell chrome, or ConfigurableShell.

Publishing keeps the saved Experimental project so it can continue evolving.

## Verify

- For authoring-tool changes, open `/experimental` and exercise the dock.
- For saved-source changes, confirm the placeholder export and portable imports.
- Run the repository's relevant tests and build checks.
