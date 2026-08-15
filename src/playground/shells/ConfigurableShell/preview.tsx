/**
 * Demo harness. To experiment with a different component:
 * 1. Render it as children of ConfigurableShell
 * 2. Drive it with `controls` / `actions`
 * 3. Pass `getExportCode` that returns that component's source at the current values
 */
import { useMemo, useState } from "react";
import { ConfigurableShell, linearScale } from "./ConfigurableShell";
import { ExamplePreview } from "./ExamplePreview";
import { exportExampleCode } from "./exportExample";
import { ResetIcon, SlidersIcon } from "./icons";

export const meta = {
  title: "Configurable Shell",
};

const DEFAULTS = {
  tracking: 40,
  weight: 62,
  shift: 28,
};

export default function ConfigurableShellPreview() {
  const [tracking, setTracking] = useState(DEFAULTS.tracking);
  const [weight, setWeight] = useState(DEFAULTS.weight);
  const [shift, setShift] = useState(DEFAULTS.shift);
  const [panning, setPanning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const actions = useMemo(
    () => [
      {
        id: "randomize",
        label: "Randomize",
        icon: <SlidersIcon />,
        onClick: () => {
          setTracking(8 + Math.round(Math.random() * 84));
          setWeight(20 + Math.round(Math.random() * 70));
          setShift(8 + Math.round(Math.random() * 60));
        },
      },
      {
        id: "reset",
        label: "Reset",
        icon: <ResetIcon />,
        onClick: () => {
          setTracking(DEFAULTS.tracking);
          setWeight(DEFAULTS.weight);
          setShift(DEFAULTS.shift);
          setOffset({ x: 0, y: 0 });
        },
      },
    ],
    [],
  );

  const controls = useMemo(
    () => [
      {
        id: "tracking",
        label: "Tracking",
        value: tracking,
        onChange: setTracking,
        ...linearScale(0, 100, 1),
      },
      {
        id: "weight",
        label: "Weight",
        value: weight,
        onChange: setWeight,
        ...linearScale(0, 100, 1),
      },
      {
        id: "shift",
        label: "Shift",
        value: shift,
        onChange: setShift,
        ...linearScale(0, 100, 1),
      },
    ],
    [tracking, weight, shift],
  );

  return (
    <ConfigurableShell
      actions={actions}
      controls={controls}
      getExportCode={() => exportExampleCode(tracking, weight, shift, offset)}
      onMove={() => setPanning(value => !value)}
      movePressed={panning}
      onExpand={() => setExpanded(value => !value)}
      expandPressed={expanded}
      expanded={expanded}
    >
      <ExamplePreview
        tracking={tracking}
        weight={weight}
        shift={shift}
        panEnabled={panning}
        offset={offset}
        onOffsetChange={setOffset}
      />
    </ConfigurableShell>
  );
}
