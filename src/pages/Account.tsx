import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { Health } from "../../shared/types";
import { useSellerData } from "../hooks/useSellerData";
import { Button } from "../components/UI";
import { PageHeading, Notice } from "../components/Workspace";
export function Profile() {
  const { data, loading, error, refresh } = useSellerData();
  return (
    <div className="page-stack account-page">
      <PageHeading
        title="Seller account"
        subtitle="Account details for this workspace."
      />
      {error && <Notice onRetry={() => void refresh()}>{error}</Notice>}
      {loading && !data && <p role="status">Loading account…</p>}
      {data && (
        <section className="account-section">
          <h2>Workspace details</h2>
          <dl className="settings-list">
            <div>
              <dt>Seller name</dt>
              <dd>{data.data.seller.name}</dd>
            </div>
            <div>
              <dt>Seller identifier</dt>
              <dd>{data.data.seller.id}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{data.data.seller.currency}</dd>
            </div>
          </dl>
        </section>
      )}
      <Link className="text-action" to="/settings">
        Data & privacy →
      </Link>
    </div>
  );
}
export function DataPrivacy({
  health,
  error,
  refresh,
}: {
  health: Health | null;
  error: string;
  refresh: () => void;
}) {
  return (
    <div className="page-stack account-page">
      <Link className="back-link" to="/profile">
        <ArrowLeft size={15} />
        Seller account
      </Link>
      <PageHeading
        title="Data & privacy"
        subtitle="Understand the source of your figures and how conversations are handled."
      />
      <section className="account-section">
        <h2>Account data</h2>
        <p className="source-disclosure">
          <b>Sample data.</b> This independent Seller360 project uses a fixed
          illustrative seller account with two undated monthly totals. It has no
          connection to a live Snapdeal marketplace account. Figures and
          suggestions use those totals, which cannot establish business causes.
          Review Nova’s replies against your own records.
        </p>
        <dl className="settings-list">
          <div>
            <dt>Available detail</dt>
            <dd>
              Sales, orders, cancellation rate, average selling price and
              unavailable-product count.
            </dd>
          </div>
          <div>
            <dt>Not supplied</dt>
            <dd>
              Daily transactions, calendar periods, individual products,
              traffic, conversion and cancellation reasons.
            </dd>
          </div>
          <div>
            <dt>Data freshness</dt>
            <dd>
              No source timestamp is supplied. Rechecking figures recalculates
              the comparison; it does not sync a marketplace account.
            </dd>
          </div>
        </dl>
      </section>
      <section className="account-section">
        <div className="section-title">
          <h2>Nova availability</h2>
          <Button variant="secondary" onClick={refresh}>
            <RefreshCw size={15} />
            Check status
          </Button>
        </div>
        {error && <Notice onRetry={refresh}>{error}</Notice>}
        <div
          className={
            "runtime-status " + (health?.ready ? "ready" : "unavailable")
          }
        >
          <span aria-hidden="true" />
          {!health
            ? "Checking availability…"
            : health.ready
              ? "Language model ready"
              : health.provider === "demo"
                ? "Limited responses available"
                : "Language model unavailable"}
        </div>
        <p>{health?.detail}</p>
        <dl className="settings-list">
          <div>
            <dt>Reasoning</dt>
            <dd>
              {health?.provider === "ollama"
                ? "Local Ollama"
                : health?.provider === "demo"
                  ? "Rules-only fallback"
                  : (health?.provider ?? "Not yet checked")}
              {health?.model ? " · " + health.model : ""}
            </dd>
          </div>
          <div>
            <dt>Speech recognition</dt>
            <dd>
              Browser recognition is tried first and may use the browser
              vendor’s service. If it fails, Whisper can transcribe on this
              device after a model download.
            </dd>
          </div>
          <div>
            <dt>Spoken replies</dt>
            <dd>
              Installed browser voices, with English and Hindi available. Voice
              availability depends on this device.
            </dd>
          </div>
        </dl>
      </section>
      <section className="account-section">
        <h2>Conversation storage</h2>
        <p>
          Transcript text is sent to the application server and saved during the
          conversation. After the call, you can read it in Saved calls. The
          configured reasoning provider receives the conversation and account
          figures to answer your questions.
        </p>
        <dl className="settings-list">
          <div>
            <dt>Application storage</dt>
            <dd>
              Hosted workspaces use Netlify’s persistent storage. Local runs use
              files on the server. Conversations older than 30 days are pruned
              when a session is saved; hosted workspaces retain up to 30 calls.
            </dd>
          </div>
          <div>
            <dt>This browser</dt>
            <dd>
              A separate cache retains up to 20 completed calls. Clearing
              browser storage removes that cache and the browser’s workspace
              identifier.
            </dd>
          </div>
          <div>
            <dt>Actions</dt>
            <dd>
              Task status records work in this application. Completing a task
              does not change marketplace inventory, listings or orders.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
