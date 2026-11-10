import type {
  ActionItem,
  ActionKey,
  SellerStatement,
} from "../../../shared/types";
const definitions: Record<
  ActionKey,
  Omit<ActionItem, "id" | "key" | "status" | "createdAt">
> = {
  restock: {
    title: "Restock your high-demand products",
    priority: "High",
    problem: "Inventory availability risk",
    description:
      "Identify the high-demand items among the 18 unavailable products. Confirm supplier lead times, restore stock, and review stock sync daily.",
    supportingInsight:
      "Out-of-stock products increased from 5 to 18. Product-level demand is not available yet.",
    impact: "Improve product availability and reduce avoidable lost orders.",
    owner: "Inventory owner",
    timeframe: "Today",
  },
  dispatch: {
    title: "Resolve dispatch delays",
    priority: "High",
    problem: "Seller-reported fulfilment delays",
    description:
      "Review pending orders and missed dispatch deadlines. Assign a daily packing and pickup checkpoint, then check cancellation reason codes.",
    supportingInsight:
      "Seller reports dispatch delays. Cancellation rate increased from 8% to 14%; attribution is not established.",
    impact: "Reduce preventable fulfilment-related cancellations.",
    owner: "Fulfilment owner",
    timeframe: "Within 48 hours",
  },
  cancellations: {
    title: "Audit cancellation reasons",
    priority: "High",
    problem: "Increased cancellation rate",
    description:
      "Export cancellation reason codes. Separate seller-side, customer-side, stock and dispatch issues; address the largest verified group first.",
    supportingInsight:
      "Cancellation rate rose from 8% to 14%, an increase of 6 percentage points.",
    impact: "Identify and address the actual source of cancellations.",
    owner: "Operations owner",
    timeframe: "Within 48 hours",
  },
  visibility: {
    title: "Review product visibility",
    priority: "Medium",
    problem: "Traffic and conversion are unknown",
    description:
      "Compare impressions, product views and conversion for the same two periods. Review listings only where evidence shows a decline.",
    supportingInsight:
      "Orders fell from 400 to 270 with unchanged ASP. Traffic and conversion data have not been supplied.",
    impact: "Determine whether discovery or conversion needs attention.",
    owner: "Catalogue owner",
    timeframe: "This week",
  },
  pricing: {
    title: "Benchmark comparable product prices",
    priority: "Medium",
    problem: "Competitor changes reported; pricing evidence incomplete",
    description:
      "Compare like-for-like products, delivery fees and offers before testing any price change. Do not apply a blanket discount.",
    supportingInsight:
      "ASP is stable at ₹500. Competitor information is seller-reported and requires verification.",
    impact: "Make evidence-based pricing decisions while protecting margin.",
    owner: "Commercial owner",
    timeframe: "This week",
  },
};
export function actionForKey(key: ActionKey): ActionItem {
  return {
    id: `action-${key}`,
    key,
    ...definitions[key],
    status: "suggested",
    createdAt: new Date().toISOString(),
  };
}
export function generateRecoveryRecommendations(
  statements: SellerStatement[],
): ActionItem[] {
  const reported = (topic: string) =>
    statements.some((s) => s.topic === topic && s.status === "reported");
  const denied = (topic: string) =>
    statements.some((s) => s.topic === topic && s.status === "denied");
  const keys: ActionKey[] = [];
  if (reported("dispatch")) keys.push("dispatch");
  if (!denied("inventory")) keys.push("restock");
  if (keys.length < 2) keys.push("cancellations");
  if (reported("pricing")) keys.push("pricing");
  else keys.push("visibility");
  return [...new Set(keys)].slice(0, 3).map((key) => {
    const action = actionForKey(key);
    if (key === "restock" && reported("inventory"))
      action.supportingInsight += " Seller also reports stock shortages.";
    return action;
  });
}
export const generateRecoveryPlan = generateRecoveryRecommendations;
