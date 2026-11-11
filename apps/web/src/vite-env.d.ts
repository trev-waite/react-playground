/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "on" shows the light/dark button; otherwise the site follows the system theme. */
  readonly VITE_THEME_TOGGLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
