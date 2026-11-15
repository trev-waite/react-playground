import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { SegmentedControl } from "@/live/controls/SegmentedControl/SegmentedControl";
import { Switch } from "@/live/controls/Switch/Switch";
import { CLOSE_RATE, MAX_PORTRAIT, OPEN_MS, geometry, tracks, type Geometry } from "./portal";
import { beadAt, type Dot } from "./presence";
import { ROOM_COLOR, paintSilhouette } from "./silhouette";
import styles from "./ProfileButton.module.css";

export type Profile = { name: string; handle: string };

const VISIBILITY = ["Public", "Friends", "Only me"] as const;

/** The silhouette, drawn once at `pixels`, or at the element's own size when omitted. */
function Silhouette({ className, pixels }: { className?: string; pixels?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    paintSilhouette(canvas, pixels ?? Math.max(16, Math.round(canvas.clientWidth * dpr)));
  }, [pixels]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

/**
 * The layers of one flight, played forward to open and backward to close.
 * `stale` marks a stage resized mid-flight; `trace` is the frame that redraws
 * the presence bead while the flight plays, from where the dot sat, `dot`,
 * toward the room (`heading` 1) or back out (-1).
 */
type Flight = {
  animations: Animation[];
  portal: Animation;
  geometry: Geometry;
  reduced: boolean;
  stale: boolean;
  trace: number;
  dot: Dot | null;
  heading: 1 | -1;
};

type Layers = {
  stage: HTMLElement;
  avatar: HTMLElement;
  portal: HTMLElement;
  room: HTMLElement;
  portrait: HTMLElement;
  content: HTMLElement;
  trace: HTMLElement;
};

/** The stage's on-screen scale, for a stage drawn inside a transformed card. */
function stageScale(stage: HTMLElement): number {
  return stage.getBoundingClientRect().width / stage.offsetWidth || 1;
}

function measure({ stage, avatar }: Layers): Geometry {
  const stageRect = stage.getBoundingClientRect();
  const avatarRect = avatar.getBoundingClientRect();
  const scale = stageScale(stage);
  return geometry(
    { width: stage.offsetWidth, height: stage.offsetHeight },
    {
      x: (avatarRect.left + avatarRect.width / 2 - stageRect.left) / scale,
      y: (avatarRect.top + avatarRect.height / 2 - stageRect.top) / scale,
    },
    avatarRect.width / 2 / scale,
  );
}

function place({ portal, room, portrait, content, trace }: Layers, g: Geometry) {
  const { avatar: a, reach, stage } = g;
  const box = { left: `${a.x - reach}px`, top: `${a.y - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px` };
  Object.assign(portal.style, box);
  Object.assign(trace.style, box);
  Object.assign(room.style, { left: `${reach - a.x}px`, top: `${reach - a.y}px`, width: `${stage.width}px`, height: `${stage.height}px` });
  Object.assign(portrait.style, {
    left: `${g.portrait.x - g.portraitSize / 2}px`,
    top: `${g.portrait.y - g.portraitSize / 2}px`,
    width: `${g.portraitSize}px`,
    height: `${g.portraitSize}px`,
  });
  content.style.setProperty("--arrow-top", `${g.arrowTop}px`);
  content.style.setProperty("--arrow-x", `${g.arrowX}px`);
  content.style.setProperty("--details-top", `${g.details.top}px`);
  content.style.setProperty("--details-left", `${g.details.left}px`);
  content.style.setProperty("--details-width", `${g.details.width}px`);
  content.dataset.layout = g.details.strip ? "strip" : g.details.align === "start" ? "side" : "stacked";
}

/** Builds every layer's animation for one geometry. Reduced motion swaps the zoom for a short cross-fade. */
function launch(layers: Layers, g: Geometry, reduced: boolean): Flight {
  place(layers, g);
  const timing: KeyframeAnimationOptions = { duration: reduced ? 200 : OPEN_MS, fill: "both", easing: "linear" };
  const animations: Animation[] = [];
  let portal: Animation;
  if (reduced) {
    portal = layers.portal.animate([{ opacity: 0, transform: "none" }, { opacity: 1, transform: "none" }], timing);
    animations.push(portal, layers.room.animate([{ transform: "none" }, { transform: "none" }], timing));
  } else {
    const track = tracks(g);
    portal = layers.portal.animate(track.portal, timing);
    animations.push(portal, layers.room.animate(track.room, timing), layers.trace.animate(track.portal, timing));
  }
  animations.push(
    layers.content.animate(
      [
        { offset: 0, opacity: 0, transform: "translateY(12px)" },
        { offset: reduced ? 0 : 0.6, opacity: 0, transform: "translateY(12px)", easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        { offset: 1, opacity: 1, transform: "none" },
      ],
      timing,
    ),
  );
  return { animations, portal, geometry: g, reduced, stale: false, trace: 0, dot: null, heading: 1 };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function steer(flight: Flight, direction: 1 | -1) {
  for (const animation of flight.animations) {
    animation.updatePlaybackRate(direction > 0 ? 1 : -CLOSE_RATE);
    animation.play();
  }
}

/** Divides out the dot's own scale, so a dot still scaling in does not shrink the bead. */
function measureDot(stage: HTMLElement, presence: HTMLElement): Dot {
  const stageRect = stage.getBoundingClientRect();
  const rect = presence.getBoundingClientRect();
  const scale = stageScale(stage);
  const own = Number.parseFloat(getComputedStyle(presence).scale) || 1;
  return {
    x: (rect.left + rect.width / 2 - stageRect.left) / scale,
    y: (rect.top + rect.height / 2 - stageRect.top) / scale,
    radius: rect.width / 2 / scale / own,
  };
}

/**
 * Hands the presence dot to the bead above the window for the flight, and
 * redraws the bead from the flight's own clock each frame it plays, so it
 * keeps pace both ways and through a reversal mid-flight.
 */
function traceDot(flight: Flight, stage: HTMLElement, bead: SVGPathElement, dot: Dot) {
  cancelAnimationFrame(flight.trace);
  const draw = () => {
    const ms = Number(flight.portal.currentTime ?? 0);
    const { path, stroke } = beadAt(flight.geometry, dot, ms);
    if (bead.getAttribute("d") !== path) {
      bead.setAttribute("d", path);
      bead.style.strokeWidth = `${stroke.toFixed(2)}px`;
    }
    const gone = path === "" && flight.heading > 0;
    // perf-allow: runs only while a flight the viewer started plays, at most 1.3s, and stops once the bead has ridden off the stage.
    flight.trace = flight.portal.playState === "running" && !gone ? requestAnimationFrame(draw) : 0;
  };
  stage.dataset.trace = "";
  draw();
}

function stopTracing(flight: Flight, stage: HTMLElement) {
  cancelAnimationFrame(flight.trace);
  flight.trace = 0;
  delete stage.dataset.trace;
}

/** The flight in progress, kept outside React. */
type Cockpit = { flight: Flight | null };

/**
 * Makes `started` the current flight. Once it lands in the room it catches up
 * with any resize it flew through; once it plays back out, the portal hides.
 */
function adopt(cockpit: Cockpit, layers: Layers, started: Flight) {
  started.portal.addEventListener("finish", () => {
    if (cockpit.flight !== started) return;
    if (started.portal.playbackRate >= 0) {
      stopTracing(started, layers.stage);
      if (started.stale) refit(cockpit, layers);
      return;
    }
    releaseFlight(cockpit, layers.stage, true);
  });
  cockpit.flight = started;
  layers.stage.dataset.flight = "";
}

/** Rebuilds an open room for the stage's current size, landed. */
function refit(cockpit: Cockpit, layers: Layers) {
  if (!cockpit.flight) return;
  for (const animation of cockpit.flight.animations) animation.cancel();
  const resized = launch(layers, measure(layers), prefersReducedMotion());
  for (const animation of resized.animations) animation.finish();
  adopt(cockpit, layers, resized);
}

/** Builds the flight held at its first frame, which shows the avatar exactly, so pressing it paints nothing new. */
function primeFlight(cockpit: Cockpit, layers: Layers) {
  if (cockpit.flight) return;
  const started = launch(layers, measure(layers), prefersReducedMotion());
  for (const animation of started.animations) animation.pause();
  adopt(cockpit, layers, started);
}

/** Drops a flight that is back outside, or, unless `landed`, one primed but never taken. */
function releaseFlight(cockpit: Cockpit, stage: HTMLElement, landed = false) {
  const current = cockpit.flight;
  if (!current || (!landed && current.portal.playState !== "paused")) return;
  stopTracing(current, stage);
  for (const animation of current.animations) animation.cancel();
  cockpit.flight = null;
  delete stage.dataset.flight;
}

type ProfileButtonProps = {
  profile: Profile;
  /** Avatar diameter in px. */
  size?: number;
};

/**
 * A profile picture that is a way in. Pressing it pulls the viewer through the
 * picture into a dark room behind it, where the profile and its settings wait;
 * the arrow above the head, or Escape, zooms back out. Fills its container.
 */
export function ProfileButton({ profile, size = 72 }: ProfileButtonProps) {
  const [open, setOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const portraitRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const presenceRef = useRef<HTMLSpanElement>(null);
  const traceRef = useRef<HTMLDivElement>(null);
  const beadRef = useRef<SVGPathElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const cockpit = useRef<Cockpit>({ flight: null });
  const onlineId = useId();
  const [online, setOnline] = useState(true);

  function layers(): Layers | null {
    const [stage, avatar, portal, room, portrait, content, trace] = [
      stageRef.current,
      avatarRef.current,
      portalRef.current,
      roomRef.current,
      portraitRef.current,
      contentRef.current,
      traceRef.current,
    ];
    return stage && avatar && portal && room && portrait && content && trace ? { stage, avatar, portal, room, portrait, content, trace } : null;
  }

  function prime() {
    const found = layers();
    if (found) primeFlight(cockpit.current, found);
  }

  function release() {
    if (stageRef.current) releaseFlight(cockpit.current, stageRef.current);
  }

  function fly(flight: Flight, direction: 1 | -1) {
    const [stage, presence, bead] = [stageRef.current, presenceRef.current, beadRef.current];
    if (stage && presence && bead && online && !flight.reduced) {
      const dot = flight.trace && flight.dot ? flight.dot : measureDot(stage, presence);
      flight.dot = dot;
      flight.heading = direction;
      steer(flight, direction);
      traceDot(flight, stage, bead, dot);
      return;
    }
    if (stage) stopTracing(flight, stage);
    steer(flight, direction);
  }

  function enter() {
    prime();
    const { flight } = cockpit.current;
    if (!flight) return;
    flushSync(() => setOpen(true));
    fly(flight, 1);
    backRef.current?.focus({ preventScroll: true });
  }

  function leave() {
    const { flight } = cockpit.current;
    if (!flight) return;
    flushSync(() => setOpen(false));
    fly(flight, -1);
    avatarRef.current?.focus({ preventScroll: true });
  }

  /** An open room follows the stage's size. A room in flight keeps its course and catches up when it lands. */
  const onResize = useEffectEvent(() => {
    const found = layers();
    const current = cockpit.current.flight;
    if (!current || !found) return;
    if (current.portal.playState === "paused") releaseFlight(cockpit.current, found.stage);
    else if (current.portal.playState === "finished" && current.portal.playbackRate >= 0) refit(cockpit.current, found);
    else current.stale = true;
  });

  const leaveOnEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    leave();
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => leaveOnEscape(event);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    const stage = stageRef.current;
    const pilot = cockpit.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => onResize());
    observer.observe(stage);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pilot.flight?.trace ?? 0);
      for (const animation of pilot.flight?.animations ?? []) animation.cancel();
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      data-open={open || undefined}
      style={{ "--room": ROOM_COLOR, "--avatar": `${size}px` } as CSSProperties}
    >
      <button
        ref={avatarRef}
        type="button"
        className={styles.avatar}
        aria-label={`Open ${profile.name}'s profile${online ? ", online" : ""}`}
        aria-haspopup="dialog"
        inert={open}
        onPointerEnter={prime}
        onFocus={prime}
        onPointerLeave={release}
        onBlur={release}
        onClick={enter}
      >
        <Silhouette className={styles.avatarFace} />
        <span ref={presenceRef} className={styles.presence} data-online={online || undefined} aria-hidden="true" />
      </button>
      <div ref={portalRef} className={styles.portal}>
        <div ref={roomRef} className={styles.room} role="dialog" aria-label={`${profile.name}'s profile`} inert={!open}>
          <div ref={portraitRef} className={styles.portrait}>
            <Silhouette className={styles.portraitFace} pixels={MAX_PORTRAIT * 2} />
          </div>
          <div ref={contentRef} className={styles.content}>
            <button ref={backRef} type="button" className={styles.back} aria-label="Zoom back out" onClick={leave}>
              <BackArrow />
            </button>
            <div className={styles.details}>
              <div className={styles.identity}>
                <h3 className={styles.name}>{profile.name}</h3>
                <p className={styles.handle}>{profile.handle}</p>
              </div>
              <div className={styles.settings}>
                <SegmentedControl label="Who can see your profile" options={VISIBILITY} />
                <div className={styles.setting}>
                  <label htmlFor={onlineId}>Show when I'm online</label>
                  <Switch id={onlineId} label="Show when I'm online" size="compact" defaultChecked onChange={setOnline} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div ref={traceRef} className={styles.trace} aria-hidden="true">
        <svg>
          <path ref={beadRef} />
        </svg>
      </div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M18 11H4M10 5l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
