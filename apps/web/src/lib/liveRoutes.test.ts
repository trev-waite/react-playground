import { describe, expect, test } from "bun:test";
import { livePath, liveRoutes, liveSlugFromPath, routeTitle, type RouteCard } from "./liveRoutes";

const controls: RouteCard = {
  slug: "controls",
  title: "Controls",
  members: [{ slug: "controls/Stepper" }, { slug: "controls/Switch" }],
};
const menuPill: RouteCard = { slug: "navigation/MenuPill", title: "Menu Pill", members: [{ slug: "navigation/MenuPill" }] };

describe("Live paths", () => {
  test("a card's page is its slug, and the grid is the root", () => {
    expect(livePath("navigation/MenuPill")).toBe("/navigation/MenuPill");
    expect(livePath(null)).toBe("/");
  });

  test("a path reads back as the slug it was written from, with or without a trailing slash", () => {
    expect(liveSlugFromPath("/")).toBeNull();
    expect(liveSlugFromPath("/navigation/MenuPill")).toBe("navigation/MenuPill");
    expect(liveSlugFromPath("/navigation/MenuPill/")).toBe("navigation/MenuPill");
  });
});

describe("liveRoutes", () => {
  test("answers the grid, each card, and each component on a family card, once", () => {
    expect(liveRoutes([controls, menuPill]).map(route => [route.path, route.card?.slug ?? null])).toEqual([
      ["/", null],
      ["/controls", "controls"],
      ["/controls/Stepper", "controls"],
      ["/controls/Switch", "controls"],
      ["/navigation/MenuPill", "navigation/MenuPill"],
    ]);
  });
});

describe("routeTitle", () => {
  test("an open card leads the tab title; the grid is the site alone", () => {
    expect(routeTitle(menuPill)).toBe("Menu Pill · Trev’s Studio");
    expect(routeTitle(null)).toBe("Trev’s Studio");
  });
});
