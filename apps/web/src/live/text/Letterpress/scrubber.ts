import { clamp } from "./scene";

const TOUCH_SLOP = 8;
const KEY_STEP: Record<string, number> = { ArrowLeft: -0.01, ArrowDown: -0.01, ArrowRight: 0.01, ArrowUp: 0.01, PageDown: -0.1, PageUp: 0.1, Home: -1, End: 1 };

export function connectScrubber(
  surface: HTMLDivElement,
  progress: () => number,
  setProgress: (progress: number) => void,
  options: AddEventListenerOptions,
) {
  const track = surface.querySelector<HTMLElement>("[data-scrubber-track]")!;
  let press: { id: number; touch: boolean; x: number; y: number; left: number; width: number; scrubbing: boolean } | null = null;

  function clearPress() {
    press = null;
    window.removeEventListener("touchstart", onAdditionalTouch, true);
  }

  function onAdditionalTouch(event: TouchEvent) {
    if (event.touches.length > 1) clearPress();
  }

  function scrub(clientX: number) {
    if (!press) return;
    setProgress(clamp((clientX - press.left) / press.width));
  }

  surface.addEventListener("pointerdown", event => {
    if (press || !event.isPrimary || event.button !== 0) return;
    const bounds = track.getBoundingClientRect();
    const touch = event.pointerType === "touch";
    press = {
      id: event.pointerId,
      touch,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      width: Math.max(1, bounds.width),
      scrubbing: !touch,
    };
    if (touch) {
      window.addEventListener("touchstart", onAdditionalTouch, { ...options, passive: true, capture: true });
      return;
    }
    event.preventDefault();
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    scrub(event.clientX);
  }, options);

  surface.addEventListener("pointermove", event => {
    if (press?.id === event.pointerId && !press.touch) scrub(event.clientX);
  }, options);

  surface.addEventListener("touchmove", event => {
    const touch = event.touches[0];
    if (!press?.touch || !touch) return;
    if (event.touches.length !== 1 || !event.cancelable) {
      clearPress();
      return;
    }
    if (!press.scrubbing) {
      const dx = Math.abs(touch.clientX - press.x);
      const dy = Math.abs(touch.clientY - press.y);
      if (Math.max(dx, dy) < TOUCH_SLOP) return;
      if (dy >= dx) {
        clearPress();
        return;
      }
      press.scrubbing = true;
    }
    event.preventDefault();
    scrub(touch.clientX);
  }, { ...options, passive: false });

  function release(event: PointerEvent) {
    if (press?.id !== event.pointerId) return;
    if (event.type === "pointerup") scrub(event.clientX);
    clearPress();
  }

  surface.addEventListener("pointerup", release, options);
  surface.addEventListener("pointercancel", release, options);
  surface.addEventListener("lostpointercapture", release, options);
  surface.addEventListener("keydown", event => {
    const step = KEY_STEP[event.key];
    if (step === undefined || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    setProgress(clamp(progress() + step));
  }, options);
}
