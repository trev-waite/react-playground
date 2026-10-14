import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Example } from "./ideas/TreeFlipbook/source";

function scenePaths(wind: number) {
  const markup = renderToStaticMarkup(
    <Example sliders={{ wind, leaves: 60, frameRate: 12 }} />,
  );
  return [...markup.matchAll(/<path d="([^"]+)"/g)].map(([, d]) => d);
}

describe("Tree Flipbook scene", () => {
  test("keeps the landscape and trunk base fixed as wind changes", () => {
    const calm = scenePaths(0);
    const windy = scenePaths(100);

    expect(calm[0]).not.toBe(windy[0]);
    expect(calm.find(d => d?.startsWith("M48 651"))).toBe(
      windy.find(d => d?.startsWith("M48 651")),
    );
    expect(calm.find(d => d?.startsWith("M792 712"))).toBe(
      windy.find(d => d?.startsWith("M792 712")),
    );
    expect(calm.find(d => d?.startsWith("M429 499"))).toBe(
      windy.find(d => d?.startsWith("M429 499")),
    );
  });

  test("renders the tree as a noninteractive scene without a bird", () => {
    const markup = renderToStaticMarkup(<Example />);

    expect(markup).toContain('role="img"');
    expect(markup).not.toContain('role="button"');
    expect(markup).not.toContain('M-18-8-31-17');
  });
});
