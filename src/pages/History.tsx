import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, AudioLines } from "lucide-react";
import type { AgentSession } from "../../shared/types";
import { api } from "../lib/api";
import { loadHistory } from "../lib/history";
import {
  PageHeading,
  Notice,
  EmptyState,
  shortDate,
} from "../components/Workspace";
export default function History() {
  const [rows, setRows] = useState<AgentSession[]>(() =>
    loadHistory().filter((s) => s.endedAt),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.history();
      const all = [...r.sessions, ...loadHistory()]
        .filter(
          (s, i, a) => s.endedAt && a.findIndex((x) => x.id === s.id) === i,
        )
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      setRows(all.slice(0, 30));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load saved calls.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const active = rows.find((s) => s.id === params.get("call"));
  return (
    <div className="page-stack">
      <Link to="/kam" className="back-link">
        <ArrowLeft size={15} />
        Get help from Nova
      </Link>
      <PageHeading
        title="Saved calls"
        subtitle="Return to the context, decisions and next steps from a conversation."
        action={
          <Link className="btn btn-primary" to="/kam">
            <AudioLines size={16} />
            New conversation
          </Link>
        }
      />
      {error && (
        <Notice onRetry={() => void refresh()}>
          {error}
          {rows.length ? " Showing browser-saved calls." : ""}
        </Notice>
      )}
      {loading && <p role="status">Loading calls…</p>}
      {params.has("call") && !active && !loading && (
        <Notice>
          This saved call could not be found. Choose another conversation.
        </Notice>
      )}
      {active ? (
        <section className="transcript-detail">
          <button className="back-link" onClick={() => setParams({})}>
            <ArrowLeft size={15} />
            All saved calls
          </button>
          <div className="transcript-heading">
            <h2>{active.concern || "Business check-in"}</h2>
            <span>{shortDate(active.startedAt)}</span>
          </div>
          {active.summary && (
            <div className="call-summary">
              <h3>What you covered</h3>
              <p>{active.summary.concern}</p>
              {active.summary.issues.length > 0 && (
                <ul>
                  {active.summary.issues.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
              {active.summary.commitments.length > 0 && (
                <>
                  <h3>Agreed next steps</h3>
                  <ul>
                    {active.summary.commitments.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="history-messages">
            {active.messages.map((m) => (
              <article className="conversation-message" key={m.id}>
                <div className="message-meta">
                  <b>{m.role === "seller" ? "You" : "Nova"}</b>
                  <time dateTime={m.timestamp}>{shortDate(m.timestamp)}</time>
                </div>
                <p>{m.content}</p>
              </article>
            ))}
          </div>
        </section>
      ) : rows.length ? (
        <div className="history-list">
          {rows.map((s) => (
            <button
              key={s.id}
              className="history-row"
              onClick={() => setParams({ call: s.id })}
            >
              <AudioLines size={22} />
              <span>
                <b>{s.concern || "Business check-in"}</b>
                <small>
                  {shortDate(s.startedAt)} ·{" "}
                  {s.messages.filter((m) => m.role === "seller").length}{" "}
                  contributions
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <EmptyState
            title="No saved conversations"
            action={
              <Link className="btn btn-primary" to="/kam">
                Start a conversation
              </Link>
            }
          >
            Completed calls and their transcripts will appear here.
          </EmptyState>
        )
      )}
    </div>
  );
}
