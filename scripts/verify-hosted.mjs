import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.SELLER360_QA_URL;
if (base !== "https://seller360-akhil.netlify.app")
  throw Error("Set SELLER360_QA_URL to the approved Seller360 deployment.");
const owner = crypto.randomUUID();
const headers = {
  "content-type": "application/json",
  "x-demo-session": owner,
  Origin: base,
};
const checks = [];
async function call(path, method = "GET", body) {
  const begin = Date.now();
  const response = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(35000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(path + " " + response.status + " " + JSON.stringify(data));
  checks.push({ path, status: response.status, ms: Date.now() - begin });
  return data;
}
try {
  const health = await call("/api/health");
  if (health.provider !== "gemini" || !health.configured)
    throw Error("Cloud provider is not ready");
  await call("/api/seller/performance");
  const opening = await call("/api/agent/start", "POST", { language: "en-IN" });
  if (opening.session.mode !== "gemini")
    throw Error("Unexpected conversation provider");
  const turn = await call("/api/agent/turn", "POST", {
    sessionId: opening.session.id,
    message:
      "Explain the sales drop. Do not claim a proven cause from aggregate data.",
  });
  await call("/api/agent/end", "POST", { sessionId: opening.session.id });
  const history = await call("/api/agent/history");
  if (
    !history.sessions.some(
      (session) => session.id === opening.session.id && session.endedAt,
    )
  )
    throw Error("Saved call did not persist");
  const plan = await call("/api/actions", "POST", { key: "visibility" });
  const id = plan.actions.find((action) => action.key === "visibility").id;
  await call("/api/actions/" + id, "PATCH", { status: "completed" });
  const tasks = await call("/api/actions");
  if (
    !tasks.actions.some(
      (action) => action.id === id && action.status === "completed",
    )
  )
    throw Error("Task update did not persist");
  const isolated = await fetch(base + "/api/agent/history", {
    headers: { ...headers, "x-demo-session": crypto.randomUUID() },
  }).then((response) => response.json());
  if (isolated.sessions.length) throw Error("Workspace isolation failed");
  const result = {
    verifiedAt: new Date().toISOString(),
    health,
    checks,
    reply: turn.assistantMessage,
    persistedCalls: true,
    persistedTasks: true,
    isolated: true,
  };
  mkdirSync("test-results/deploy", { recursive: true });
  writeFileSync(
    "test-results/deploy/live-smoke.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, checks }));
  process.exitCode = 1;
}
