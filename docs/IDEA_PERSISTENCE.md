# Experimental Projects

Experimental is a studio for inventing React components that are not Live yet. The page, shared dock, and saved ideas live under `apps/web/src/experimental/`.

## Layout

```text
apps/web/src/
  app/                          # playground chrome (not ConfigurableShell)
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

- Create `apps/web/src/experimental/ideas/<IdeaName>/source.tsx` to start a new idea on disk. The app writes `project.json` the next time it lists or opens projects.
- Edit `source.tsx` when changing the component by hand or with an agent. Keep a `const SLIDERS = { ... }` block so the dock can bake current values on Save without rewriting the rest of the file.
- Let the app manage `id`, `revision`, and `sourceDigest` in `project.json`. Dock labels, ranges, and values live in `draft.actions` and `draft.sliders`.
- Commit both files so another machine or agent can reopen the project.
- The directory uses the idea's component name (`Study`, `Study2` when names collide). The stable UUID and source digest live in `project.json`. The app renames the directory when the idea is renamed.

`project.json` is a small local database record, not a place to store code. The filesystem is enough for this local workflow. If the app later needs queries, relationships, or multiple writers, the repository layer can move metadata to SQLite without changing `source.tsx`.

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

The source should be portable React code. It must not import from `apps/web/src/app/` or `apps/web/src/lib/`. GPU ideas may import `@/gpu` so they can run in the stacked Experimental layer and after Make Live; see [WebGPU with vgpu](WEBGPU.md). Slider widgets and mock button effects belong to the Experimental harness, not this file. The harness passes `progress` from 0 to 1 for form, unform, and replay actions; components that do not need staged playback can ignore it.

## Editing and saving

Direct edits to `source.tsx` are supported. During development, Vite refreshes the preview and notifies the studio when source or project metadata changes. Clean drafts reload automatically. Unsaved drafts stay intact and show an explicit action to discard edits and reload; deleted projects can be kept as new ideas. New source folders appear automatically. Reconnecting or focusing the window also checks for changes. Source edits are recorded as a new revision without rewriting the source.

Ordinary saves keep the project directory in place and skip unchanged files. Changed files are written to a temporary sibling and atomically renamed. Source is written before metadata; if interrupted between those writes, the next read reconciles the source digest and revision. Directory renames retain the staged backup/recovery path. Save and Copy bake current slider numbers into the `SLIDERS` block only.

The repository uses schema 3 projects only. Convert older project files before placing them in `ideas/`.

## Git and agents

The two project files are Git-trackable. Temporary and unknown files under `ideas/` are ignored.

```bash
git add apps/web/src/experimental/ideas/<IdeaName>/project.json \
  apps/web/src/experimental/ideas/<IdeaName>/source.tsx
```

For agent work:

1. To start a new idea, add `apps/web/src/experimental/ideas/<IdeaName>/source.tsx` with one `export function Example` and a `const SLIDERS` block. Skip `project.json` unless you copy a complete existing file.
2. To edit an existing idea, find the project by `id` in `project.json`, then change `source.tsx`.
3. Keep exactly one `export function Example` declaration.
4. Do not invent or hand-edit the digest or revision; the app reconciles them.
5. Run tests and review both files before committing.

Git provides shared history. The project revision only protects against stale local saves.

## Make Live

Make Live asks for a Live folder, then reads the saved project and creates:

```text
apps/web/src/live/<folder>/<Name>/
├── <Name>.tsx
└── preview.tsx
```

The component is portable. `preview.tsx` only renders `<Name />`. No sliders, Experimental chrome, mock triggers, or ConfigurableShell. The published file should look like it was written by hand at the current dock values. GPU components keep their `@/gpu` import; see [WebGPU with vgpu](WEBGPU.md).

Under `bun run dev`, Make Live refreshes the catalog, loads the published preview, and navigates without reloading the page. Refresh in the Live sidebar updates the catalog in place. Vite also picks up catalog additions and removals automatically. Existing Live updates atomically replace only changed files. Refresh errors and timeouts are shown rather than treated as success. Production `bun run start` serves a frozen `dist/` until the next build.

Publishing the same unchanged project again is safe. Publishing never deletes the Experimental project.
