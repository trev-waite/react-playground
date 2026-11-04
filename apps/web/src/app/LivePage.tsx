import { startTransition, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { cardIndexForSlug } from "../lib/catalog";
import { useLiveCards } from "../lib/liveCatalog";
import { CardDeck, type DeckView } from "./deck/CardDeck";
import { ChromeBar, DeckChromeSlot, DeckPager, DeckViewButton } from "./deck/DeckChrome";
import { RefreshCatalogButton } from "./RefreshCatalogButton";
import styles from "./LivePage.module.css";

type LivePageProps = {
  slug: string | null;
  /** False while another view covers Live (the local studio). */
  active?: boolean;
};

export function LivePage({ slug, active = true }: LivePageProps) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<Status>Loading…</Status>}>
        <LiveDeck slug={slug} active={active} />
      </Suspense>
    </div>
  );
}

function LiveDeck({ slug, active }: { slug: string | null; active: boolean }) {
  const cards = useLiveCards();
  const navigate = useNavigate();
  const slot = useContext(DeckChromeSlot);
  const [view, setView] = useState<DeckView>("page");
  const found = cardIndexForSlug(cards, slug);
  const activeIndex = Math.max(0, found);
  const card = cards[activeIndex];

  function show(index: number) {
    const next = cards[index];
    if (next) navigate(`/${next.slug}`, { replace: true });
  }

  useEffect(() => {
    if (view !== "grid" || !active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) setView("page");
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

  if (slug && found < 0) {
    return (
      <Status>
        No Live component at “{slug}”.
        <span className={styles.actions}>
          {import.meta.env.DEV && <RefreshCatalogButton className={styles.action} />}
          <button type="button" className={styles.action} onClick={() => show(0)}>
            Show first
          </button>
        </span>
      </Status>
    );
  }

  const viewButton = (
    <DeckViewButton
      view={view}
      title={card.title}
      onToggle={() => setView(current => (current === "grid" ? "page" : "grid"))}
    />
  );

  return (
    <div
      className={styles.deck}
      data-chrome={active ? (view === "page" ? card.theme : "light") : undefined}
    >
      {slot ? createPortal(viewButton, slot) : <ChromeBar>{viewButton}</ChromeBar>}
      <DeckPager
        hidden={view === "grid"}
        index={activeIndex}
        count={cards.length}
        onStep={delta => show(activeIndex + delta)}
      />
      <p className={styles.srOnly} aria-live="polite">
        {view === "grid" ? "All components" : card.title}
      </p>
      <CardDeck
        cards={cards}
        view={view}
        activeIndex={activeIndex}
        listening={active}
        onActiveChange={show}
        onOpen={index => {
          // Router navigations run as transitions; zoom in the same commit as the URL change.
          startTransition(() => {
            show(index);
            setView("page");
          });
        }}
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
