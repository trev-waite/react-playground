import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useGpu } from "@/gpu";
import { createGooRenderer, type GooRenderer } from "./gpuGoo";
import {
  BASELINE,
  DROP_Y,
  FONT,
  FONT_SIZE,
  GOO_BLUR,
  GOO_CUT,
  GOO_GAIN,
  HEIGHT,
  DROP_SIZE,
  BLUE,
  DRAIN_SOFTNESS,
  INK,
  measureLines,
  SPILL_X,
  SPILL_Y,
  bridgePath,
  type GooFrame,
  type Lines,
} from "./scene";
import { BEAD_RADIUS, phases, poseAt, restingPose, type Pose } from "./timeline";

/** How far either side of the bead (in bead radii) the thread thins before it breaks. */
const PINCH_SPREAD = 2.1;
import styles from "./GooeyText.module.css";

const DEFAULT_WORDS = ["hello", "gooey", "flow"] as const;
/** A reduced-motion line shows each word this long, still. */
const STILL_MS = 3200;
/** The spring the drop's stretch rides: a few soft swings that settle in about half a second. */
const DROP_STIFFNESS = 170;
const DROP_DAMPING = 11;

/** Writes an attribute only when it changed, so a settled letter costs nothing. */
function write(element: Element | undefined, name: string, value: string) {
  if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Paints a frame into the SVG goo, which shows wherever the GPU goo cannot run. */
function svgPainter(svg: SVGSVGElement): (state: GooFrame) => void {
  const groups = Array.from(svg.querySelectorAll<SVGGElement>("[data-word]"));
  const slime = Array.from(svg.querySelectorAll<SVGGElement>("[data-slime]"));
  const inks = Array.from(svg.querySelectorAll<SVGDefsElement>("[data-inks]"));
  const drop = svg.querySelector<SVGCircleElement>("[data-drop]") ?? undefined;
  return state => {
    const letters = groups[state.word]?.children;
    const bridges = slime[state.word]?.querySelectorAll("path");
    const beads = slime[state.word]?.querySelectorAll("circle");
    const drains = inks[state.word]?.children;
    state.letters.forEach((letter, i) => {
      const transform = `translate(${letter.x.toFixed(2)} ${letter.y.toFixed(2)}) scale(${letter.sx.toFixed(4)} ${letter.sy.toFixed(4)}) translate(${(-letter.center).toFixed(2)} ${-DROP_Y})`;
      write(letters?.[i], "transform", transform);
      const drain = drains?.[i];
      write(drain, "x1", letter.toward > 0 ? "0" : "1");
      write(drain, "x2", letter.toward > 0 ? "1" : "0");
      write(drain?.children[0], "offset", (letter.drain * (1 + DRAIN_SOFTNESS) - DRAIN_SOFTNESS).toFixed(3));
      write(drain?.children[1], "offset", (letter.drain * (1 + DRAIN_SOFTNESS)).toFixed(3));
      write(bridges?.[i], "d", bridgePath(letter.bridge));
      write(beads?.[i], "cx", letter.bridge.beadX.toFixed(2));
      write(beads?.[i], "cy", letter.bridge.beadY.toFixed(2));
      write(beads?.[i], "r", letter.bridge.bead.toFixed(2));
    });
    write(drop, "transform", `translate(${state.drop.x.toFixed(2)} ${state.drop.y.toFixed(2)}) scale(${state.drop.sx.toFixed(4)} ${state.drop.sy.toFixed(4)})`);
  };
}

/**
 * Runs the drop and the letters until stopped, handing each frame to
 * `paint`. Sleeps off screen; reduced motion shows each word still, with its period.
 */
function startFlow(svg: SVGSVGElement, lines: Lines, paint: (state: GooFrame) => void): () => void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const layers = Array.from(svg.querySelectorAll<SVGGElement>("[data-word], [data-slime]"));
  const cycles = lines.words.map(word => phases(word.letters.length).total);
  let wordIndex = 0;
  let elapsed = 0;
  let previous = 0;
  let frame = 0;
  let timer = 0;
  let visible = true;
  let lastDropX: number | null = null;
  /** The drop's stretch rides a spring toward the stretch its speed asks for, so it wobbles like jelly when it starts and stops. */
  let stretch = 0;
  let stretchVelocity = 0;

  function show(index: number) {
    layers.forEach(layer => {
      const own = layer.dataset.word ?? layer.dataset.slime;
      write(layer, "visibility", Number(own) === index ? "visible" : "hidden");
    });
  }

  /** Poses word `index` at `ms` into its cycle. */
  function play(index: number, ms: number, dt: number) {
    const before = lines.words[(index - 1 + lines.words.length) % lines.words.length]!;
    draw(index, poseAt(lines.words[index]!, before, FONT_SIZE, ms), dt);
  }

  /** Draws word `index` in `pose`. A `dt` of 0 draws a still frame, with the drop's stretch at rest. */
  function draw(index: number, pose: Pose, dt: number) {
    const word = lines.words[index]!;
    const speed = lastDropX == null || dt <= 0 ? 0 : Math.abs(pose.dropX - lastDropX) / dt;
    lastDropX = pose.dropX;
    if (dt <= 0) {
      stretch = pose.dropSquash;
      stretchVelocity = 0;
    } else {
      const target = Math.min(0.42, speed * 0.5) + pose.dropSquash;
      const seconds = dt / 1000;
      stretchVelocity += (DROP_STIFFNESS * (target - stretch) - DROP_DAMPING * stretchVelocity) * seconds;
      stretch = Math.min(0.5, Math.max(-0.3, stretch + stretchVelocity * seconds));
    }
    const drop = { x: pose.dropX, y: DROP_Y + pose.dropSink, sx: (1 + stretch) * pose.dropScale, sy: pose.dropScale / (1 + stretch * 0.55) };
    const letters = pose.letters.map((letter, i) => {
      const layout = word.letters[i]!;
      const center = layout.left + layout.width / 2;
      const x = center + letter.dx;
      const y = DROP_Y + letter.dy;
      const toward = pose.dropX >= x ? 1 : -1;
      const to = x + toward * layout.width * 0.15 * letter.scale;
      const { bridge } = letter;
      return {
        center,
        width: layout.width,
        sx: Math.max(0, letter.scale * letter.stretch),
        sy: Math.max(0, letter.scale / Math.sqrt(letter.stretch)),
        x,
        y,
        drain: letter.drain,
        toward,
        bridge: {
          from: drop.x,
          fromY: drop.y,
          to,
          toY: y,
          start: bridge.drop * FONT_SIZE * pose.dropScale,
          end: bridge.letter * FONT_SIZE * letter.scale,
          waist: bridge.waist * FONT_SIZE,
          bead: bridge.bead * FONT_SIZE,
          beadX: drop.x + (to - drop.x) * bridge.beadAt,
          beadY: drop.y + (y - drop.y) * bridge.beadAt,
          beadAt: bridge.beadAt,
          pinch: bridge.pinch * FONT_SIZE,
          spread: (BEAD_RADIUS * PINCH_SPREAD * FONT_SIZE) / Math.max(1, Math.abs(to - drop.x)),
        },
      };
    });
    paint({ word: index, letters, drop });
  }

  function advance(dt: number) {
    elapsed += dt;
    while (elapsed >= cycles[wordIndex]!) {
      elapsed -= cycles[wordIndex]!;
      wordIndex = (wordIndex + 1) % lines.words.length;
      lastDropX = null;
      show(wordIndex);
    }
  }

  function tick(now: number) {
    frame = 0;
    const dt = Math.min(48, now - previous);
    previous = now;
    advance(dt);
    play(wordIndex, elapsed, dt);
    if (visible) frame = requestAnimationFrame(tick);
  }

  function resume() {
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function still() {
    window.clearTimeout(timer);
    show(wordIndex);
    lastDropX = null;
    draw(wordIndex, restingPose(lines.words[wordIndex]!, FONT_SIZE), 0);
    timer = window.setTimeout(() => {
      wordIndex = (wordIndex + 1) % lines.words.length;
      still();
    }, STILL_MS);
  }

  function wake() {
    cancelAnimationFrame(frame);
    frame = 0;
    window.clearTimeout(timer);
    if (!visible) return;
    if (reducedMotion.matches) {
      still();
      return;
    }
    show(wordIndex);
    resume();
  }

  const observer = new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry?.isIntersecting ?? true;
    if (visible && !was) wake();
    if (!visible) {
      cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(timer);
    }
  });
  observer.observe(svg);
  reducedMotion.addEventListener("change", wake);
  play(0, 0, 0);
  wake();

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    observer.disconnect();
    reducedMotion.removeEventListener("change", wake);
  };
}

type GooeyTextProps = {
  /** Typed one after another, on a loop. */
  words?: readonly string[];
};

/**
 * Text typed by a drop of ink: it glides along the line and each letter oozes
 * out of it on a bridge of slime that necks down until it pinches off, and
 * the blue drains back out of the freed letter, leaving it black. The drop
 * swings straight back to land after the word as its period, then lifts off,
 * slides back, swallows the word, and flows on to the next.
 */
export function GooeyText({ words = DEFAULT_WORDS }: GooeyTextProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GooRenderer | null>(null);
  const latestRef = useRef<GooFrame | null>(null);
  const paintSvgRef = useRef<((state: GooFrame) => void) | null>(null);
  /** While the GPU goo shows, the hidden SVG goo is left alone, and caught up the moment it shows again. */
  const gpuShownRef = useRef(false);
  const filterId = `goo-${useId().replace(/[^\w-]/g, "")}`;
  const lines = measureLines(words);

  const { status } = useGpu(canvasRef, {
    label: `Gooey Text: ${words.join(" ")}`,
    start: ({ gpu, surface, canvas }) => {
      const renderer = createGooRenderer(gpu, surface, lines);
      const repaint = () => {
        if (latestRef.current) renderer.paint(latestRef.current);
      };
      const resize = new ResizeObserver(repaint);
      resize.observe(canvas);
      rendererRef.current = renderer;
      repaint();
      return () => {
        resize.disconnect();
        rendererRef.current = null;
        renderer.destroy();
      };
    },
  });

  useEffect(() => {
    gpuShownRef.current = status === "running";
    if (!gpuShownRef.current && latestRef.current) paintSvgRef.current?.(latestRef.current);
  }, [status]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paintSvg = svgPainter(svg);
    paintSvgRef.current = paintSvg;
    return startFlow(svg, lines, state => {
      latestRef.current = state;
      rendererRef.current?.paint(state);
      if (!gpuShownRef.current) paintSvg(state);
    });
  }, [lines]);

  const spill: CSSProperties = {
    left: `${(-SPILL_X / lines.width) * 100}%`,
    top: `${(-SPILL_Y / HEIGHT) * 100}%`,
    width: `${((lines.width + SPILL_X * 2) / lines.width) * 100}%`,
    height: `${((HEIGHT + SPILL_Y * 2) / HEIGHT) * 100}%`,
  };

  return (
    <div className={styles.stage}>
      <div className={styles.line}>
        <canvas ref={canvasRef} className={styles.goo} style={spill} aria-hidden="true" />
        <svg
          ref={svgRef}
          className={styles.svg}
          viewBox={`0 0 ${lines.width} ${HEIGHT}`}
          role="img"
          aria-label={`Gooey text typing ${words.join(", ")}`}
        >
          <defs>
            <filter id={filterId} x="-5%" y="-25%" width="110%" height="150%" colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation={GOO_BLUR} result="blur" />
              <feColorMatrix in="blur" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${GOO_GAIN} -${GOO_CUT}`} />
            </filter>
          </defs>
          {lines.words.map((word, index) => (
            <defs key={index} data-inks={index}>
              {word.letters.map((_, i) => (
                <linearGradient key={i} id={`${filterId}-ink-${index}-${i}`}>
                  <stop offset="0" stopColor={`rgb(${INK.join(" ")})`} />
                  <stop offset="0" stopColor={`rgb(${BLUE.join(" ")})`} />
                </linearGradient>
              ))}
            </defs>
          ))}
          <g filter={`url(#${filterId})`} display={status === "running" ? "none" : undefined}>
            {lines.words.map((word, index) => (
              <g key={index} data-slime={index} visibility={index === 0 ? "visible" : "hidden"} className={styles.slime}>
                {word.letters.map((_, i) => (
                  <path key={i} d="" />
                ))}
                {word.letters.map((_, i) => (
                  <circle key={i} r={0} />
                ))}
              </g>
            ))}
            {lines.words.map((word, index) => (
              <g key={index} data-word={index} visibility={index === 0 ? "visible" : "hidden"} style={{ font: FONT }}>
                {word.letters.map((letter, i) => (
                  <text key={i} x={letter.left} y={BASELINE} transform="scale(0)" fill={`url(#${filterId}-ink-${index}-${i})`}>
                    {letter.char}
                  </text>
                ))}
              </g>
            ))}
            <circle data-drop="" r={DROP_SIZE} className={styles.drop} />
          </g>
        </svg>
      </div>
    </div>
  );
}
