import { CORS_ORIGIN, PLAYGROUND_ROOT, PORT } from "./config";
import { refreshWebRegistry } from "./registry";
import { startPlaygroundApi } from "./server";

const server = startPlaygroundApi({
  playgroundRoot: PLAYGROUND_ROOT,
  corsOrigin: CORS_ORIGIN,
  port: PORT,
  refreshRegistry: refreshWebRegistry,
});

console.log(`Playground API running at ${server.url} (CORS ${CORS_ORIGIN})`);
