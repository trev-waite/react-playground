(() => {
  const root = document.documentElement;
  let stored = null;
  if ("themeToggle" in root.dataset) {
    try {
      stored = localStorage.getItem("theme");
    } catch {}
  }
  const dark = stored === "light" || stored === "dark" ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "dark" : "light";
  if (dark) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#1d2026");
})();
