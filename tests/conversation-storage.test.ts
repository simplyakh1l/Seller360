import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
afterEach(() => vi.unstubAllEnvs());
it("persists a completed transcript exactly once per message and reloads it with owner isolation", async () => {
  vi.stubEnv("LLM_PROVIDER", "demo");
  const { startSession, processTurn, endSession } =
    await import("../server/src/services/agent");
  const owner = "storage-" + crypto.randomUUID();
  const start = await startSession(owner, "en-IN");
  const phrase = "Explain my cancellation rate.";
  await processTurn(owner, start.session.id, phrase);
  const ended = await endSession(owner, start.session.id);
  const disk = JSON.parse(
    await readFile(
      join(process.env.SELLER360_DATA_DIR!, "conversations.json"),
      "utf8",
    ),
  );
  expect(
    disk.find((r: { owner: string }) => r.owner === owner).session,
  ).toMatchObject({
    id: start.session.id,
    stage: "ended",
    summary: expect.any(Object),
  });
  expect(
    ended.session.messages.filter((m) => m.content === phrase),
  ).toHaveLength(1);
  vi.resetModules();
  const restored = await import("../server/src/services/store");
  await restored.loadSessions();
  expect(restored.getHistory(owner)[0]).toEqual(ended.session);
  expect(restored.getHistory("other-" + owner)).toEqual([]);
  expect(restored.getSession("other-" + owner, start.session.id)).toBeNull();
});
