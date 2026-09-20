import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  bakeSliders,
  defaultIdeaDraft,
  sliderRecord,
  type IdeaDraft,
  type IdeaSlider,
  type IdeaActionMock,
} from "@react-playground/api";
import {
  CheckIcon,
  CopyIcon,
} from "../live/shells/ConfigurableShell/icons";
import {
  ProximityControl,
  type ShellControl,
} from "../live/shells/ConfigurableShell/ProximityControl";
import { linearScale } from "../live/shells/ConfigurableShell/scales";
import { useIdeaModules } from "./ideaCatalog";
import type { IdeaExample } from "./ideaModules";
import styles from "./IdeaWorkbench.module.css";

const COPIED_MS = 1600;
const PLAYBACK_RATE_PER_SECOND = 2.1;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function EmptyStage() {
  return (
    <p className={styles.blankHint}>
      Empty idea. Edit this project’s source to see it on the stage.
    </p>
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

export type IdeaStudioParts = {
  stage: ReactNode;
  dock: ReactNode;
};

type IdeaWorkbenchProps = {
  componentName: string | null;
  draft?: IdeaDraft;
  onMutate?: () => void;
  onDraftChange?: (draft: IdeaDraft) => void;
  children: (parts: IdeaStudioParts) => ReactNode;
};

export default function IdeaWorkbench({
  componentName,
  draft = defaultIdeaDraft(),
  onMutate,
  onDraftChange,
  children,
}: IdeaWorkbenchProps) {
  const [sliders, setSliders] = useState(draft.sliders);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(1);
  const [target, setTarget] = useState(1);
  const [motionNonce, setMotionNonce] = useState(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const draftRef = useRef(draft);
  draftRef.current = { ...draft, sliders };

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
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
      current += Math.sign(delta) * Math.min(
        Math.abs(delta),
        PLAYBACK_RATE_PER_SECOND * dt,
      );
      setProgress(current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, motionNonce]);

  const modules = useIdeaModules();
  const load = componentName ? modules[componentName] : undefined;
  const Stage = useMemo(() => load ? lazy<IdeaExample>(async () => {
    const module = await load();
    return { default: module.Example ?? EmptyStage };
  }) : null, [load]);
  const liveSliders = sliderRecord(sliders);
  const scrollMock =
    pressedId != null &&
    draft.actions.some(action => action.id === pressedId && action.mock === "scroll");

  function playTo(next: number) {
    setTarget(next);
    setMotionNonce(nonce => nonce + 1);
  }

  function playReplay() {
    progressRef.current = 0;
    setProgress(0);
    setTarget(1);
    setMotionNonce(nonce => nonce + 1);
  }

  function onAction(mock: IdeaActionMock, id: string) {
    if (mock === "form") playTo(1);
    else if (mock === "unform") playTo(0);
    else if (mock === "replay") playReplay();
    else setPressedId(id);
  }

  function actionPressed(mock: IdeaActionMock, id: string) {
    if (mock === "form") return target >= 1 && progress >= 0.99;
    if (mock === "unform") return target <= 0 && progress <= 0.01;
    return pressedId === id;
  }

  function emit(next: IdeaDraft) {
    draftRef.current = next;
    onDraftChange?.(next);
  }

  function changeSlider(id: string, value: number) {
    const nextSliders = sliders.map(slider =>
      slider.id === id ? { ...slider, value } : slider,
    ) as [IdeaSlider, IdeaSlider, IdeaSlider];
    setSliders(nextSliders);
    onMutate?.();
    emit({ ...draftRef.current, sliders: nextSliders });
  }

  const controls: ShellControl[] = sliders.map(slider => ({
    id: slider.id,
    label: slider.label,
    value: slider.value,
    onChange: (value: number) => changeSlider(slider.id, value),
    ...linearScale(slider.min, slider.max, slider.step),
  }));

  async function onCopy() {
    const source = bakeSliders(
      draftRef.current.portableSourceTemplate,
      draftRef.current.sliders,
    );
    const ok = await copyToClipboard(source);
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  const stage = (
    <div
      className={styles.frame}
      data-blank={!Stage || undefined}
      data-mock={scrollMock ? "scroll" : undefined}
    >
      {Stage ? (
        <div className={styles.stageViewport}>
          <Suspense fallback={<p className={styles.blankHint}>Loading…</p>}>
            <Stage sliders={liveSliders} progress={progress} />
          </Suspense>
        </div>
      ) : (
        <EmptyStage />
      )}
    </div>
  );

  const dock = (
    <div className={styles.dock}>
      <div className={styles.actions}>
        {draft.actions.map(action => {
          const pressed = actionPressed(action.mock, action.id);
          return (
            <button
              key={action.id}
              type="button"
              className={styles.action}
              aria-pressed={pressed}
              data-pressed={pressed ? true : undefined}
              onClick={() => onAction(action.mock, action.id)}
            >
              {action.label}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.action}
          aria-label="Copy component"
          onClick={() => void onCopy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className={styles.controls}>
        {controls.map(control => (
          <ProximityControl key={control.id} control={control} barCount={29} />
        ))}
      </div>
    </div>
  );

  return children({ stage, dock });
}
