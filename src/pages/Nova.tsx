import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LoaderCircle,
  Volume2,
  Mic,
  Headphones,
  History,
  Lightbulb,
  MicOff,
  Clock3,
  VolumeX,
  FileText,
  X,
  Send,
  ShieldCheck,
  CheckCheck,
  CheckCircle2,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  AudioLines,
} from "lucide-react";
import type {
  ActionItem,
  AgentResponse,
  AgentSession,
  SessionSummary,
} from "../../shared/types";
import { api } from "../lib/api";
import { Button, Eyebrow, Panel, SectionHeading } from "../components/UI";
import { PageHeading, shortDate } from "../components/Workspace";
import { useVoice } from "../hooks/useVoice";
import { loadHistory, saveHistory } from "../lib/history";
function CallIndicator({ state }: { state: string }) {
  return (
    <div className={"call-indicator indicator-" + state}>
      {state === "processing" || state === "connecting" ? (
        <LoaderCircle size={28} className="call-progress" />
      ) : state === "speaking" ? (
        <Volume2 size={28} />
      ) : state === "listening" ? (
        <Mic size={28} />
      ) : (
        <Headphones size={28} />
      )}
    </div>
  );
}
function Duration({
  start,
  active,
}: {
  start: string | null;
  active: boolean;
}) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active || !start) {
      setSec(0);
      return;
    }
    const update = () =>
      setSec(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(start).getTime()) / 1000),
        ),
      );
    update();
    const id = window.setInterval(update, 1000);
    return () => clearInterval(id);
  }, [active, start]);
  return (
    <span>
      {String(Math.floor(sec / 60)).padStart(2, "0")}:
      {String(sec % 60).padStart(2, "0")}
    </span>
  );
}
function ConversationMessage({
  message,
  dim = false,
}: {
  message: { role: string; content: string; timestamp: string };
  dim?: boolean;
}) {
  return (
    <article
      className={
        "conversation-message " +
        (message.role === "seller" ? "seller-message" : "nova-message") +
        (dim ? " message-dim" : "")
      }
    >
      <span
        className={
          "message-avatar " +
          (message.role === "seller"
            ? "seller-message-avatar"
            : "nova-message-avatar")
        }
      >
        {message.role === "seller" ? "DS" : "N"}
      </span>
      <div className="message-body">
        <div className="message-meta">
          <b>{message.role === "seller" ? "You" : "Nova"}</b>
          <time>{shortDate(message.timestamp)}</time>
        </div>
        <p>{message.content}</p>
      </div>
    </article>
  );
}
export default function NovaPage({
  notify,
  onActions,
}: {
  notify: (s: string) => void;
  onActions: (a: ActionItem[]) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<AgentSession | null>(null);
  const [history, setHistory] = useState<AgentSession[]>(() =>
    loadHistory().filter((s) => s.endedAt),
  );
  const [busy, setBusy] = useState(false);
  const [busyStart, setBusyStart] = useState(false);
  const [ending, setEnding] = useState(false);
  const [input, setInput] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const [latestCaption, setLatestCaption] = useState("");
  const [captions, setCaptions] = useState(false);
  const current = useRef<AgentSession | null>(null);
  const requestInFlight = useRef(false);
  const pendingRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const controls = useRef<ReturnType<typeof useVoice> | null>(null);

  const apply = useCallback(
    (r: AgentResponse) => {
      current.current = r.session;
      setSession(r.session);
      onActions(r.actions);
    },
    [onActions],
  );

  const send = useCallback(
    async (text: string) => {
      if (requestInFlight.current || !text.trim()) return;
      if (current.current?.endedAt) {
        current.current = null;
        setSession(null);
      }
      requestInFlight.current = true;
      const controller = new AbortController();
      pendingRequest.current = controller;
      const opening = text === "__START__";
      setBusyStart(opening);
      setBusy(true);
      setLatestCaption("");
      controls.current?.pause();
      if (!opening) controls.current?.beginThinking();
      try {
        let active = current.current;
        let response: AgentResponse;
        if (!active) {
          response = await api.start(
            controls.current?.language ?? "en-IN",
            controller.signal,
          );
          if (
            !mounted.current ||
            controller.signal.aborted ||
            pendingRequest.current !== controller
          )
            return;
          apply(response);
          active = response.session;
          if (!opening) {
            response = await api.turn(
              active.id,
              text.trim(),
              controller.signal,
            );
            if (
              !mounted.current ||
              controller.signal.aborted ||
              pendingRequest.current !== controller
            )
              return;
            apply(response);
          }
        } else if (opening) {
          response = {
            session: active,
            assistantMessage:
              active.messages.filter((m) => m.role === "assistant").at(-1)
                ?.content || "I'm here. What would you like to explore?",
            actions: [],
          };
        } else {
          response = await api.turn(active.id, text.trim(), controller.signal);
          if (
            !mounted.current ||
            controller.signal.aborted ||
            pendingRequest.current !== controller
          )
            return;
          apply(response);
        }
        if (controller.signal.aborted) return;
        controls.current?.endThinking();
        setLatestCaption(response.assistantMessage);
        setBusy(false);
        setBusyStart(false);
        await controls.current?.speak(response.assistantMessage);
      } catch (error) {
        if (
          !mounted.current ||
          controller.signal.aborted ||
          pendingRequest.current !== controller
        )
          return;
        if (!opening) {
          setInput(text);
          setShowTyping(true);
        }
        notify(
          error instanceof Error
            ? error.message
            : "Nova could not answer. Please try again.",
        );
      } finally {
        if (pendingRequest.current !== controller) return;
        pendingRequest.current = null;
        controls.current?.endThinking();
        requestInFlight.current = false;
        if (mounted.current) {
          setBusy(false);
          setBusyStart(false);
        }
      }
    },
    [apply, notify],
  );

  const voice = useVoice(send);
  controls.current = voice;
  useEffect(() => {
    mounted.current = true;
    void api
      .history()
      .then(({ sessions }) => {
        if (!mounted.current) return;
        const completed = [...sessions, ...loadHistory()].filter(
          (s, i, all) =>
            !!s.endedAt && all.findIndex((x) => x.id === s.id) === i,
        );
        setHistory(
          completed.sort(
            (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
          ),
        );
        const active = sessions.find((s) => !s.endedAt);
        if (!current.current && active && !requestInFlight.current) {
          current.current = active;
          setSession(active);
        }
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      pendingRequest.current?.abort();
    };
  }, []);
  const routeState = location.state as {
    session?: AgentSession;
    autoStart?: boolean;
    prompt?: string;
  } | null;
  const handledRoute = useRef(false);
  useEffect(() => {
    if (!routeState || handledRoute.current) return;
    // Defer the one-shot handoff so StrictMode's mount probe cannot abort it
    // and then leave the replacement mount with an already-consumed prompt.
    const timer = window.setTimeout(() => {
      handledRoute.current = true;
      if (routeState.session) {
        current.current = routeState.session;
        setSession(routeState.session);
      }
      if (routeState.prompt) void send(routeState.prompt);
      else if (routeState.autoStart) void controls.current?.start();
      navigate("/kam", { replace: true, state: null });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [routeState, navigate, send]);

  const end = async () => {
    if (ending) return;
    const cancelled = pendingRequest.current;
    pendingRequest.current = null;
    requestInFlight.current = false;
    voice.stop();
    setBusy(false);
    setBusyStart(false);
    setLatestCaption("");
    if (!current.current) {
      cancelled?.abort();
      notify("Call cancelled.");
      return;
    }
    setEnding(true);
    try {
      const response = await api.end(current.current.id);
      apply(response);
      const cached = saveHistory(response.session);
      setHistory(loadHistory().filter((s) => s.endedAt));
      setLatestCaption("");
      notify(
        cached
          ? "Call saved. Your transcript and summary are ready."
          : "Call saved on the local server. Browser storage is unavailable.",
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Could not save the call. Please retry.",
      );
    } finally {
      cancelled?.abort();
      setEnding(false);
    }
  };
  const newCall = () => {
    voice.stop();
    current.current = null;
    setSession(null);
    setInput("");
    setLatestCaption("");
    setShowTyping(false);
    void voice.start();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || requestInFlight.current || session?.endedAt) return;
    setInput("");
    await send(text);
    if (current.current && !current.current.endedAt) voice.resume();
  };
  const completed = !!session?.endedAt;
  const preparingSpeech =
    !!voice.localStatus &&
    /Downloading|Preparing|Switching|download failed/i.test(voice.localStatus);
  const callState = busyStart
    ? "connecting"
    : busy
      ? "processing"
      : preparingSpeech
        ? "connecting"
        : voice.state;
  const stateTitle = ending
    ? "Saving your call"
    : completed
      ? "Call complete"
      : preparingSpeech && !busyStart && !busy
        ? "Preparing your microphone"
        : busyStart
          ? "Connecting with Nova"
          : busy
            ? "Nova is thinking"
            : voice.state === "speaking"
              ? "Nova is speaking"
              : voice.state === "listening"
                ? "Nova is listening"
                : voice.state === "error"
                  ? "Let's reconnect"
                  : session
                    ? "Take your time"
                    : "Let's review your business";
  const stateDetail =
    preparingSpeech && !busyStart && !busy
      ? "On-device speech needs a first-use download. You can use the keyboard while it prepares."
      : busyStart
        ? "Getting ready for your conversation."
        : busy
          ? "Considering your question and account context."
          : voice.state === "speaking"
            ? "Listen in. Your microphone is paused while Nova speaks."
            : voice.state === "listening"
              ? "Go ahead. Speak naturally, then pause."
              : session
                ? "Resume your microphone whenever you're ready."
                : "Ask about sales, cancellations, or what to do next. Nova uses your account figures and what you tell her.";
  const locked = busy || busyStart || ending;
  const inputLocked = locked || voice.state === "speaking";

  return (
    <div className="nova-page">
      <PageHeading
        title="Get help from Nova"
        subtitle="Talk through a concern. Work out the next step together."
        action={
          <Button variant="secondary" onClick={() => navigate("/history")}>
            <History size={15} /> Saved calls
          </Button>
        }
      />
      {session?.mode === "demo" && (
        <div role="status" className="speech-compat">
          <Lightbulb size={15} />
          <span>
            Nova is using limited rules-only responses for this conversation.
            Check availability in Data & privacy.
          </span>
        </div>
      )}
      {voice.error && (
        <div role="alert" className="error-banner">
          <MicOff size={15} />
          <span>{voice.error}</span>
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() => void voice.resumeMicrophone()}
          >
            Retry microphone
          </Button>
        </div>
      )}
      {!completed ? (
        <Panel className={"nova-call-stage state-" + callState}>
          <div className="nova-stage-top">
            <span className="nova-live-label">
              <span /> {session ? "Call in progress" : "Voice account review"}
            </span>
            <span className="nova-call-clock">
              <Clock3 size={14} />
              <Duration start={session?.startedAt ?? null} active={!!session} />
            </span>
          </div>
          <div className="nova-stage-center">
            <div className="nova-indicator-space" aria-hidden="true">
              <CallIndicator state={callState} />
            </div>
            <div className="nova-stage-wordmark">
              Nova <span>Your account review partner</span>
            </div>
            <h2 role="status" aria-live="polite">
              {stateTitle}
            </h2>
            <p className="nova-state-detail">{stateDetail}</p>
            {captions && latestCaption && (
              <p
                className="nova-live-caption"
                aria-label="Current spoken reply"
              >
                {latestCaption}
              </p>
            )}
          </div>
          <div className="nova-stage-bottom">
            {!session && !busy ? (
              <div className="nova-start-controls">
                <Button
                  onClick={() => void voice.start()}
                  disabled={!voice.available || locked}
                >
                  <Mic size={18} /> Start a voice call
                </Button>
                <button
                  className="text-action"
                  onClick={() => setShowTyping((v) => !v)}
                >
                  Prefer to type?
                </button>
              </div>
            ) : (
              <div className="nova-call-controls">
                <button
                  className={"nova-control " + (voice.muted ? "is-muted" : "")}
                  onClick={voice.toggleMute}
                  aria-label={voice.muted ? "Unmute Nova" : "Mute Nova"}
                >
                  {voice.muted ? <VolumeX size={21} /> : <Volume2 size={21} />}
                  <span>{voice.muted ? "Muted" : "Speaker"}</span>
                </button>
                <button
                  className="nova-control"
                  disabled={locked}
                  onClick={() =>
                    voice.state === "listening"
                      ? voice.pauseMicrophone()
                      : void voice.resumeMicrophone()
                  }
                  aria-label={
                    voice.state === "listening"
                      ? "Pause microphone"
                      : "Resume microphone"
                  }
                >
                  {voice.state === "listening" ? (
                    <Mic size={21} />
                  ) : (
                    <MicOff size={21} />
                  )}
                  <span>Microphone</span>
                </button>
                <button
                  className={"nova-control " + (captions ? "is-selected" : "")}
                  onClick={() => setCaptions((v) => !v)}
                  aria-label={
                    captions ? "Hide live captions" : "Show live captions"
                  }
                  aria-pressed={captions}
                >
                  <FileText size={21} />
                  <span>Captions</span>
                </button>
                <button
                  className="nova-control nova-end"
                  onClick={() => void end()}
                  disabled={ending}
                  aria-label="End call"
                >
                  <X size={21} />
                  <span>{ending ? "Saving…" : "End call"}</span>
                </button>
              </div>
            )}
            {session && (
              <button
                className="nova-type-toggle"
                onClick={() => setShowTyping((v) => !v)}
                aria-expanded={showTyping}
              >
                {showTyping ? "Hide keyboard" : "Use keyboard instead"}
              </button>
            )}
            {showTyping && (
              <form
                className="voice-input-row nova-keyboard"
                onSubmit={(event) => void submit(event)}
              >
                <input
                  aria-label="Message to Nova"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about your business…"
                  maxLength={1200}
                  disabled={inputLocked}
                />
                <button
                  className="send-button"
                  aria-label="Send message"
                  disabled={inputLocked || !input.trim()}
                >
                  <Send size={16} />
                </button>
              </form>
            )}
            <div className="nova-call-preferences">
              <label>
                Language{" "}
                <select
                  aria-label="Conversation language"
                  value={voice.language}
                  disabled={locked || voice.isActive}
                  onChange={(event) =>
                    voice.setLanguage(event.target.value as "en-IN" | "hi-IN")
                  }
                >
                  <option value="en-IN">English</option>
                  <option value="hi-IN">हिन्दी</option>
                </select>
              </label>
            </div>
            <p className="nova-save-note">
              <ShieldCheck size={13} /> Read your transcript in Saved calls
              after you finish.
            </p>
            {voice.localStatus && (
              <p className="nova-local-status">{voice.localStatus}</p>
            )}
          </div>
        </Panel>
      ) : (
        <div className="page-stack">
          <Panel className="nova-call-complete">
            <span className="nova-complete-icon">
              <CheckCheck size={25} />
            </span>
            <div>
              <Eyebrow icon={CheckCircle2}>CALL SAVED</Eyebrow>
              <h2>Your conversation, ready to revisit.</h2>
              <p>
                {shortDate(session.startedAt)} · Transcript and business summary
              </p>
            </div>
            <Button onClick={newCall}>
              <Mic size={16} /> New call
            </Button>
          </Panel>
          {session.summary && (
            <Panel className="final-summary-panel">
              <h3>What you covered</h3>
              <SummaryContent summary={session.summary} />
            </Panel>
          )}
          <Panel className="nova-saved-transcript">
            <SectionHeading
              label="SAVED CONVERSATION"
              title={session.concern || "Your call with Nova"}
              detail="The complete transcript, in order."
            />
            <div className="history-messages">
              {session.messages.map((message) => (
                <ConversationMessage key={message.id} message={message} />
              ))}
            </div>
          </Panel>
          <Button variant="secondary" onClick={() => navigate("/actions")}>
            Review actions <ArrowRight size={14} />
          </Button>
        </div>
      )}
      {!session && !busy && (
        <div className="nova-topic-hints">
          <span>Need a starting point?</span>
          {[
            "Understand my sales",
            "Review cancellations",
            "Plan my next steps",
          ].map((text) => (
            <button
              key={text}
              onClick={() => {
                setShowTyping(true);
                setInput(text);
              }}
            >
              {text}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
      )}
      {(!session || completed) && history.length > 0 && (
        <Panel className="nova-past-calls">
          <SectionHeading
            label="PICK UP THE CONTEXT"
            title="Your saved calls"
          />
          {history.slice(0, 3).map((saved) => (
            <button
              key={saved.id}
              className="recent-session"
              onClick={() => {
                current.current = saved;
                setSession(saved);
              }}
            >
              <span className="recent-session-icon">
                <AudioLines size={16} />
              </span>
              <span className="recent-session-copy">
                <b>{saved.concern || "Business check-in"}</b>
                <small>{shortDate(saved.startedAt)}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </Panel>
      )}
    </div>
  );
}

function SummaryContent({ summary }: { summary: SessionSummary }) {
  return (
    <div className="summary-grid">
      <div className="summary-block">
        <b>Your concern</b>
        <p>{summary.concern}</p>
      </div>
      <div className="summary-block">
        <b>Observed metrics</b>
        {summary.metrics.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>
      <div className="summary-block">
        <b>Identified signals</b>
        {summary.issues.map((x) => (
          <p key={x}>• {x}</p>
        ))}
      </div>
      <div className="summary-block">
        <b>Seller-reported context</b>
        {summary.sellerInformation.length ? (
          summary.sellerInformation.map((x) => (
            <p key={x.topic}>
              {x.topic}: {x.status}. “{x.statement}”
            </p>
          ))
        ) : (
          <p>No additional seller context recorded.</p>
        )}
      </div>
      <div className="summary-block">
        <b>Recommendations</b>
        {summary.recommendations.map((x) => (
          <p key={x.id}>{x.title}</p>
        ))}
      </div>
      <div className="summary-block">
        <b>Next steps & outstanding questions</b>
        {[...summary.commitments, ...summary.outstanding].map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>
    </div>
  );
}
