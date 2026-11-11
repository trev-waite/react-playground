const matrix = document.querySelector(".matrix");
const cells = [...matrix.children];
const COLUMNS = 17;
const ROWS = cells.length / COLUMNS;
const RADIUS = 2.2;
let lit = new Set();

function at(event) {
  const box = matrix.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * COLUMNS - 0.5,
    y: ((event.clientY - box.top) / box.height) * ROWS - 0.5,
  };
}

function light(event) {
  const { x, y } = at(event);
  const next = new Set();
  for (let row = Math.max(0, Math.ceil(y - RADIUS)); row <= Math.min(ROWS - 1, y + RADIUS); row++) {
    for (let column = Math.max(0, Math.ceil(x - RADIUS)); column <= Math.min(COLUMNS - 1, x + RADIUS); column++) {
      const near = 1 - Math.hypot(column - x, row - y) / RADIUS;
      if (near <= 0) continue;
      const cell = cells[row * COLUMNS + column];
      cell.style.setProperty("--heat", near.toFixed(3));
      cell.dataset.lit = "";
      next.add(cell);
    }
  }
  for (const cell of lit) if (!next.has(cell)) fade(cell);
  lit = next;
}

function fade(cell) {
  delete cell.dataset.lit;
  cell.style.removeProperty("--heat");
}

function clear() {
  lit.forEach(fade);
  lit = new Set();
}

function ping(event) {
  const { x, y } = at(event);
  cells.forEach((cell, index) => {
    const ring = Math.hypot((index % COLUMNS) - x, Math.floor(index / COLUMNS) - y);
    cell.style.setProperty("--ring", ring.toFixed(2));
  });
  delete matrix.dataset.ping;
  void matrix.offsetWidth;
  matrix.dataset.ping = "";
  light(event);
}

matrix.addEventListener("pointermove", light);
matrix.addEventListener("pointerdown", ping);
matrix.addEventListener("pointerleave", clear);
matrix.addEventListener("pointercancel", clear);
matrix.addEventListener("pointerup", event => {
  if (event.pointerType !== "mouse") clear();
});
