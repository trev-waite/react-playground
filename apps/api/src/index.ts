import { CORS_ORIGIN, EXPERIMENTAL_ROOT, LIVE_ROOT, PORT } from "./config/config";
import { refreshWebRegistry } from "./config/registry";
import { startPlaygroundApi } from "./server/server";

const server = startPlaygroundApi({
  experimentalRoot: EXPERIMENTAL_ROOT,
  liveRoot: LIVE_ROOT,
  corsOrigin: CORS_ORIGIN,
  port: PORT,
  refreshRegistry: refreshWebRegistry,
});

console.log(`Playground API running at ${server.url} (CORS ${CORS_ORIGIN})`);
