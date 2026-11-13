import { describe, expect, test } from "bun:test";
import { liveRoutes, type RouteCard } from "../src/lib/liveRoutes.ts";
import { HEAD_SLOT, renderHead, robots, routeHead, sitemap, stampHead, unescapeHtml, type HeadTag } from "./routeHead.ts";

const SITE = "https://studio.example.com";
const controls: RouteCard = {
  slug: "controls",
  title: "Controls",
  description: "Segmented control, switch, and stepper share one rhythm.",
  members: [{ slug: "controls/Switch" }],
};
const bare: RouteCard = { slug: "svgs/BlobPet", title: "Blob Pet", members: [{ slug: "svgs/BlobPet" }] };
const [home, card, member, blob] = liveRoutes([controls, bare]);

function content(tags: readonly HeadTag[], name: string): string | undefined {
  for (const tag of tags) {
    if (tag.tag === "meta" && (tag.attrs.property === name || tag.attrs.name === name)) return tag.attrs.content;
    if (tag.tag === "link" && tag.attrs.rel === name) return tag.attrs.href;
    if (tag.tag === "title" && name === "title") return tag.text;
  }
  return undefined;
}

describe("routeHead", () => {
  const context = { siteUrl: SITE, cardImages: new Set(["controls"]) };

  test("a card's page is titled, described, and pictured as that card", () => {
    const tags = routeHead(card!, context);
    expect(content(tags, "title")).toBe("Controls · Trev’s Studio");
    expect(content(tags, "description")).toBe(controls.description);
    expect(content(tags, "og:title")).toBe("Controls");
    expect(content(tags, "og:description")).toBe(controls.description);
    expect(content(tags, "og:url")).toBe(`${SITE}/controls`);
    expect(content(tags, "canonical")).toBe(`${SITE}/controls`);
    expect(content(tags, "og:image")).toBe(`${SITE}/og/controls.png`);
    expect(content(tags, "og:video")).toBeUndefined();
  });

  test("a component on a family card shares the card's tags and names the card's URL as canonical", () => {
    expect(member!.path).toBe("/controls/Switch");
    expect(routeHead(member!, context)).toEqual(routeHead(card!, context));
  });

  test("a card with no image or line of its own borrows the site's", () => {
    const tags = routeHead(blob!, context);
    expect(content(tags, "og:image")).toBe(`${SITE}/og.png`);
    expect(content(tags, "description")).toBe(content(routeHead(home!, context), "description"));
  });

  test("the grid's page is the site's, and the only one to offer the tour video", () => {
    const tags = routeHead(home!, context);
    expect(content(tags, "title")).toBe("Trev’s Studio");
    expect(content(tags, "og:url")).toBe(`${SITE}/`);
    expect(content(tags, "og:video")).toBe(`${SITE}/og.mp4`);
  });

  test("without an origin, URLs stay root-relative and no canonical is claimed", () => {
    const tags = routeHead(card!, { siteUrl: null, cardImages: new Set() });
    expect(content(tags, "og:url")).toBe("/controls");
    expect(content(tags, "canonical")).toBeUndefined();
  });
});

describe("renderHead", () => {
  test("escapes whatever a card's meta says, in text and in attributes", () => {
    const html = renderHead([
      { tag: "title", text: `Push & <Pull>` },
      { tag: "meta", attrs: { name: "description", content: `A "quoted" <b> & more` } },
    ]);
    expect(html).toBe(
      `<title>Push &amp; &lt;Pull&gt;</title>\n    <meta name="description" content="A &quot;quoted&quot; &lt;b&gt; &amp; more" />`,
    );
  });
});

describe("unescapeHtml", () => {
  test("reads back exactly what renderHead wrote, without decoding twice", () => {
    for (const text of [`A "quoted" <b> & more`, "https://a&b.example.com", "already &amp; escaped"]) {
      const written = /content="([^"]*)"/.exec(renderHead([{ tag: "meta", attrs: { name: "x", content: text } }]))![1]!;
      expect(unescapeHtml(written)).toBe(text);
    }
  });
});

describe("stampHead", () => {
  test("writes the tags where the template leaves room, and nowhere else", () => {
    const html = stampHead(`<head>${HEAD_SLOT}<meta charset="utf-8" /></head>`, [{ tag: "title", text: "Controls" }]);
    expect(html).toBe(`<head><title>Controls</title><meta charset="utf-8" /></head>`);
  });

  test("refuses a template with no slot, or more than one", () => {
    expect(() => stampHead("<head></head>", [])).toThrow(/exactly one/);
    expect(() => stampHead(`${HEAD_SLOT}${HEAD_SLOT}`, [])).toThrow(/exactly one/);
  });
});

describe("sitemap and robots", () => {
  test("the sitemap lists each canonical page once, leaving out the other ways in to a card", () => {
    const xml = sitemap(liveRoutes([controls, bare]), SITE);
    expect(xml.match(/<loc>[^<]+<\/loc>/g)).toEqual([
      `<loc>${SITE}/</loc>`,
      `<loc>${SITE}/controls</loc>`,
      `<loc>${SITE}/svgs/BlobPet</loc>`,
    ]);
  });

  test("robots.txt points crawlers at the sitemap", () => {
    expect(robots(SITE)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});
