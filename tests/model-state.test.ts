import { afterEach, describe, expect, it, vi } from "vitest";
import { consent } from "../server/src/services/conversation";
import { getProviderHealth } from "../server/src/services/llm";
import {
  startSession,
  processTurn,
  endSession,
} from "../server/src/services/agent";
import { getSession } from "../server/src/services/store";
import * as store from "../server/src/services/store";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const output = (
  decision = "answer",
  actionKeys: string[] = [],
  assistantMessage = "A response chosen by the model: " + crypto.randomUUID(),
) =>
  new Response(
    JSON.stringify({
      message: {
        content: JSON.stringify({
          decision,
          actionKeys,
          askedTopic: "none",
          sellerContext: [],
          assistantMessage,
        }),
      },
    }),
  );
describe("Model availability and action state", () => {
  it("bounds local CPU concurrency and releases the model after a short idle period", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    const fetch = vi.fn().mockResolvedValue(output());
    vi.stubGlobal("fetch", fetch);
    await startSession("resources-" + crypto.randomUUID(), "en-IN");
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.keep_alive).toBe("60s");
    expect(request.options.num_thread).toBe(2);
    expect(request.options.num_ctx).toBe(8192);
  });
  it("retries an echoed answer against the actual latest message", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(output("answer", [], "Hello."))
      .mockResolvedValueOnce(output("answer", [], "The detailed explanation."))
      .mockResolvedValueOnce(
        output("acknowledge", [], "The detailed explanation."),
      )
      .mockResolvedValueOnce(output("acknowledge", [], "You're welcome."));
    vi.stubGlobal("fetch", fetch);
    const owner = "echo-" + crypto.randomUUID();
    const start = await startSession(owner, "en-IN");
    await processTurn(owner, start.session.id, "Explain my sales.");
    const result = await processTurn(owner, start.session.id, "Thank you.");
    expect(result.assistantMessage).toBe("You're welcome.");
    expect(result.session.mode).toBe("ollama");
    expect(result.actions).toEqual([]);
    const retry = JSON.parse(fetch.mock.calls[3][1].body);
    expect(retry.messages.at(-1)).toEqual({
      role: "user",
      content: "Thank you.",
    });
    expect(retry.messages[0].content).toContain("REVISE YOUR DRAFT");
  });
  it("distinguishes configured, missing model and offline runtime", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "test-model:latest");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ models: [{ name: "test-model:latest" }] }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] })))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    expect(await getProviderHealth()).toMatchObject({
      configured: true,
      ready: true,
      provider: "ollama",
    });
    expect(await getProviderHealth()).toMatchObject({
      configured: true,
      ready: false,
      detail: expect.stringContaining("missing"),
    });
    expect(await getProviderHealth()).toMatchObject({
      ready: false,
      detail: expect.stringContaining("offline"),
    });
  });
  it("accepts natural task approval while rejecting questions and negatives", () => {
    for (const text of [
      "Okay sure.",
      "Yes please!",
      "Please save the plan.",
      "Sure, add them.",
      "Go ahead.",
    ])
      expect(consent(text), text).toBe(true);
    for (const text of [
      "Why save the plan?",
      "Explain whether I should save the plan.",
      "Do not add the tasks.",
      "Yes, but do not save.",
      "We have no dispatch delays.",
      "Thank you.",
    ])
      expect(consent(text), text).toBe(false);
  });
  it("invalidates a pending plan when the seller corrects its assumptions", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(output())
        .mockResolvedValueOnce(output("propose_plan", ["restock", "dispatch"]))
        .mockResolvedValueOnce(output())
        .mockResolvedValueOnce(output("accept_plan")),
    );
    const owner = "correction-" + crypto.randomUUID();
    const start = await startSession(owner, "en-IN");
    const plan = await processTurn(owner, start.session.id, "Create a plan.");
    expect(plan.session.awaitingPlanConfirmation).toBe(true);
    const corrected = await processTurn(
      owner,
      start.session.id,
      "All products are in stock and we have no dispatch delays.",
    );
    expect(corrected.session.awaitingPlanConfirmation).toBe(false);
    expect(corrected.session.recommendedActions).toEqual([]);
    const yes = await processTurn(owner, start.session.id, "Yes.");
    expect(yes.actions).toEqual([]);
  });
  it("does not reopen an ended session when an approved task save finishes late", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(output())
        .mockResolvedValueOnce(output("propose_plan", ["restock"]))
        .mockResolvedValueOnce(output("accept_plan")),
    );
    const owner = "save-cancel-" + crypto.randomUUID();
    const start = await startSession(owner, "en-IN");
    await processTurn(owner, start.session.id, "Create a plan.");
    let release!: () => void;
    let saving!: () => void;
    const savingStarted = new Promise<void>((resolve) => {
      saving = resolve;
    });
    vi.spyOn(store, "createActionPlan").mockImplementationOnce(async () => {
      saving();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return [];
    });
    const turn = processTurn(owner, start.session.id, "Yes, please save it.");
    const rejected = expect(turn).rejects.toMatchObject({ name: "AbortError" });
    await savingStarted;
    await endSession(owner, start.session.id);
    release();
    await rejected;
    expect(getSession(owner, start.session.id)?.stage).toBe("ended");
    expect(getSession(owner, start.session.id)?.committedKeys).toEqual([
      "restock",
    ]);
    expect(
      getSession(owner, start.session.id)?.summary?.commitments,
    ).toHaveLength(1);
    expect(getSession(owner, start.session.id)?.endedAt).toBeTruthy();
  });
  it("prevents overlapping turns or ending a session from losing conversation state", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    let release!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(output())
        .mockImplementationOnce(
          () => new Promise((resolve) => (release = resolve)),
        ),
    );
    const owner = "concurrency-" + crypto.randomUUID();
    const start = await startSession(owner, "en-IN");
    const first = processTurn(
      owner,
      start.session.id,
      "Explain the sales decline.",
    );
    await expect(
      processTurn(owner, start.session.id, "Create a plan."),
    ).rejects.toMatchObject({ status: 409 });
    const ended = await endSession(owner, start.session.id);
    expect(ended.session.endedAt).toBeTruthy();
    expect(ended.session.messages.at(-1)?.content).toBe(
      "Explain the sales decline.",
    );
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    release(output());
    await rejected;
    expect(getSession(owner, start.session.id)?.endedAt).toBeTruthy();
    expect(
      getSession(owner, start.session.id)
        ?.messages.filter((m) => m.role === "seller")
        .map((m) => m.content),
    ).toEqual(["Explain the sales decline."]);
  });
});
