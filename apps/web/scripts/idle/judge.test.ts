import { describe, expect, test } from "bun:test";
import { judgeIdle, previewChunks, sourceOf, type IdleRecord } from "./judge";

const many = (count: number, record: IdleRecord) => Array.from({ length: count }, () => record);

describe("judgeIdle", () => {
  test("a quiet page passes", () => {
    expect(judgeIdle([], 4)).toEqual({ ok: true, offenders: [] });
  });

  test("one-off work passes, however many sources do it once", () => {
    const records = [
      { kind: "timer", source: "text/QuoteLens (sizeClone)" },
      { kind: "frame", source: "app (settle)" },
      ...many(4, { kind: "timer", source: "text/WordClock (schedule)" }),
    ] satisfies IdleRecord[];
    expect(judgeIdle(records, 4).ok).toBe(true);
  });

  test("a source that keeps scheduling fails and is named, busiest first", () => {
    const records = [
      ...many(240, { kind: "frame", source: "particles/Bad (tick)" }),
      ...many(60, { kind: "timer", source: "text/Poll (loop)" }),
      { kind: "timer", source: "text/Fine (settle)" },
    ] satisfies IdleRecord[];
    expect(judgeIdle(records, 4)).toEqual({
      ok: false,
      offenders: [
        { source: "particles/Bad (tick)", kind: "frame", perSecond: 60 },
        { source: "text/Poll (loop)", kind: "timer", perSecond: 15 },
      ],
    });
  });
});

describe("attribution", () => {
  const entry = 'const x={"../live/text/WordClock/preview.tsx":()=>K(()=>import(`./preview-CDYIBTP5.js`),[]),"../live/dither/EPaper/preview.tsx":()=>K(()=>import(`./preview-Ab_1.js`),[])}';

  test("reads which card each preview chunk belongs to", () => {
    expect([...previewChunks(entry)]).toEqual([
      ["preview-CDYIBTP5.js", "text/WordClock"],
      ["preview-Ab_1.js", "dither/EPaper"],
    ]);
  });

  test("names a stack by its first built chunk, as a card where it can", () => {
    const chunks = previewChunks(entry);
    const stack = "Error\n    at window.setTimeout (<anonymous>:3:9)\n    at tick (http://localhost:4173/assets/preview-CDYIBTP5.js:1:2345)\n    at run (http://localhost:4173/assets/index-1.js:9:9)";
    expect(sourceOf(stack, chunks)).toBe("text/WordClock (tick)");
    expect(sourceOf("Error\n    at run (http://localhost:4173/assets/index-1.js:9:9)", chunks)).toBe("index-1.js (run)");
    expect(sourceOf("Error\n    at <anonymous>", chunks)).toBe("unknown");
  });
});
