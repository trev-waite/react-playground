import {
  Component,
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { m, useTransform } from "motion/react";
import type { LiveCard, LiveCardMember } from "../../lib/catalog";
import type { CardMotion } from "./cardMotion";
import { observeFit } from "./fitPreview";
import styles from "./DeckCard.module.css";

/** Padding as a tile (chrome 0) and as a page (chrome 1). The page top clears the floating chrome. */
const TILE_PADDING = 16;
const PAGE_PADDING = { top: 80, inline: 24, bottom: 80, footer: 112 };

function padding(page: number) {
  return (chrome: number) => TILE_PADDING + (page - TILE_PADDING) * chrome;
}

type DeckCardProps = {
  card: LiveCard;
  motion: CardMotion;
  /** Render the previews. Off for pages far from view. */
  mounted: boolean;
  /** Previews take input; off while the card is a tile or in flight. */
  interactive: boolean;
  /** Present in the grid: the whole tile opens the page. */
  onOpen?: () => void;
  raised?: boolean;
};

export function DeckCard({ card, motion: values, mounted, interactive, onOpen, raised }: DeckCardProps) {
  const [resetKey, setResetKey] = useState(0);
  const hasFooter = Boolean(card.description || card.reset);
  const paddingTop = useTransform(values.chrome, padding(PAGE_PADDING.top));
  const paddingInline = useTransform(values.chrome, padding(PAGE_PADDING.inline));
  const paddingBottom = useTransform(
    values.chrome,
    padding(hasFooter ? PAGE_PADDING.footer : PAGE_PADDING.bottom),
  );
  const footerY = useTransform(values.chrome, chrome => (1 - chrome) * 16);

  return (
    <m.article
      className={styles.card}
      data-theme={card.theme}
      data-raised={raised || undefined}
      aria-label={card.title}
      style={{
        left: values.left,
        top: values.top,
        width: values.width,
        height: values.height,
        x: values.x,
        y: values.y,
        scale: values.scale,
        borderRadius: values.radius,
        ...(card.background ? ({ "--card-background": card.background } as CSSProperties) : null),
      }}
    >
      <m.div
        className={styles.preview}
        style={{ paddingTop, paddingBottom, paddingLeft: paddingInline, paddingRight: paddingInline }}
        inert={interactive ? undefined : true}
      >
        <FitStage contentKey={`${mounted}-${resetKey}`}>
          {mounted ? <Members key={resetKey} members={card.members} /> : null}
        </FitStage>
      </m.div>

      {hasFooter ? (
        <m.footer
          className={styles.footer}
          style={{ opacity: values.chrome, y: footerY }}
          inert={interactive ? undefined : true}
        >
          {card.description ? <p className={styles.description}>{card.description}</p> : null}
          {card.reset ? (
            <button
              type="button"
              className={styles.reset}
              onClick={() => setResetKey(key => key + 1)}
            >
              <ResetIcon />
              {card.reset === "replay" ? "Replay" : "Reset"}
            </button>
          ) : null}
        </m.footer>
      ) : null}

      {onOpen ? (
        <button type="button" className={styles.open} onClick={onOpen}>
          <span className={styles.openLabel}>{card.title}</span>
        </button>
      ) : null}
    </m.article>
  );
}

/** Shows a preview as it looks on the page, only smaller when the card is a tile. */
function FitStage({ contentKey, children }: { contentKey: string; children: ReactNode }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    return observeFit(area, content);
  }, [contentKey]);

  return (
    <div ref={areaRef} className={styles.area}>
      <div ref={contentRef} className={styles.fit}>
        {children}
      </div>
    </div>
  );
}

/**
 * Memoized: the deck re-renders cards when the view changes, and previews
 * (whole components) must not re-render with them at the start of a flight.
 */
const Members = memo(function Members({ members }: { members: LiveCardMember[] }) {
  if (members.length === 1 && members[0]) {
    return (
      // `.frame` must stretch: `useGpu` waits for a real canvas layout.
      <div className={styles.frame}>
        <Member member={members[0]} />
      </div>
    );
  }
  return (
    <div className={styles.family}>
      {members.map(member => (
        <div key={member.slug} className={styles.member}>
          <Member member={member} />
        </div>
      ))}
    </div>
  );
});

function Member({ member }: { member: LiveCardMember }) {
  const { Preview } = member;
  if (!Preview) {
    return <PreviewError title={member.title} message={member.error} />;
  }
  return (
    <PreviewBoundary title={member.title}>
      <Preview />
    </PreviewBoundary>
  );
}

function PreviewError({ title, message }: { title: string; message?: string }) {
  return (
    <p className={styles.error} role="alert">
      {title} could not load{message ? `: ${message}` : "."}
    </p>
  );
}

/** One broken preview should not take the rest of the deck down with it. */
class PreviewBoundary extends Component<
  { title: string; children: ReactNode },
  { message: string | null }
> {
  override state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "Render failed" };
  }

  override render() {
    if (this.state.message != null) {
      return <PreviewError title={this.props.title} message={this.state.message} />;
    }
    return this.props.children;
  }
}

function ResetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.25 8a4.75 4.75 0 1 0 1.4-3.37M3.25 2.75v2.5h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
