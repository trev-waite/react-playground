import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const SLIDERS = {"flipSpeed":55,"sweep":77,"hold":84};

/** A flip-disc sign: two lines of five characters in the 5×7 font those signs use. */
export const COLUMNS = 31;
export const ROWS = 17;
const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const LINE_TOPS = [1, 9];
const MESSAGES = ["HELLO\nTHERE", "FLIP\nDOTS"];

const PLATE = "#14161a";
const DISC_DARK = "#272a30";
const DISC_LIT = "#f4f1e8";

const GLYPHS: Record<string, readonly number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ":": [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The time over the date, as a station clock would show it: "09:41" above "13NOV". */
export function clockMessage(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}\n${pad(date.getDate())}${MONTHS[date.getMonth()]}`;
}

/** Which discs show their lit face for `message`: up to two centered lines, one byte per disc, row by row. */
export function layoutMessage(message: string): Uint8Array {
  const discs = new Uint8Array(COLUMNS * ROWS);
  const lines = message.toUpperCase().split("\n").slice(0, LINE_TOPS.length);
  const tops = lines.length === 1 ? [(ROWS - GLYPH_HEIGHT) / 2] : LINE_TOPS;
  lines.forEach((line, lineIndex) => {
    const letters = [...line].slice(0, Math.floor((COLUMNS + 1) / (GLYPH_WIDTH + 1)));
    const width = letters.length * (GLYPH_WIDTH + 1) - 1;
    const left = Math.floor((COLUMNS - width) / 2);
    letters.forEach((letter, letterIndex) => {
      const rows = GLYPHS[letter];
      if (!rows) return;
      rows.forEach((bits, row) => {
        for (let column = 0; column < GLYPH_WIDTH; column++) {
          if (!(bits & (1 << (GLYPH_WIDTH - 1 - column)))) continue;
          const x = left + letterIndex * (GLYPH_WIDTH + 1) + column;
          discs[(tops[lineIndex]! + row) * COLUMNS + x] = 1;
        }
      });
    });
  });
  return discs;
}

type Settings = { sliders: Record<string, number>; progress: number };

/** A running board: `wake` after its settings change, since it sleeps between messages. */
type Board = { wake: () => void; stop: () => void };

function hash01(value: number): number {
  const t = Math.sin(value * 127.1) * 43758.5453123;
  return t - Math.floor(t);
}

/**
 * Drives the board. Each disc remembers the face it shows and when it last
 * flipped; a new message hands every changed disc a due time, column by
 * column, the way the sign's driver walks across the coils. A pointer acts as
 * a magnet: discs under it turn over, then fall back.
 */
function startBoard(canvas: HTMLCanvasElement, settings: RefObject<Settings>): Board {
  const context = canvas.getContext("2d");
  if (!context) return { wake() {}, stop() {} };
  const ctx = context;
  const count = COLUMNS * ROWS;
  const blank = new Uint8Array(count);
  const shown = new Uint8Array(count);
  const flippedAt = new Float64Array(count).fill(-Infinity);
  const dueAt = new Float64Array(count);
  const heldUntil = new Float64Array(count);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let target: Uint8Array = blank;
  let messageIndex = -1;
  let nextMessageAt = 0;
  let wasOn = false;
  let visible = true;
  let frame = 0;
  let timer = 0;
  let pitch = 1;
  let dpr = 1;

  const slider = (name: keyof typeof SLIDERS) => (settings.current.sliders[name] ?? SLIDERS[name]) / 100;
  const flipMs = () => (reducedMotion.matches ? 0 : 420 - slider("flipSpeed") * 320);
  const sweepMs = () => (reducedMotion.matches ? 0 : slider("sweep") * 60);
  const holdMs = () => 1800 + slider("hold") * 5000;

  function show(next: Uint8Array, now: number) {
    target = next;
    const step = sweepMs();
    for (let i = 0; i < count; i++) dueAt[i] = now + (i % COLUMNS) * step + hash01(i) * step * 3;
  }

  function advance(now: number) {
    const messages = [MESSAGES[0]!, clockMessage(new Date()), ...MESSAGES.slice(1)];
    messageIndex = (messageIndex + 1) % messages.length;
    show(layoutMessage(messages[messageIndex]!), now);
    nextMessageAt = now + holdMs();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    pitch = canvas.clientWidth / COLUMNS;
  }

  function draw(now: number): boolean {
    const duration = flipMs();
    const radius = pitch * 0.42;
    let busy = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    for (const lit of [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const turn = duration > 0 ? Math.min(1, (now - flippedAt[i]!) / duration) : 1;
        const eased = turn * turn * (3 - 2 * turn);
        const face = eased < 0.5 ? 1 - shown[i]! : shown[i]!;
        if (face !== lit) continue;
        if (turn < 1) busy = true;
        const x = ((i % COLUMNS) + 0.5) * pitch;
        const y = (Math.floor(i / COLUMNS) + 0.5) * pitch;
        const edgeOn = Math.max(0.08, Math.abs(Math.cos(eased * Math.PI)));
        ctx.moveTo(x + radius, y);
        ctx.ellipse(x, y, radius, radius * edgeOn, -Math.PI / 4, 0, Math.PI * 2);
      }
      ctx.fillStyle = lit ? DISC_LIT : DISC_DARK;
      ctx.fill();
    }
    return busy;
  }

  function tick(now: number) {
    frame = 0;
    const on = settings.current.progress >= 0.5;
    if (on !== wasOn) {
      wasOn = on;
      messageIndex = -1;
      if (on) advance(now);
      else show(blank, now);
    } else if (on && !reducedMotion.matches && now >= nextMessageAt) {
      advance(now);
    }

    let pending = false;
    for (let i = 0; i < count; i++) {
      const held = now < heldUntil[i]!;
      const want = target[i]! ^ (held ? 1 : 0);
      if (held) pending = true;
      if (want === shown[i]) continue;
      if (now < dueAt[i]!) {
        pending = true;
        continue;
      }
      shown[i] = want;
      flippedAt[i] = now;
    }

    const busy = draw(now);
    if (!visible) return;
    if (busy || pending) frame = requestAnimationFrame(tick);
    else if (on && !reducedMotion.matches) timer = window.setTimeout(wake, Math.max(0, nextMessageAt - now));
  }

  function wake() {
    window.clearTimeout(timer);
    if (!frame && visible) frame = requestAnimationFrame(tick);
  }

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1) return;
    const scale = canvas.clientWidth / rect.width;
    const x = ((event.clientX - rect.left) * scale) / pitch;
    const y = ((event.clientY - rect.top) * scale) / pitch;
    const now = performance.now();
    for (let row = Math.max(0, Math.floor(y - 1.5)); row <= Math.min(ROWS - 1, Math.ceil(y + 0.5)); row++) {
      for (let column = Math.max(0, Math.floor(x - 1.5)); column <= Math.min(COLUMNS - 1, Math.ceil(x + 0.5)); column++) {
        if (Math.hypot(column + 0.5 - x, row + 0.5 - y) > 1.6) continue;
        const i = row * COLUMNS + column;
        heldUntil[i] = now + 650;
        dueAt[i] = now;
      }
    }
    wake();
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    wake();
  });
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) wake();
    else window.clearTimeout(timer);
  });
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerMove);
  reducedMotion.addEventListener("change", wake);
  resize();
  wake();

  return {
    wake,
    stop() {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerMove);
      reducedMotion.removeEventListener("change", wake);
    },
  };
}

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ sliders, progress });
  const board = useRef<Board | null>(null);
  useLayoutEffect(() => {
    settings.current = { sliders, progress };
    board.current?.wake();
  }, [sliders, progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const started = startBoard(canvas, settings);
    board.current = started;
    return () => {
      board.current = null;
      started.stop();
    };
  }, []);

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        minHeight: 200,
        containerType: "size",
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          width: `min(100cqw, (100cqh - 24px) * ${COLUMNS} / ${ROWS} + 24px, 640px)`,
          padding: 12,
          borderRadius: 16,
          background: PLATE,
        }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Flip-dot sign cycling through Hello There, the time, and Flip Dots"
          style={{
            display: "block",
            width: "100%",
            aspectRatio: `${COLUMNS} / ${ROWS}`,
            touchAction: "pan-y",
          }}
        />
      </div>
    </div>
  );
}
