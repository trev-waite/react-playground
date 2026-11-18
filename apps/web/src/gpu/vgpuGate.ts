import { webGpuSupported } from "./host";
import type * as Library from "./vgpuLibrary";

let library: typeof Library | undefined;

function needsWebGpu(): never {
  throw new Error("vgpu needs WebGPU, which this browser does not have.");
}

type Call = (...args: never[]) => unknown;

function gated<Name extends Exclude<keyof typeof Library, "init">>(name: Name): (typeof Library)[Name] {
  const call = (...args: never[]) => (library ? (library[name] as Call)(...args) : needsWebGpu());
  return call as unknown as (typeof Library)[Name];
}

export const init: typeof Library.init = async (...args) => {
  if (!webGpuSupported()) needsWebGpu();
  library ??= await import("./vgpuLibrary");
  return library.init(...args);
};
export const clock = gated("clock");
export const effect = gated("effect");
export const frame = gated("frame");
export const frameLoop = gated("frameLoop");
export const sampler = gated("sampler");
export const surface = gated("surface");
export const target = gated("target");
