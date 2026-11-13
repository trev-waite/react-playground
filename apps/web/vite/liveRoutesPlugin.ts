import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { liveRoutes, liveSlugFromPath, livePath, type LiveRoute } from "../src/lib/liveRoutes.ts";
import { readLiveCards } from "./liveCards.ts";
import { cardImagePath, robots, routeHead, sitemap, stampHead, type HeadContext } from "./routeHead.ts";

/** The public origin the Live app is served from, without a trailing slash. */
export function resolveSiteUrl(env: Record<string, string | undefined>): string | null {
  return env.SITE_URL ? env.SITE_URL.replace(/\/+$/, "") : null;
}

/** The file a route's page is written to. Cloudflare serves `controls/Switch.html` at `/controls/Switch`. */
export function routePageFile(route: LiveRoute): string {
  return route.path === "/" ? "index.html" : `${route.path.slice(1)}.html`;
}

/**
 * Gives every Live route a real page. The app is one bundle, but each route's
 * page carries its own title, description, canonical URL, and link preview, so
 * a shared link unfurls as the component it names and a crawler reads the page
 * without running the app. Anything else stays a 404.
 *
 * The dev server stamps the same tags on the path it is asked for, so a page
 * reads the same in development as it will deployed.
 */
export function liveRoutesPlugin(env: Record<string, string | undefined>): Plugin {
  const siteUrl = resolveSiteUrl(env);
  let liveDir = "";
  let publicDir = "";

  async function site(): Promise<{ routes: LiveRoute[]; context: HeadContext }> {
    const cards = await readLiveCards(liveDir);
    const withImage = cards.filter(card => existsSync(path.join(publicDir, cardImagePath(card.slug))));
    return { routes: liveRoutes(cards), context: { siteUrl, cardImages: new Set(withImage.map(card => card.slug)) } };
  }

  return {
    name: "live-routes",
    configResolved(config) {
      liveDir = path.join(config.root, "src/live");
      publicDir = config.publicDir;
      if (!siteUrl && config.command === "build") {
        config.logger.warn("SITE_URL is not set, so link previews get root-relative URLs and pages get no canonical URL or sitemap.");
      }
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html, { server, originalUrl }) {
        // A build stamps each route's page once the bundle exists.
        if (!server) return html;
        const { routes, context } = await site();
        const asked = livePath(liveSlugFromPath(new URL(originalUrl ?? "/", "http://localhost").pathname));
        const route = routes.find(route => route.path === asked) ?? routes[0]!;
        return stampHead(html, routeHead(route, context));
      },
    },
    generateBundle: {
      order: "post",
      async handler(_, bundle) {
        const page = bundle["index.html"];
        if (page?.type !== "asset") this.error("live-routes: the build emitted no index.html");
        const template = String(page.source);
        const { routes, context } = await site();
        for (const card of new Set(routes.map(route => route.card))) {
          if (card && !context.cardImages.has(card.slug)) {
            this.warn(`${card.slug} has no link-preview image, so its page shares the site's. Run \`bun run og:cards\` to draw one.`);
          }
        }
        for (const route of routes) {
          const source = stampHead(template, routeHead(route, context));
          if (route.path === "/") page.source = source;
          else this.emitFile({ type: "asset", fileName: routePageFile(route), source });
        }
        if (siteUrl) {
          this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap(routes, siteUrl) });
          this.emitFile({ type: "asset", fileName: "robots.txt", source: robots(siteUrl) });
        }
      },
    },
  };
}
