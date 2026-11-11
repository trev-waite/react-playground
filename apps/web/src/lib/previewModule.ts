import type { PlaygroundEntry, PreviewModule } from "./types";

type TrackedPromise<T> = Promise<T> & { status?: "pending" | "fulfilled" | "rejected"; value?: T; reason?: unknown };

const modules = new WeakMap<PlaygroundEntry["load"], Promise<PreviewModule>>();

/**
 * One promise per loader. It records how it settled in the fields React's `use`
 * reads, so a module that is already here renders without a loading frame. A
 * failed load is forgotten, so the next catalog snapshot imports it again.
 */
export function previewModule(entry: PlaygroundEntry): Promise<PreviewModule> {
  const cached = modules.get(entry.load);
  if (cached) return cached;
  const tracked: TrackedPromise<PreviewModule> = entry.load();
  tracked.status = "pending";
  tracked.then(
    value => {
      tracked.status = "fulfilled";
      tracked.value = value;
    },
    reason => {
      tracked.status = "rejected";
      tracked.reason = reason;
      if (modules.get(entry.load) === tracked) modules.delete(entry.load);
    },
  );
  modules.set(entry.load, tracked);
  return tracked;
}
