import { beforeEach, describe, expect, it, vi } from "vitest";
const blobs = vi.hoisted(() => {
  const rows = new Map<string, { data: unknown; etag: string }>();
  let revision = 0;
  return {
    rows,
    get: vi.fn(async (key: string) =>
      structuredClone(rows.get(key)?.data ?? null),
    ),
    getWithMetadata: vi.fn(async (key: string) =>
      structuredClone(rows.get(key) ?? null),
    ),
    setJSON: vi.fn(
      async (
        key: string,
        data: unknown,
        options: { onlyIfMatch?: string; onlyIfNew?: boolean } = {},
      ) => {
        const previous = rows.get(key);
        if (
          (options.onlyIfNew && previous) ||
          (options.onlyIfMatch && previous?.etag !== options.onlyIfMatch)
        )
          return { modified: false };
        const etag = String(++revision);
        rows.set(key, { data: structuredClone(data), etag });
        return { modified: true, etag };
      },
    ),
  };
});
vi.mock("@netlify/blobs", () => ({ getStore: () => blobs }));
import {
  withCloudWorkspace,
  claimCloudUsage,
} from "../server/src/services/cloudStore";
import {
  createActionPlan,
  getActions,
  storeSession,
  getHistory,
} from "../server/src/services/store";
import { startSession, endSession } from "../server/src/services/agent";
beforeEach(() => {
  blobs.rows.clear();
  vi.stubEnv("LLM_PROVIDER", "demo");
  vi.stubEnv("SELLER360_HOSTED", "0");
});
describe("Persistent hosted workspace", () => {
  it("restores tasks and calls in a fresh request without leaking another owner", async () => {
    const owner = crypto.randomUUID();
    await withCloudWorkspace(owner, async () => {
      await createActionPlan(owner, ["restock"]);
      const start = await startSession(owner, "en-IN");
      await endSession(owner, start.session.id);
    });
    await withCloudWorkspace(owner, async () => {
      expect(getActions(owner)).toHaveLength(1);
      expect(getHistory(owner)[0].endedAt).toBeTruthy();
    });
    await withCloudWorkspace(crypto.randomUUID(), async () => {
      expect(getActions(owner)).toHaveLength(0);
    });
  });
  it("does not resurrect a call ended by another function instance", async () => {
    const owner = crypto.randomUUID();
    let stale: any;
    await withCloudWorkspace(owner, async () => {
      stale = (await startSession(owner, "en-IN")).session;
    });
    await withCloudWorkspace(owner, async () => {
      await endSession(owner, stale.id);
    });
    await withCloudWorkspace(owner, async () => {
      await expect(storeSession(owner, stale)).rejects.toMatchObject({
        name: "AbortError",
      });
    });
  });
  it("enforces the durable hourly AI allowance", async () => {
    vi.stubEnv("AI_REQUESTS_PER_HOUR", "1");
    const owner = crypto.randomUUID();
    await claimCloudUsage(owner);
    await expect(claimCloudUsage(owner)).rejects.toMatchObject({ status: 429 });
  });
});
