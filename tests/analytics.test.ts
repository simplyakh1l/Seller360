import { describe, expect, it } from "vitest";
import {
  analyzeSellerPerformance,
  calculatePerformanceChanges,
  getBusinessInsights,
  percentageChange,
} from "../server/src/services/analytics";
import { generateRecoveryRecommendations } from "../server/src/services/recommendations";
import type { SellerStatement } from "../shared/types";

describe("Seller360 business analysis", () => {
  it("derives the supplied month-over-month changes from the dataset", () => {
    const result = analyzeSellerPerformance();
    expect(result.metrics.map(({ key, change }) => [key, change])).toEqual([
      ["sales", -32.5],
      ["orders", -32.5],
      ["cancellationRate", 6],
      ["averageSellingPrice", 0],
      ["outOfStockProducts", 260],
    ]);
  });

  it("reports absolute rate changes in percentage points and keeps stable pricing stable", () => {
    const metrics = calculatePerformanceChanges(
      {
        sales: 200,
        orders: 4,
        cancellationRate: 8,
        averageSellingPrice: 50,
        outOfStockProducts: 0,
      },
      {
        sales: 100,
        orders: 2,
        cancellationRate: 14,
        averageSellingPrice: 50,
        outOfStockProducts: 3,
      },
    );
    expect(
      metrics.find((item) => item.key === "cancellationRate"),
    ).toMatchObject({ change: 6, changeUnit: "pp", signal: "risk" });
    expect(
      metrics.find((item) => item.key === "averageSellingPrice"),
    ).toMatchObject({ change: 0, signal: "stable" });
    expect(
      metrics.find((item) => item.key === "outOfStockProducts"),
    ).toMatchObject({ change: null, signal: "risk" });
    expect(percentageChange(0, 3)).toBeNull();
    expect(percentageChange(0, 0)).toBe(0);
  });

  it("labels observed risks without making unsupported causal claims", () => {
    const findings = getBusinessInsights();
    expect(findings.filter((item) => item.severity === "high")).toHaveLength(3);
    expect(findings.every((item) => item.evidenceLevel === "observed")).toBe(
      true,
    );
    expect(
      findings.find((item) => item.id === "inventory")?.informationNeeded,
    ).toContain("high-demand");
  });

  it("prioritises seller-reported dispatch problems and does not recommend blanket discounts", () => {
    const statements: SellerStatement[] = [
      {
        topic: "dispatch",
        status: "reported",
        statement: "We have some delayed dispatches.",
        timestamp: new Date(0).toISOString(),
      },
      {
        topic: "inventory",
        status: "reported",
        statement: "My best-selling products are out of stock.",
        timestamp: new Date(0).toISOString(),
      },
    ];
    const actions = generateRecoveryRecommendations(statements);
    expect(actions).toHaveLength(3);
    expect(actions.map((item) => item.key)).toEqual([
      "dispatch",
      "restock",
      "visibility",
    ]);
    expect(actions.some((item) => item.key === "pricing")).toBe(false);
    expect(actions[1].supportingInsight).toContain(
      "Seller also reports stock shortages.",
    );
  });
});
