import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Check, RefreshCw, AudioLines, ArrowRight } from "lucide-react";
import type { ActionItem } from "../../shared/types";
import { api } from "../lib/api";
import { useSellerData } from "../hooks/useSellerData";
import { Button } from "../components/UI";
import { PageHeading, Notice, EmptyState } from "../components/Workspace";
export default function Actions({
  actions,
  setActions,
  notify,
  loading,
  error,
  onRefresh,
}: {
  actions: ActionItem[];
  setActions: (a: ActionItem[]) => void;
  notify: (s: string) => void;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const suggestions = params.get("view") === "suggestions";
  const filter = params.get("status") ?? "open";
  const [updating, setUpdating] = useState("");
  const [writeError, setWriteError] = useState("");
  const shown = actions.filter(
    (a) =>
      filter === "all" ||
      (filter === "completed"
        ? a.status === "completed"
        : a.status !== "completed"),
  );
  const update = async (a: ActionItem, status: ActionItem["status"]) => {
    setUpdating(a.id);
    setWriteError("");
    try {
      const r = await api.updateAction(a.id, status);
      setActions(r.actions);
      notify(
        status === "completed" ? "Task marked complete." : "Task updated.",
      );
    } catch (e) {
      setWriteError(
        e instanceof Error ? e.message : "Could not update the task.",
      );
    } finally {
      setUpdating("");
    }
  };
  return (
    <div className="page-stack">
      <PageHeading
        title="Actions"
        subtitle="Keep the work you agree on in one place."
        action={
          <Link className="btn btn-secondary" to="/kam">
            <AudioLines size={16} />
            Discuss with Nova
          </Link>
        }
      />
      <nav className="section-tabs" aria-label="Actions views">
        <Link to="/actions" aria-current={!suggestions ? "page" : undefined}>
          Your plan{" "}
          <span>
            {loading || error
              ? "—"
              : actions.filter((a) => a.status !== "completed").length}
          </span>
        </Link>
        <Link
          to="/actions?view=suggestions"
          aria-current={suggestions ? "page" : undefined}
        >
          Suggestions
        </Link>
      </nav>
      {suggestions ? (
        <Suggestions
          actions={actions}
          setActions={setActions}
          notify={notify}
        />
      ) : (
        <>
          {error && <Notice onRetry={onRefresh}>{error}</Notice>}
          {writeError && <Notice>{writeError}</Notice>}
          {loading ? (
            <p role="status" className="loading-state">
              Loading tasks…
            </p>
          ) : (
            !error && (
              <>
                <div className="list-toolbar">
                  <h2>
                    {filter === "completed"
                      ? "Completed work"
                      : "Your saved tasks"}
                  </h2>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Filter tasks"
                  >
                    {["open", "completed", "all"].map((f) => (
                      <button
                        key={f}
                        aria-pressed={filter === f}
                        onClick={() =>
                          setParams(f === "open" ? {} : { status: f })
                        }
                      >
                        {f === "open"
                          ? "Open"
                          : f === "completed"
                            ? "Completed"
                            : "All"}
                      </button>
                    ))}
                  </div>
                </div>
                {shown.length ? (
                  <div className="task-list">
                    {shown.map((a) => (
                      <article
                        key={a.id}
                        className={
                          "task-row " +
                          (a.status === "completed" ? "is-complete" : "")
                        }
                      >
                        <div className="task-status-icon" aria-hidden="true">
                          {a.status === "completed" ? (
                            <Check size={18} />
                          ) : (
                            <span />
                          )}
                        </div>
                        <div className="task-main">
                          <div className="task-meta">
                            <span className={"status-label status-" + a.status}>
                              {a.status === "suggested"
                                ? "Ready to start"
                                : a.status === "started"
                                  ? "In progress"
                                  : "Completed"}
                            </span>
                            <span>{a.priority} priority</span>
                            <span>{a.timeframe}</span>
                          </div>
                          <h3>{a.title}</h3>
                          <p>{a.description}</p>
                          <details>
                            <summary>Evidence and ownership</summary>
                            <p>{a.supportingInsight}</p>
                            <p>Suggested owner: {a.owner}</p>
                            <p>Intended outcome: {a.impact}</p>
                          </details>
                        </div>
                        <Button
                          variant={
                            a.status === "started" ? "primary" : "secondary"
                          }
                          disabled={updating === a.id}
                          onClick={() =>
                            void update(
                              a,
                              a.status === "started" ? "completed" : "started",
                            )
                          }
                        >
                          {updating === a.id ? (
                            "Saving…"
                          ) : a.status === "completed" ? (
                            <>
                              <RefreshCw size={14} />
                              Reopen
                            </>
                          ) : a.status === "started" ? (
                            <>
                              <Check size={14} />
                              Mark complete
                            </>
                          ) : (
                            <>
                              Start task
                              <ArrowRight size={14} />
                            </>
                          )}
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={
                      filter === "completed"
                        ? "No completed tasks yet"
                        : "Your next step starts here"
                    }
                    action={
                      <Link
                        className="btn btn-primary"
                        to="/actions?view=suggestions"
                      >
                        Explore suggestions
                      </Link>
                    }
                  >
                    {filter === "completed"
                      ? "Tasks you mark complete will appear here."
                      : "Review a suggestion or agree on a plan with Nova, then track it here."}
                  </EmptyState>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
function Suggestions({
  actions,
  setActions,
  notify,
}: {
  actions: ActionItem[];
  setActions: (a: ActionItem[]) => void;
  notify: (s: string) => void;
}) {
  const { data, loading, error, refresh } = useSellerData();
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState("");
  const [addError, setAddError] = useState("");
  const navigate = useNavigate();
  const m = (key: string) => data?.metrics.find((x) => x.key === key);
  const stock = m("outOfStockProducts"),
    cancel = m("cancellationRate"),
    orders = m("orders");
  const choices = [
    {
      key: "restock" as const,
      title: "Review unavailable products",
      reason: stock
        ? stock.current +
          " products are unavailable, compared with " +
          stock.previous +
          ". Product-level demand is needed to prioritise restocking."
        : "",
      question: "Which unavailable products normally drive the most orders?",
    },
    {
      key: "cancellations" as const,
      title: "Trace cancellation reasons",
      reason: cancel
        ? "The cancellation rate changed from " +
          cancel.previous +
          "% to " +
          cancel.current +
          "%. Separate stock, dispatch and customer-side reasons."
        : "",
      question: "What do the cancellation reason codes show?",
    },
    {
      key: "visibility" as const,
      title: "Check traffic and conversion",
      reason: orders
        ? "Orders changed from " +
          orders.previous +
          " to " +
          orders.current +
          ". Traffic and conversion were not supplied, so their contribution is unknown."
        : "",
      question: "Have impressions, product views or conversion changed?",
    },
  ];
  const add = async (key: ActionItem["key"]) => {
    setAdding(key);
    setAddError("");
    try {
      const r = await api.addAction(key);
      setActions(r.actions);
      notify("Suggestion added to your plan.");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add suggestion.");
    } finally {
      setAdding("");
    }
  };
  return (
    <div className="suggestions">
      <div className="section-title">
        <div>
          <h2>Questions worth investigating</h2>
          <p>
            Choose a useful next step. These signals do not establish a root
            cause.
          </p>
        </div>
      </div>
      {error && <Notice onRetry={() => void refresh()}>{error}</Notice>}
      {addError && <Notice>{addError}</Notice>}
      {loading && !data && <p role="status">Loading evidence…</p>}
      {data && !error && (
        <div className="suggestion-list">
          {choices.map((r) => (
            <article className="suggestion-row" key={r.key}>
              <div>
                <h3>{r.title}</h3>
                <p>{r.reason}</p>
                <p className="investigation-question">{r.question}</p>
              </div>
              <Button
                variant="secondary"
                disabled={
                  adding === r.key || actions.some((a) => a.key === r.key)
                }
                onClick={() => void add(r.key)}
              >
                {adding === r.key ? (
                  "Adding…"
                ) : actions.some((a) => a.key === r.key) ? (
                  <>
                    <Check size={15} />
                    In your plan
                  </>
                ) : (
                  <>
                    <Plus size={15} />
                    Add to plan
                  </>
                )}
              </Button>
            </article>
          ))}
        </div>
      )}
      <form
        className="context-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) navigate("/kam", { state: { prompt: note.trim() } });
        }}
      >
        <label htmlFor="growth-feedback">
          What growth problem should Nova understand better?
        </label>
        <p>Pass your context directly into a conversation.</p>
        <div>
          <textarea
            id="growth-feedback"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1200}
            placeholder="For example, dispatch capacity or seasonal demand…"
            rows={2}
          />
          <Button disabled={!note.trim()} type="submit">
            Share in conversation
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </div>
  );
}
