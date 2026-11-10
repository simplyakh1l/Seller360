import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { ActionItem, AgentSession } from "../../../shared/types";
interface Workspace {
  actions: ActionItem[];
  sessions: AgentSession[];
}
interface Scope {
  owner: string;
  data: Workspace;
}
const scope = new AsyncLocalStorage<Scope>();
const keyFor = (owner: string) =>
  "workspace/" + createHash("sha256").update(owner).digest("hex");
const blobs = () =>
  getStore({ name: "seller360-workspaces", consistency: "strong" });
const empty = (): Workspace => ({ actions: [], sessions: [] });
export const cloudScope = (owner: string) => {
  const current = scope.getStore();
  return current?.owner === owner ? current : null;
};
export async function withCloudWorkspace<T>(
  owner: string,
  run: () => T,
): Promise<T> {
  const data = (await blobs().get(keyFor(owner), {
    type: "json",
  })) as Workspace | null;
  return scope.run({ owner, data: data ?? empty() }, run);
}
async function mutate(owner: string, change: (data: Workspace) => void) {
  const store = blobs();
  const key = keyFor(owner);
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await store.getWithMetadata(key, { type: "json" });
    const data = (current?.data ?? empty()) as Workspace;
    change(data);
    const result = await store.setJSON(
      key,
      data,
      current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    if (result.modified) {
      const context = cloudScope(owner);
      if (context) context.data = data;
      return;
    }
  }
  throw Object.assign(
    new Error("Your workspace changed in another request. Please retry."),
    { status: 409 },
  );
}
export async function saveCloudActions(owner: string, actions: ActionItem[]) {
  await mutate(owner, (data) => {
    for (const action of actions) {
      const index = data.actions.findIndex((a) => a.key === action.key);
      if (index < 0) data.actions.push(structuredClone(action));
      else data.actions[index] = structuredClone(action);
    }
  });
}
export async function saveCloudSession(owner: string, session: AgentSession) {
  await mutate(owner, (data) => {
    const prior = data.sessions.find((s) => s.id === session.id);
    if (prior?.endedAt && !session.endedAt)
      throw new DOMException("The call has ended.", "AbortError");
    data.sessions = data.sessions.filter(
      (s) =>
        s.id !== session.id &&
        Date.parse(s.startedAt) > Date.now() - 30 * 24 * 3600_000,
    );
    data.sessions.push(structuredClone(session));
    data.sessions = data.sessions.slice(-30);
  });
}
export async function claimCloudUsage(owner: string) {
  const store = blobs();
  const key =
    "usage/" +
    createHash("sha256").update(owner).digest("hex") +
    "/" +
    Math.floor(Date.now() / 3600_000);
  const limit = Math.min(
    100,
    Math.max(1, Number(process.env.AI_REQUESTS_PER_HOUR) || 20),
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await store.getWithMetadata(key, { type: "json" });
    const count = Number(current?.data?.count) || 0;
    if (count >= limit)
      throw Object.assign(
        new Error(
          "This workspace has reached its hourly AI allowance. Please try again later.",
        ),
        { status: 429 },
      );
    const result = await store.setJSON(
      key,
      { count: count + 1 },
      current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    if (result.modified) return;
  }
  throw Object.assign(
    new Error("Too many simultaneous requests. Please retry."),
    { status: 429 },
  );
}
