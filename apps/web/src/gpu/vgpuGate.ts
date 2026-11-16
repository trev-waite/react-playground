import { webGpuSupported } from "./host";
import type * as Library from "./vgpuLibrary";

/**
 * What `import … from "vgpu"` resolves to in this app (`vite/vgpuGatePlugin.ts`).
 * The library is the largest script a visit fetches and does nothing without
 * WebGPU, so a browser without it gets these stand-ins and never downloads
 * it. A GPU component still loads there and shows its fallback: it calls
 * vgpu only from `useGpu`'s `start`, which never runs.
 */
const library = webGpuSupported() ? await import("./vgpuLibrary") : undefined;

function needsWebGpu(): never {
  throw new Error("vgpu needs WebGPU, which this browser does not have.");
}

function gated<Name extends keyof typeof Library>(name: Name): (typeof Library)[Name] {
  return library ? library[name] : needsWebGpu;
}

export const clock = gated("clock");
export const effect = gated("effect");
export const frame = gated("frame");
export const frameLoop = gated("frameLoop");
export const init = gated("init");
export const sampler = gated("sampler");
export const surface = gated("surface");
export const target = gated("target");
