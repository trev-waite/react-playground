/**
 * Experimental workbench chrome — a full-bleed stage + dock, not ConfigurableShell.
 *
 * It echoes that component's visual language (glass, ink, proximity sliders) in
 * its own layout. Do not render <ConfigurableShell> here. Do not import
 * ConfigurableShell.module.css. The Live card stays a separate, portable unit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { IdeaStudioSession } from "../lib/ideaSession";
import { registerIdeaExporter } from "../lib/ideaExport";
import { ExamplePreview } from "../playground/shells/ConfigurableShell/ExamplePreview";
import { exportExampleCode } from "../playground/shells/ConfigurableShell/exportExample";
import {
  CheckIcon,
  CopyIcon,
  MoveIcon,
  ResetIcon,
  SlidersIcon,
} from "../playground/shells/ConfigurableShell/icons";
import {
  ProximityControl,
  type ShellControl,
} from "../playground/shells/ConfigurableShell/ProximityControl";
import { linearScale } from "../playground/shells/ConfigurableShell/scales";
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

const COPIED_MS = 1600;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through.
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.append(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

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
  const [offset, setOffset] = useState(initial.offset);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef({
    form: initial.blank ? DEFAULTS.form : initial.form,
    soft: initial.blank ? DEFAULTS.soft : initial.soft,
    drift: initial.blank ? DEFAULTS.drift : initial.drift,
    offset: initial.blank ? { x: 0, y: 0 } : { ...initial.offset },
  });

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!panning) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPanning(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panning]);

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

  const controls: ShellControl[] = useMemo(
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

  async function onCopy() {
    if (blank) return;
    const ok = await copyToClipboard(exportExampleCode(form, soft, drift, offset));
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <div className={styles.studio}>
      <div
        className={styles.stage}
        data-panning={!blank && panning ? true : undefined}
        data-blank={blank || undefined}
      >
        <div className={styles.stageWell}>
          {blank ? (
            <p className={styles.blankHint}>
              Empty stage — randomize to start a new idea.
            </p>
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
        </div>

        {!blank ? (
          <div className={styles.stageTools}>
            <button
              type="button"
              className={styles.tool}
              aria-label="Pan preview"
              aria-pressed={panning}
              data-pressed={panning || undefined}
              onClick={() => setPanning(value => !value)}
            >
              <MoveIcon />
            </button>
          </div>
        ) : null}

        <div className={styles.stageFrost} aria-hidden="true" />
      </div>

      <div className={styles.dock}>
        <div className={styles.dockGlass}>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setForm(12 + Math.round(Math.random() * 80));
                setSoft(18 + Math.round(Math.random() * 70));
                setDrift(8 + Math.round(Math.random() * 72));
                setOffset({ x: 0, y: 0 });
                setBlank(false);
                onMutate?.();
              }}
            >
              <SlidersIcon />
              Randomize
            </button>
            <button
              type="button"
              className={styles.action}
              disabled={blank}
              onClick={() => {
                setForm(baseline.current.form);
                setSoft(baseline.current.soft);
                setDrift(baseline.current.drift);
                setOffset({ ...baseline.current.offset });
                onMutate?.();
              }}
            >
              <ResetIcon />
              Reset
            </button>
            <button
              type="button"
              className={styles.action}
              aria-label="Copy component"
              disabled={blank}
              onClick={() => void onCopy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className={styles.controls}>
            {controls.map(control => (
              <ProximityControl key={control.id} control={control} barCount={39} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
