import path from "node:path";
import { report, smoke } from "./checks.ts";

const origin = process.argv[2]?.replace(/\/+$/, "");
if (!origin) {
  console.error("Usage: bun scripts/smoke/run.ts <origin>");
  process.exit(2);
}

const outcomes = await smoke({
  origin,
  siteUrl: origin,
  dist: path.join(import.meta.dir, "../../dist"),
  skipChallenges: true,
  attempts: 6,
  retryMs: 5000,
});
const exitCode = report(outcomes);
const skipped = outcomes.filter(outcome => outcome.status === "skip").length;
if (skipped > 0 && process.env.GITHUB_ACTIONS === "true") {
  console.log(`::warning::${skipped} smoke checks were skipped; see the lines marked skip.`);
}
process.exit(exitCode);
