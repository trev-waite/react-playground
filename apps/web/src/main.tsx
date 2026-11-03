import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { LiveApp } from "./app/LiveApp";
import "./app/app.css";

// The studio needs the dev server and local API, so builds ship the Live app alone.
const App: ComponentType = import.meta.env.DEV
  ? (await import("./studio/StudioApp")).StudioApp
  : LiveApp;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
