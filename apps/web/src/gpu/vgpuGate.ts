import { webGpuSupported } from "./host";
import type * as Library from "./vgpuLibrary";

/**
 * What `import … from "vgpu"` resolves to in this app (`vite/vgpuGatePlugin.ts`).
 * The library is the largest script a visit fetches and does nothing without
 * WebGPU, so it is fetched only where WebGPU exists, as soon as a GPU
 * component's module loads. A component starts with `init`, which waits for
 * it; vgpu's other functions are called once `init` is done. Without WebGPU
 * nothing is fetched, and a GPU component still loads and shows its
 * fallback: `useGpu` never starts it.
 *
 * Not awaited at the top of this module: that would make every module that
 * imports vgpu wait too, and split shared code out of the app's entry.
 */
let library: typeof Library | undefined;
const loading = webGpuSupported() ? import("./vgpuLibrary").then(loaded => (library = loaded)) : undefined;
// A failed fetch fails `init`, which reports it; unawaited, it must not also surface as an unhandled rejection.
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
