import { useEffect, useId, useRef } from "react";
import { DROP_RADIUS, PARK_GAP, layoutWord, phases, poseAt, type WordLayout } from "./timeline";
import styles from "./GooeyText.module.css";

const DEFAULT_WORDS = ["hello", "gooey", "flow"] as const;
/** Layout units: the font is set at this size and the SVG scales to fit. */
const FONT_SIZE = 100;
const FONT = `720 ${FONT_SIZE}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const BASELINE = FONT_SIZE * 0.95;
/** The drop rides at the middle of the lowercase letters. */
const DROP_Y = BASELINE - FONT_SIZE * 0.27;
const HEIGHT = FONT_SIZE * 1.3;
/** Room between letters, so the goo joins a letter to the drop but not to its neighbors. */
const TRACKING = FONT_SIZE * 0.035;
/** A reduced-motion line shows each word this long, still. */
const STILL_MS = 3200;

type Lines = { words: WordLayout[]; width: number };

function measureLines(words: readonly string[]): Lines {
  const context = document.createElement("canvas").getContext("2d");
  const measure = (text: string) => {
    if (!context) return text.length * FONT_SIZE * 0.6;
    context.font = FONT;
    return context.measureText(text).width;
  };
  const tracked = (text: string) => measure(text) + [...text].length * TRACKING;
  const widest = Math.max(...words.map(tracked));
  const width = widest + FONT_SIZE * (DROP_RADIUS * 2 + PARK_GAP + 0.25) * 2;
  return { words: words.map(word => layoutWord(word, tracked, width)), width };
}

const BLUE = [36, 72, 216] as const;
const INK = [17, 19, 24] as const;

/** The letter's color `ink` of the way from drop blue to black. */
function inkColor(ink: number): string {
  const mix = (i: 0 | 1 | 2) => Math.round(BLUE[i] + (INK[i] - BLUE[i]) * ink);
  return `rgb(${mix(0)} ${mix(1)} ${mix(2)})`;
}

function letterTransform(center: number, scale: number, stretch: number, dx: number, dy: number): string {
  const sx = Math.max(0, scale * stretch);
  const sy = Math.max(0, scale / Math.sqrt(stretch));
  return `translate(${(center + dx).toFixed(2)} ${(DROP_Y + dy).toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${(-center).toFixed(2)} ${-DROP_Y})`;
}

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

/** Runs the drop and the letters until stopped. Sleeps through each hold and off screen; reduced motion shows each word still. */
function startFlow(svg: SVGSVGElement, lines: Lines): () => void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const groups = Array.from(svg.querySelectorAll<SVGGElement>("[data-word]"));
  const strands = Array.from(svg.querySelectorAll<SVGGElement>("[data-strands]"));
  const necks = Array.from(svg.querySelectorAll<SVGGElement>("[data-necks]"));
  const drop = svg.querySelector<SVGCircleElement>("[data-drop]") ?? undefined;
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
    groups.forEach((group, i) => write(group, "visibility", i === index ? "visible" : "hidden"));
    strands.forEach((group, i) => write(group, "visibility", i === index ? "visible" : "hidden"));
    necks.forEach((group, i) => write(group, "visibility", i === index ? "visible" : "hidden"));
  }

  /** Poses word `index` at `ms` into its cycle; returns whether it is holding still. */
  function draw(index: number, ms: number, dt: number): boolean {
    const word = lines.words[index]!;
    const before = lines.words[(index - 1 + lines.words.length) % lines.words.length]!;
    const pose = poseAt(word, before, FONT_SIZE, ms);
    const letters = groups[index]!.children;
    const threads = strands[index]!.children;
    const pinches = necks[index]!.children;
    pose.letters.forEach((letter, i) => {
      const layout = word.letters[i]!;
      const center = layout.left + layout.width / 2;
      write(letters[i], "transform", letterTransform(center, letter.scale, letter.stretch, letter.dx, letter.dy));
      write(letters[i], "fill", inkColor(letter.ink));
      const facing = center + letter.dx + Math.sign(pose.dropX - center) * layout.width * 0.3 * letter.scale;
      const thread = threads[i];
      write(thread, "x1", pose.dropX.toFixed(2));
      write(thread, "x2", facing.toFixed(2));
      write(thread, "stroke-width", (letter.strand * FONT_SIZE).toFixed(2));
      write(pinches[i], "d", neckPath(pose.dropX, facing, letter.strand * FONT_SIZE));
    });
    const speed = lastDropX == null || dt <= 0 ? 0 : Math.abs(pose.dropX - lastDropX) / dt;
    lastDropX = pose.dropX;
    stretch += (Math.min(0.42, speed * 0.5) - stretch) * (1 - Math.exp(-dt / 60));
    if (pose.still) stretch = 0;
    const scaleX = 1 + stretch;
    const scaleY = 1 / (1 + stretch * 0.55);
    write(drop, "transform", `translate(${pose.dropX.toFixed(2)} ${DROP_Y}) scale(${scaleX.toFixed(4)} ${scaleY.toFixed(4)})`);
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
  const filterId = `goo-${useId().replace(/[^\w-]/g, "")}`;
  const lines = measureLines(words);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return startFlow(svg, lines);
  }, [lines]);

  const blur = FONT_SIZE * 0.045;

  return (
    <div className={styles.stage}>
      <svg
        ref={svgRef}
        className={styles.line}
        viewBox={`0 0 ${lines.width} ${HEIGHT}`}
        role="img"
        aria-label={`Gooey text typing ${words.join(", ")}`}
      >
        <defs>
          <filter id={filterId} x="-5%" y="-25%" width="110%" height="150%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
            <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 40 -18" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>
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
          <circle data-drop="" r={FONT_SIZE * DROP_RADIUS} className={styles.drop} />
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
  );
}
