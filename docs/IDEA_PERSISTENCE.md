# Experimental Projects

Experimental is a studio for inventing React components that are not Live yet. The page, shared dock, and saved ideas live under `apps/web/src/experimental/`.

## Layout

```text
apps/web/src/
  app/                          # Live app (not ConfigurableShell)
  studio/                       # dev-only shell: Live + Experimental
  experimental/
    ExperimentalPage.tsx        # Save / Open / Make Live
    IdeaWorkbench.tsx           # shared dock + stage harness
    ideas/<IdeaName>/           # each idea: source + dock settings
  live/                         # published catalog
```

There are no experiment kinds and no workbenches folder. Every idea is a peer.

## Idea files

The app or a person (or agent) creates one directory per idea under `ideas/`, named after the idea:

```text
apps/web/src/experimental/ideas/<IdeaName>/
├── project.json  # stable id, revision, source digest, dock settings
└── source.tsx    # canonical component code
```

Use the files this way:

- Create `apps/web/src/experimental/ideas/<IdeaName>/source.tsx` to start a new idea on disk. The app writes `project.json` the next time it lists or opens projects, with a generic dock (`slider1` to `slider3`); set `draft.sliders` ids to the source's `SLIDERS` keys so the dock drives it.
- Edit `source.tsx` when changing the component by hand or with an agent. Keep a `const SLIDERS = { ... }` block so the dock can bake current values on Save without rewriting the rest of the file.
- Let the app manage `id`, `revision`, and `sourceDigest` in `project.json`. Dock labels, ranges, and values live in `draft.actions` and `draft.sliders`.
- Commit both files so another machine or agent can reopen the project.
- The directory uses the idea's component name (`Study`, `Study2` when names collide). The stable UUID and source digest live in `project.json`. The app renames the directory when the idea is renamed.

## Source contract

`source.tsx` must contain exactly one placeholder export:

```tsx
const SLIDERS = {"slider1":50,"slider2":50,"slider3":50};

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: {
  sliders?: Record<string, number>;
  progress?: number;
} = {}) {
  return null;
}
```

The source should be portable React code. It must not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU ideas may import `@/gpu` so they can run in the stacked Experimental layer and after Make Live; see [WebGPU with vgpu](WEBGPU.md). Any idea may import Live code by `@/live/`. An idea brought in from Live imports the helpers and styles in its own Live folder that way (`@/live/<folder>/<Name>/…`), and Make Live writes those imports as `./…`; the `new-experiment` skill has the steps. Slider widgets and mock button effects belong to the Experimental harness, not this file. The harness passes `progress` from 0 to 1 for form, unform, and replay actions; components that do not need staged playback can ignore it.

## Editing and saving

Direct edits to `source.tsx` are supported. Vite refreshes the preview and the studio reloads clean drafts; unsaved drafts stay intact with an explicit discard-and-reload action. Save and Copy bake current slider numbers into the `SLIDERS` block only. Only schema 3 projects are supported.

## Git and agents

Only the two project files are tracked; everything else under `ideas/` is ignored. For agent work:

1. To start a new idea, add `apps/web/src/experimental/ideas/<IdeaName>/source.tsx` with one `export function Example` and a `const SLIDERS` block. Skip `project.json` unless you copy a complete existing file.
2. To edit an existing idea, find the project by `id` in `project.json`, then change `source.tsx`.
3. Keep exactly one `export function Example` declaration.
4. Do not invent or hand-edit the digest or revision; the app reconciles them.
5. Run tests and review both files before committing.

## Make Live

Make Live asks for a Live folder, then reads the saved project and creates:

```text
apps/web/src/live/<folder>/<Name>/
├── <Name>.tsx
└── preview.tsx
```

The component is portable. `preview.tsx` only renders `<Name />`. No sliders, Experimental chrome, mock triggers, or ConfigurableShell. The published file should look like it was written by hand at the current dock values. GPU components keep their `@/gpu` import; see [WebGPU with vgpu](WEBGPU.md).

Make Live refreshes the catalog and navigates to the new entry without a reload. The deployed Live build only changes when you rebuild.

Once an idea is Live the button reads **Update Live**. It rewrites `<Name>.tsx` from the idea and nothing else: a `preview.tsx` you have tuned, and any tests, styles, or helpers you added beside the component, stay as they are, so a finished card can be updated as often as needed. Hand edits to `<Name>.tsx` itself are replaced, so make those in the idea. It never deletes the Experimental project. A folder whose `preview.tsx` has no `<Name>.tsx` beside it belongs to another component, and publishing there is refused.
