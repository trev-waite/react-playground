import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseTheme, siteTheme, storedThemeAfterToggle, THEME_STORAGE_KEY } from "./theme";

describe("site theme", () => {
  test("a toggle that lands on the system's theme forgets the choice, so the site follows the system again", () => {
    expect(storedThemeAfterToggle("light", "light")).toBe("dark");
    expect(storedThemeAfterToggle("dark", "light")).toBeNull();
    expect(storedThemeAfterToggle("dark", "dark")).toBe("light");
    expect(storedThemeAfterToggle("light", "dark")).toBeNull();
  });

  test("follows the system unless the button is live and the visitor picked a theme", () => {
    expect(siteTheme("dark", "light", false)).toBe("light");
    expect(siteTheme(null, "dark", false)).toBe("dark");
    expect(siteTheme("dark", "light", true)).toBe("dark");
    expect(siteTheme(null, "light", true)).toBe("light");
  });

  test("only a known theme is read back from storage", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });

  test("the pre-paint script and the page are wired to the same choice", async () => {
    const web = path.join(import.meta.dir, "../../..");
    const script = await Bun.file(path.join(web, "public/theme.js")).text();
    expect(script).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    for (const page of ["index.html", "public/404.html"]) {
      const html = await Bun.file(path.join(web, page)).text();
      const head = html.slice(0, html.indexOf("</head>"));
      expect(head).toMatch(/<script src="\/theme\.js"><\/script>/);
    }
  });
});
