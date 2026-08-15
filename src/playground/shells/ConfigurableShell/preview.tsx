import { useMemo, useState } from "react";
import { ConfigurableShell, linearScale } from "./ConfigurableShell";
import { HeartIcon, ResetIcon, SlidersIcon } from "./icons";
import { TypeSpecimen } from "./TypeSpecimen";

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
  const [saved, setSaved] = useState(false);
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
          setSaved(false);
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
          setSaved(false);
        },
      },
      {
        id: "save",
        label: "Save",
        icon: <HeartIcon filled={saved} />,
        pressed: saved,
        onClick: () => setSaved(value => !value),
      },
    ],
    [saved],
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
      onMove={() => setPanning(value => !value)}
      movePressed={panning}
      onExpand={() => setExpanded(value => !value)}
      expandPressed={expanded}
      expanded={expanded}
    >
      <TypeSpecimen
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
