import {
  createHttpPlaygroundApi,
  type PlaygroundApi,
} from "@react-playground/api";

function apiBaseUrl(): string {
  const env = import.meta.env;
  const fromEnv =
    env && typeof env === "object" && "BUN_PUBLIC_API_URL" in env
      ? env.BUN_PUBLIC_API_URL
      : undefined;
  return fromEnv || "http://localhost:3001";
}

/**
 * Single backend binding for the UI.
 * Replace `createHttpPlaygroundApi` with another `PlaygroundApi` when swapping
 * the local disk API for a remote or more robust implementation.
 */
export const playgroundApi: PlaygroundApi = createHttpPlaygroundApi({
  baseUrl: apiBaseUrl(),
});
