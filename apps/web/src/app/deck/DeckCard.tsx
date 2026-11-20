import {
  Component,
  memo,
  Suspense,
  use,
  useCallback,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import type { LiveCard, LiveCardMember } from "../../lib/catalog";
import { livePath } from "../../lib/liveRoutes";
import { opacity, px, transform, useMotionStyle } from "../motion/hooks";
import type { MotionValue } from "../motion/motionValue";
import type { PreviewModule } from "../../lib/types";
import { useTheme } from "../theme/theme";
import type { CardMotion } from "./cardMotion";
import { footerOpacity, type Size } from "./deckLayout";
import { familyLayoutWidth, observeFit, refitArea } from "./fitPreview";
import styles from "./DeckCard.module.css";

const TILE_PADDING = 16;
const PAGE_INLINE_PADDING = 24;

function topPadding(chrome: number) {
  return `calc(${px(TILE_PADDING)} + (var(--preview-top) - ${px(TILE_PADDING)} + var(--safe-top)) * ${chrome})`;
}

function footerPadding(chrome: number) {
  const page = `var(--footer-height) + var(--footer-inset) + var(--footer-gap) - ${px(TILE_PADDING)}`;
  return `calc(${px(TILE_PADDING)} + (${page}) * ${chrome} + ${chrome} * var(--safe-bottom))`;
}

type DeckCardProps = {
  card: LiveCard;
  motion: CardMotion;
  /** The card's size as a grid tile. */
  tile: Size;
  /** The card's size as a full page. */
  page: Size;
  /** Render the previews. Off for pages far from view. */
  mounted: boolean;
  /** Previews take input; off while the card is a tile or in flight. */
  interactive: boolean;
  /** The page the reader is on. Only that page takes input. */
  current: boolean;
  /** Present in the grid: the whole tile opens the page. */
  onOpen?: () => void;
  /** The Code button was pressed; it is the control to hand focus back to. */
  onShowCode?: (trigger: HTMLElement) => void;
  /** The reader is reaching for the code button: fetch what it opens. */
  onPrepareCode?: () => void;
  raised?: boolean;
};

export function DeckCard({
  card,
  motion: values,
  tile,
  page,
  mounted,
  interactive,
  current,
  onOpen,
  onShowCode,
  onPrepareCode,
  raised,
}: DeckCardProps) {
  const [resetKey, setResetKey] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const { left, top, width, height, x, y, scale, radius, chrome } = values;
  const pageInteractive = interactive && current;
  const theme = useTheme();
  const surface = card.surface[theme];
  const membersWidth = familyLayoutWidth(
    { width: tile.width - TILE_PADDING * 2, height: tile.height - TILE_PADDING * 2 },
    page.width - PAGE_INLINE_PADDING * 2,
  );

  const cardStyle = useMotionStyle(cardRef, [left, top, width, height, x, y, scale, radius], style => {
    style("left", px(left.get()));
    style("top", px(top.get()));
    style("width", px(width.get()));
    style("height", px(height.get()));
    style("transform", transform({ x: x.get(), y: y.get(), scale: scale.get() }));
    style("borderRadius", px(radius.get()));
  });

  const previewStyle = useMotionStyle(previewRef, [chrome], style => {
    const inline = px(TILE_PADDING + (PAGE_INLINE_PADDING - TILE_PADDING) * chrome.get());
    style("paddingTop", topPadding(chrome.get()));
    style("paddingBottom", footerPadding(chrome.get()));
    style("paddingLeft", inline);
    style("paddingRight", inline);
  });

  const ends = useEffectEvent(() => ({ tile, page }));

  // Here, not in the stage: a child's effect would run before the footer measures the height the stage depends on.
  useLayoutEffect(() => {
    const area = areaRef.current;
    const fit = fitRef.current;
    if (!area || !fit) return;
    return observeFit(area, fit, { progress: chrome, box: [width, height], ends });
  }, [mounted, resetKey, chrome, width, height]);

  return (
    <article
      ref={cardRef}
      className={styles.card}
      data-theme={surface.theme}
      data-raised={raised || undefined}
      data-current={current || undefined}
      aria-label={card.title}
      style={{
        ...cardStyle,
        "--card-background": surface.background,
        "--page-width": px(page.width),
        "--page-height": px(page.height),
      } as CSSProperties}
    >
      <div ref={previewRef} className={styles.preview} style={previewStyle} inert={!pageInteractive}>
        <FitStage areaRef={areaRef} fitRef={fitRef}>
          {mounted ? <Members key={resetKey} members={card.members} familyWidth={membersWidth} /> : null}
        </FitStage>
      </div>

      <CardFooter chrome={chrome} interactive={pageInteractive} title={card.title} description={card.description}>
        {onShowCode ? (
          <button
            type="button"
            className={styles.code}
            aria-haspopup="dialog"
            onClick={event => onShowCode(event.currentTarget)}
            onPointerEnter={onPrepareCode}
            onFocus={onPrepareCode}
          >
            <CodeIcon />
            <span className={styles.buttonLabel}>Code</span>
          </button>
        ) : null}
        {card.reset ? (
          <button
            type="button"
            className={styles.reset}
            onClick={() => setResetKey(key => key + 1)}
          >
            <ResetIcon />
            <span className={styles.buttonLabel}>{card.reset === "replay" ? "Replay" : "Reset"}</span>
          </button>
        ) : null}
      </CardFooter>

      {onOpen ? (
        // A real link to the card's page: it opens in a new tab, copies, and reads as a link. A plain click flies there.
        <a
          className={styles.open}
          href={livePath(card.slug)}
          draggable={false}
          onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onOpen();
          }}
        >
          <span className={styles.openLabel}>{card.title}</span>
        </a>
      ) : null}
    </article>
  );
}

/** The page's caption bar. It tells the card its height, so the preview above never runs under it. */
function CardFooter({ chrome, interactive, title, description, children }: {
  chrome: MotionValue;
  interactive: boolean;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const titleId = useId();
  const [overflow, setOverflow] = useState(false);
  const scrollable = interactive && overflow;
  const footerStyle = useMotionStyle(ref, [chrome], style => {
    style("opacity", opacity(footerOpacity(chrome.get())));
    style("transform", transform({ y: (1 - chrome.get()) * 16 }));
  });

  useLayoutEffect(() => {
    const footer = ref.current;
    const card = footer?.parentElement;
    if (!footer || !card) return;
    const measure = (size: number) => {
      // A card skipped off screen can measure 0; it keeps the height it had, or the one-line default.
      if (size <= 0) return;
      const height = px(Math.round(size));
      if (card.style.getPropertyValue("--footer-height") !== height) card.style.setProperty("--footer-height", height);
    };
    measure(footer.offsetHeight);
    // The observer hands over the size it measured: reading offsetHeight here would force another layout mid-flight.
    const observer = new ResizeObserver(([entry]) => measure(entry?.borderBoxSize[0]?.blockSize ?? footer.offsetHeight));
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const caption = captionRef.current;
    const text = caption?.firstElementChild;
    const thumb = thumbRef.current;
    if (!interactive || !caption || !text || !thumb) return;
    const travel = { scroll: 0, thumb: 0 };
    const moveThumb = () => {
      if (travel.scroll === 0) return;
      const progress = Math.min(1, Math.max(0, caption.scrollTop / travel.scroll));
      thumb.style.transform = `translateY(${progress * travel.thumb}%)`;
    };
    const update = () => {
      const visible = caption.clientHeight;
      const total = caption.scrollHeight;
      travel.scroll = Math.max(0, total - visible);
      setOverflow(travel.scroll > 0);
      if (travel.scroll === 0) return;
      const fraction = Math.max(0.22, visible / total);
      thumb.style.blockSize = `${fraction * 100}%`;
      travel.thumb = (1 / fraction - 1) * 100;
      moveThumb();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(caption);
    observer.observe(text);
    caption.addEventListener("scroll", moveThumb, { passive: true });
    return () => {
      observer.disconnect();
      caption.removeEventListener("scroll", moveThumb);
    };
  }, [interactive]);

  return (
    <footer ref={ref} className={styles.footer} style={footerStyle} inert={interactive ? undefined : true}>
      <div className={styles.captionFrame}>
        <div
          ref={captionRef}
          className={styles.caption}
          role={scrollable ? "region" : undefined}
          aria-labelledby={scrollable ? titleId : undefined}
          tabIndex={scrollable ? 0 : undefined}
        >
          <div className={styles.captionText}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
        </div>
        <div data-caption-scroll className={styles.captionScroll} hidden={!scrollable} aria-hidden="true">
          <span ref={thumbRef} className={styles.captionThumb} />
        </div>
      </div>
      {children}
    </footer>
  );
}

/** Shows a preview as it looks on the page, only smaller when the card is a tile. */
function FitStage({ areaRef, fitRef, children }: { areaRef: RefObject<HTMLDivElement | null>; fitRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  // The loaded preview can overflow where the placeholder did not, and the area never resized.
  const refit = useCallback(() => {
    if (areaRef.current) refitArea(areaRef.current);
  }, [areaRef]);

  return (
    <div ref={areaRef} className={styles.area}>
      <div ref={fitRef} className={styles.fit}>
        <Suspense fallback={<div className={styles.loading} aria-hidden="true" />}>
          {children}
          <Revealed onReveal={refit} />
        </Suspense>
      </div>
    </div>
  );
}

/** Mounts after the previews beside it, so its layout effect runs once they are on the page. */
function Revealed({ onReveal }: { onReveal: () => void }) {
  useLayoutEffect(onReveal, [onReveal]);
  return null;
}

/**
 * Memoized: the deck re-renders cards when the view changes, and previews
 * (whole components) must not re-render with them at the start of a flight.
 */
const Members = memo(function Members({ members, familyWidth }: { members: LiveCardMember[]; familyWidth: number }) {
  if (members.length === 1 && members[0]) {
    return (
      // `.frame` must stretch: `useGpu` waits for a real canvas layout.
      <div className={styles.frame}>
        <Member member={members[0]} />
      </div>
    );
  }
  return (
    <div className={styles.family} style={{ width: familyWidth }}>
      {members.map(member => (
        <div key={member.slug} className={styles.member}>
          <Member member={member} />
        </div>
      ))}
    </div>
  );
});

function Member({ member }: { member: LiveCardMember }) {
  const module = member.load();
  return (
    <PreviewBoundary title={member.title} module={module}>
      <LoadedPreview module={module} />
    </PreviewBoundary>
  );
}

/** Suspends its card until the module arrives; a failed load lands in the boundary above. */
function LoadedPreview({ module }: { module: Promise<PreviewModule> }) {
  const { default: Preview } = use(module);
  return <Preview />;
}

function PreviewError({ title, message }: { title: string; message?: string }) {
  return (
    <p className={styles.error} role="alert">
      {title} could not load{message ? `: ${message}` : "."}
    </p>
  );
}

type PreviewBoundaryProps = { title: string; module: Promise<PreviewModule>; children: ReactNode };
type PreviewBoundaryState = { message: string | null; module: Promise<PreviewModule> };

/** One broken preview should not take the rest of the deck down with it. A new module gets a fresh try. */
class PreviewBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
  override state: PreviewBoundaryState = { message: null, module: this.props.module };

  static getDerivedStateFromProps(props: PreviewBoundaryProps, state: PreviewBoundaryState) {
    return props.module === state.module ? null : { message: null, module: props.module };
  }

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

function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
