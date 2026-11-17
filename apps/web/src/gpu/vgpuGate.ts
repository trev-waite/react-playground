import { webGpuSupported } from "./host";
import type * as Library from "./vgpuLibrary";

/**
 * What `import … from "vgpu"` resolves to (`vite/vgpuGatePlugin.ts`): the
 * library is fetched only where WebGPU exists, and `init` waits for it.
 * Not a top-level await: that would split shared code out of the app's entry.
 */
let library: typeof Library | undefined;
const loading = webGpuSupported() ? import("./vgpuLibrary").then(loaded => (library = loaded)) : undefined;
// A failed fetch is reported by `init`, not as an unhandled rejection.
loading?.catch(() => {});

function needsWebGpu(): never {
  throw new Error("vgpu needs WebGPU, which this browser does not have.");
}

type Call = (...args: never[]) => unknown;

function gated<Name extends Exclude<keyof typeof Library, "init">>(name: Name): (typeof Library)[Name] {
  const call = (...args: never[]) => (library ? (library[name] as Call)(...args) : needsWebGpu());
  return call as unknown as (typeof Library)[Name];
}

export const init: typeof Library.init = async (...args) => {
  if (!loading) needsWebGpu();
  return (await loading).init(...args);
};
export const clock = gated("clock");
export const effect = gated("effect");
export const frame = gated("frame");
export const frameLoop = gated("frameLoop");
export const sampler = gated("sampler");
export const surface = gated("surface");
export const target = gated("target");
