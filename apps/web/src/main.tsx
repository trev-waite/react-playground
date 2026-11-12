import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { LiveApp } from "./app/LiveApp";
import { installMotionProperties } from "./app/motion/cssMotion";
import { installTheme } from "./app/theme/theme";
import "./app/app.css";

installMotionProperties(document.documentElement);
installTheme();

// The studio needs the dev server and local API, so builds ship the Live app alone.
const App: ComponentType = import.meta.env.DEV
  ? (await import("./studio/StudioApp")).StudioApp
  : LiveApp;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
