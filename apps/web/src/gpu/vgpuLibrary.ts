/**
 * The parts of vgpu this app runs, named one by one so the bundle carries
 * nothing else. An idea that needs another adds it here and to `vgpuGate.ts`.
 */
export { clock, effect, frame, frameLoop, init, sampler, surface, target } from "vgpu";
