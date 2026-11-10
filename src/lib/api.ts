import type {
  ActionItem,
  AgentResponse,
  Health,
  PerformanceResponse,
  Insight,
  AgentSession,
} from "../../shared/types";
const sessionKey = "seller360.demo-session";
function getOwner() {
  let id = localStorage.getItem(sessionKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(sessionKey, id);
  }
  return id;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-demo-session": getOwner(),
      ...init?.headers,
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error("The service returned an invalid response.");
  }
  if (!res.ok) throw new Error(body.error || "Request failed.");
  return body;
}
export const api = {
  health: () => request<Health>("/api/health"),
  performance: () => request<PerformanceResponse>("/api/seller/performance"),
  insights: () => request<{ insights: Insight[] }>("/api/seller/insights"),
  actions: () => request<{ actions: ActionItem[] }>("/api/actions"),
  history: () => request<{ sessions: AgentSession[] }>("/api/agent/history"),
  start: (language: "en-IN" | "hi-IN", signal?: AbortSignal) =>
    request<AgentResponse>("/api/agent/start", {
      method: "POST",
      body: JSON.stringify({ language }),
      signal,
    }),
  turn: (sessionId: string, message: string, signal?: AbortSignal) =>
    request<AgentResponse>("/api/agent/turn", {
      method: "POST",
      body: JSON.stringify({ sessionId, message }),
      signal,
    }),
  end: (sessionId: string) =>
    request<AgentResponse>("/api/agent/end", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  addAction: (key: ActionItem["key"]) =>
    request<{ actions: ActionItem[] }>("/api/actions", {
      method: "POST",
      body: JSON.stringify({ key }),
    }),
  updateAction: (id: string, status: ActionItem["status"]) =>
    request<{ actions: ActionItem[] }>(
      "/api/actions/" + encodeURIComponent(id),
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
};
