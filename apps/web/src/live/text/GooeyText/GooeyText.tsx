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
  inkColor,
  measureLines,
  SPILL_X,
  SPILL_Y,
  type GooFrame,
  type Lines,
} from "./scene";
import { phases, poseAt } from "./timeline";
import styles from "./GooeyText.module.css";

const DEFAULT_WORDS = ["hello", "gooey", "flow"] as const;
/** A reduced-motion line shows each word this long, still. */
const STILL_MS = 3200;

/** The thinnest a neck gets before it snaps, so it still reads as one strand of slime. */
const NECK_MIN = FONT_SIZE * 0.011;

/**
 * A strand of slime from the drop at `from` to a letter at `to`, `width`
 * across at the drop: pinched in the middle the way a stretched neck thins,
 * and drawn above the goo so even its finest point stays visible.
 */
function neckPath(from: number, to: number, width: number): string {
  if (width <= 0) return "";
  const length = to - from;
  const middle = from + length / 2;
  const edge = width / 2;
  const tip = edge * 0.7;
  const pinch = Math.max(NECK_MIN, edge * 0.32);
  const y = DROP_Y;
  const top = (h: number) => (y - h).toFixed(2);
  const bottom = (h: number) => (y + h).toFixed(2);
  const x = (v: number) => v.toFixed(2);
  return [
    `M${x(from)} ${top(edge)}`,
    `C${x(from + length * 0.3)} ${top(edge)} ${x(middle - length * 0.18)} ${top(pinch)} ${x(middle)} ${top(pinch)}`,
    `C${x(middle + length * 0.18)} ${top(pinch)} ${x(to - length * 0.3)} ${top(tip)} ${x(to)} ${top(tip)}`,
    `L${x(to)} ${bottom(tip)}`,
    `C${x(to - length * 0.3)} ${bottom(tip)} ${x(middle + length * 0.18)} ${bottom(pinch)} ${x(middle)} ${bottom(pinch)}`,
    `C${x(middle - length * 0.18)} ${bottom(pinch)} ${x(from + length * 0.3)} ${bottom(edge)} ${x(from)} ${bottom(edge)}`,
    "Z",
  ].join("");
}

/** Writes an attribute only when it changed, so a settled letter costs nothing. */
function write(element: Element | undefined, name: string, value: string) {
  if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Paints a frame into the SVG goo, which shows wherever the GPU goo cannot run. */
function svgPainter(svg: SVGSVGElement): (state: GooFrame) => void {
  const groups = Array.from(svg.querySelectorAll<SVGGElement>("[data-word]"));
  const strands = Array.from(svg.querySelectorAll<SVGGElement>("[data-strands]"));
  const drop = svg.querySelector<SVGCircleElement>("[data-drop]") ?? undefined;
  return state => {
    const letters = groups[state.word]?.children;
    const threads = strands[state.word]?.children;
    state.letters.forEach((letter, i) => {
      const transform = `translate(${letter.x.toFixed(2)} ${letter.y.toFixed(2)}) scale(${letter.sx.toFixed(4)} ${letter.sy.toFixed(4)}) translate(${(-letter.center).toFixed(2)} ${-DROP_Y})`;
      write(letters?.[i], "transform", transform);
      write(letters?.[i], "fill", `rgb(${inkColor(letter.ink).join(" ")})`);
      write(threads?.[i], "x1", letter.strand.from.toFixed(2));
      write(threads?.[i], "x2", letter.strand.to.toFixed(2));
      write(threads?.[i], "stroke-width", letter.strand.width.toFixed(2));
    });
    write(drop, "transform", `translate(${state.drop.x.toFixed(2)} ${DROP_Y}) scale(${state.drop.sx.toFixed(4)} ${state.drop.sy.toFixed(4)})`);
  };
}

/**
 * Runs the drop and the letters until stopped, handing each frame to
 * `paint`. Sleeps through each hold and off screen; reduced motion shows
 * each word still.
 */
function startFlow(svg: SVGSVGElement, lines: Lines, paint: (state: GooFrame) => void): () => void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const layers = Array.from(svg.querySelectorAll<SVGGElement>("[data-word], [data-strands], [data-necks]"));
  const necks = Array.from(svg.querySelectorAll<SVGGElement>("[data-necks]"));
  const cycles = lines.words.map(word => phases(word.letters.length).total);
  let wordIndex = 0;
  let elapsed = 0;
  let previous = 0;
  let frame = 0;
  let timer = 0;
  let visible = true;
  let lastDropX: number | null = null;
  let stretch = 0;

  function show(index: number) {
    layers.forEach(layer => {
      const own = layer.dataset.word ?? layer.dataset.strands ?? layer.dataset.necks;
      write(layer, "visibility", Number(own) === index ? "visible" : "hidden");
    });
  }

  /** Poses word `index` at `ms` into its cycle; returns whether it is holding still. */
  function draw(index: number, ms: number, dt: number): boolean {
    const word = lines.words[index]!;
    const before = lines.words[(index - 1 + lines.words.length) % lines.words.length]!;
    const pose = poseAt(word, before, FONT_SIZE, ms);
    const speed = lastDropX == null || dt <= 0 ? 0 : Math.abs(pose.dropX - lastDropX) / dt;
    lastDropX = pose.dropX;
    stretch += (Math.min(0.42, speed * 0.5) - stretch) * (1 - Math.exp(-dt / 60));
    if (pose.still) stretch = 0;
    const letters = pose.letters.map((letter, i) => {
      const layout = word.letters[i]!;
      const center = layout.left + layout.width / 2;
      const facing = center + letter.dx + Math.sign(pose.dropX - center) * layout.width * 0.3 * letter.scale;
      return {
        center,
        sx: Math.max(0, letter.scale * letter.stretch),
        sy: Math.max(0, letter.scale / Math.sqrt(letter.stretch)),
        x: center + letter.dx,
        y: DROP_Y + letter.dy,
        ink: letter.ink,
        strand: { from: pose.dropX, to: facing, width: letter.strand * FONT_SIZE },
      };
    });
    paint({ word: index, letters, drop: { x: pose.dropX, sx: 1 + stretch, sy: 1 / (1 + stretch * 0.55) } });
    const pinches = necks[index]!.children;
    letters.forEach((letter, i) => write(pinches[i], "d", neckPath(letter.strand.from, letter.strand.to, letter.strand.width)));
    return pose.still;
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
    const holding = draw(wordIndex, elapsed, dt);
    if (!visible) return;
    if (holding) {
      const timing = phases(lines.words[wordIndex]!.letters.length);
      const rest = timing.glide + timing.type + timing.hold - elapsed;
      timer = window.setTimeout(() => {
        advance(rest);
        resume();
      }, rest);
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function resume() {
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function still() {
    window.clearTimeout(timer);
    show(wordIndex);
    const timing = phases(lines.words[wordIndex]!.letters.length);
    lastDropX = null;
    draw(wordIndex, timing.glide + timing.type, 0);
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
  draw(0, 0, 0);
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
 * out of it on a strand of slime that thins until it snaps, and the freed
 * letter sets black. Then the drop slides back, swallows the word, and flows
 * on to the next.
 */
export function GooeyText({ words = DEFAULT_WORDS }: GooeyTextProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GooRenderer | null>(null);
  const latestRef = useRef<GooFrame | null>(null);
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
    const svg = svgRef.current;
    if (!svg) return;
    const paintSvg = svgPainter(svg);
    return startFlow(svg, lines, state => {
      latestRef.current = state;
      paintSvg(state);
      rendererRef.current?.paint(state);
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
          <g filter={`url(#${filterId})`} display={status === "running" ? "none" : undefined}>
            {lines.words.map((word, index) => (
              <g key={index} data-strands={index} visibility={index === 0 ? "visible" : "hidden"} className={styles.strand}>
                {word.letters.map((_, i) => (
                  <line key={i} y1={DROP_Y} y2={DROP_Y} strokeWidth={0} />
                ))}
              </g>
            ))}
            {lines.words.map((word, index) => (
              <g key={index} data-word={index} visibility={index === 0 ? "visible" : "hidden"} style={{ font: FONT }}>
                {word.letters.map((letter, i) => (
                  <text key={i} x={letter.left} y={BASELINE} transform="scale(0)">
                    {letter.char}
                  </text>
                ))}
              </g>
            ))}
            <circle data-drop="" r={DROP_SIZE} className={styles.drop} />
          </g>
          {lines.words.map((word, index) => (
            <g key={index} data-necks={index} visibility={index === 0 ? "visible" : "hidden"} className={styles.neck}>
              {word.letters.map((_, i) => (
                <path key={i} d="" />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
