import { serve } from "bun";
import index from "./index.html";

const server = serve({
  routes: {
    // SPA: serve index.html for all routes so React Router can handle them.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // CSS Modules break under Bun's browser HMR (import_*_module undefined).
    // Full page reload on save still works; keep Modules for exportable experiments.
    hmr: false,
    console: true,
  },
});

console.log(`Playground running at ${server.url}`);
