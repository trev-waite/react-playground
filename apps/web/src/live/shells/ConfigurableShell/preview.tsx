/**
 * Live preview for the portable ConfigurableShell card.
 * Experimental view is a separate studio; do not reuse this card there.
 *
 * To wrap a different component in the card:
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
  form: 46,
  soft: 58,
  drift: 36,
};

export default function ConfigurableShellPreview() {
  const [form, setForm] = useState(DEFAULTS.form);
  const [soft, setSoft] = useState(DEFAULTS.soft);
  const [drift, setDrift] = useState(DEFAULTS.drift);
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
          setForm(12 + Math.round(Math.random() * 80));
          setSoft(18 + Math.round(Math.random() * 70));
          setDrift(8 + Math.round(Math.random() * 72));
        },
      },
      {
        id: "reset",
        label: "Reset",
        icon: <ResetIcon />,
        onClick: () => {
          setForm(DEFAULTS.form);
          setSoft(DEFAULTS.soft);
          setDrift(DEFAULTS.drift);
          setOffset({ x: 0, y: 0 });
        },
      },
    ],
    [],
  );

  const controls = useMemo(
    () => [
      {
        id: "form",
        label: "Form",
        value: form,
        onChange: setForm,
        ...linearScale(0, 100, 1),
      },
      {
        id: "soft",
        label: "Soft",
        value: soft,
        onChange: setSoft,
        ...linearScale(0, 100, 1),
      },
      {
        id: "drift",
        label: "Drift",
        value: drift,
        onChange: setDrift,
        ...linearScale(0, 100, 1),
      },
    ],
    [form, soft, drift],
  );

  return (
    <ConfigurableShell
      actions={actions}
      controls={controls}
      getExportCode={() => exportExampleCode(form, soft, drift, offset)}
      onMove={() => setPanning(value => !value)}
      movePressed={panning}
      onExpand={() => setExpanded(value => !value)}
      expandPressed={expanded}
      expanded={expanded}
    >
      <ExamplePreview
        form={form}
        soft={soft}
        drift={drift}
        panEnabled={panning}
        offset={offset}
        onOffsetChange={setOffset}
      />
    </ConfigurableShell>
  );
}
