import path from "node:path";
import { normalizePath, type Plugin } from "vite";

/** Stands in for the vgpu package wherever the app imports it. */
export const VGPU_GATE = "src/gpu/vgpuGate.ts";
/** The one module that imports the package itself, loaded by the gate only where WebGPU exists. */
export const VGPU_LIBRARY = "src/gpu/vgpuLibrary.ts";

/** Whether an import goes to the gate: every import of `vgpu` but the library module's own. */
export function importsGatedVgpu(source: string, importer: string | undefined, root: string): boolean {
  return source === "vgpu" && (importer === undefined || normalizePath(importer) !== normalizePath(path.join(root, VGPU_LIBRARY)));
}

/**
 * Sends `import … from "vgpu"` to the gate, so components keep importing the
 * package by name while a browser without WebGPU never downloads it.
 */
export function vgpuGatePlugin(): Plugin {
  let root = "";
  return {
    name: "vgpu-gate",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    resolveId(source, importer) {
      return importsGatedVgpu(source, importer, root) ? path.join(root, VGPU_GATE) : undefined;
    },
  };
}
