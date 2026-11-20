type Position = readonly [number, number, number];
type Surface = (u: number, v: number) => Position;
type Material = number | ((u: number, v: number) => number);

const TAU = 2 * Math.PI;

function gaussian(value: number) {
  return Math.exp(-value * value);
}

const DOT_SPACING = 0.029;

export function buildSculpture() {
  const vertices: number[] = [];
  const triangles: number[] = [];

  function shell(columns: number, rows: number, position: Surface, material: Material) {
    const start = vertices.length / 7;
    const stride = columns + 1;
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const v = row / rows;
        const [x, y, z] = position(u, v);
        vertices.push(x, y - 1.35, z, 0, 0, 0, typeof material === "number" ? material : material(u, v));
      }
    }

    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const index = start + row * stride + column;
        const left = (index - Number(column > 0)) * 7;
        const right = (index + Number(column < columns)) * 7;
        const bottom = (index - (row > 0 ? stride : 0)) * 7;
        const top = (index + (row < rows ? stride : 0)) * 7;
        const ax = vertices[right]! - vertices[left]!;
        const ay = vertices[right + 1]! - vertices[left + 1]!;
        const az = vertices[right + 2]! - vertices[left + 2]!;
        const bx = vertices[top]! - vertices[bottom]!;
        const by = vertices[top + 1]! - vertices[bottom + 1]!;
        const bz = vertices[top + 2]! - vertices[bottom + 2]!;
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz) || 1;
        vertices[index * 7 + 3] = nx / length;
        vertices[index * 7 + 4] = ny / length;
        vertices[index * 7 + 5] = nz / length;

        if (row < rows && column < columns) {
          const next = index + stride;
          triangles.push(index, index + 1, next, next, index + 1, next + 1);
        }
      }
    }
  }

  function brim(angle: number, radius: number): Position {
    const curl = 0.105 * Math.sin(2 * angle + 0.6) + 0.065 * Math.cos(3 * angle - 0.9);
    return [
      1.44 * radius * Math.sin(angle) - 0.075 * radius * Math.cos(2 * angle),
      0.98 + 0.14 * Math.sin(angle) * radius + curl * radius ** 2 - 0.13 * Math.cos(angle) * radius,
      0.94 * radius * Math.cos(angle) - 0.05,
    ];
  }

  function crown(angle: number, height: number, lining: number): Position {
    const profile = height * (1 - lining);
    const fold = (0.055 * Math.sin(3 * angle + profile * 3) + 0.037 * Math.sin(7 * angle - profile * 10)) * Math.sin(Math.PI * height);
    const radius = (1 - height) ** 1.13;
    const crease = 0.026 * Math.cos(29 * profile + Math.sin(2 * angle) * 2.4) * Math.sin(height * Math.PI);
    return [
      -0.74 * profile ** 2 + 0.18 * Math.sin(Math.PI * profile) + Math.sin(angle) * radius * (0.78 + fold + crease - lining),
      1.01 + 1.46 * profile - 0.29 * profile ** 5 + 0.12 * Math.sin(angle) * radius
        + 0.044 * Math.sin(angle * 4 + profile * 8) * Math.sin(Math.PI * height) - 0.85 * lining,
      -0.06 - profile ** 2 * 0.32 + Math.cos(angle) * radius * (0.58 + fold + crease - lining),
    ];
  }

  const LINING = 0.055;
  const COLUMNS = 128;

  function brimSheet(angle: number, width: number, lining: number): Position {
    const radius = 0.54 + width * 0.46;
    const [x, y, z] = brim(angle, radius);
    const [baseX, baseY, baseZ] = brim(angle, 0.54);
    const [openingX, openingY, openingZ] = crown(angle, 0, lining);
    const join = (1 - width) ** 2;
    const curl = 0.035 * (1 - radius * radius) - lining * Math.sin(Math.PI * (1 - width) / 2);
    const baseCurl = 0.035 * (1 - 0.54 ** 2) - lining;
    return [
      x + (openingX - baseX) * join,
      y + curl + (openingY - baseY - baseCurl) * join,
      z + (openingZ - baseZ) * join,
    ];
  }

  shell(COLUMNS, 24, (u, v) => brimSheet(TAU * u, v, 0), (u, v) =>
    -(0.52 + 0.08 * v + 0.14 * gaussian((v - 0.97) / 0.09) + 0.08 * Math.sin(15 * TAU * u + v * 10)));

  shell(COLUMNS, 22, (u, v) => brimSheet(TAU * u, v, LINING),
    (_u, v) => -(0.46 + 0.08 * v + 0.10 * gaussian(v / 0.09)));

  shell(COLUMNS, 62, (u, v) => crown(TAU * u, v, 0), (u, v) => {
    const band = 0.19 * gaussian((v - 0.094) / 0.036);
    return 0.62 - band + 0.064 * Math.sin(v * 43 + 2 * Math.sin(TAU * u * 2));
  });

  shell(COLUMNS, 56, (u, v) => crown(TAU * (1 - u), v, LINING), (u, v) =>
    0.49 - 0.17 * v + 0.044 * Math.sin(TAU * u * 11 + v * 9));

  const cells = new Map<number, number>();
  const surface = new Float32Array((vertices.length / 7) * 3);
  for (let index = 0; index < vertices.length; index += 7) {
    const x = vertices[index]!;
    const y = vertices[index + 1]!;
    const z = vertices[index + 2]!;
    const vertex = (index / 7) * 3;
    surface[vertex] = x;
    surface[vertex + 1] = y;
    surface[vertex + 2] = z;
    const column = Math.floor(x / DOT_SPACING);
    const row = Math.floor(y / DOT_SPACING);
    const slice = Math.floor(z / DOT_SPACING);
    const key = (column + 128) + (row + 128) * 256 + (slice + 128) * 65536;
    const prior = cells.get(key);
    if (prior === undefined) {
      cells.set(key, index);
      continue;
    }

    const cx = (column + 0.5) * DOT_SPACING;
    const cy = (row + 0.5) * DOT_SPACING;
    const cz = (slice + 0.5) * DOT_SPACING;
    const distance = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
    const priorDistance = (vertices[prior]! - cx) ** 2 + (vertices[prior + 1]! - cy) ** 2 + (vertices[prior + 2]! - cz) ** 2;
    if (distance < priorDistance) cells.set(key, index);
  }

  const points: number[] = [];
  for (const index of cells.values()) {
    for (let offset = 0; offset < 7; offset++) points.push(vertices[index + offset]!);
  }
  return {
    points: new Float32Array(points),
    surface,
    indices: new Uint16Array(triangles),
  };
}

export type HologramSculpture = ReturnType<typeof buildSculpture>;
