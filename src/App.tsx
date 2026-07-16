import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "./shell/AppShell";
import { EmptyStage, ExperimentStage } from "./shell/ExperimentStage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<EmptyStage />} />
          <Route path="*" element={<ExperimentStage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
