import { useEffect, useMemo, useState } from "react";
import type { IdeaStudioSession } from "../lib/idea";
import { registerIdeaExporter } from "../lib/ideaExport";
import {
  ConfigurableShell,
  linearScale,
} from "../playground/shells/ConfigurableShell/ConfigurableShell";
import { ExamplePreview } from "../playground/shells/ConfigurableShell/ExamplePreview";
import { exportExampleCode } from "../playground/shells/ConfigurableShell/exportExample";
import { ResetIcon, SlidersIcon } from "../playground/shells/ConfigurableShell/icons";
import styles from "./IdeaWorkbench.module.css";

const DEFAULTS = {
  form: 46,
  soft: 58,
  drift: 36,
};

const REST = {
  form: 0,
  soft: 0,
  drift: 0,
};

function stateFromSession(session: IdeaStudioSession) {
  if (session.kind === "blank") {
    return {
      blank: true,
      form: REST.form,
      soft: REST.soft,
      drift: REST.drift,
      offset: { x: 0, y: 0 },
    };
  }
  if (session.kind === "restore") {
    return {
      blank: false,
      form: session.studio.form,
      soft: session.studio.soft,
      drift: session.studio.drift,
      offset: { ...session.studio.offset },
    };
  }
  return {
    blank: false,
    form: DEFAULTS.form,
    soft: DEFAULTS.soft,
    drift: DEFAULTS.drift,
    offset: { x: 0, y: 0 },
  };
}

type IdeaWorkbenchProps = {
  session?: IdeaStudioSession;
  onMutate?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
};

/** Experimental chrome that composes ConfigurableShell without forking it. */
export default function IdeaWorkbench({
  session = { kind: "demo" },
  onMutate,
  onDraftChange,
}: IdeaWorkbenchProps) {
  const initial = stateFromSession(session);
  const [blank, setBlank] = useState(initial.blank);
  const [form, setForm] = useState(initial.form);
  const [soft, setSoft] = useState(initial.soft);
  const [drift, setDrift] = useState(initial.drift);
  const [panning, setPanning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState(initial.offset);

  function mutateForm(value: number) {
    setForm(value);
    onMutate?.();
  }
  function mutateSoft(value: number) {
    setSoft(value);
    onMutate?.();
  }
  function mutateDrift(value: number) {
    setDrift(value);
    onMutate?.();
  }
  function mutateOffset(next: { x: number; y: number }) {
    setOffset(next);
    onMutate?.();
  }

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
          setOffset({ x: 0, y: 0 });
          setBlank(false);
          onMutate?.();
        },
      },
      {
        id: "reset",
        label: "Reset",
        icon: <ResetIcon />,
        disabled: blank,
        onClick: () => {
          setForm(DEFAULTS.form);
          setSoft(DEFAULTS.soft);
          setDrift(DEFAULTS.drift);
          setOffset({ x: 0, y: 0 });
          onMutate?.();
        },
      },
    ],
    [blank, onMutate],
  );

  const controls = useMemo(
    () => [
      {
        id: "form",
        label: "Form",
        value: form,
        onChange: mutateForm,
        ...linearScale(0, 100, 1),
      },
      {
        id: "soft",
        label: "Soft",
        value: soft,
        onChange: mutateSoft,
        ...linearScale(0, 100, 1),
      },
      {
        id: "drift",
        label: "Drift",
        value: drift,
        onChange: mutateDrift,
        ...linearScale(0, 100, 1),
      },
    ],
    [form, soft, drift, onMutate],
  );

  useEffect(() => {
    onDraftChange?.(!blank);
  }, [blank, onDraftChange]);

  useEffect(() => {
    if (blank) {
      registerIdeaExporter(null);
      return () => registerIdeaExporter(null);
    }
    registerIdeaExporter(() => ({
      source: exportExampleCode(form, soft, drift, offset),
      studio: { form, soft, drift, offset },
    }));
    return () => registerIdeaExporter(null);
  }, [blank, form, soft, drift, offset]);

  return (
    <div className={styles.frame}>
      <ConfigurableShell
        actions={actions}
        controls={controls}
        getExportCode={
          blank ? undefined : () => exportExampleCode(form, soft, drift, offset)
        }
        onMove={blank ? undefined : () => setPanning(value => !value)}
        movePressed={panning}
        onExpand={() => setExpanded(value => !value)}
        expandPressed={expanded}
        expanded={expanded}
      >
        {blank ? (
          <p className={styles.blank}>Empty stage — randomize to start a new idea.</p>
        ) : (
          <ExamplePreview
            form={form}
            soft={soft}
            drift={drift}
            panEnabled={panning}
            offset={offset}
            onOffsetChange={mutateOffset}
          />
        )}
      </ConfigurableShell>
    </div>
  );
}
