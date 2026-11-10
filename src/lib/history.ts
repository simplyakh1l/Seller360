import type { AgentSession } from "../../shared/types";
export function loadHistory() {
  try {
    const rows: unknown = JSON.parse(
      localStorage.getItem("seller360.history") || "[]",
    );
    return Array.isArray(rows) ? (rows as AgentSession[]) : [];
  } catch {
    return [];
  }
}
export function saveHistory(s: AgentSession) {
  const rest = loadHistory().filter((x) => x.id !== s.id);
  rest.unshift(s);
  try {
    localStorage.setItem(
      "seller360.history",
      JSON.stringify(rest.slice(0, 20)),
    );
    return true;
  } catch {
    return false;
  }
}
