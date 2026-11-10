import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, AudioLines, RefreshCw } from "lucide-react";
import type { Metric } from "../../shared/types";
import { Button } from "../components/UI";
import {
  PageHeading,
  Notice,
  fmtCurrency,
  shortDate,
} from "../components/Workspace";
import { useSellerData } from "../hooks/useSellerData";
const format = (m: Metric, n: number) =>
  m.unit === "currency"
    ? fmtCurrency(n)
    : n.toLocaleString("en-IN") + (m.unit === "percent" ? "%" : "");
const delta = (m: Metric) =>
  m.change === null
    ? "No baseline"
    : m.change === 0
      ? "No change"
      : (m.change > 0 ? "+" : "") +
        Number(m.change.toFixed(1)) +
        (m.changeUnit === "pp" ? " pp" : "%");
export default function Dashboard() {
  const { data, loading, error, refresh } = useSellerData();
  const location = useLocation();
  useEffect(() => {
    if (data && location.hash)
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [data, location.hash]);
  const sales = data?.metrics.find((m) => m.key === "sales");
  const orders = data?.metrics.find((m) => m.key === "orders");
  const asp = data?.metrics.find((m) => m.key === "averageSellingPrice");
  const amount = sales ? sales.current - sales.previous : 0;
  return (
    <div className="page-stack dashboard">
      <PageHeading
        eyebrow="Monthly account review"
        title="A clear view of your business"
        subtitle="Compare the two supplied periods and decide what needs attention."
        action={
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            {loading ? "Checking…" : "Recheck figures"}
          </Button>
        }
      />
      {error && (
        <Notice onRetry={() => void refresh()}>
          {error}
          {data ? " Showing the last successful comparison." : ""}
        </Notice>
      )}
      {!data && loading && (
        <div className="loading-state" role="status">
          Loading account figures…
        </div>
      )}
      {data && sales && (
        <>
          <section className="sales-review" aria-labelledby="sales-heading">
            <div className="sales-story">
              <span className="section-label">Sales comparison</span>
              <h2 id="sales-heading">
                {amount === 0
                  ? "Sales held steady"
                  : amount < 0
                    ? "Sales fell by"
                    : "Sales grew by"}
                {amount !== 0 && (
                  <strong>{fmtCurrency(Math.abs(amount))}</strong>
                )}
              </h2>
              <p>
                <span className={"change-label " + sales.signal}>
                  {delta(sales)}
                </span>{" "}
                compared with the previous period
              </p>
              {orders && asp && (
                <div className="sales-arithmetic">
                  <div>
                    <span>Orders</span>
                    <b>
                      {orders.previous.toLocaleString("en-IN")}{" "}
                      <span aria-label="to">→</span>{" "}
                      {orders.current.toLocaleString("en-IN")}
                    </b>
                  </div>
                  <div>
                    <span>Average selling price</span>
                    <b>
                      {asp.previous === asp.current
                        ? fmtCurrency(asp.current) + " unchanged"
                        : fmtCurrency(asp.previous) +
                          " → " +
                          fmtCurrency(asp.current)}
                    </b>
                  </div>
                </div>
              )}
              <p className="figure-note">
                Orders × average selling price explains the totals. It does not
                establish why demand changed.
              </p>
            </div>
            <div className="sales-plot">
              <dl aria-label="Sales: previous versus current period">
                {[
                  { label: "Previous period", value: sales.previous },
                  { label: "Current period", value: sales.current },
                ].map((row, i) => (
                  <div className="sales-period" key={row.label}>
                    <div>
                      <dt>{row.label}</dt>
                      <dd>{fmtCurrency(row.value)}</dd>
                    </div>
                    <div className="sales-track" aria-hidden="true">
                      <span
                        className={i ? "current" : "previous"}
                        style={{
                          width:
                            (row.value /
                              Math.max(sales.previous, sales.current, 1)) *
                              100 +
                            "%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
              <span className="plot-caption">Monthly totals · INR</span>
            </div>
          </section>
          <section
            id="performance"
            className="performance-section"
            aria-labelledby="performance-heading"
          >
            <div className="section-title">
              <div>
                <h2 id="performance-heading">The operating picture</h2>
                <p>What changed, and what to investigate next.</p>
              </div>
              <span className="small-label">Previous → current</span>
            </div>
            <div
              className="evidence-table"
              role="table"
              aria-label="Account performance comparison"
            >
              <div className="evidence-head" role="row">
                <span role="columnheader">Metric</span>
                <span role="columnheader">Previous</span>
                <span role="columnheader">Current</span>
                <span role="columnheader">Change</span>
                <span role="columnheader">What it tells us</span>
              </div>
              {data.metrics.map((m) => {
                const insight = data.insights.find(
                  (i) =>
                    i.id ===
                    {
                      sales: "orders",
                      orders: "orders",
                      cancellationRate: "cancellations",
                      averageSellingPrice: "pricing",
                      outOfStockProducts: "inventory",
                    }[m.key],
                );
                return (
                  <div className="evidence-row" role="row" key={m.key}>
                    <span className="metric-name" role="rowheader">
                      {m.label}
                    </span>
                    <span role="cell" className="metric-previous">
                      <small>Previous</small>
                      {format(m, m.previous)}
                    </span>
                    <span role="cell" className="metric-current">
                      <small>Current</small>
                      {format(m, m.current)}
                    </span>
                    <span role="cell" className={"metric-change " + m.signal}>
                      {delta(m)}
                    </span>
                    <span role="cell" className="metric-context">
                      {m.key === "sales"
                        ? "Revenue reflects the change in orders and average selling price."
                        : m.key === "orders"
                          ? "Check traffic and conversion before assigning a cause."
                          : (insight?.informationNeeded ??
                            insight?.explanation ??
                            "More information is needed.")}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="figure-note">
              Percentage points (pp) compare cancellation rates. Changes
              describe observed results, not confirmed causes.
            </p>
          </section>
          <section className="nova-handoff">
            <span className="nova-handoff-icon">
              <AudioLines size={26} />
            </span>
            <div>
              <h2>Make sense of the change with Nova</h2>
              <p>
                Bring the context behind your numbers. Leave with a practical
                next step.
              </p>
            </div>
            <Link className="btn btn-primary" to="/kam">
              Get help from Nova <ArrowUpRight size={16} />
            </Link>
          </section>
          <div className="review-foot">
            <span>
              Comparison calculated {shortDate(data.analyzedAt)}. Source periods
              are undated.
            </span>
            <Link to="/actions?view=suggestions">
              Review suggested actions <ArrowUpRight size={14} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
