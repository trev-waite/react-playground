(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("theme");
  } catch {}
  const dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (dark) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#1d2026");
})();
