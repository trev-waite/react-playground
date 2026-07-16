import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  "/usr/bin/google-chrome-stable";
const BASE = process.env.PREVIEW_URL ?? "http://localhost:3000/agents/OmniAgentBar";
const OUT_DIR = join(
  import.meta.dir,
  "../src/playground/agents/OmniAgentBar/previews",
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";

const FRAMES = ["collapsed", "loading", "reply"] as const;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
    defaultViewport: { width: 1100, height: 1600, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector('[data-screenshot-root="true"]', {
      timeout: 30000,
    });
    // Let fonts / motion settle
    await new Promise(r => setTimeout(r, 1200));

    for (const frame of FRAMES) {
      const handle = await page.$(`[data-preview="${frame}"]`);
      if (!handle) throw new Error(`Missing preview root: ${frame}`);

      const out = join(OUT_DIR, `${frame}.png`);
      const artifact = join(ARTIFACT_DIR, `omni-agent-bar-${frame}.png`);
      await handle.screenshot({
        path: out,
        type: "png",
        omitBackground: false,
      });
      await handle.screenshot({
        path: artifact,
        type: "png",
        omitBackground: false,
      });
      console.log(`wrote ${out}`);
      console.log(`wrote ${artifact}`);
    }

    // Full page preview for PR walkthrough
    const full = join(ARTIFACT_DIR, "omni-agent-bar-page.png");
    await page.screenshot({ path: full, type: "png", fullPage: true });
    console.log(`wrote ${full}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
