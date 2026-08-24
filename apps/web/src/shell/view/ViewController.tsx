import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { liveEntries } from "../../lib/discover";
import { playgroundApi } from "../../lib/playgroundApi";
import type { PlaygroundEntry } from "../../lib/types";
import type { PromoteInput } from "@react-playground/api";
import {
  DEFAULT_DURATION_MS,
  REDUCED_MOTION_MS,
  clamp01,
} from "./diagonalBand";

export type ViewMode = "live" | "experimental";

type ViewContextValue = {
  mode: ViewMode;
  /** 0 = Live covering; 1 = Experimental revealed */
  progress: number;
  animating: boolean;
  liveSlug: string | null;
  liveEntries: PlaygroundEntry[];
  promoting: boolean;
  promoteError: string | null;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  setMode: (mode: ViewMode) => void;
  /**
   * Publish the current idea as a new Live component.
   * When `discardExperimental` is set, that WIP folder is deleted after publish.
   */
  promote: (input: PromoteInput) => Promise<void>;
};

const ViewContext = createContext<ViewContextValue | null>(null);

const EXPERIMENTAL_PATH = "/experimental";

function isExperimentalPath(pathname: string): boolean {
  return (
    pathname === EXPERIMENTAL_PATH ||
    pathname.startsWith(`${EXPERIMENTAL_PATH}/`)
  );
}

function pathToSlug(pathname: string): string | null {
  const slug = pathname.replace(/^\//, "").replace(/\/$/, "");
  if (!slug || isExperimentalPath(`/${slug}`)) return null;
  return slug;
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

function easeOutExpo(t: number): number {
  return 1 - Math.pow(1 - t, 3.2);
}

type ViewProviderProps = {
  children: ReactNode;
};

export function ViewProvider({ children }: ViewProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [liveSlug, setLiveSlug] = useState<string | null>(() => {
    const fromUrl = pathToSlug(location.pathname);
    if (fromUrl) return fromUrl;
    return null;
  });
  const [experimentalHref, setExperimentalHref] = useState(() =>
    isExperimentalPath(location.pathname)
      ? location.pathname
      : EXPERIMENTAL_PATH,
  );

  const urlMode: ViewMode = isExperimentalPath(location.pathname)
    ? "experimental"
    : "live";

  const [progress, setProgress] = useState(() =>
    urlMode === "experimental" ? 1 : 0,
  );
  const [mode, setModeState] = useState<ViewMode>(urlMode);
  const [animating, setAnimating] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [reducedTransparency, setReducedTransparency] = useState(
    prefersReducedTransparency,
  );

  const progressRef = useRef(progress);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef(mode);

  progressRef.current = progress;
  modeRef.current = mode;

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
    if (urlMode !== "experimental") return;
    setExperimentalHref(location.pathname);
  }, [location.pathname, urlMode]);

  useEffect(() => {
    if (urlMode !== "live") return;
    const slug = pathToSlug(location.pathname);
    if (slug && liveEntries.some(e => e.slug === slug)) {
      setLiveSlug(slug);
    }
  }, [location.pathname, urlMode, liveEntries]);

  const animateTo = useCallback(
    (target: number, nextMode: ViewMode) => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const from = progressRef.current;
      if (Math.abs(from - target) < 0.001) {
        setProgress(target);
        setModeState(nextMode);
        setAnimating(false);
        return;
      }

      const duration = reducedMotion ? REDUCED_MOTION_MS : DEFAULT_DURATION_MS;
      const start = performance.now();
      setAnimating(true);
      setModeState(nextMode);

      const tick = (now: number) => {
        const t = clamp01((now - start) / duration);
        const eased = reducedMotion ? t : easeOutExpo(t);
        const value = from + (target - from) * eased;
        setProgress(value);
        progressRef.current = value;

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setProgress(target);
          progressRef.current = target;
          setAnimating(false);
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [reducedMotion],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (urlMode === modeRef.current && !animating) {
      const expected = urlMode === "experimental" ? 1 : 0;
      if (Math.abs(progressRef.current - expected) > 0.01) {
        animateTo(expected, urlMode);
      }
      return;
    }
    if (urlMode !== modeRef.current) {
      animateTo(urlMode === "experimental" ? 1 : 0, urlMode);
    }
  }, [urlMode, animateTo, animating]);

  const setMode = useCallback(
    (next: ViewMode) => {
      setPromoteError(null);
      if (next === "experimental") {
        navigate(experimentalHref);
      } else {
        const path = liveSlug ? `/${liveSlug}` : "/";
        navigate(path);
      }
    },
    [navigate, liveSlug, experimentalHref],
  );

  const promote = useCallback(
    async (input: PromoteInput) => {
      if (promoting) return;

      setPromoting(true);
      setPromoteError(null);

      try {
        const { slug } = await playgroundApi.promote(input);
        setLiveSlug(slug);
        // Full reload so the regenerated registry can lazy-load the new module.
        window.location.assign(`/${slug}`);
      } catch (err) {
        setPromoteError(err instanceof Error ? err.message : "Promote failed");
        setPromoting(false);
      }
    },
    [promoting],
  );

  const value = useMemo<ViewContextValue>(
    () => ({
      mode,
      progress,
      animating,
      liveSlug,
      liveEntries,
      promoting,
      promoteError,
      reducedMotion,
      reducedTransparency,
      setMode,
      promote,
    }),
    [
      mode,
      progress,
      animating,
      liveSlug,
      liveEntries,
      promoting,
      promoteError,
      reducedMotion,
      reducedTransparency,
      setMode,
      promote,
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
