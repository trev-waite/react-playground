import path from "node:path";

export type ApiConfig = {
  port: number;
  corsOrigin: string;
  webRoot: string;
  experimentalRoot: string;
  liveRoot: string;
};

export function parsePort(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback;
  return n;
}

export function resolveApiConfig(
  env: Record<string, string | undefined> = process.env,
  srcDir = path.join(import.meta.dir, ".."),
): ApiConfig {
  const webRoot = path.resolve(env.WEB_ROOT ?? path.join(srcDir, "../../web"));
  return {
    port: parsePort(env.PORT, 3001),
    corsOrigin: env.CORS_ORIGIN ?? "http://localhost:3000",
    webRoot,
    experimentalRoot: path.resolve(
      env.EXPERIMENTAL_ROOT ?? path.join(webRoot, "src", "experimental", "ideas"),
    ),
    liveRoot: path.resolve(env.LIVE_ROOT ?? path.join(webRoot, "src", "live")),
  };
}

const config = resolveApiConfig();

export const PORT = config.port;
export const CORS_ORIGIN = config.corsOrigin;
export const WEB_ROOT = config.webRoot;
export const EXPERIMENTAL_ROOT = config.experimentalRoot;
export const LIVE_ROOT = config.liveRoot;
