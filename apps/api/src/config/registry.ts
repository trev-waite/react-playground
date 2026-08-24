import { WEB_ROOT } from "./config";

export async function refreshWebRegistry(): Promise<void> {
  const proc = Bun.spawn(["bun", "run", "sync:playground"], {
    cwd: WEB_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Failed to refresh playground registry (exit ${code})`);
  }
}
