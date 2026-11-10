import sellerData from "../data/sellerData.json";
import type {
  SellerData,
  Insight,
  Metric,
  MonthlyMetrics,
  PerformanceResponse,
} from "../../../shared/types";
export function getSellerPerformance(): SellerData {
  return structuredClone(sellerData);
}
export const percentageChange = (
  previous: number,
  current: number,
): number | null =>
  previous === 0
    ? current === 0
      ? 0
      : null
    : ((current - previous) / previous) * 100;
export function calculatePerformanceChanges(
  previous: MonthlyMetrics,
  current: MonthlyMetrics,
): Metric[] {
  return (
    [
      ["sales", "Total sales", "currency"],
      ["orders", "Total orders", "count"],
      ["cancellationRate", "Cancellation rate", "percent"],
      ["averageSellingPrice", "Avg. selling price", "currency"],
      ["outOfStockProducts", "Out of stock", "count"],
    ] as const
  ).map(([key, label, unit]) => {
    const change =
      key === "cancellationRate"
        ? current[key] - previous[key]
        : percentageChange(previous[key], current[key]);
    const bad =
      key === "cancellationRate" || key === "outOfStockProducts"
        ? (change ?? 0) > 0
        : (change ?? 0) < 0;
    const signal: Metric["signal"] =
      change === 0
        ? "stable"
        : change === null
          ? current[key] > previous[key]
            ? key === "cancellationRate" || key === "outOfStockProducts"
              ? "risk"
              : "positive"
            : "stable"
          : bad
            ? "risk"
            : "positive";
    return {
      key,
      label,
      unit,
      previous: previous[key],
      current: current[key],
      change,
      changeUnit: key === "cancellationRate" ? "pp" : "%",
      signal,
    };
  });
}
export function getBusinessInsights(data = getSellerPerformance()): Insight[] {
  const p = data.performance.lastMonth,
    c = data.performance.thisMonth;
  return [
    {
      id: "orders",
      title: "Fewer orders, lower sales",
      evidence: `Orders: ${p.orders} → ${c.orders} (${percentageChange(p.orders, c.orders)?.toFixed(1)}%).`,
      severity: "high",
      evidenceLevel: "observed",
      explanation:
        "Order volume and revenue fell together. This is an observed relationship, not a confirmed root cause.",
      informationNeeded:
        "Traffic, conversion and product-level orders are not supplied.",
    },
    {
      id: "inventory",
      title: "Inventory needs your attention",
      evidence: `Out-of-stock products: ${p.outOfStockProducts} → ${c.outOfStockProducts}.`,
      severity: "high",
      evidenceLevel: "observed",
      explanation:
        "Availability may be contributing to fewer orders. The dataset does not identify affected products or their demand.",
      informationNeeded: "Which unavailable products are high-demand sellers?",
    },
    {
      id: "cancellations",
      title: "Cancellations are rising",
      evidence: `Cancellation rate: ${p.cancellationRate}% → ${c.cancellationRate}% (+${c.cancellationRate - p.cancellationRate} pp).`,
      severity: "high",
      evidenceLevel: "observed",
      explanation:
        "Stock availability, dispatch delays or customer-side reasons need investigation before assigning a cause.",
      informationNeeded: "Cancellation reason codes and dispatch timings.",
    },
    {
      id: "pricing",
      title: "Pricing remains stable",
      evidence: `Average selling price: ₹${p.averageSellingPrice} → ₹${c.averageSellingPrice}.`,
      severity: "low",
      evidenceLevel: "observed",
      explanation:
        "Stable aggregate ASP gives no evidence that a price cut is needed. Product mix and competitor prices are unknown.",
      informationNeeded: null,
    },
  ];
}
export function diagnoseSalesDecline() {
  return {
    primaryIssue:
      "Declining order volume with inventory and cancellation risks",
    supportingSignals: getBusinessInsights(),
    unresolvedQuestions: [
      "Are cancellations seller-side or customer-side?",
      "Are high-demand products unavailable?",
      "Have impressions or conversion changed?",
    ],
  };
}
export function analyzeSellerPerformance(): PerformanceResponse {
  const data = getSellerPerformance();
  return {
    data,
    metrics: calculatePerformanceChanges(
      data.performance.lastMonth,
      data.performance.thisMonth,
    ),
    insights: getBusinessInsights(data),
    analyzedAt: new Date().toISOString(),
  };
}
