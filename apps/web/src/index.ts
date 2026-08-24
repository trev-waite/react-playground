import { serve } from "bun";
import index from "./index.html";

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    // CSS Modules break under Bun's browser HMR (import_*_module undefined).
    // Full page reload on save still works; keep Modules for exportable experiments.
    hmr: false,
    console: true,
  },
});

console.log(`Playground UI running at ${server.url}`);
