import { describe, expect, test } from "bun:test";
import { adaptersDiffer, gpuWaker, type GpuIdentity } from "./keepAwake";

const INTEGRATED = { vendor: "intel", architecture: "gen-9" };
const DISCRETE = { vendor: "amd", architecture: "rdna-1" };

describe("adaptersDiffer", () => {
  test("tells an integrated GPU from a discrete one, as a dual-GPU laptop reports them", () => {
    expect(
      adaptersDiffer(
        { vendor: "intel", architecture: "gen-9", device: "", description: "" },
        { vendor: "amd", architecture: "rdna-1", device: "", description: "" },
      ),
    ).toBe(true);
  });

  test("treats the same GPU asked for twice as one, so a single-GPU machine is left alone", () => {
    const apple = { vendor: "apple", architecture: "metal-3", device: "", description: "" };
    expect(adaptersDiffer(apple, { ...apple })).toBe(false);
  });

  test("does not read a field one adapter leaves empty as a difference", () => {
    expect(adaptersDiffer({ vendor: "intel", architecture: "" }, { vendor: "intel", architecture: "gen-12lp" })).toBe(false);
    expect(adaptersDiffer({}, {})).toBe(false);
  });
});

type Gpus = Record<GPUPowerPreference, GpuIdentity | null | undefined>;

/** A host whose adapters the test answers by hand, one detection at a time, with its timers in view. */
function host() {
  const detections: { gpus: Promise<Gpus>; answer: (gpus: Gpus) => void; fail: (error: Error) => void }[] = [];
  const detection = (index: number) => {
    while (detections.length <= index) {
      let answer!: (gpus: Gpus) => void;
      let fail!: (error: Error) => void;
      const gpus = new Promise<Gpus>((resolve, reject) => {
        answer = resolve;
        fail = reject;
      });
      detections.push({ gpus, answer, fail });
    }
    return detections[index]!;
  };
  let asked = 0;
  let settled = 0;
  const state = { hidden: false, timers: [] as { ms: number; pulse: () => void; stopped: boolean }[] };
  const keepAwake = gpuWaker({
    // A detection asks for both adapters, one after the other.
    gpu: async powerPreference => (await detection(Math.floor(asked++ / 2)).gpus)[powerPreference],
    hidden: () => state.hidden,
    every: (ms, pulse) => {
      const timer = { ms, pulse, stopped: false };
      state.timers.push(timer);
      return () => void (timer.stopped = true);
    },
  });
  /** Answers the next detection, and lets everything waiting on it run. `true` is a laptop's two chips, `false` one GPU. */
  const detected = async (outcome: boolean | Error | [GpuIdentity | null | undefined, GpuIdentity | null | undefined]) => {
    const next = detection(settled++);
    if (outcome instanceof Error) next.fail(outcome);
    else {
      const [saving, fast] = outcome === true ? [INTEGRATED, DISCRETE] : outcome === false ? [INTEGRATED, INTEGRATED] : outcome;
      next.answer({ "low-power": saving, "high-performance": fast });
    }
    await new Promise(resolve => setTimeout(resolve));
  };
  return { keepAwake, state, detected, detections: () => Math.ceil(asked / 2) };
}

function device() {
  const submissions: unknown[][] = [];
  return { queue: { submit: (buffers: unknown[]) => void submissions.push(buffers) }, submissions } as unknown as Pick<GPUDevice, "queue"> & {
    submissions: unknown[][];
  };
}

describe("keepGpuAwake", () => {
  test("pulses a device with an empty submission, well inside the seven idle seconds a discrete GPU sleeps after", async () => {
    const { keepAwake, state, detected } = host();
    const gpu = device();
    keepAwake(gpu);
    expect(state.timers).toEqual([]);
    await detected(true);
    expect(state.timers).toHaveLength(1);
    expect(state.timers[0]!.ms).toBeLessThanOrEqual(3500);
    state.timers[0]!.pulse();
    expect(gpu.submissions).toEqual([[]]);
  });

  test("lets the GPU sleep while the tab is hidden", async () => {
    const { keepAwake, state, detected } = host();
    const gpu = device();
    keepAwake(gpu);
    await detected(true);
    state.hidden = true;
    state.timers[0]!.pulse();
    expect(gpu.submissions).toEqual([]);
    state.hidden = false;
    state.timers[0]!.pulse();
    expect(gpu.submissions).toHaveLength(1);
  });

  test("never starts a timer on a machine with one GPU", async () => {
    const { keepAwake, state, detected } = host();
    keepAwake(device());
    keepAwake(device());
    await detected(false);
    expect(state.timers).toEqual([]);
  });

  test("shares one timer between sessions, and stops it only when the last is released", async () => {
    const { keepAwake, state, detected } = host();
    const [first, second] = [device(), device()];
    const releaseFirst = keepAwake(first);
    const releaseSecond = keepAwake(second);
    await detected(true);
    expect(state.timers).toHaveLength(1);
    releaseFirst();
    expect(state.timers[0]!.stopped).toBe(false);
    state.timers[0]!.pulse();
    expect(first.submissions).toEqual([]);
    expect(second.submissions).toHaveLength(1);
    releaseSecond();
    expect(state.timers[0]!.stopped).toBe(true);
  });

  test("starts again for a session opened after the last one was released", async () => {
    const { keepAwake, state, detected } = host();
    keepAwake(device())();
    await detected(true);
    expect(state.timers).toEqual([]);
    const release = keepAwake(device());
    await new Promise(resolve => setTimeout(resolve));
    expect(state.timers).toHaveLength(1);
    release();
    expect(state.timers[0]!.stopped).toBe(true);
  });

  test("takes two GPUs that describe themselves alike, or not at all, for one: it cannot tell, and does not guess", async () => {
    const unknowns: [GpuIdentity | null | undefined, GpuIdentity | null | undefined][] = [
      [{ vendor: "", architecture: "" }, { vendor: "", architecture: "" }],
      [{}, DISCRETE],
      [undefined, DISCRETE],
      [INTEGRATED, null],
    ];
    for (const adapters of unknowns) {
      const { keepAwake, state, detected } = host();
      keepAwake(device());
      await detected(adapters);
      expect(state.timers).toEqual([]);
    }
  });

  test("starts nothing when an adapter request fails, and asks again for the next session rather than give up for good", async () => {
    const { keepAwake, state, detected, detections } = host();
    const release = keepAwake(device());
    await detected(new Error("requestAdapter failed"));
    expect(state.timers).toEqual([]);
    release();

    keepAwake(device());
    expect(detections()).toBe(2);
    await detected(true);
    expect(state.timers).toHaveLength(1);
  });

  test("asks once when it gets an answer, however many sessions follow", async () => {
    const { keepAwake, detected, detections } = host();
    keepAwake(device());
    await detected(false);
    keepAwake(device());
    keepAwake(device());
    expect(detections()).toBe(1);
  });
});
