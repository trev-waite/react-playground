import { useEffect, useMemo, useRef, useState } from "react";

const SLIDERS = {"wind":55,"leaves":60,"frameRate":12};

type Point = { x: number; y: number };
type Layer = "canopy" | "trunk" | "ground" | "river" | "grass" | "ripple";
type Stroke = {
  layer: Layer;
  color: string;
  width: number;
  subpaths: Point[][];
};

// Every motion below is periodic over FRAME_COUNT, so the frame after the last is the first.
const FRAME_COUNT = 72;
const TAU = Math.PI * 2;
const VIEW_BOX = "0 0 1024 952";
const TRUNK_BASE = { x: 430, y: 588 };
const TREE_HEIGHT = 498;
const GUST_TRAVEL = 4000;
const MAX_LEAVES = 30;
const STREAK_DASH = 0.3;

const INK = "#566B25";
const WATER = "#8A9660";
const DEEP_WATER = "#6C7D3A";
const LEAF_INK = "#3F4F1A";
const PAPER =
  "radial-gradient(ellipse at 50% 38%, #FBF7EA 0%, #F4EDD9 58%, #E8DEC2 100%)";

const SCENE: { layer: Layer; width: number; color?: string; d: string }[] = [
  { layer: "canopy", width: 3.3, d: "m284 174c-9-1-15-8-14-14 0-6 5-11 12-10-8-5-6-12 1-16-6-3-4-11 3-15 5-4 11-4 17-2-4-8 3-15 10-16 5-1 9 0 12 3 5-7 12-8 17-4 5 3 6 7 5 11 8-4 17-1 18 7 0-8 2-15 10-18l8-3c-10-1-14-11-10-17 4-7 12-10 20-7 0-3 3-3 6-2-3-9 7-17 15-13 6-11 16-11 23-1 7-6 15-2 15 7 4-5 8-3 11 0 5-11 21-9 22 5 8-4 16 2 14 10 4-4 7-3 10-1 11-10 21 1 15 11 7 1 5 9 2 13 4-4 8-6 12-1 7-7 17-2 17 6 2 4-1 8-4 10 5 2 6 6 0 8 9 2 12 8 8 15-2 4-6 5-9 5 4 6 2 11-3 13 5 3 7 6 7 7" },
  { layer: "canopy", width: 3.3, d: "m371 124c-5-3-9-4-13-2m-29 40c-10-2-16 4-16 11-7 0-8 8-2 14-5 0-8-3-8-6-3-7-9-7-13-3-4-9-16-8-20 0-2 3-2 6-1 9-5-9-12-10-19-6-3 2-4 2-5 0-5-7-20-4-19 5-8-1-12 7-8 14-8-5-19-1-21 7-1 5 0 9 6 12-8 0-10 6-4 12l-5 2c-7-8-17 0-18 7-1 4 2 7 5 8-7 0-11 8-7 14s9 6 15 4c-2 9 11 10 16 2-1 6 10 9 6 0m1 6c-7-1-5 4-5 6m16-1c-11-5-23-3-27 3-1 2-2 5-2 9-7-6-18-2-22 5-3 4-3 9 2 13-6 1-7 8-3 12-4-1-5-1-7 2-4-8-14-4-17 3-6-3-13 5-13 11 0 4 2 6 5 8-8 2-7 11 1 15-8 2-13 12-9 19 3 6 8 7 14 5-1 10 11 16 20 7l4-3c5 6 12 0 13-4h5" },
  { layer: "canopy", width: 3.3, d: "m182 386c-5 3-6 7-2 10-9 2-11 12-3 17-7 6-4 15 3 18 5 1 10-1 13-4 5 12 19 6 19-3 4 6 12 2 13-1 5 4 14 1 15-5-5 6-2 15 4 17-4 6 1 14 8 14 6 1 11-2 13-6 4 10 19 6 16-8 8 5 13 1 13-3 6 9 16-1 12-8l-3-2c6-1 7-9 3-14 6 4 15 4 19-2 5 3 12 1 14-2 6-2 11 1 14 4" },
  { layer: "canopy", width: 3.3, d: "m223 369c7 5 17-1 17-8l-4-4c6 7 17 7 21-1 1 5 7 5 12 1-8 6-3 10 2 10-7 9 5 16 12 11 3 9 17 7 21-1 5 3 14-2 10-10 6 3 18-2 12-13 11-3 7-15-2-17" },
  { layer: "canopy", width: 3.3, d: "m271 270c6 6 17 3 16-4l-4-4c6 9 18 11 24 2l-1-4c8 6 19 1 17-8l-3-5c7 1 10-7 4-12 7 6 19 3 24-4l2-5c-2 8 12 11 20 3-4 5-12 4-11 12-8 1-11 10-5 14-6 8-2 15 6 16 3 1 7 0 10-2 3 7 12 7 17 0 5 1 10-4 8-9 3 8 17 11 23 3 4 1 9-2 9-5l7-2c-5 7 0 11 6 9 0 8 13 7 18 2 6 7 19 2 15-8 4 3 7-1 8-4 8 6 20-1 15-9 5 1 8-4 4-8" },
  { layer: "canopy", width: 3.3, d: "m435 200c5-6 13-6 19-1-5-5-2-13 5-16-7-11 7-21 19-13h6c-5-8 5-15 13-12 0-11 16-12 22-2 8-6 19-1 17 8 4-4 8 0 6 4 8-6 18-9 25-2-6-2-8-8-4-14 5-7 15-9 20-2 5-6 17-1 19 6 1 3 1 7-2 10 6 0 9 5 4 11 5-3 9-2 11 1 6-10 17-1 11 8 12-1 18 11 9 18 9 6 3 17-6 16 8 1 15 8 13 15-1 7-8 11-14 9 7 6 3 13-6 14-4-2-9 1-12 6 5-8 0-13-5-10 7-7 0-16-8-16l-10 2c5-8-5-15-12-11" },
  { layer: "canopy", width: 3.3, d: "m612 262c5-3 9-2 12-5 8-5 21 3 19 12 4 0 7 5 3 8 4-5 8-3 11-1 4-11 24-6 22 5l-1 6c9-4 18 2 18 10 1 5-2 9-5 11 6 0 10 6 6 11 9 0 14 9 10 15-2 4-5 5-10 4 8 5 3 17-4 18-5 1-8-2-10-4-2 8-15 6-16-2-3 2-6 0-7-3 8 7 3 12-1 13 9 9-3 22-11 15-3 5-12 4-16-1 5 6 2 12-4 14 10 8-2 17-10 12-5 6-14 4-18 0-1 10-14 14-17 2-12 6-23-4-14-12-7-4-5-13 1-17-15 4-22 0-32-2-11-4-21-2-30 3" },
  { layer: "canopy", width: 3.3, d: "m459 333c4 9 17 9 19-2 6 7 18-1 12-9 3 1 8-4 0-9 5 6 15 9 21 3 7 5 15 1 15-7 1 12 13 16 19 9 5 4 9 0 12-4-7 8-5 13 4 13-9 7-2 15 7 12 2-1 4-1 6-3 2 11 16 9 18-1 8 8 21-2 13-10 6 4 12-1 7-8 3 14 16 16 21 9 4 8 15 3 13-6" },
  { layer: "canopy", width: 3.3, d: "m628 402c6 3 11 10 6 18 4-4 10-3 12 1 5-5 13-1 15 6l-1 6c10 0 13 13 4 17l-4 2c7 6 0 16-8 15-5 1-9-1-12-4-2 10-12 11-17 6-4 4-8-2-11-5 5 5 1 10-4 10 2 14-9 17-17 10-7 5-16 1-18-6-2 6-7 6-11 3 0 10-11 14-17 6-11 10-25 2-19-10-7 3-12-6-6-10 3 2 5 1 7 0-8 0-9-6-2-8-4 3-7 1-9-2-6 9-20-1-15-9l2-5c-4 5-7 4-8 1 4 10-11 11-15 4-2 11-13 14-19 7-6 7-17 4-19-4" },
  { layer: "canopy", width: 2, d: "m491 101c7-4 14 1 13 9" },
  { layer: "trunk", width: 3.2, d: "m309 267c7 8 11 21 22 26s19 6 27 14c12 12 7 24 25 36 14 10 21 23 19 38s-12 28-13 43c-1 14 6 21 4 34-2 21-13 38-25 56-11 16-10 31-21 42-13 12-33 19-53 19" },
  { layer: "trunk", width: 3.2, d: "m304 270c10 9 12 21 23 27 14 7 24 5 31 19 6 12 10 23 22 33 13 11 19 22 18 36-1 12-7 22-8 33-18 2-24-9-32-20-8-10-18-13-28-16-9-3-15-6-22-5" },
  { layer: "trunk", width: 3.2, d: "m359 272c-2 11-2 23-1 35m7-35c-3 18-3 35 7 52 8 13 20 15 30 22" },
  { layer: "trunk", width: 3.2, d: "m400 269c5 12 12 20 12 36 1 17-5 25-9 38-2 6 3 10 6 15m-1-88c5 10 8 19 9 30 1 4 0 8-1 12 8-11 19-14 27-21 7-6 12-16 15-22m-38 0c-4 9-4 18-3 30m48-27c-4 10-11 23-22 30-15 10-20 17-25 35-4 14 5 25 5 42-1 15 0 26 7 35" },
  { layer: "trunk", width: 3.2, d: "m323 365 10 19m-4 5c12 2 18 8 24 15 7 12 12 20 23 26 9 6 12 13 12 22m1-27c-16-3-22-9-27-18m-9 2c5 14 12 21 20 31 14 17 9 42 3 58" },
  { layer: "trunk", width: 3.2, d: "m492 368c7-11 4-26 13-38l11-12m-18 2c1 19-7 39-16 53-8 12-12 22-25 29-11 6-21 7-29 16-7 7-12 17-15 28m87-123 5-2m-84 69c-2 12-9 20-5 31" },
  { layer: "trunk", width: 3.2, d: "m444 436c11-13 26-19 34-36 8-19 20-27 39-31 23-4 35-17 57-27m-13-6c-13 8-24 19-35 24-12 5-23 3-33 8-15 6-19 23-29 32-9 8-19 10-28 18" },
  { layer: "trunk", width: 3.2, d: "m443 438c-11 19-8 40-14 59s-10 37-3 53c6 17 20 25 39 27" },
  { layer: "trunk", width: 3.2, d: "m429 499c-6 15-18 37-14 53 3 14 16 26 32 30l22 6m-48-21c5 13 20 27 35 35m-18-1c-9-10-21-9-29-14-12-6-19-23-16-39-2 17-12 25-24 30-11 4-19 11-31 14m50-20c1 5 7 8 13 12-12-7-22-8-32-4m38-106c-2 19-14 32-25 46-12 16-12 33-25 48-11 14-26 14-41 21l-18 7" },
  { layer: "trunk", width: 3.2, d: "m370 526c-9 15-12 29-26 38-14 8-31 11-46 11m54-10c-8 9-22 13-33 17m57-85c-10 14-16 23-20 41" },
  { layer: "ground", width: 3, d: "m48 651c36-9 70-24 109-40 38-16 68-22 100-28 15-3 26-7 41-8" },
  { layer: "ground", width: 3, d: "m459 578c14 2 23 10 37 14 33 7 68 15 100 28 30 10 59 27 92 40 36 14 66 24 100 37 11 4 29 12 12 19" },
  { layer: "ground", width: 2.5, d: "m618 628c36 5 110-21 163-34 45-12 78-14 111-10 31 4 57 12 84 16" },
  { layer: "ground", width: 2.5, d: "m112 681c48-14 102-17 150-12 40 4 78 13 115 26 38 13 78 31 119 42" },
  { layer: "ground", width: 3, d: "m687 660c55 3 121 6 171 16 25 5 41 11 44 17" },
  { layer: "ground", width: 2.5, d: "m858 697c21-3 35-3 49-3m27-2c12-6 26-4 42 0" },
  { layer: "river", width: 3.6, d: "m792 712c13 5 25 11 9 18-24 11-69 14-106 19-40 5-83 9-103 25 9 4 19 9 9 13-21 8-59 10-89 20-19 6-29 12-33 19s-5 16 0 24" },
  { layer: "river", width: 3.6, d: "m858 697c20 4 45 11 57 20 23 17-14 27-40 34-29 7-56 10-79 17-16 5-21 12-23 18m-8 3c-15 6-31 10-31 22 0 14 31 23 57 31 36 10 84 19 107 30" },
  { layer: "river", width: 2.7, d: "m435 838c13-1 27 8 36 12m18 6c19 10 54 18 84 25 31 7 60 14 82 23" },
  { layer: "grass", width: 2.1, d: "m261 583c-6-6-11-7-17-7 8-2 17 4 21 6-2-6-5-13-10-16 9 2 13 9 15 15 0-8 0-16 3-21-1 9 1 16 2 20 3-12 8-19 17-23-9 9-12 15-12 21 6-7 11-11 17-11-7 3-11 7-12 10" },
  { layer: "grass", width: 2.1, d: "m471 580c1-6 5-11 10-14-5 6-6 12-5 17 4-6 9-9 15-10-5 3-8 7-9 13 5-4 10-5 15-4" },
  { layer: "grass", width: 2.1, d: "m177 670c-5-7-9-10-14-10 11 0 16 5 19 10-2-9-1-14 3-19-2 7 0 15 2 19 2-9 7-17 14-21-7 8-8 15-8 21 6-8 11-11 17-13" },
  { layer: "grass", width: 2.1, d: "m750 663c-3-4-7-7-10-7 7 0 12 4 14 8 0-6 1-9 3-11l1 11c2-7 6-10 10-13-4 5-6 8-6 13 4-4 7-5 11-5" },
  { layer: "grass", width: 1.8, d: "m622 670c11-1 18 3 26 8-2-6-4-10-7-13 8 3 9 8 11 14 2-5 4-7 8-9l-3 10 12-4m-6 5c8 0 16 3 22 7" },
  { layer: "grass", width: 2.1, d: "m909 694c-4-8-9-12-13-14 8 2 14 7 17 14-1-8-2-16-6-20 7 6 9 12 10 19 0-12 3-19 10-26-5 9-6 18-6 26 5-11 13-19 24-23-10 6-16 14-19 22 6-7 14-12 20-13" },
  { layer: "grass", width: 2.1, d: "m751 740c-2-5-5-8-8-9 6 1 10 4 13 8-1-8-4-14-8-17 7 3 10 9 12 16-1-7 0-13 3-17-1 6 0 13 2 17 2-10 6-16 12-20-5 7-6 14-7 18 4-5 8-9 13-10" },
  { layer: "grass", width: 2.1, d: "m540 757c11 0 21 5 26 9-5-10-11-17-17-21 11 4 16 12 21 22-2-10-2-17 1-22-1 10 2 18 3 24 4-22 12-34 23-39-12 12-17 25-18 41 8-15 18-22 29-24-13 7-20 15-23 26 5-5 13-9 20-10" },
  { layer: "grass", width: 2.1, d: "m765 789c0-5-2-8-4-10 5 1 7 4 7 8 0-7 3-13 7-17m5 15c4-3 8-4 12-4" },
  { layer: "grass", width: 2.1, d: "m460 844c-4-8-8-14-12-18 9 5 12 11 17 22-3-13-4-23 1-31-2 12 1 21 4 31 0-23 11-46 30-52-15 11-23 26-24 42m6 14c2-8 7-14 14-18-6 7-9 14-9 20 5-10 14-16 23-17-9 5-13 10-17 19 4-3 8-6 13-6m-5 9c4-5 11-9 18-9" },
  { layer: "grass", width: 2.1, d: "m785 840c-2-9-5-16-10-21 11 5 15 13 17 23-3-11-3-20 1-25-2 10 2 20 5 27 1-17 11-30 24-35-11 11-17 22-18 36 7-9 13-13 19-16-6 6-10 12-12 18 9-11 17-15 26-16-9 4-15 10-19 18" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m747 676c15 0 29 0 43 2" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m795 684 38 1" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m829 708c11 2 21 1 31 3" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m848 724h33" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m816 739c13-2 26 0 39-3" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m749 755c14-1 28 0 42-1" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m687 774c17-5 37 0 54-4" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m627 788c17-1 32 3 49 0" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m643 804c17-2 36 0 54 2" },
  { layer: "ripple", width: 1.5, color: WATER, d: "m586 824c-17 6-10 11 7 15 19 4 37 3 53 3" },
  { layer: "ripple", width: 1.8, color: DEEP_WATER, d: "m657 859c19 0 33-1 49 5 15 5 33 6 50 6" },
  { layer: "ripple", width: 1.8, color: DEEP_WATER, d: "m704 879c12 8 35 9 56 10 15 0 28 2 38 5" },
];

const STREAKS = [
  { d: "M612 138C690 104 764 150 846 122S958 92 986 132C996 150 976 166 962 152C952 142 962 130 974 138", start: 0.3, span: 0.42 },
  { d: "M720 300C784 280 846 322 906 298S984 282 1010 304", start: 0.42, span: 0.36 },
  { d: "M18 508C66 490 118 514 166 496S222 480 240 492", start: 0.2, span: 0.34 },
  { d: "M600 560C660 540 730 572 800 548S910 528 960 552", start: 0.86, span: 0.34 },
];

const LEAF_SHAPE = "M-7 0C-4-4 3-4.5 7 0C3 4.5-4 4-7 0Z";
const LEAF_RIB = "M-9.5 1L-7 0L6 0";
const LEAF_COLORS: readonly (readonly [string, string])[] = [
  ["#7C8F3A", "#A9B56A"],
  ["#94A34E", "#C2C98A"],
  ["#5E7228", "#8C9A5A"],
  ["#B5B35C", "#D6D39A"],
  ["#C99A3A", "#E0C27E"],
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const fract = (value: number) => value - Math.floor(value);
const round = (value: number) => Math.round(value * 10) / 10;
const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash(seed: number) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Absolute cubic points per subpath: start, then (control, control, end) triples. */
function parsePath(d: string): Point[][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  let command = "";
  let index = 0;
  let pen: Point = { x: 0, y: 0 };
  let start = pen;
  let lastControl: Point | null = null;

  const read = () => Number(tokens[index++]);
  const lineTo = (to: Point) => {
    current.push(lerp(pen, to, 1 / 3), lerp(pen, to, 2 / 3), to);
    pen = to;
    lastControl = null;
  };

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      index++;
    }
    const relative = command === command.toLowerCase();
    const at = (x: number, y: number): Point =>
      relative ? { x: pen.x + x, y: pen.y + y } : { x, y };

    switch (command.toLowerCase()) {
      case "m": {
        if (current.length > 1) subpaths.push(current);
        pen = at(read(), read());
        start = pen;
        current = [pen];
        lastControl = null;
        command = relative ? "l" : "L";
        break;
      }
      case "l":
        lineTo(at(read(), read()));
        break;
      case "h": {
        const x = read();
        lineTo({ x: relative ? pen.x + x : x, y: pen.y });
        break;
      }
      case "v": {
        const y = read();
        lineTo({ x: pen.x, y: relative ? pen.y + y : y });
        break;
      }
      case "c": {
        const c1 = at(read(), read());
        const c2 = at(read(), read());
        const to = at(read(), read());
        current.push(c1, c2, to);
        pen = to;
        lastControl = c2;
        break;
      }
      case "s": {
        const c1: Point = lastControl
          ? { x: 2 * pen.x - lastControl.x, y: 2 * pen.y - lastControl.y }
          : pen;
        const c2 = at(read(), read());
        const to = at(read(), read());
        current.push(c1, c2, to);
        pen = to;
        lastControl = c2;
        break;
      }
      case "z":
        lineTo(start);
        break;
      default:
        throw new Error(`Unsupported path command "${command}"`);
    }
  }
  if (current.length > 1) subpaths.push(current);
  return subpaths;
}

function pathData(subpaths: Point[][]): string {
  return subpaths
    .map(([first, ...rest]) =>
      first
        ? `M${round(first.x)} ${round(first.y)}C${rest.map(p => `${round(p.x)} ${round(p.y)}`).join(" ")}`
        : "",
    )
    .join("");
}

const STROKES: Stroke[] = SCENE.map(({ layer, width, color = INK, d }) => ({
  layer,
  width,
  color,
  subpaths: parsePath(d),
}));

const CANOPY_ANCHORS = STROKES.filter(stroke => stroke.layer === "canopy").flatMap(
  stroke => stroke.subpaths.flatMap(points => points.filter((_, i) => i % 3 === 0)),
);

const LEAVES = Array.from({ length: MAX_LEAVES }, (_, i) => {
  const r = (k: number) => hash(i * 13 + k);
  return {
    spawn: CANOPY_ANCHORS[Math.floor(r(1) * CANOPY_ANCHORS.length)] ?? TRUNK_BASE,
    cycles: r(2) < 0.6 ? 1 : 2,
    offset: r(3),
    drift: 420 + 280 * r(4),
    fall: 240 + 240 * r(5),
    swings: 2 + Math.floor(r(6) * 3),
    sway: 18 + 26 * r(7),
    spin: (r(8) - 0.5) * 1.6,
    flips: 1 + Math.floor(r(9) * 3),
    size: 1.1 + 0.8 * r(10),
    colors: LEAF_COLORS[Math.floor(r(11) * LEAF_COLORS.length)] ?? ["#7C8F3A", "#A9B56A"],
    seed: r(12),
  };
});

type Leaf = (typeof LEAVES)[number];

const CANOPY_LEAVES = Array.from({ length: 48 }, (_, i) => {
  const r = (k: number) => hash(i * 17 + k + 400);
  return {
    anchor: CANOPY_ANCHORS[Math.floor(r(1) * CANOPY_ANCHORS.length)] ?? TRUNK_BASE,
    rotation: r(2) * 360,
    size: 0.55 + r(3) * 0.45,
    color: LEAF_COLORS[Math.floor(r(4) * LEAF_COLORS.length)]?.[0] ?? "#7C8F3A",
    seed: r(5),
  };
});

/** One gust per loop, peaking mid-loop so the seam sits in the calm. */
function gust(phase: number) {
  return ((1 - Math.cos(TAU * phase)) / 2) ** 3;
}

/** Antiderivative of `gust`, so drifting leaves keep the distance a gust pushed them. */
function gustIntegral(phase: number) {
  const a = TAU * phase;
  return (
    (2.5 * phase -
      (3.75 * Math.sin(a)) / TAU +
      (1.5 * Math.sin(2 * a)) / (2 * TAU) -
      (0.25 * Math.sin(3 * a)) / (3 * TAU)) /
    8
  );
}

function breeze(phase: number, x: number) {
  const q = phase - x / GUST_TRAVEL;
  return (
    0.45 +
    0.35 * Math.sin(TAU * 2 * q) +
    0.18 * Math.sin(TAU * 5 * q + 1.3) +
    1.25 * gust(q)
  );
}

function treeOffset(p: Point, phase: number, wind: number): Point {
  const h = clamp((TRUNK_BASE.y - p.y) / TREE_HEIGHT, 0, 1);
  const dx = wind * 11 * breeze(phase, p.x) * h ** 1.35;
  const rustle =
    wind *
    h *
    (0.55 + 1.1 * gust(phase - p.x / GUST_TRAVEL)) *
    Math.sin(TAU * 8 * phase + p.x * 0.05 + p.y * 0.035);
  return { x: dx + rustle, y: Math.abs(dx) * 0.14 * h + rustle * 0.7 };
}

function leafAt(leaf: Leaf, phase: number, wind: number) {
  const t = fract(phase * leaf.cycles + leaf.offset);
  const free = smoothstep(0, 0.3, t);
  const held = treeOffset(leaf.spawn, phase, wind);
  const lag = leaf.spawn.x / GUST_TRAVEL;
  const pushed =
    wind * 520 * (gustIntegral(phase - lag) - gustIntegral(phase - lag - t / leaf.cycles));
  const swing = TAU * leaf.swings * t;
  const x =
    leaf.spawn.x +
    held.x * (1 - free) +
    t * leaf.drift * (0.3 + 1.1 * wind) +
    (leaf.sway * Math.sin(swing) + pushed) * free;
  const y =
    leaf.spawn.y +
    held.y * (1 - free) +
    t * leaf.fall -
    7 * (1 - Math.cos(2 * swing)) * free;
  const rotation = leaf.seed * 360 + leaf.spin * t * 360 + 38 * Math.cos(swing) * free;
  const tumble = Math.cos(TAU * leaf.flips * t + leaf.seed * TAU);
  const size = leaf.size * (0.55 + 0.45 * smoothstep(0, 0.1, t));
  const flip = (tumble < 0 ? -1 : 1) * Math.max(0.16, Math.abs(tumble));
  return {
    transform: `translate(${round(x)} ${round(y)}) rotate(${round(rotation)}) scale(${size.toFixed(2)} ${(size * flip).toFixed(2)})`,
    fill: tumble < 0 ? leaf.colors[1] : leaf.colors[0],
    opacity: smoothstep(0, 0.06, t) * (1 - smoothstep(0.86, 1, t)),
  };
}

function drawFrame(frame: number, wind: number) {
  const index = ((frame % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
  const phase = index / FRAME_COUNT;

  const strokes = STROKES.map(stroke => {
    const move = (p: Point): Point => {
      if (stroke.layer !== "canopy" && stroke.layer !== "trunk") return p;
      const offset = treeOffset(p, phase, wind);
      const branch = stroke.layer === "trunk" ? smoothstep(465, 315, p.y) : 1;
      return { x: p.x + offset.x * branch, y: p.y + offset.y * branch };
    };
    return {
      d: pathData(stroke.subpaths.map(points => points.map(move))),
      color: stroke.color,
      width: stroke.width,
    };
  });

  const streaks = STREAKS.map(streak => {
    const local = fract(phase - streak.start) / streak.span;
    const visible = local < 1;
    return {
      d: streak.d,
      offset: visible ? STREAK_DASH - local * (1 + STREAK_DASH) : STREAK_DASH,
      opacity: visible ? Math.min(1, wind * 1.6) * Math.sin(Math.PI * local) ** 0.6 : 0,
    };
  });

  return {
    index,
    phase,
    strokes,
    streaks,
  };
}

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: {
  sliders?: Record<string, number>;
  progress?: number;
} = {}) {
  const wind = clamp((sliders.wind ?? SLIDERS.wind) / 100, 0, 1);
  const leafCount = Math.round(clamp((sliders.leaves ?? SLIDERS.leaves) / 100, 0, 1) * MAX_LEAVES);
  const fps = clamp(sliders.frameRate ?? SLIDERS.frameRate, 1, 60);
  const [frame, setFrame] = useState(0);
  const playback = useRef({ fps, rate: 1 });
  playback.current = { fps, rate: clamp(progress, 0, 1) };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    const tick = (now: number) => {
      const { fps, rate } = playback.current;
      clock += Math.min(0.1, (now - last) / 1000) * fps * rate;
      last = now;
      setFrame(Math.floor(clock) % FRAME_COUNT);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scene = useMemo(() => drawFrame(frame, wind), [frame, wind]);
  const leaves = useMemo(
    () => LEAVES.slice(0, leafCount).map(leaf => leafAt(leaf, scene.phase, wind)),
    [leafCount, scene.phase, wind],
  );
  const canopyLeaves = useMemo(
    () => CANOPY_LEAVES.map(leaf => {
      const breezeOffset = treeOffset(leaf.anchor, scene.phase, wind);
      const rustle = wind * 3 * Math.sin(TAU * 4 * scene.phase + leaf.seed * TAU);
      const position = {
        x: leaf.anchor.x + breezeOffset.x + rustle,
        y: leaf.anchor.y + breezeOffset.y,
      };
      return {
        transform: `translate(${round(position.x)} ${round(position.y)}) rotate(${round(leaf.rotation + rustle * 2)}) scale(${leaf.size.toFixed(2)})`,
        color: leaf.color,
      };
    }),
    [scene.phase, wind],
  );

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: PAPER }}
    >
      <svg
        viewBox={VIEW_BOX}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Hand-drawn tree with branches and leaves moving in the wind over a still landscape"
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        <g
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {scene.strokes.map((stroke, i) => (
            <path
              key={i}
              d={stroke.d}
              stroke={stroke.color}
              strokeWidth={stroke.width}
            />
          ))}
          {canopyLeaves.map((leaf, i) => (
            <g key={i} transform={leaf.transform} pointerEvents="none">
              <path d={LEAF_SHAPE} fill={leaf.color} stroke={LEAF_INK} strokeWidth={1.1} />
              <path d={LEAF_RIB} stroke={LEAF_INK} strokeWidth={0.8} />
            </g>
          ))}
          {scene.streaks.map((streak, i) => (
            <path
              key={i}
              d={streak.d}
              pathLength={1}
              stroke={WATER}
              strokeWidth={2.2}
              strokeDasharray={`${STREAK_DASH} 2`}
              strokeDashoffset={streak.offset}
              opacity={streak.opacity}
            />
          ))}
          {leaves.map((leaf, i) => (
            <g key={i} transform={leaf.transform} opacity={leaf.opacity} pointerEvents="none">
              <path d={LEAF_SHAPE} fill={leaf.fill} stroke={LEAF_INK} strokeWidth={1.1} />
              <path d={LEAF_RIB} stroke={LEAF_INK} strokeWidth={0.8} />
            </g>
          ))}
        </g>
        <text
          x={1000}
          y={938}
          textAnchor="end"
          fontSize={20}
          fontFamily='"Bradley Hand", "Segoe Print", cursive'
          fill={WATER}
          opacity={0.75}
        >
          {String(scene.index + 1).padStart(2, "0")}
        </text>
      </svg>
    </div>
  );
}
