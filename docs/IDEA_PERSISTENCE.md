# Experimental Projects

Experimental is the workspace for ideas that are not Live yet.

## Files

The app creates one directory per saved idea, named after the idea:

```text
apps/web/src/experimental/<IdeaName>/
├── project.json  # stable id, revision, source digest, editor state
└── source.tsx    # canonical component code
```

Use the files this way:

- Edit `source.tsx` when changing the component by hand or with an agent.
- Let the app manage `project.json`.
- Commit both files so another machine or agent can reopen the project.
- The directory uses the idea's component name (`Study`, `Study2` when names collide). The stable UUID and source digest live in `project.json`. The app renames the directory when the idea is renamed.

`project.json` is a small local database record, not a place to store code. The filesystem is enough for this local workflow. If the app later needs queries, relationships, or multiple writers, the repository layer can move metadata to SQLite without changing `source.tsx`.

## Source contract

`source.tsx` must contain exactly one placeholder export:

```tsx
export function Example() {
  return null;
}
```

The source should be portable React code. It must not import Experimental shell or app utilities.

## Editing and saving

Direct edits to `source.tsx` are supported. The next Open, Save, or Make Live validates the file and records the edit as a new revision. A browser opened before that edit must reload instead of overwriting it.

Each app save replaces `project.json` and `source.tsx` together. Interrupted saves keep the last complete version.

Older project formats migrate automatically when opened.

## Git and agents

The two project files are Git-trackable. Temporary and unknown files in the Experimental directory are ignored.

```bash
git add apps/web/src/experimental/<IdeaName>/project.json \
  apps/web/src/experimental/<IdeaName>/source.tsx
```

For agent work:

1. Find the project by reading `project.json` files (match on `id`, not the folder name).
2. Make code changes in the matching `source.tsx`.
3. Keep exactly one `export function Example` declaration.
4. Do not manually update the digest or revision; the app reconciles them.
5. Run tests and review both files before committing.

Git provides shared history. The project revision only protects against stale local saves.

## Make Live

Make Live asks for a Live folder, then reads the saved project and creates:

```text
apps/web/src/live/<folder>/<Name>/
├── <Name>.tsx
└── preview.tsx
```

The component is portable. `preview.tsx` only renders it. No sliders, Experimental shell, or ConfigurableShell.

Publishing the same unchanged project again is safe. Publishing never deletes the Experimental project.
