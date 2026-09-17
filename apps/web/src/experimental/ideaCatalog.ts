import { useSyncExternalStore } from "react";
import { ideaModules } from "./ideaModules";
import { moduleStore } from "../lib/moduleStore";

const catalog = moduleStore(ideaModules);

if (import.meta.hot) {
  import.meta.hot.accept("./ideaModules", next => {
    if (!next) return;
    const modules: typeof ideaModules = next.ideaModules;
    const current = catalog.getSnapshot();
    catalog.update(Object.fromEntries(Object.entries(modules).map(
      ([name, load]) => [name, current[name] ?? load],
    )));
  });
}

export function useIdeaModules() {
  return useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
}
