import { describe, expect, test } from "bun:test";
import path from "node:path";
import { liveRoutes } from "../src/lib/liveRoutes.ts";
import { readLiveCards } from "./liveCards.ts";
import { resolveSiteUrl, routePageFile } from "./liveRoutesPlugin.ts";
import { HEAD_SLOT } from "./routeHead.ts";

const web = path.join(import.meta.dir, "..");

describe("resolveSiteUrl", () => {
  test("uses SITE_URL without a trailing slash", () => {
    expect(resolveSiteUrl({ SITE_URL: "https://play.example.com/" })).toBe("https://play.example.com");
  });

  test("is null when no origin is known", () => {
    expect(resolveSiteUrl({})).toBeNull();
  });
});

describe("routePageFile", () => {
  test("names the file Cloudflare serves at each route's path", () => {
    const controls = { slug: "controls", title: "Controls", members: [{ slug: "controls/Switch" }] };
    expect(liveRoutes([controls]).map(routePageFile)).toEqual(["index.html", "controls.html", "controls/Switch.html"]);
  });
});

describe("the page template", () => {
  test("index.html leaves one slot for a route's tags and sets none of them itself", async () => {
    const html = await Bun.file(path.join(web, "index.html")).text();
    expect(html.split(HEAD_SLOT)).toHaveLength(2);
    expect(html).not.toMatch(/<title>|property="og:|rel="canonical"|name="description"/);
  });
});

describe("readLiveCards", () => {
  test("reads the catalog from source as the app plans it: every card titled, in display order, with its components", async () => {
    const cards = await readLiveCards(path.join(web, "src/live"));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]).toMatchObject({ slug: "controls", title: "Controls" });
    expect(cards[0]!.members.map(member => member.slug)).toContain("controls/Switch");
    for (const card of cards) {
      expect(card.title).not.toBe("");
      expect(card.members.length).toBeGreaterThan(0);
    }
  });
});
