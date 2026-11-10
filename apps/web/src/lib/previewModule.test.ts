import { describe, expect, mock, test } from "bun:test";
import { previewModule } from "./previewModule";
import type { PlaygroundEntry, PreviewModule } from "./types";

const loaded: PreviewModule = { default: () => null };

function entry(load: PlaygroundEntry["load"]): PlaygroundEntry {
  return { slug: "demo", title: "Demo", load };
}

describe("previewModule", () => {
  test("imports a preview once and marks it fulfilled for React's use", async () => {
    const load = mock(() => Promise.resolve(loaded));
    const demo = entry(load);
    const first = previewModule(demo);
    expect(previewModule(demo)).toBe(first);
    await first;
    expect(first).toMatchObject({ status: "fulfilled", value: loaded });
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("imports a failed preview again on the next request", async () => {
    let attempts = 0;
    const load = mock(() => (++attempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(loaded)));
    const demo = entry(load);
    const failed = previewModule(demo);
    await failed.catch(() => {});
    expect(failed).toMatchObject({ status: "rejected" });
    const retried = previewModule(demo);
    expect(retried).not.toBe(failed);
    expect(await retried).toBe(loaded);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
