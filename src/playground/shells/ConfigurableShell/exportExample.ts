type ExampleMetrics = {
  letterSpacing: number;
  fontWeight: number;
  stroke: number;
  ghostX: number;
  ghostY: number;
  panX: number;
  panY: number;
  rule: number;
};

export function exampleMetrics(
  tracking: number,
  weight: number,
  shift: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): ExampleMetrics {
  return {
    letterSpacing: -0.09 + (tracking / 100) * 0.32,
    fontWeight: 400 + Math.round((weight / 100) * 400),
    stroke: 0.7 + (weight / 100) * 2.1,
    ghostX: (shift / 100) * 14,
    ghostY: (shift / 100) * 5.5,
    panX: offset.x * 0.35,
    panY: offset.y * 0.35,
    rule: 52 + (tracking / 100) * 86,
  };
}

function fmt(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)));
}

const DISPLAY_FONT = '"SF Pro Display", "Helvetica Neue", system-ui, sans-serif';

/** Demo-only: React source for the current example preview. Swap with your own exporter. */
export function exportExampleCode(
  tracking: number,
  weight: number,
  shift: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): string {
  const m = exampleMetrics(tracking, weight, shift, offset);
  const typeStyle = `fontFamily: '${DISPLAY_FONT}', fontSize: 92, letterSpacing: "${fmt(m.letterSpacing)}em", fontWeight: ${m.fontWeight}`;
  const open =
    m.panX === 0 && m.panY === 0
      ? ""
      : `\n      <g transform="translate(${fmt(m.panX)} ${fmt(m.panY)})">`;
  const close = m.panX === 0 && m.panY === 0 ? "" : "\n      </g>";
  const pad = m.panX === 0 && m.panY === 0 ? "      " : "        ";

  return `export function Example() {
  return (
    <svg
      viewBox="0 0 420 280"
      role="img"
      aria-label="Aa"
      style={{ display: "block", width: "100%", height: "auto" }}
    >${open}
${pad}<text
${pad}  x="210"
${pad}  y="152"
${pad}  textAnchor="middle"
${pad}  fill="none"
${pad}  stroke="#111113"
${pad}  strokeWidth={${fmt(m.stroke)}}
${pad}  strokeLinejoin="round"
${pad}  opacity={0.22}
${pad}  transform="translate(${fmt(m.ghostX)} ${fmt(m.ghostY)})"
${pad}  style={{ ${typeStyle} }}
${pad}>
${pad}  Aa
${pad}</text>
${pad}<text
${pad}  x="210"
${pad}  y="152"
${pad}  textAnchor="middle"
${pad}  fill="#111113"
${pad}  style={{ ${typeStyle} }}
${pad}>
${pad}  Aa
${pad}</text>
${pad}<line
${pad}  x1={${fmt(210 - m.rule / 2)}}
${pad}  y1="178"
${pad}  x2={${fmt(210 + m.rule / 2)}}
${pad}  y2="178"
${pad}  stroke="#111113"
${pad}  strokeWidth={0.7}
${pad}  opacity={0.22}
${pad}/>${close}
    </svg>
  );
}
`;
}
