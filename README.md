# React Playground

Personal studio for learning React by building isolated components. The deployed site is branded **Trev’s Studio**; the repo and code keep the React Playground name.

Write an idea in **Experimental**, tune it on the shared dock, then **Make Live**. Live is the published catalog: the component as you last configured it, no playground chrome. Live builds and deploys on its own; Experimental only runs locally.

## Quick start

```bash
bun install
bun run dev
```

- Studio (Live + Experimental): http://localhost:3000
- Local API: http://127.0.0.1:3001 (loopback only)

`bun run build && bun run start` previews the deployable Live app, and `bun run smoke:local` builds it and smoke tests it on a local Worker.

Authoring, export, layout, and commands: [Using the playground](docs/USING_THE_PLAYGROUND.md).
