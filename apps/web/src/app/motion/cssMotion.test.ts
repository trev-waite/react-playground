import { describe, expect, test } from "bun:test";
import path from "node:path";
import { motionProperties, springCss } from "./cssMotion";
import { springGenerator } from "./generators";
import { SPRING } from "./transitions";

const src = path.join(import.meta.dir, "../..");

describe("motion vocabulary in CSS", () => {
  test("a spring's linear() curve runs 0 → 1 over the engine's settle time", () => {
    for (const spring of Object.values(SPRING)) {
      const { duration, easing } = springCss(spring);
      expect(duration).toBe(`${springGenerator(0, 1, spring, 0).duration}ms`);
      expect(easing.startsWith("linear(0, ")).toBe(true);
      expect(easing.endsWith(", 1)")).toBe(true);
    }
  });

  test("the pill spring keeps its overshoot in CSS", () => {
    const points = springCss(SPRING.pill).easing.slice("linear(".length, -1).split(", ").map(Number);
    expect(Math.max(...points)).toBeGreaterThan(1.02);
  });

  test("stylesheets only use motion properties the vocabulary defines", async () => {
    const defined = new Set(Object.keys(motionProperties()));
    const missing: string[] = [];
    for await (const file of new Bun.Glob("**/*.css").scan({ cwd: src })) {
      const text = await Bun.file(path.join(src, file)).text();
      for (const [, name] of text.matchAll(/var\((--(?:spring|reduced-motion)-[\w-]+)/g)) {
        if (!defined.has(name!)) missing.push(`${file}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
