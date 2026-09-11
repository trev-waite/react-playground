import {
  createHttpPlaygroundApi,
  type PlaygroundApi,
} from "@react-playground/api";

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || "http://localhost:3001";
}

/**
 * Single backend binding for the UI.
 * Replace `createHttpPlaygroundApi` with another `PlaygroundApi` when swapping
 * the local disk API for a remote or more robust implementation.
 */
export const playgroundApi: PlaygroundApi = createHttpPlaygroundApi({
  baseUrl: apiBaseUrl(),
});
