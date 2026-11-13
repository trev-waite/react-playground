import { useContext, useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardIndexForSlug } from "../lib/catalog";
import { useLiveCards } from "../lib/liveCatalog";
import { routeTitle } from "../lib/liveRoutes";
import { CardDeck, type DeckView } from "./deck/CardDeck";
import { BackPill, ChromeBar, DeckChromeSlot, DeckPager, DeckViewButton, ThemeButton } from "./deck/DeckChrome";
import { RefreshCatalogButton } from "./RefreshCatalogButton";
import { useTheme } from "./theme/theme";
import styles from "./LivePage.module.css";

/**
 * Moves the URL to a card's page, or to the grid with `null`. Changing view
 * pushes, so Back returns to where the reader was; paging through cards
 * replaces, so Back never has to retrace a scroll.
 */
export type NavigateLive = (slug: string | null, how: "push" | "replace") => void;

type LivePageProps = {
  /** The card the URL names. It shows as a page; with none, or one not in the catalog, the grid shows. */
  slug: string | null;
  /** False while another view covers Live (the local studio). */
  active?: boolean;
  onNavigate: NavigateLive;
  /** Live owns the page (not the studio), so phones may scroll the document itself. */
  documentScroll?: boolean;
};

export function LivePage({ slug, active = true, onNavigate, documentScroll = false }: LivePageProps) {
  return (
    <div className={styles.page}>
      <LiveDeck slug={slug} active={active} onNavigate={onNavigate} documentScroll={documentScroll} />
    </div>
  );
}

function LiveDeck({ slug, active, onNavigate, documentScroll }: Required<LivePageProps>) {
  const cards = useLiveCards();
  const slot = useContext(DeckChromeSlot);
  const theme = useTheme();
  const found = cardIndexForSlug(cards, slug);
  const view: DeckView = found >= 0 ? "page" : "grid";
  /** The page last shown, which the grid keeps raised and goes back to. */
  const [lastSlug, setLastSlug] = useState(slug);
  if (found >= 0 && slug !== lastSlug) setLastSlug(slug);
  const activeIndex = Math.max(0, found >= 0 ? found : cardIndexForSlug(cards, lastSlug));
  const card = cards[activeIndex];

  /** Pages to a card: the reader stays in the page view, so the URL only follows. */
  function page(index: number) {
    const next = cards[index];
    if (next) onNavigate(next.slug, "replace");
  }

  /** Opens a card from the grid. */
  function open(index: number) {
    const next = cards[index];
    if (next) onNavigate(next.slug, "push");
  }

  const reopen = useEffectEvent(() => open(activeIndex));
  const title = routeTitle(active && view === "page" && card ? card : null);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (view !== "grid" || !active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) reopen();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, active]);

  if (!card) {
    return (
      <Status>
        No Live components yet.
        {import.meta.env.DEV && <RefreshCatalogButton className={styles.action} />}
      </Status>
    );
  }

  const viewButton = (
    <DeckViewButton
      view={view}
      title={card.title}
      onToggle={() => (view === "grid" ? open(activeIndex) : onNavigate(null, "push"))}
    />
  );

  return (
    <div
      className={styles.deck}
      data-chrome={active && view === "page" ? card.surface[theme].theme : undefined}
    >
      {slot ? (
        createPortal(viewButton, slot)
      ) : (
        <ChromeBar>
          <BackPill>{viewButton}</BackPill>
          <ThemeButton />
        </ChromeBar>
      )}
      <DeckPager
        hidden={view === "grid"}
        index={activeIndex}
        count={cards.length}
        onStep={delta => page(activeIndex + delta)}
      />
      <p className={styles.srOnly} aria-live="polite">
        {view === "grid" ? "All components" : card.title}
      </p>
      <CardDeck
        cards={cards}
        view={view}
        activeIndex={activeIndex}
        listening={active}
        documentScroll={documentScroll}
        onActiveChange={page}
        onOpen={open}
      />
    </div>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <div className={styles.status} role="status">
      <p className={styles.message}>{children}</p>
    </div>
  );
}
