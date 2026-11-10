import { cloudScope, saveCloudActions, saveCloudSession } from "./cloudStore";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  ActionItem,
  ActionKey,
  AgentSession,
} from "../../../shared/types";
import { actionForKey } from "./recommendations";
const path = resolve(
  process.env.SELLER360_DATA_DIR || "server/.local",
  "actions.json",
);
const byClient = new Map<string, ActionItem[]>();
const sessions = new Map<string, { owner: string; session: AgentSession }>();
let writeQueue = Promise.resolve();
const sessionsPath = resolve(dirname(path), "conversations.json");
let sessionWriteQueue = Promise.resolve();
export async function loadSessions() {
  try {
    const rows = JSON.parse(await readFile(sessionsPath, "utf8"));
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (
        typeof row.owner === "string" &&
        row.session?.id &&
        Array.isArray(row.session.messages)
      )
        sessions.set(row.session.id, row);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("Saved conversations could not be loaded.");
  }
}
export async function loadActions() {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    for (const [key, value] of Object.entries(data))
      if (Array.isArray(value)) byClient.set(key, value as ActionItem[]);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn(
        "Local actions could not be loaded; starting an empty demo store.",
      );
  }
}
async function persist() {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path + ".tmp",
        JSON.stringify(Object.fromEntries(byClient), null, 2),
      );
      await rename(path + ".tmp", path);
    });
  await writeQueue;
}
export const getActions = (owner: string) =>
  structuredClone(cloudScope(owner)?.data.actions ?? byClient.get(owner) ?? []);
export async function createActionPlan(
  owner: string,
  keys: ActionKey[],
  recommendations: ActionItem[] = [],
) {
  const actions = getActions(owner);
  for (const key of keys)
    if (!actions.some((a) => a.key === key)) {
      const recommended = recommendations.find((a) => a.key === key);
      actions.push(
        recommended
          ? { ...structuredClone(recommended), status: "suggested" }
          : actionForKey(key),
      );
    }
  if (cloudScope(owner)) await saveCloudActions(owner, actions);
  else {
    byClient.set(owner, actions);
    await persist();
  }
  return getActions(owner);
}
export async function updateAction(
  owner: string,
  id: string,
  status: ActionItem["status"],
) {
  const actions = getActions(owner);
  const action = actions.find((a) => a.id === id);
  if (!action) return null;
  action.status = status;
  if (cloudScope(owner)) await saveCloudActions(owner, [action]);
  else {
    byClient.set(owner, actions);
    await persist();
  }
  return structuredClone(action);
}
export async function storeSession(owner: string, session: AgentSession) {
  if (cloudScope(owner)) {
    await saveCloudSession(owner, session);
    return;
  }
  sessions.set(session.id, { owner, session: structuredClone(session) });
  const cutoff = Date.now() - 30 * 24 * 3600_000;
  for (const [id, row] of sessions)
    if (new Date(row.session.startedAt).getTime() < cutoff) sessions.delete(id);
  sessionWriteQueue = sessionWriteQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(dirname(sessionsPath), { recursive: true });
      await writeFile(
        sessionsPath + ".tmp",
        JSON.stringify([...sessions.values()], null, 2),
      );
      await rename(sessionsPath + ".tmp", sessionsPath);
    });
  await sessionWriteQueue;
}
export function getSession(owner: string, id: string) {
  const cloud = cloudScope(owner);
  if (cloud) return cloud.data.sessions.find((s) => s.id === id) ?? null;
  const row = sessions.get(id);
  return row?.owner === owner ? row.session : null;
}
export function getHistory(owner: string) {
  const cloud = cloudScope(owner);
  if (cloud) return structuredClone(cloud.data.sessions).reverse();
  return [...sessions.values()]
    .filter((row) => row.owner === owner)
    .map((row) => structuredClone(row.session))
    .reverse();
}
