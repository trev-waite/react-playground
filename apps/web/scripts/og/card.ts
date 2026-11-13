type OgCardImages = {
  favicon: Buffer;
  grid: Buffer;
};

/** The 1200×630 link-preview card: the mark and name beside the Live grid, on the app's dotted canvas. */
export function ogCardHtml({ favicon, grid }: OgCardImages): string {
  const mark = `data:image/svg+xml;base64,${favicon.toString("base64")}`;
  const shot = `data:image/png;base64,${grid.toString("base64")}`;
  return `<!doctype html>
<meta charset="utf-8">
<style>
  body {
    margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: system-ui, -apple-system, "SF Pro Display", sans-serif; color: #1c2430;
    background:
      radial-gradient(circle, rgba(40, 48, 64, 0.14) 1.2px, transparent 1.6px) 0 0 / 16px 16px,
      radial-gradient(120% 80% at 10% 0%, #f0f2f6 0%, transparent 55%),
      radial-gradient(90% 70% at 100% 100%, #dce1ea 0%, transparent 50%),
      #e8eaee;
  }
  .copy {
    position: absolute; left: 72px; top: 0; bottom: 0; width: 430px;
    display: flex; flex-direction: column; justify-content: center; gap: 24px;
  }
  .mark { width: 88px; height: 88px; display: block; }
  h1 { margin: 0; font-size: 68px; line-height: 1; font-weight: 700; letter-spacing: -0.035em; }
  p { margin: 0; font-size: 28px; line-height: 1.35; color: #5c6678; font-weight: 450; letter-spacing: -0.01em; }
  .shot {
    position: absolute; left: 560px; top: 100px; width: 820px; border-radius: 32px; overflow: hidden;
    box-shadow: 0 1px 2px rgba(28, 36, 48, 0.06), 0 24px 64px rgba(28, 36, 48, 0.16);
  }
  .shot img { display: block; width: 100%; }
</style>
<div class="copy">
  <img class="mark" src="${mark}" alt="">
  <h1>Trev’s<br>Studio</h1>
  <p>Small React components, built and tuned one at a time.</p>
</div>
<div class="shot"><img src="${shot}" alt=""></div>`;
}

type OgComponentImages = {
  favicon: Buffer;
  /** The card's page, square. */
  shot: Buffer;
  title: string;
  description?: string;
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
}

/** A card's own 1200×630 link preview: its name and line beside its page, on the same canvas as the site's. */
export function ogComponentHtml({ favicon, shot, title, description }: OgComponentImages): string {
  const mark = `data:image/svg+xml;base64,${favicon.toString("base64")}`;
  const page = `data:image/png;base64,${shot.toString("base64")}`;
  return `<!doctype html>
<meta charset="utf-8">
<style>
  body {
    margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative;
    font-family: system-ui, -apple-system, "SF Pro Display", sans-serif; color: #1c2430;
    background:
      radial-gradient(circle, rgba(40, 48, 64, 0.14) 1.2px, transparent 1.6px) 0 0 / 16px 16px,
      radial-gradient(120% 80% at 10% 0%, #f0f2f6 0%, transparent 55%),
      radial-gradient(90% 70% at 100% 100%, #dce1ea 0%, transparent 50%),
      #e8eaee;
  }
  .copy {
    position: absolute; left: 72px; top: 0; bottom: 0; width: 448px;
    display: flex; flex-direction: column; justify-content: center; gap: 24px;
  }
  .site { display: flex; align-items: center; gap: 16px; font-size: 26px; font-weight: 600; letter-spacing: -0.01em; color: #5c6678; }
  .mark { width: 48px; height: 48px; display: block; }
  h1 { margin: 0; font-size: 64px; line-height: 1.04; font-weight: 700; letter-spacing: -0.035em; text-wrap: balance; }
  p { margin: 0; font-size: 28px; line-height: 1.35; color: #5c6678; font-weight: 450; letter-spacing: -0.01em; text-wrap: pretty; }
  .shot {
    position: absolute; left: 592px; top: 43px; width: 544px; height: 544px; border-radius: 32px; overflow: hidden;
    box-shadow: 0 1px 2px rgba(28, 36, 48, 0.06), 0 24px 64px rgba(28, 36, 48, 0.16);
  }
  .shot img { display: block; width: 100%; height: 100%; }
</style>
<div class="copy">
  <div class="site"><img class="mark" src="${mark}" alt="">Trev’s Studio</div>
  <h1>${escapeHtml(title)}</h1>
  ${description ? `<p>${escapeHtml(description)}</p>` : ""}
</div>
<div class="shot"><img src="${page}" alt=""></div>`;
}
