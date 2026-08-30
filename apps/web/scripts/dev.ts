/**
 * Dev entry: keep generated registries in sync, watch Live and Experimental
 * sources, run the UI server.
 */
import { watch } from "node:fs";
import path from "node:path";
import { syncIdeaRegistry, syncPlaygroundRegistry } from "./sync-playground";

const ROOT = path.join(import.meta.dir, "..");
const LIVE = path.join(ROOT, "src", "live");
const IDEAS = path.join(ROOT, "src", "experimental", "ideas");

async function syncAll() {
  const [live, ideas] = await Promise.all([
    syncPlaygroundRegistry(),
    syncIdeaRegistry(),
  ]);
  return { live: live.length, ideas: ideas.length };
}

const initial = await syncAll();
console.log(
  `[playground] synced ${initial.live} Live entries, ${initial.ideas} ideas`,
);

let syncing = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleResync(reason: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const next = await syncAll();
      console.log(
        `[playground] synced ${next.live} Live, ${next.ideas} ideas (${reason})`,
      );
    } finally {
      syncing = false;
    }
  }, 80);
}

watch(LIVE, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const normalized = filename.replace(/\\/g, "/");
  if (normalized.endsWith("preview.tsx") || normalized.endsWith("preview.ts")) {
    scheduleResync(normalized);
  }
});

watch(IDEAS, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const normalized = filename.replace(/\\/g, "/");
  if (normalized.endsWith("source.tsx")) {
    scheduleResync(normalized);
  }
});

console.log("[playground] watching Live previews and Experimental idea sources");

const child = Bun.spawn(["bun", "--hot", path.join(ROOT, "src", "index.ts")], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const code = await child.exited;
process.exit(code);
