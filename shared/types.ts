export type MetricKey =
  | "sales"
  | "orders"
  | "cancellationRate"
  | "averageSellingPrice"
  | "outOfStockProducts";
export type MonthlyMetrics = Record<MetricKey, number>;
export interface SellerData {
  seller: { id: string; name: string; marketplace: string; currency: string };
  performance: { lastMonth: MonthlyMetrics; thisMonth: MonthlyMetrics };
}
export interface Metric {
  key: MetricKey;
  label: string;
  previous: number;
  current: number;
  change: number | null;
  unit: "currency" | "count" | "percent";
  changeUnit: "%" | "pp";
  signal: "risk" | "stable" | "positive";
}
export interface Insight {
  id: string;
  title: string;
  evidence: string;
  severity: "high" | "medium" | "low";
  evidenceLevel: "observed" | "hypothesis" | "seller-reported";
  explanation: string;
  informationNeeded: string | null;
}
export interface PerformanceResponse {
  data: SellerData;
  metrics: Metric[];
  insights: Insight[];
  analyzedAt: string;
}
export type Topic =
  "inventory" | "dispatch" | "cancellations" | "visibility" | "pricing";
export interface SellerStatement {
  topic: Topic;
  status: "reported" | "denied" | "unknown";
  statement: string;
  timestamp: string;
}
export type ActionKey =
  "restock" | "dispatch" | "cancellations" | "visibility" | "pricing";
export interface ActionItem {
  id: string;
  key: ActionKey;
  title: string;
  priority: "High" | "Medium";
  problem: string;
  description: string;
  supportingInsight: string;
  impact: string;
  owner: string;
  timeframe: string;
  status: "suggested" | "started" | "completed";
  createdAt: string;
}
export interface Activity {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  kind: "data" | "analysis" | "context" | "plan" | "commit" | "system";
}
export interface Message {
  id: string;
  role: "assistant" | "seller";
  content: string;
  timestamp: string;
}
export type Stage =
  "greeting" | "discovery" | "recommendations" | "commitment" | "ended";
export type AgentProvider = "demo" | "gemini" | "openai" | "ollama";
export interface SessionSummary {
  concern: string;
  metrics: string[];
  issues: string[];
  sellerInformation: SellerStatement[];
  likelyContributors: string[];
  recommendations: ActionItem[];
  commitments: string[];
  outstanding: string[];
}
export interface AgentSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  stage: Stage;
  messages: Message[];
  statements: SellerStatement[];
  askedTopics: Topic[];
  concern: string;
  diagnosis: {
    primaryIssue: string;
    supportingSignals: Insight[];
    unresolvedQuestions: string[];
  };
  recommendedActions: ActionItem[];
  committedKeys: ActionKey[];
  activity: Activity[];
  summary: SessionSummary | null;
  mode: AgentProvider;
  model: string | null;
  fallbackReason: string | null;
  language: "en-IN" | "hi-IN";
  awaitingPlanConfirmation?: boolean;
}
export interface AgentResponse {
  session: AgentSession;
  assistantMessage: string;
  actions: ActionItem[];
}
export interface Health {
  status: string;
  provider: AgentProvider;
  model: string | null;
  configured: boolean;
  demoData: boolean;
  ready?: boolean;
  detail?: string;
}
