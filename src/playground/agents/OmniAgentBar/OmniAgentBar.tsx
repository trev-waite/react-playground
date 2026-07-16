import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import styles from "./OmniAgentBar.module.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ModelId = "omni-1" | "omni-fast" | "omni-max";
type ResponseMode = "concise" | "balanced" | "creative";

const MODELS: { id: ModelId; label: string }[] = [
  { id: "omni-1", label: "Omni 1" },
  { id: "omni-fast", label: "Omni Fast" },
  { id: "omni-max", label: "Omni Max" },
];

const MODES: { id: ResponseMode; label: string }[] = [
  { id: "concise", label: "Concise" },
  { id: "balanced", label: "Balanced" },
  { id: "creative", label: "Creative" },
];

const FAKE_REPLY =
  "Got it. I’ve sketched a clean path forward: keep the surface quiet, let motion carry the expand, and treat the send ring as the only color moment while thinking. Ready for the next instruction whenever you are.";

/**
 * Portable Omni agent bar — copy with OmniAgentBar.module.css.
 * Collapses to a single input; expands to settings + transcript on send.
 */
export function OmniAgentBar() {
  const formId = useId();
  const [expanded, setExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<ModelId>("omni-1");
  const [mode, setMode] = useState<ResponseMode>("balanced");
  const [messages, setMessages] = useState<Message[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function collapse() {
    if (loading) return;
    setExpanded(false);
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };

    setInput("");
    setExpanded(true);
    setSettingsOpen(true);
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    await new Promise(resolve => setTimeout(resolve, 1600));

    setMessages(prev => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: FAKE_REPLY,
      },
    ]);
    setLoading(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <motion.div
      className={styles.root}
      layout
      data-expanded={expanded}
      transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.85 }}
    >
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="panel"
            className={styles.panel}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
          >
            <div className={styles.panelInner}>
              <header className={styles.header}>
                <div className={styles.brandBlock}>
                  <span className={styles.brand}>Omni</span>
                  <span className={styles.brandSub}>agent</span>
                </div>
                <div className={styles.headerActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    aria-expanded={settingsOpen}
                    onClick={() => setSettingsOpen(open => !open)}
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={collapse}
                    disabled={loading}
                  >
                    Collapse
                  </button>
                </div>
              </header>

              <AnimatePresence initial={false}>
                {settingsOpen && (
                  <motion.div
                    key="settings"
                    className={styles.settings}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className={styles.settingsInner}>
                      <fieldset className={styles.fieldset}>
                        <legend className={styles.legend}>Model</legend>
                        <div className={styles.segment} role="radiogroup" aria-label="Model">
                          {MODELS.map(option => (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={model === option.id}
                              className={styles.segmentBtn}
                              data-active={model === option.id}
                              onClick={() => setModel(option.id)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <fieldset className={styles.fieldset}>
                        <legend className={styles.legend}>Response</legend>
                        <div
                          className={styles.segment}
                          role="radiogroup"
                          aria-label="Response mode"
                        >
                          {MODES.map(option => (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={mode === option.id}
                              className={styles.segmentBtn}
                              data-active={mode === option.id}
                              onClick={() => setMode(option.id)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={transcriptRef}
                className={styles.transcript}
                aria-live="polite"
              >
                {messages.length === 0 && !loading ? (
                  <p className={styles.empty}>Send a message to see Omni respond.</p>
                ) : (
                  <ul className={styles.messageList}>
                    <AnimatePresence initial={false}>
                      {messages.map(message => (
                        <motion.li
                          key={message.id}
                          className={styles.message}
                          data-role={message.role}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <span className={styles.role}>
                            {message.role === "user" ? "You" : "Omni"}
                          </span>
                          <p className={styles.messageBody}>{message.content}</p>
                        </motion.li>
                      ))}
                      {loading && (
                        <motion.li
                          key="pending"
                          className={styles.message}
                          data-role="assistant"
                          data-pending="true"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.22 }}
                        >
                          <span className={styles.role}>Omni</span>
                          <p className={styles.messageBody}>
                            <span className={styles.thinking}>Thinking</span>
                          </p>
                        </motion.li>
                      )}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        id={formId}
        className={styles.composer}
        onSubmit={event => void handleSubmit(event)}
      >
        {!expanded && <span className={styles.compactBrand}>Omni</span>}
        <label className={styles.srOnly} htmlFor={`${formId}-input`}>
          Message Omni
        </label>
        <textarea
          id={`${formId}-input`}
          className={styles.input}
          rows={1}
          placeholder="Ask Omni…"
          value={input}
          onChange={event => setInput(event.target.value)}
          onFocus={() => {
            if (messages.length > 0) setExpanded(true);
          }}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button
          type="submit"
          className={styles.send}
          data-loading={loading}
          disabled={loading || !input.trim()}
          aria-label={loading ? "Sending" : "Send message"}
        >
          <span className={styles.sendRing} aria-hidden="true" />
          <span className={styles.sendFace} aria-hidden="true">
            {loading ? (
              <span className={styles.sendPulse} />
            ) : (
              <svg
                className={styles.sendIcon}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 12h12M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>
      </form>
    </motion.div>
  );
}
