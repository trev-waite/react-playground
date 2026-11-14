import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { SegmentedControl } from "@/live/controls/SegmentedControl/SegmentedControl";
import { Switch } from "@/live/controls/Switch/Switch";
import { CLOSE_RATE, OPEN_MS, geometry, tracks, type Geometry } from "./portal";
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

/** The layers of one flight, played forward to open and backward to close. `stale` marks a stage resized mid-flight. */
type Flight = { animations: Animation[]; portal: Animation; stale: boolean };

type Layers = { stage: HTMLElement; avatar: HTMLElement; portal: HTMLElement; room: HTMLElement; portrait: HTMLElement; content: HTMLElement };

function measure({ stage, avatar }: Layers): Geometry {
  const stageRect = stage.getBoundingClientRect();
  const avatarRect = avatar.getBoundingClientRect();
  const scale = stageRect.width / stage.offsetWidth || 1;
  return geometry(
    { width: stage.offsetWidth, height: stage.offsetHeight },
    {
      x: (avatarRect.left + avatarRect.width / 2 - stageRect.left) / scale,
      y: (avatarRect.top + avatarRect.height / 2 - stageRect.top) / scale,
    },
    avatarRect.width / 2 / scale,
  );
}

function place({ portal, room, portrait, content }: Layers, g: Geometry) {
  const { avatar: a, reach, stage } = g;
  Object.assign(portal.style, { left: `${a.x - reach}px`, top: `${a.y - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px` });
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
    animations.push(portal, layers.room.animate(track.room, timing));
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
  return { animations, portal, stale: false };
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
  const backRef = useRef<HTMLButtonElement>(null);
  const cockpit = useRef<Cockpit>({ flight: null });
  const onlineId = useId();
  const [online, setOnline] = useState(true);

  function layers(): Layers | null {
    const [stage, avatar, portal, room, portrait, content] = [
      stageRef.current,
      avatarRef.current,
      portalRef.current,
      roomRef.current,
      portraitRef.current,
      contentRef.current,
    ];
    return stage && avatar && portal && room && portrait && content ? { stage, avatar, portal, room, portrait, content } : null;
  }

  function prime() {
    const found = layers();
    if (found) primeFlight(cockpit.current, found);
  }

  function release() {
    if (stageRef.current) releaseFlight(cockpit.current, stageRef.current);
  }

  function enter() {
    prime();
    const { flight } = cockpit.current;
    if (!flight) return;
    flushSync(() => setOpen(true));
    steer(flight, 1);
    backRef.current?.focus({ preventScroll: true });
  }

  function leave() {
    const { flight } = cockpit.current;
    if (!flight) return;
    flushSync(() => setOpen(false));
    steer(flight, -1);
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
        <span className={styles.presence} data-online={online || undefined} aria-hidden="true" />
      </button>
      <div ref={portalRef} className={styles.portal}>
        <div ref={roomRef} className={styles.room} role="dialog" aria-label={`${profile.name}'s profile`} inert={!open}>
          <div ref={portraitRef} className={styles.portrait}>
            <Silhouette className={styles.portraitFace} pixels={192} />
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
