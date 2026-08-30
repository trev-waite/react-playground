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

The source should be portable React code. It must not import from `apps/web/src/app/` or `apps/web/src/lib/`. Slider widgets and mock button effects belong to the Experimental harness, not this file. The harness passes `progress` from 0 to 1 for form, unform, and replay actions; components that do not need staged playback can ignore it.

## Editing and saving

Direct edits to `source.tsx` are supported. The next Open, Save, or Make Live validates the file and records the edit as a new revision. A new folder with only `source.tsx` is adopted on the next list or Open. A browser opened before that edit must reload instead of overwriting it.

Each app save replaces `project.json` and `source.tsx` together. Save and Copy bake the current slider numbers into the `SLIDERS` block only. Interrupted saves keep the last complete version.

Older project formats migrate automatically when opened.

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

The component is portable. `preview.tsx` only renders `<Name />`. No sliders, Experimental chrome, mock triggers, or ConfigurableShell. The published file should look like it was written by hand at the current dock values.

Publishing the same unchanged project again is safe. Publishing never deletes the Experimental project.
