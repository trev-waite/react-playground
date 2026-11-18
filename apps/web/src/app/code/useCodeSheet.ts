import { useRef, useState } from "react";
import { loadSource } from "./cardSource";

/** A press waits this long for code on its way before the sheet opens on placeholder lines, so a fast failure never flashes an empty sheet. */
const REVEAL_DELAY_MS = 150;
/** Tries again the reader may take before only a fresh page can help. */
export const MAX_RETRIES = 5;

type CodeSlug = { slug: string };
/** A card whose code could not load, the tries again taken, and whether one is under way. */
export type CodeFailure = { slug: string; retries: number; trying: boolean };

/**
 * The code sheet and its failure toast. A press opens the sheet once the code
 * arrives, or on placeholders if it is slow; a fetch that fails closes the
 * sheet and shows the toast. Trying again keeps the toast up, its button
 * reading "Trying…", until the fetch settles: the sheet opens on the code, or
 * the toast says it failed again. Dismissing the toast or closing the sheet
 * hands focus back to the Code button that started it.
 */
export function useCodeSheet() {
  /** The card whose code was last asked for. The sheet stays mounted once opened, so it can animate out. */
  const [code, setCode] = useState<{ slug: string; open: boolean; attempt: number } | null>(null);
  const [failure, setFailure] = useState<CodeFailure | null>(null);
  /** Bumped by every press, try, dismissal, and close, so a fetch that settles late only acts for the press that started it. */
  const attempt = useRef(0);
  /** The Code button that was pressed, to return focus to. */
  const origin = useRef<HTMLElement | null>(null);
  /** A failure is showing, so the sheet closing for it must not take focus from the toast. */
  const failing = useRef(false);

  function returnFocus() {
    const target = origin.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }

  function load(card: CodeSlug, retries: number) {
    const id = ++attempt.current;
    const open = () => {
      failing.current = false;
      setFailure(null);
      setCode({ slug: card.slug, open: true, attempt: id });
    };
    // Only a first press opens early on placeholders; a try again waits behind its toast.
    const reveal =
      retries === 0
        ? setTimeout(() => {
            if (attempt.current === id) open();
          }, REVEAL_DELAY_MS)
        : undefined;
    loadSource(card).then(
      () => {
        clearTimeout(reveal);
        if (attempt.current === id) open();
      },
      () => {
        clearTimeout(reveal);
        if (attempt.current !== id) return;
        failing.current = true;
        setCode(current => current && { ...current, open: false });
        setFailure({ slug: card.slug, retries, trying: false });
      },
    );
  }

  return {
    code,
    failure,
    show: (card: CodeSlug, trigger: HTMLElement) => {
      origin.current = trigger;
      failing.current = false;
      setFailure(null);
      load(card, 0);
    },
    retry: (card: CodeSlug) => {
      if (!failure || failure.trying) return;
      setFailure({ ...failure, trying: true });
      load(card, failure.retries + 1);
    },
    dismiss: () => {
      attempt.current++;
      failing.current = false;
      setFailure(null);
      returnFocus();
    },
    close: () => {
      attempt.current++;
      setCode(current => current && { ...current, open: false });
      if (!failing.current) returnFocus();
    },
  };
}
