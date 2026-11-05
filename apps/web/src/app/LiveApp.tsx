import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { liveSlugFromPath } from "../lib/catalog";
import { LivePage } from "./LivePage";

/** The deployable Live catalog: one page, the URL path is the component slug. */
export function LiveApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<LiveRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

function LiveRoute() {
  const { pathname } = useLocation();
  return <LivePage slug={liveSlugFromPath(pathname)} />;
}
