import { Panel } from "./UI";

/** Two observed totals need a comparison, not an animated time series. */
export default function BarChartCard({
  title,
  detail,
  last,
  current,
  unit,
  color,
  changeUnit = "%",
}: {
  title: string;
  detail: string;
  last: number;
  current: number;
  unit: "₹" | "" | "%";
  color: string;
  changeUnit?: "%" | "pp";
}) {
  const format = (value: number) =>
    (unit === "₹" ? "₹" : "") +
    value.toLocaleString("en-IN") +
    (unit === "%" ? "%" : "");
  const maximum = Math.max(last, current, 1);
  const change =
    changeUnit === "pp"
      ? current - last
      : last === 0
        ? null
        : ((current - last) / last) * 100;
  const changeText =
    change === null
      ? "No previous baseline"
      : (change > 0 ? "+" : "") + Number(change.toFixed(1)) + " " + changeUnit;
  return (
    <Panel className="chart-panel">
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
        <span className="comparison-change">{changeText}</span>
      </div>
      <dl
        className="period-comparison"
        aria-label={title + ": last month versus this month"}
      >
        {[
          { label: "Last month", value: last },
          { label: "This month", value: current },
        ].map((item, index) => (
          <div className="period-row" key={item.label}>
            <div className="period-figures">
              <dt>{item.label}</dt>
              <dd>{format(item.value)}</dd>
            </div>
            <div className="period-track" aria-hidden="true">
              <span
                style={{
                  width: (item.value / maximum) * 100 + "%",
                  background: index ? color : "#d5d6d5",
                }}
              />
            </div>
          </div>
        ))}
      </dl>
      <p className="comparison-foot">
        Supplied monthly totals · no daily trend data
      </p>
    </Panel>
  );
}
