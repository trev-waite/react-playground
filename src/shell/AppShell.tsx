import { Outlet } from "react-router";
import { playgroundTree } from "../lib/discover";
import { Canvas } from "./Canvas";
import { Sidebar } from "./Sidebar/Sidebar";
import "./shell.css";
import styles from "./AppShell.module.css";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <Sidebar tree={playgroundTree} />
      <div className={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}

export { Canvas };
