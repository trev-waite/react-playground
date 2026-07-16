import {
  FAKE_REPLY,
  OmniAgentBar,
  type Message,
} from "./OmniAgentBar";
import styles from "./preview.module.css";

import collapsedPreview from "./previews/collapsed.png";
import loadingPreview from "./previews/loading.png";
import replyPreview from "./previews/reply.png";

export const meta = {
  title: "Omni Agent Bar",
};

const DEMO_USER: Message = {
  id: "demo-user",
  role: "user",
  content: "Design a quiet agent bar with one color moment.",
};

const DEMO_ASSISTANT: Message = {
  id: "demo-assistant",
  role: "assistant",
  content: FAKE_REPLY,
};

const IMAGE_FRAMES = [
  {
    id: "collapsed",
    title: "Collapsed",
    caption: "Simple input + send",
    src: collapsedPreview,
  },
  {
    id: "loading",
    title: "Loading",
    caption: "Expanded settings + rainbow send ring",
    src: loadingPreview,
  },
  {
    id: "reply",
    title: "Reply",
    caption: "Hardcoded assistant output",
    src: replyPreview,
  },
] as const;

export default function OmniAgentBarPreview() {
  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.heading}>Live</h2>
          <p className={styles.lede}>Type a message and send to expand.</p>
        </div>
        <div className={styles.liveStage}>
          <OmniAgentBar previewId="live" />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.heading}>Image previews</h2>
          <p className={styles.lede}>Captured frames of the three key states.</p>
        </div>
        <div className={styles.imageGrid}>
          {IMAGE_FRAMES.map(frame => (
            <figure key={frame.id} className={styles.imageCard}>
              <img
                className={styles.image}
                src={frame.src}
                alt={`Omni Agent Bar — ${frame.title}`}
                width={720}
                height={480}
              />
              <figcaption className={styles.caption}>
                <span className={styles.captionTitle}>{frame.title}</span>
                <span className={styles.captionBody}>{frame.caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Off-canvas freeze frames for `bun scripts/capture-omni-previews.ts` */}
      <div className={styles.captureRoot} data-screenshot-root="true" aria-hidden="true">
        <div className={styles.frame} data-frame="collapsed">
          <OmniAgentBar previewId="collapsed" interactive={false} />
        </div>
        <div className={styles.frame} data-frame="loading">
          <OmniAgentBar
            previewId="loading"
            interactive={false}
            initialExpanded
            initialLoading
            initialMessages={[DEMO_USER]}
          />
        </div>
        <div className={styles.frame} data-frame="reply">
          <OmniAgentBar
            previewId="reply"
            interactive={false}
            initialExpanded
            initialMessages={[DEMO_USER, DEMO_ASSISTANT]}
          />
        </div>
      </div>
    </div>
  );
}
