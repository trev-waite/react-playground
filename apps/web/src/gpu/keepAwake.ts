/** What an adapter says about its GPU. Browsers leave some fields empty. */
export type GpuIdentity = { vendor?: string; architecture?: string; device?: string; description?: string };

export function adaptersDiffer(a: GpuIdentity, b: GpuIdentity): boolean {
  const fields = ["vendor", "architecture", "device", "description"] as const;
  return fields.some(field => Boolean(a[field]) && Boolean(b[field]) && a[field] !== b[field]);
}

/**
 * A discrete GPU powers down after about seven idle seconds, and the next draw
 * then blocks the browser's whole GPU process for most of a second while it wakes.
 */
const PULSE_MS = 3000;

type WakerHost = {
  gpu: (powerPreference: GPUPowerPreference) => Promise<GpuIdentity | null | undefined>;
  hidden: () => boolean;
  /** Runs `pulse` every `ms`; returns the stop. */
  every: (ms: number, pulse: () => void) => () => void;
};

type Device = Pick<GPUDevice, "queue" | "lost">;

/**
 * One timer shared by every live device, started only on a machine with a
 * separate fast GPU. GPUs that describe themselves alike, or not at all, are
 * taken for one: a guess would wake machines with nothing to keep awake.
 */
export function gpuWaker(host: WakerHost): (device: Device) => () => void {
  const devices = new Set<Device>();
  let separate: Promise<boolean> | undefined;
  let stop: (() => void) | undefined;

  const findSeparateFastGpu = async () => {
    const [saving, fast] = await Promise.all([host.gpu("low-power"), host.gpu("high-performance")]);
    return saving != null && fast != null && adaptersDiffer(saving, fast);
  };

  const pulse = () => {
    if (host.hidden()) return;
    const [device] = devices;
    device?.queue.submit([]);
  };

  const remove = (device: Device) => {
    devices.delete(device);
    if (devices.size > 0) return;
    stop?.();
    stop = undefined;
  };

  return device => {
    devices.add(device);
    void device.lost.then(() => remove(device));
    // A failed query is asked again by the next device.
    separate ??= findSeparateFastGpu().catch(() => {
      separate = undefined;
      return false;
    });
    void separate.then(found => {
      if (found && devices.size > 0) stop ??= host.every(PULSE_MS, pulse);
    });
    return () => remove(device);
  };
}

/** Keeps the fast GPU awake while `device` lives, so a paused loop resumes without a freeze. Returns the release. */
export const keepGpuAwake = gpuWaker({
  gpu: async powerPreference => (await navigator.gpu.requestAdapter({ powerPreference }))?.info,
  hidden: () => document.visibilityState === "hidden",
  every: (ms, pulse) => {
    const timer = setInterval(pulse, ms);
    return () => clearInterval(timer);
  },
});
