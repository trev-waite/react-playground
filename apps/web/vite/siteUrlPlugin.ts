import type { Plugin } from "vite";

const PLACEHOLDER = "%SITE_URL%";

/**
 * The public origin the Live app is served from, without a trailing slash.
 * `SITE_URL` wins; Vercel production builds fall back to their project domain.
 */
export function resolveSiteUrl(env: Record<string, string | undefined>): string | null {
  const url = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return url ? url.replace(/\/+$/, "") : null;
}

/**
 * Link-preview crawlers need absolute og:image and og:video URLs, so the
 * `%SITE_URL%` placeholders in index.html become the deployed origin. Without
 * one the URLs stay root-relative, which only some crawlers resolve.
 */
export function siteUrlPlugin(env: Record<string, string | undefined>): Plugin {
  const siteUrl = resolveSiteUrl(env);
  return {
    name: "site-url",
    configResolved(config) {
      if (!siteUrl && config.command === "build") {
        config.logger.warn("SITE_URL is not set, so link previews get root-relative og:image and og:video URLs.");
      }
    },
    transformIndexHtml: {
      order: "pre",
      handler: html => html.replaceAll(PLACEHOLDER, siteUrl ?? ""),
    },
  };
}
