---
name: new-experiment
description: Create or edit a playground idea in Experimental, then optionally publish it as a portable Live component. Use for experiments, prototypes, saved ideas, or Experimental authoring controls.
disable-model-invocation: true
---

# New Experiment

Build ideas in Experimental. Keep Experimental, Live components, and ConfigurableShell separate.

```text
apps/web/src/
  app/                 # playground chrome (layout, Live catalog UI) — not ConfigurableShell
  experimental/        # studio page, shared dock, and saved ideas
    ideas/<Name>/      # switchable projects (source.tsx + project.json)
  live/                # published catalog
```

See [Experimental Projects](../../../docs/IDEA_PERSISTENCE.md).

Humans and agents both work in idea files. Save in the UI is one way to create a project. Creating the folder on disk is another. The app fills in `project.json` when it is missing.

## Choose the workflow

### Create a new idea on disk

Use this when starting a new experiment without going through Save first.

```text
apps/web/src/experimental/ideas/<IdeaName>/
├── source.tsx      # required
└── project.json    # optional; the app mints it on next Open or list
```

- `<IdeaName>` is a PascalCase component name (`QuietButton`). If that folder exists, use `QuietButton2`.
- Write portable React in `source.tsx` with exactly one `export function Example({ sliders = SLIDERS, progress = 1 } = {})` and a `const SLIDERS = { ... }` block the dock can bake. The optional `progress` prop drives form, unform, and replay actions.
- Do not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU ideas may import `@/gpu`. See [WebGPU with vgpu](../../../docs/WEBGPU.md).
- Skip `project.json` unless you are copying a complete existing file. Do not invent `id`, `revision`, or `sourceDigest`.
- After writing files, the next Experimental list or Open adopts the folder and writes `project.json`.

### Edit one saved idea

Find the project by matching `id` in `project.json`, not by guessing the folder name. The directory is the idea's component name (`Study`, `Study2` on collision). The UUID and `sourceDigest` stay in JSON.

```text
apps/web/src/experimental/ideas/<IdeaName>/
├── project.json    # identity + this idea’s dock settings
└── source.tsx      # code
```

- Edit `source.tsx`. That is the usual way you and agents tweak an idea.
- Leave `id`, `revision`, and `sourceDigest` alone. The app reconciles them after a source edit.
- Keep exactly one `export function Example` declaration. Play passes live slider numbers into `Example`; baked `SLIDERS` defaults are what Make Live ships.
- Keep the source portable: no imports from `apps/web/src/app/` or `apps/web/src/lib/`. GPU ideas may import `@/gpu`.
- Do not rename the project directory by hand. The app names it from the idea and may rename it when the idea is renamed.

The app adopts a valid direct source edit the next time it reads the project.

### Extend the Experimental authoring tool

Use this when adding or changing the stage, dock, controls, or generated source:

- `apps/web/src/experimental/ExperimentalPage.tsx` — save, open, and Make Live (folder picker)
- `apps/web/src/experimental/FolderEditor.tsx` — Live folder select used by Make Live
- `apps/web/src/experimental/IdeaWorkbench.tsx` — shared play dock and stage harness for every idea
- `apps/web/src/experimental/ideaModules.ts` — lazy `import.meta.glob` of idea `source.tsx` files

Report dock settings through `onDraftChange`. Bake current slider numbers into the `const SLIDERS` block in `portableSourceTemplate`. Do not put mock button logic or slider widgets in `source.tsx`. The dock is a fixed template (three actions, Copy, three sliders); this idea’s `project.json` fills labels, ranges, values, and optional `mock` (`none`, `scroll`, `form`, `unform`, or `replay`).

Do not hand-edit `id`, `revision`, or `sourceDigest` in `project.json`.

## Keep ConfigurableShell separate

ConfigurableShell is a portable Live catalog card at `apps/web/src/live/shells/ConfigurableShell/`. It is not the Experimental host and is unrelated to `apps/web/src/app/`.

- Do not render or import `ConfigurableShell` in Experimental.
- Do not import `ConfigurableShell.module.css`.
- Do not add Experimental save, open, switch, or Make Live behavior to ConfigurableShell.
- Experimental may import `ProximityControl`, `linearScale`, and icons from that Live folder so the controls feel the same.

## GPU ideas

Hang a canvas and call `useGpu` from `@/gpu`. Shaders come from `vgpu`; the loop is `pausableLoop` from `@/gpu`. Call `useGpu` instead of `navigator.gpu`. For the GPU implementation itself, follow the `gpu-idea` skill. Full notes: [WebGPU with vgpu](../../../docs/WEBGPU.md).

## Define the idea

Before implementation, determine any details the user has not supplied:

- Idea name
- Live destination folder only when publishing. Never `shells` or `experimental`; unsaved and saved ideas do not require a destination.
- How this idea fills the shared dock: three slider labels/ranges/defaults, three action labels, and whether actions mock `scroll`, `form`, `unform`, or `replay` (otherwise `none`)

Do not add a fourth slider, a custom action slot, or a per-idea `settings.tsx`. When details are open-ended, propose a small sensible set instead of blocking on every choice.

## Make Live

Only publish when the user asks or uses **Make Live**. The UI asks for a Live folder, then creates:

```text
apps/web/src/live/<folder>/<Name>/
├── <Name>.tsx
├── <Name>.module.css   ← optional
└── preview.tsx
```

`<Name>.tsx` contains only the portable component. `preview.tsx` only renders `<Name />`. Neither file may contain Experimental controls, app chrome, or ConfigurableShell.

GPU ideas: LiveStage’s preview frame already fills the catalog canvas so `useGpu` gets a real layout. After publishing, open Live and confirm the component paints. If it should be a plaque rather than full-bleed, size that box from content (padding + in-flow fallback); do not rely on a 0-height `height: 100%` child. Full notes: [WebGPU with vgpu](../../../docs/WEBGPU.md) and the `gpu-idea` skill.

Publishing keeps the saved Experimental project so it can continue evolving.

## Verify

- For authoring-tool changes, open `/experimental` and exercise the dock, including Make Live folder pick.
- For a new on-disk idea, confirm it appears after reload and that `project.json` was minted.
- For saved-source changes, confirm the placeholder export and portable imports.
- Run the repository's relevant tests and build checks.
