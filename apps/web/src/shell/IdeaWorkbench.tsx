/**
 * Experimental stage and dock. Not ConfigurableShell.
 * Author here; Save and Make Live write the portable component only.
 */
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import type { IdeaDraft, IdeaStudioSession } from "../lib/ideaSession";
import {
  CheckIcon,
  CopyIcon,
} from "../live/shells/ConfigurableShell/icons";
import {
  ProximityControl,
  type ShellControl,
} from "../live/shells/ConfigurableShell/ProximityControl";
import { linearScale } from "../live/shells/ConfigurableShell/scales";
import { EmeraldConstruct } from "./workbench/EmeraldConstruct/EmeraldConstruct";
import {
  type ConstructId,
  detailElementCount,
  hueFromColor,
  isConstructId,
  nextConstruct,
} from "./workbench/EmeraldConstruct/constructs";
import { exportEmeraldConstructCode } from "./workbench/EmeraldConstruct/exportCode";
import styles from "./IdeaWorkbench.module.css";

const DEFAULTS = {
  formationSpeed: 56,
  detail: 58,
  color: 42,
  variant: "bird" as ConstructId,
  origin: { x: 0.5, y: 0.68 },
};

const COPIED_MS = 1600;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function BuildIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M3.2 12.6 8 3.4l4.8 9.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.1 9.1h5.8" strokeLinecap="round" />
    </svg>
  );
}

function DissolveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M3.4 4.2h9.2" strokeLinecap="round" />
      <path d="M4.6 7.4h6.8M5.8 10.4h4.4M7 13h2" strokeLinecap="round" />
    </svg>
  );
}

function ConstructIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M8 2.4 13.2 5.2v5.6L8 13.6 2.8 10.8V5.2Z" strokeLinejoin="round" />
    </svg>
  );
}

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
      formationSpeed: DEFAULTS.formationSpeed,
      detail: DEFAULTS.detail,
      color: DEFAULTS.color,
      variant: DEFAULTS.variant,
      origin: { ...DEFAULTS.origin },
    };
  }
  if (session.kind === "restore") {
    const variant = session.editorState.variant;
    return {
      blank: false,
      formationSpeed: session.editorState.formationSpeed,
      detail: session.editorState.detail,
      color: session.editorState.color,
      variant: variant && isConstructId(variant) ? variant : DEFAULTS.variant,
      origin: { ...session.editorState.origin },
    };
  }
  return {
    blank: false,
    formationSpeed: DEFAULTS.formationSpeed,
    detail: DEFAULTS.detail,
    color: DEFAULTS.color,
    variant: DEFAULTS.variant,
    origin: { ...DEFAULTS.origin },
  };
}

type IdeaWorkbenchProps = {
  session?: IdeaStudioSession;
  onMutate?: () => void;
  onDraftChange?: (draft: IdeaDraft | null) => void;
};

export default function IdeaWorkbench({
  session = { kind: "demo" },
  onMutate,
  onDraftChange,
}: IdeaWorkbenchProps) {
  const initial = stateFromSession(session);
  const [blank, setBlank] = useState(initial.blank);
  const [formationSpeed, setFormationSpeed] = useState(initial.formationSpeed);
  const [detail, setDetail] = useState(initial.detail);
  const [color, setColor] = useState(initial.color);
  const [variant, setVariant] = useState<ConstructId>(initial.variant);
  const [origin, setOrigin] = useState(initial.origin);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(() =>
    initial.blank ? 0 : reducedMotion() ? 1 : 0,
  );
  const [target, setTarget] = useState(() =>
    initial.blank ? 0 : reducedMotion() ? 1 : 0,
  );
  const [motionNonce, setMotionNonce] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutatedRef = useRef(session.kind !== "restore");
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function markDraft() {
    mutatedRef.current = true;
    setBlank(false);
    onMutate?.();
  }

  function mutateFormationSpeed(value: number) {
    setFormationSpeed(value);
    markDraft();
  }
  function mutateDetail(value: number) {
    setDetail(value);
    markDraft();
  }
  function mutateColor(value: number) {
    setColor(value);
    markDraft();
  }

  useEffect(() => {
    if (reducedMotion()) {
      setProgress(target);
      return;
    }

    let frame = 0;
    let last = performance.now();
    let current = progressRef.current;

    const tick = (now: number) => {
      const dt = Math.min(0.048, (now - last) / 1000);
      last = now;
      const delta = target - current;
      if (Math.abs(delta) < 0.002) {
        current = target;
        setProgress(target);
        return;
      }
      const rate = 1.25 + (formationSpeed / 100) * 2.05;
      current += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
      setProgress(current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, formationSpeed, motionNonce]);

  const controls: ShellControl[] = useMemo(
    () => [
      {
        id: "formationSpeed",
        label: "Formation speed",
        value: formationSpeed,
        onChange: mutateFormationSpeed,
        ...linearScale(0, 100, 1),
      },
      {
        id: "detail",
        label: "Detail",
        value: detail,
        onChange: mutateDetail,
        format: (value: number) => String(detailElementCount(variant, value)),
        ...linearScale(0, 100, 1),
      },
      {
        id: "color",
        label: "Color",
        value: color,
        onChange: mutateColor,
        format: (value: number) => String(Math.round(hueFromColor(value))),
        ...linearScale(0, 100, 1),
      },
    ],
    [formationSpeed, detail, color, onMutate],
  );

  const source = exportEmeraldConstructCode(
    formationSpeed,
    detail,
    color,
    variant,
    origin,
  );

  useEffect(() => {
    if (blank) {
      onDraftChange?.(null);
      return;
    }
    if (!mutatedRef.current) return;
    onDraftChange?.({
      kind: "emerald-construct",
      version: 1,
      portableSourceTemplate: source,
      editorState: {
        formationSpeed,
        detail,
        color,
        origin: { ...origin },
        variant,
      },
    });
  }, [blank, source, formationSpeed, detail, color, origin, variant, onDraftChange]);

  async function onCopy() {
    if (blank) return;
    const ok = await copyToClipboard(source);
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  function playTo(next: number) {
    setTarget(next);
    setMotionNonce(value => value + 1);
    markDraft();
  }

  return (
    <div className={styles.studio}>
      <div className={styles.stage} data-blank={blank || undefined}>
        <div className={styles.stageWell}>
          {blank ? (
            <p className={styles.blankHint}>
              Empty stage — Build to start a new idea.
            </p>
          ) : (
            <EmeraldConstruct
              formationSpeed={formationSpeed}
              detail={detail}
              color={color}
              variant={variant}
              progress={progress}
              origin={origin}
              onOriginChange={setOrigin}
            />
          )}
        </div>

        <div className={styles.stageFrost} aria-hidden="true" />
      </div>

      <div className={styles.dock}>
        <div className={styles.dockGlass}>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              aria-pressed={target >= 1 && progress >= 0.99}
              data-pressed={target >= 1 && progress >= 0.99 ? true : undefined}
              onClick={() => playTo(1)}
            >
              <BuildIcon />
              Build
            </button>
            <button
              type="button"
              className={styles.action}
              aria-pressed={target <= 0 && progress <= 0.01}
              data-pressed={target <= 0 && progress <= 0.01 ? true : undefined}
              disabled={blank}
              onClick={() => playTo(0)}
            >
              <DissolveIcon />
              Dissolve
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setVariant(current => nextConstruct(current));
                if (progressRef.current > 0.04) {
                  progressRef.current = 0;
                  setProgress(0);
                  playTo(1);
                  return;
                }
                markDraft();
              }}
            >
              <ConstructIcon />
              Construct
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
