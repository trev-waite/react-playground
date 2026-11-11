import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMotionValue } from "../app/motion/hooks";
import { animate, type MotionValue } from "../app/motion/motionValue";
import { useLocation, useNavigate } from "react-router";
import { liveSlugFromPath } from "../lib/catalog";
import { DEFAULT_DURATION_MS, REDUCED_MOTION_MS } from "./diagonalBand";

export type ViewMode = "live" | "experimental";

type ViewContextValue = {
  mode: ViewMode;
  /**
   * 0 = Live covering; 1 = Experimental revealed. A motion value so the
   * dissolve updates styles without re-rendering the studio every frame.
   */
  progress: MotionValue;
  animating: boolean;
  liveSlug: string | null;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  setMode: (mode: ViewMode) => void;
  /** Experimental reports its first mounted stage; the first dissolve waits for it. */
  markExperimentalReady: () => void;
};

const ViewContext = createContext<ViewContextValue | null>(null);

const EXPERIMENTAL_PATH = "/experimental";

function isExperimentalPath(pathname: string): boolean {
  return (
    pathname === EXPERIMENTAL_PATH ||
    pathname.startsWith(`${EXPERIMENTAL_PATH}/`)
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function prefersReducedTransparency(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-transparency: reduce)").matches
  );
}

/** Longest the first dissolve waits for Experimental to mount before it starts anyway. */
const EXPERIMENTAL_READY_TIMEOUT_MS = 600;

function easeOutExpo(t: number): number {
  return 1 - Math.pow(1 - t, 3.2);
}

type ViewProviderProps = {
  children: ReactNode;
};

export function ViewProvider({ children }: ViewProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [experimentalHref, setExperimentalHref] = useState(() =>
    isExperimentalPath(location.pathname)
      ? location.pathname
      : EXPERIMENTAL_PATH,
  );

  const urlMode: ViewMode = isExperimentalPath(location.pathname)
    ? "experimental"
    : "live";
  const urlSlug = urlMode === "live" ? liveSlugFromPath(location.pathname) : null;
  // Remember the Live page while Experimental is showing, so the toggle returns to it.
  const [rememberedSlug, setRememberedSlug] = useState(urlSlug);
  const liveSlug = urlSlug ?? rememberedSlug;

  const progress = useMotionValue(urlMode === "experimental" ? 1 : 0);
  const mode = urlMode;
  // The mode the dissolve last finished on; the view is animating until it catches up.
  const [settledMode, setSettledMode] = useState<ViewMode>(urlMode);
  const animating = settledMode !== mode;
  // Mounting a project mid-dissolve drops frames, so the first reveal waits for it.
  const [experimentalReady, setExperimentalReady] = useState(urlMode === "experimental");
  const markExperimentalReady = useCallback(() => setExperimentalReady(true), []);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [reducedTransparency, setReducedTransparency] = useState(
    prefersReducedTransparency,
  );

  if (urlMode === "experimental" && experimentalHref !== location.pathname) {
    setExperimentalHref(location.pathname);
  }
  if (urlSlug && urlSlug !== rememberedSlug) setRememberedSlug(urlSlug);

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const transparencyMq = window.matchMedia(
      "(prefers-reduced-transparency: reduce)",
    );
    const onMotion = () => setReducedMotion(motionMq.matches);
    const onTransparency = () => setReducedTransparency(transparencyMq.matches);
    motionMq.addEventListener("change", onMotion);
    transparencyMq.addEventListener("change", onTransparency);
    return () => {
      motionMq.removeEventListener("change", onMotion);
      transparencyMq.removeEventListener("change", onTransparency);
    };
  }, []);

  useEffect(() => {
    if (urlMode !== "experimental" || experimentalReady) return;
    const timer = setTimeout(markExperimentalReady, EXPERIMENTAL_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [urlMode, experimentalReady, markExperimentalReady]);

  useEffect(() => {
    if (urlMode === "experimental" && !experimentalReady) return;
    const target = urlMode === "experimental" ? 1 : 0;
    const there = Math.abs(progress.get() - target) < 0.001;
    const dissolve = animate(progress, target, {
      duration: there ? 0 : (reducedMotion ? REDUCED_MOTION_MS : DEFAULT_DURATION_MS) / 1000,
      ease: reducedMotion ? "linear" : easeOutExpo,
      onComplete: () => setSettledMode(urlMode),
    });
    return () => dissolve.stop();
  }, [urlMode, experimentalReady, progress, reducedMotion]);

  const setMode = useCallback(
    (next: ViewMode) => {
      if (next === "experimental") {
        navigate(experimentalHref);
      } else {
        const path = liveSlug ? `/${liveSlug}` : "/";
        navigate(path);
      }
    },
    [navigate, liveSlug, experimentalHref],
  );

  const value = useMemo<ViewContextValue>(
    () => ({
      mode,
      progress,
      animating,
      liveSlug,
      reducedMotion,
      reducedTransparency,
      setMode,
      markExperimentalReady,
    }),
    [
      mode,
      progress,
      animating,
      liveSlug,
      reducedMotion,
      reducedTransparency,
      setMode,
      markExperimentalReady,
    ],
  );

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext);
  if (!ctx) {
    throw new Error("useView must be used within ViewProvider");
  }
  return ctx;
}
