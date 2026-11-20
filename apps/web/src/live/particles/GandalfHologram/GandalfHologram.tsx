import { useEffect, useRef } from "react";
import { visibleLoop, type FrameRequest } from "@/live/kit/visibleLoop";
import { advanceOrbit, decayOrbit, dragAxis, FRONT_PITCH, FRONT_YAW, orbitRadiansPerPixel, releaseSpeed, sampleFlick, TURN_STEP, type Flick, type PointerSample } from "./orbit";
import { DROP_SECONDS, makeProjection, SETTLED_SECONDS } from "./projection";
import styles from "./GandalfHologram.module.css";
import still from "./still.module.css";

type Rotation = { angle: number; goal: number; velocity: number };
type AxisDrag = { previous: PointerSample; applied: number; flick: Flick };

type Drag = {
  id: number;
  startX: number;
  startY: number;
  horizontal: AxisDrag;
  vertical: AxisDrag;
  radiansPerPixel: number;
  moved: boolean;
  onHat: boolean;
  axis: ReturnType<typeof dragAxis>;
};

function startAxis(position: number, at: number): AxisDrag {
  const sample = { x: position, at };
  return { previous: sample, applied: position, flick: { speed: 0, accepted: sample, peakX: position } };
}

function frontAngle(angle: number, front: number) {
  const turn = Math.PI * 2;
  return front + turn * Math.round((angle - front) / turn);
}

function startHologram(
  canvas: HTMLCanvasElement,
  viewport: HTMLButtonElement,
  root: HTMLElement,
) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
    stencil: false,
  });
  if (!gl) {
    root.dataset.still = "";
    return undefined;
  }

  let projection = makeProjection(gl);
  if (!projection) {
    root.dataset.still = "";
    return undefined;
  }
  const yaw: Rotation = { angle: FRONT_YAW, goal: FRONT_YAW, velocity: 0 };
  const pitch: Rotation = { angle: FRONT_PITCH, goal: FRONT_PITCH, velocity: 0 };
  const rotations = [yaw, pitch];
  let drag: Drag | null = null;
  let time = 0;
  let painted = false;
  let dropAt: number | null = null;
  let dropTimer: number | undefined;
  let dirty = true;
  let width = 0;
  let height = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reduced.matches;

  function draw(at = performance.now()) {
    if (!projection || !width || !height) return;
    const elapsed = dropAt === null ? -1 : (at - dropAt) / 1000;
    const drop = elapsed < 0 || elapsed >= DROP_SECONDS ? -1 : reducedMotion ? SETTLED_SECONDS : elapsed;
    projection.draw(yaw.angle, pitch.angle, reducedMotion ? 0 : time, drop);
    dirty = false;
    if (!painted) {
      painted = true;
      root.dataset.projecting = "";
      delete root.dataset.still;
      viewport.tabIndex = 0;
      viewport.removeAttribute("aria-disabled");
      viewport.setAttribute("aria-label", "Drop the dots");
      viewport.setAttribute("aria-description", "Gandalf’s hat, formed from white dots. Drag or use the arrow keys to turn in any direction. Press Home for the front view.");
    }
  }

  function moving() {
    return !!projection && !!width && !!height && !document.hidden && (dirty || !reducedMotion);
  }

  function wake() {
    if (moving()) loop.wake();
  }

  function tick(at: number, elapsed: number): FrameRequest {
    const delta = Math.min(elapsed / 1000, 0.04);
    if (!reducedMotion) time += delta;
    for (const rotation of rotations) {
      if (rotation.velocity) {
        rotation.angle = advanceOrbit(rotation.angle, rotation.velocity, delta);
        rotation.goal = rotation.angle;
        rotation.velocity = decayOrbit(rotation.velocity, delta);
        if (Math.abs(rotation.velocity) < 0.02) rotation.velocity = 0;
      }
      if (rotation.goal !== rotation.angle) {
        rotation.angle += (rotation.goal - rotation.angle) * (1 - Math.exp(-18 * delta));
        if (Math.abs(rotation.goal - rotation.angle) < 0.001) rotation.angle = rotation.goal;
      }
    }
    draw(at);
    return moving();
  }

  const loop = visibleLoop(viewport, tick, {
    initiallyVisible: false,
    onVisibleChange: visible => visible && measure(),
  });

  function measure() {
    if (!projection || !width || !height || !loop.visible || document.hidden) return;
    const { width: displayWidth, height: displayHeight } = canvas.getBoundingClientRect();
    if (!displayWidth || !displayHeight) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 800 / Math.max(displayWidth, displayHeight));
    const pixelWidth = Math.max(1, Math.round(displayWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(displayHeight * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    projection.resize(pixelWidth, pixelHeight, dpr);
    draw();
    wake();
  }

  function hitsHat(x: number, y: number, box = viewport.getBoundingClientRect()) {
    if (!projection) return false;
    return projection.hits((x - box.left) / box.width - 0.5, 0.5 - (y - box.top) / box.height, yaw.angle, pitch.angle);
  }

  function down(event: PointerEvent) {
    if (!projection || drag || !event.isPrimary || event.button !== 0) return;
    const touch = event.pointerType === "touch";
    const box = viewport.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: startAxis(event.clientX, event.timeStamp),
      vertical: startAxis(event.clientY, event.timeStamp),
      radiansPerPixel: orbitRadiansPerPixel(box.width, box.height),
      moved: false,
      onHat: touch && hitsHat(event.clientX, event.clientY, box),
      axis: touch ? null : "orbit",
    };
    for (const rotation of rotations) {
      rotation.goal = rotation.angle;
      rotation.velocity = 0;
    }
    viewport.setPointerCapture(event.pointerId);
    if (!touch) {
      event.preventDefault();
      viewport.dataset.dragging = "";
    }
  }

  function applyDrag(
    track: AxisDrag,
    rotation: Rotation,
    position: number,
    at: number,
    orbit: boolean,
    radiansPerPixel: number,
    coalesced: PointerSample | undefined,
  ) {
    const sample = { x: position, at };
    const prior = track.previous;
    if (sample.x !== prior.x) track.previous = sample;
    const displacement = position - track.applied;
    if (!orbit || displacement === 0) return false;

    const previous = coalesced && (position - coalesced.x) * displacement > 0 ? coalesced : prior;
    track.flick = sampleFlick(track.flick, previous, sample, radiansPerPixel);
    track.applied = position;
    rotation.angle += displacement * radiansPerPixel;
    rotation.goal = rotation.angle;
    return true;
  }

  function move(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    drag.axis ??= dragAxis(event.clientX - drag.startX, event.clientY - drag.startY, drag.onHat);
    drag.moved ||= passedSlop(event, drag);
    const coalesced = event.getCoalescedEvents?.().at(-2);
    const orbit = drag.axis === "orbit";
    const turned = applyDrag(drag.horizontal, yaw, event.clientX, event.timeStamp, orbit, drag.radiansPerPixel,
      coalesced && { x: coalesced.clientX, at: coalesced.timeStamp });
    const tilted = applyDrag(drag.vertical, pitch, event.clientY, event.timeStamp, orbit, drag.radiansPerPixel,
      coalesced && { x: coalesced.clientY, at: coalesced.timeStamp });
    if (!turned && !tilted) return;
    viewport.dataset.dragging = "";
    dirty = true;
    wake();
  }

  function lockTouch(event: TouchEvent) {
    if (!drag || event.touches.length !== 1) return;
    const touch = event.touches.item(0);
    if (!touch) return;
    drag.axis ??= dragAxis(touch.clientX - drag.startX, touch.clientY - drag.startY, drag.onHat);
    if (drag.axis === null) {
      if (touch.clientX !== drag.horizontal.previous.x) drag.horizontal.previous = { x: touch.clientX, at: event.timeStamp };
      if (touch.clientY !== drag.vertical.previous.x) drag.vertical.previous = { x: touch.clientY, at: event.timeStamp };
    }
    if ((drag.onHat || drag.axis === "orbit") && event.cancelable) event.preventDefault();
  }

  function passedSlop(event: PointerEvent, start: Drag) {
    const distance = Math.max(Math.abs(event.clientX - start.startX), Math.abs(event.clientY - start.startY));
    return distance >= (event.pointerType === "touch" ? 8 : 4);
  }

  function drop() {
    if (!projection || dropAt !== null) return;
    dropAt = performance.now();
    dirty = true;
    wake();
    dropTimer = window.setTimeout(() => {
      dropAt = null;
      dirty = true;
      wake();
    }, DROP_SECONDS * 1000);
  }

  function end(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    if (event.type === "pointerup") {
      if (drag.moved || passedSlop(event, drag)) {
        if (drag.axis === "orbit" && !reducedMotion) {
          yaw.velocity = releaseSpeed(drag.horizontal.flick, event.timeStamp);
          pitch.velocity = releaseSpeed(drag.vertical.flick, event.timeStamp);
        }
      } else if (dropAt === null && hitsHat(event.clientX, event.clientY)) {
        drop();
      }
    }
    drag = null;
    delete viewport.dataset.dragging;
    wake();
  }

  function activate(event: MouseEvent) {
    if (event.detail === 0) drop();
  }

  function cancelDrag() {
    if (drag) {
      const { id } = drag;
      drag = null;
      delete viewport.dataset.dragging;
      if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    }
  }

  function key(event: KeyboardEvent) {
    if (!projection) return;
    switch (event.key) {
      case "ArrowLeft": yaw.goal -= TURN_STEP; break;
      case "ArrowRight": yaw.goal += TURN_STEP; break;
      case "ArrowUp": pitch.goal -= TURN_STEP; break;
      case "ArrowDown": pitch.goal += TURN_STEP; break;
      case "Home":
        yaw.goal = frontAngle(yaw.angle, FRONT_YAW);
        pitch.goal = frontAngle(pitch.angle, FRONT_PITCH);
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    cancelDrag();
    for (const rotation of rotations) {
      rotation.velocity = 0;
      if (reducedMotion) rotation.angle = rotation.goal;
    }
    dirty = true;
    wake();
  }

  function changeMotion(event?: MediaQueryListEvent) {
    reducedMotion = event?.matches ?? reducedMotion;
    if (reducedMotion) {
      for (const rotation of rotations) {
        rotation.angle = rotation.goal;
        rotation.velocity = 0;
      }
      time = 0;
    }
    dirty = true;
    wake();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    loop.sleep();
    projection = null;
    cancelDrag();
    viewport.tabIndex = -1;
    viewport.setAttribute("aria-disabled", "true");
    viewport.setAttribute("aria-label", "Gandalf’s hat in white dots");
    viewport.removeAttribute("aria-description");
    painted = false;
    root.dataset.still = "";
    delete root.dataset.projecting;
  }

  function contextRestored() {
    if (gl) projection = makeProjection(gl);
    measure();
  }

  function changeVisibility() {
    if (document.hidden) loop.sleep();
    else measure();
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    measure();
  });
  resize.observe(canvas);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  viewport.addEventListener("pointerdown", down);
  viewport.addEventListener("pointermove", move);
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);
  viewport.addEventListener("lostpointercapture", end);
  viewport.addEventListener("touchmove", lockTouch, { passive: false });
  viewport.addEventListener("keydown", key);
  viewport.addEventListener("click", activate);
  reduced.addEventListener("change", changeMotion);
  document.addEventListener("visibilitychange", changeVisibility);

  return {
    dispose() {
      loop.stop();
      window.clearTimeout(dropTimer);
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", end);
      viewport.removeEventListener("pointercancel", end);
      viewport.removeEventListener("lostpointercapture", end);
      viewport.removeEventListener("touchmove", lockTouch);
      viewport.removeEventListener("keydown", key);
      viewport.removeEventListener("click", activate);
      reduced.removeEventListener("change", changeMotion);
      document.removeEventListener("visibilitychange", changeVisibility);
      cancelDrag();
      projection?.dispose();
      delete root.dataset.projecting;
      delete root.dataset.still;
      delete viewport.dataset.dragging;
    },
  };
}

export function GandalfHologram() {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!root || !viewport || !canvas) return;
    const hologram = startHologram(canvas, viewport, root);
    return () => hologram?.dispose();
  }, []);

  return (
    <div className={styles.frame}>
      <div className={styles.scene} ref={rootRef}>
        <button
          ref={viewportRef}
          className={styles.hat}
          type="button"
          aria-label="Gandalf’s hat in white dots"
          aria-disabled="true"
          tabIndex={-1}
        >
          <canvas ref={canvasRef} aria-hidden="true" />
          <span className={`${styles.still} ${still.image}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
