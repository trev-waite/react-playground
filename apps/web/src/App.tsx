import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "./shell/AppShell";

/**
 * View modes are full-page layers inside AppShell. Routes only drive URL ↔ mode
 * and Live slug; both Live and Experimental stay mounted for the dissolve.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
