/** What an adapter says about the GPU behind it. Browsers leave some fields empty. */
export type GpuIdentity = { vendor?: string; architecture?: string; device?: string; description?: string };

/** Whether two adapters are different GPUs, going by the fields both of them fill in. */
export function adaptersDiffer(a: GpuIdentity, b: GpuIdentity): boolean {
  const fields = ["vendor", "architecture", "device", "description"] as const;
  return fields.some(field => Boolean(a[field]) && Boolean(b[field]) && a[field] !== b[field]);
}

/**
 * A separate fast GPU powers down after a few seconds without work (about
 * seven on the MacBook Pro this was measured on), and the next draw then holds
 * the browser's whole GPU process for most of a second while it wakes. A
 * pulse well inside that window keeps it up.
 */
const PULSE_MS = 3000;

/** What the pulse asks of the browser. */
export type WakerHost = {
  /** What the adapter for a power preference says of its GPU; nothing where there is no adapter or it does not say. */
  gpu: (powerPreference: GPUPowerPreference) => Promise<GpuIdentity | null | undefined>;
  /** A hidden tab lets the GPU sleep. */
  hidden: () => boolean;
  /** Runs `pulse` every `ms`; returns the stop. */
  every: (ms: number, pulse: () => void) => () => void;
};

/**
 * Builds `keepGpuAwake` for a host: one timer shared by every device kept
 * awake, started only once the host is known to have a separate fast GPU (a
 * laptop with integrated and discrete chips) and stopped when the last device
 * is released. Two GPUs that describe themselves alike, or not at all, are
 * taken for one and get no pulse: a guess would wake machines that have
 * nothing to keep awake.
 */
export function gpuWaker(host: WakerHost): (device: Pick<GPUDevice, "queue">) => () => void {
  const devices = new Set<Pick<GPUDevice, "queue">>();
  let separate: Promise<boolean> | undefined;
  let stop: (() => void) | undefined;

  const findSeparateFastGpu = async () => {
    const [saving, fast] = await Promise.all([host.gpu("low-power"), host.gpu("high-performance")]);
    return saving != null && fast != null && adaptersDiffer(saving, fast);
  };

  /** An empty submission: no drawing, but the GPU process hears from the device. */
  const pulse = () => {
    if (host.hidden()) return;
    const [device] = devices;
    device?.queue.submit([]);
  };

  return device => {
    devices.add(device);
    // An answer is kept for good; a request that failed is asked again by the next session.
    separate ??= findSeparateFastGpu().catch(() => {
      separate = undefined;
      return false;
    });
    void separate.then(found => {
      if (found && devices.size > 0) stop ??= host.every(PULSE_MS, pulse);
    });
    return () => {
      devices.delete(device);
      if (devices.size > 0) return;
      stop?.();
      stop = undefined;
    };
  };
}

/**
 * Keeps the fast GPU awake while `device` lives, so a loop that resumes after
 * a pause (a card scrolled back into view) never freezes the page waking it.
 * Does nothing on a machine with one GPU. Returns the release.
 */
export const keepGpuAwake = gpuWaker({
  gpu: async powerPreference => (await navigator.gpu.requestAdapter({ powerPreference }))?.info,
  hidden: () => document.visibilityState === "hidden",
  every: (ms, pulse) => {
    const timer = setInterval(pulse, ms);
    return () => clearInterval(timer);
  },
});
