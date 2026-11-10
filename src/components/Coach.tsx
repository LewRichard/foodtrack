import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useI18n, type MessageKey } from "../i18n/index.ts";
import { errorMessage, isSignInError, streamCoach } from "../lib/api.ts";
import { coachContext, turnsToSend } from "../lib/coach.ts";
import { actions, getState, useAppState, type CoachMessage } from "../lib/store.ts";

const SUGGESTIONS: MessageKey[] = ["coach.ask1", "coach.ask2", "coach.ask3", "coach.ask4"];

/** Chat with Lew, the AI nutritionist. */
export default function Coach({ onBack, onSignIn }: { onBack: () => void; onSignIn: () => void }) {
  const { t, lang } = useI18n();
  const { coachChat } = useAppState();
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; signIn: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [coachChat.length, streaming]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming !== null) return;
    setDraft("");
    setError(null);
    const history: CoachMessage[] = [...getState().coachChat, { role: "user", content: question, at: Date.now() }];
    actions.setCoachChat(history);

    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    setStreaming("");
    try {
      await streamCoach(turnsToSend(history), coachContext(getState()), lang, (piece) => {
        reply += piece;
        setStreaming(reply);
      }, controller.signal);
      actions.setCoachChat([...getState().coachChat, { role: "assistant", content: reply, at: Date.now() }]);
    } catch (e) {
      if (controller.signal.aborted) {
        // Stopped by the person: keep what arrived so far.
        if (reply.trim()) actions.setCoachChat([...getState().coachChat, { role: "assistant", content: reply, at: Date.now() }]);
      } else {
        actions.setCoachChat([...getState().coachChat, { role: "assistant", content: reply, at: Date.now(), failed: true }]);
        setError({ text: errorMessage(e), signIn: isSignInError(e) });
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function clear() {
    if (confirm(t("coach.clearConfirm"))) actions.setCoachChat([]);
  }

  return (
    <div className="page coach">
      <header className="coach-head">
        <button className="icon-btn" onClick={onBack} aria-label={t("common.back")}>
          ‹
        </button>
        <span className="coach-avatar" aria-hidden="true">
          🥑
        </span>
        <div className="coach-title">
          <strong>Lew</strong>
          <span className="muted small">{streaming !== null ? t("coach.typing") : t("coach.role")}</span>
        </div>
        {coachChat.length > 0 && (
          <button className="link small" onClick={clear}>
            {t("coach.clear")}
          </button>
        )}
      </header>

      <div className="coach-log" aria-live="polite">
        <Bubble role="assistant">
          <p>{t("coach.welcome")}</p>
        </Bubble>
        {coachChat.length === 0 && (
          <div className="coach-suggestions">
            {SUGGESTIONS.map((key) => (
              <button key={key} className="chip-btn" onClick={() => void send(t(key))}>
                {t(key)}
              </button>
            ))}
          </div>
        )}
        {coachChat.map((m, i) => (
          <Bubble key={i} role={m.role} failed={m.failed}>
            {m.role === "assistant" ? <RichText text={m.content || "…"} /> : <p>{m.content}</p>}
          </Bubble>
        ))}
        {streaming !== null && (
          <Bubble role="assistant">
            {streaming ? <RichText text={streaming} /> : <span className="typing-dots" aria-label={t("coach.typing")}><i /><i /><i /></span>}
          </Bubble>
        )}
        {error && (
          <div className="coach-error" role="alert">
            <p className="error small">{error.text}</p>
            {error.signIn && (
              <button className="btn small-btn" onClick={onSignIn}>
                {t("scan.signInAction")}
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="coach-form" onSubmit={submit}>
        <textarea
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder={t("coach.placeholder")}
          aria-label={t("coach.placeholder")}
        />
        {streaming !== null ? (
          <button type="button" className="btn coach-send" onClick={() => abortRef.current?.abort()}>
            {t("coach.stop")}
          </button>
        ) : (
          <button className="btn primary coach-send" disabled={!draft.trim()}>
            {t("community.send")}
          </button>
        )}
      </form>
      <p className="muted tiny center coach-note">{t("coach.disclaimer")}</p>
    </div>
  );
}

function Bubble({ role, failed, children }: { role: "user" | "assistant"; failed?: boolean; children: ReactNode }) {
  return <div className={`coach-bubble ${role === "user" ? "mine" : "theirs"} ${failed ? "failed" : ""}`}>{children}</div>;
}

/** A small, safe subset of Markdown: paragraphs, "-"/"1." lists and **bold** (built as React nodes, no HTML). */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{bold(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{bold(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

function bold(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}
