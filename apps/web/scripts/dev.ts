/**
 * Dev entry: keep playground.gen.ts in sync, watch for new Live previews, run HMR server.
 */
import { watch } from "node:fs";
import path from "node:path";
import { syncPlaygroundRegistry } from "./sync-playground";

const ROOT = path.join(import.meta.dir, "..");
const LIVE = path.join(ROOT, "src", "live");

await syncPlaygroundRegistry();

let syncing = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleResync(reason: string) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const entries = await syncPlaygroundRegistry();
      console.log(`[playground] synced ${entries.length} Live entries (${reason})`);
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

console.log("[playground] watching src/live for preview.tsx changes");

const child = Bun.spawn(["bun", "--hot", path.join(ROOT, "src", "index.ts")], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const code = await child.exited;
process.exit(code);
