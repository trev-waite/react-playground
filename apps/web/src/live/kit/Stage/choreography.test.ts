import { describe, expect, test } from "bun:test";
import { cascadeDelays, keyframesOf, MOTION, type Verb } from "./choreography";

const VERBS: Verb[] = ["rise", "recede", "arrive"];

describe("Stage choreography", () => {
  test("a cascade staggers evenly and never runs past its cap, however many items", () => {
    expect(cascadeDelays(4)).toEqual([0, 80, 160, 240]);
    for (const count of [2, 10, 18, 40, 200]) {
      const delays = cascadeDelays(count);
      expect(delays.at(-1)!).toBeLessThanOrEqual(MOTION.maxCascadeMs);
      for (let index = 1; index < delays.length; index++) expect(delays[index]!).toBeGreaterThanOrEqual(delays[index - 1]!);
    }
  });

  test("a delay offsets the whole cascade", () => {
    expect(cascadeDelays(3, { delayMs: 100, staggerMs: 70 })).toEqual([100, 170, 240]);
  });

  test("every verb moves only compositor properties and filter", () => {
    for (const verb of VERBS) {
      for (const frame of keyframesOf(verb)) {
        expect(Object.keys(frame).toSorted()).toEqual(["filter", "opacity", "transform"]);
      }
    }
  });

  test("entering verbs end on the element's own style, so nothing stays blurred", () => {
    for (const verb of ["rise", "arrive"] as const) {
      expect(keyframesOf(verb).at(-1)).toEqual({ opacity: 1, filter: "none", transform: "none" });
    }
    expect(keyframesOf("recede")[0]).toEqual({ opacity: 1, filter: "none", transform: "none" });
  });
});
