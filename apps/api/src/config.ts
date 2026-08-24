import path from "node:path";

export type ApiConfig = {
  port: number;
  corsOrigin: string;
  webRoot: string;
  playgroundRoot: string;
};

export function parsePort(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

export function resolveApiConfig(
  env: Record<string, string | undefined> = process.env,
  srcDir = import.meta.dir,
): ApiConfig {
  const webRoot = path.resolve(env.WEB_ROOT ?? path.join(srcDir, "../../web"));
  return {
    port: parsePort(env.PORT, 3001),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:3000",
    webRoot,
    playgroundRoot: path.resolve(
      env.PLAYGROUND_ROOT ?? path.join(webRoot, "src", "playground"),
    ),
  };
}

const config = resolveApiConfig();

export const PORT = config.port;
export const CORS_ORIGIN = config.corsOrigin;
export const WEB_ROOT = config.webRoot;
export const PLAYGROUND_ROOT = config.playgroundRoot;
