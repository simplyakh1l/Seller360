import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  endSession,
  processTurn,
  startSession,
  updateConversationContext,
} from "../server/src/services/agent";
import type { AgentSession } from "../shared/types";
import { getSession } from "../server/src/services/store";
beforeEach(() => vi.stubEnv("LLM_PROVIDER", "demo"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const owner = () => "regression-" + randomUUID();

describe("Conversation behaviour without a language model", () => {
  it("answers repeated explanation requests without advancing through a script", async () => {
    const id = owner();
    const start = await startSession(id, "en-IN");
    for (const text of [
      "Why have my sales dropped?",
      "I want the overall reason for sales going down. Mention all possible factors.",
      "Are you hardcoded?",
      "garbled speech blarg",
    ]) {
      const r = await processTurn(id, start.session.id, text);
      expect(r.session.recommendedActions).toEqual([]);
      expect(r.session.awaitingPlanConfirmation).toBe(false);
      expect(r.actions).toEqual([]);
      expect(r.session.statements).toEqual([]);
      if (text.includes("hardcoded"))
        expect(r.assistantMessage).toMatch(/rules-only/);
      if (text.includes("overall"))
        expect(r.assistantMessage).toMatch(/270 versus 400/);
    }
  });
  it("saves only a pending approved plan and acknowledges thanks without another plan", async () => {
    const id = owner();
    const start = await startSession(id, "en-IN");
    const early = await processTurn(id, start.session.id, "Okay sure.");
    expect(early.actions).toEqual([]);
    const plan = await processTurn(
      id,
      start.session.id,
      "Create a recovery plan",
    );
    expect(plan.session.awaitingPlanConfirmation).toBe(true);
    expect(plan.actions).toEqual([]);
    const no = await processTurn(id, start.session.id, "No, this is wrong.");
    expect(no.session.awaitingPlanConfirmation).toBe(false);
    expect(no.actions).toEqual([]);
    const stray = await processTurn(id, start.session.id, "Yes.");
    expect(stray.actions).toEqual([]);
    await processTurn(id, start.session.id, "Create a recovery plan");
    const saved = await processTurn(id, start.session.id, "Okay sure.");
    expect(saved.actions).toHaveLength(3);
    expect(saved.session.committedKeys).toHaveLength(3);
    const thanked = await processTurn(id, start.session.id, "Okay, thank you.");
    expect(thanked.session.awaitingPlanConfirmation).toBe(false);
    expect(
      thanked.session.activity.filter((e) => e.kind === "plan"),
    ).toHaveLength(2);
    expect(
      thanked.session.activity.filter((e) => e.kind === "commit"),
    ).toHaveLength(1);
    const closed = await endSession(id, start.session.id);
    expect(closed.session.summary?.commitments).toHaveLength(3);
    expect(getSession("other-" + id, start.session.id)).toBeNull();
    await expect(
      processTurn(id, start.session.id, "hello"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("summarizes observed counts without overriding healthy-stock reports with an imperative", async () => {
    const id = owner();
    const start = await startSession(id, "en-IN");
    await processTurn(
      id,
      start.session.id,
      "All bestsellers are in stock and we have no dispatch delays.",
    );
    const closed = await endSession(id, start.session.id);
    expect(closed.session.summary?.issues.join(" ")).not.toContain(
      "Inventory needs your attention",
    );
    expect(closed.session.summary?.issues.join(" ")).toContain(
      "Out-of-stock products: 5 → 18",
    );
    expect(closed.session.summary?.sellerInformation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: "inventory", status: "denied" }),
      ]),
    );
  });
  it("retains denials and latest corrections without treating questions as facts", () => {
    const s = {
      statements: [],
      askedTopics: ["cancellations"],
    } as unknown as AgentSession;
    for (const q of [
      "Why are my cancellations high?",
      "Give me a short explanation of why average price is unchanged.",
      "If our stock is healthy but impressions fell, why restock?",
      "What if our inventory is low?",
      "Can stockouts affect sales?",
      "I want to understand why sales are down",
    ])
      updateConversationContext(s, q);
    expect(s.statements).toEqual([]);
    updateConversationContext(
      s,
      "We have no dispatch delays and all bestsellers are in stock; our impressions fell sharply.",
    );
    expect(s.statements.map((x) => [x.topic, x.status])).toEqual([
      ["dispatch", "denied"],
      ["inventory", "denied"],
      ["visibility", "reported"],
    ]);
    updateConversationContext(
      s,
      "Some stock is unavailable and dispatches are delayed.",
    );
    expect(s.statements.find((x) => x.topic === "inventory")?.status).toBe(
      "reported",
    );
    expect(s.statements.find((x) => x.topic === "dispatch")?.status).toBe(
      "reported",
    );
    updateConversationContext(s, "I am not sure about cancellation reasons.");
    expect(s.statements.find((x) => x.topic === "cancellations")?.status).toBe(
      "unknown",
    );
  });
});

describe("Actual model integration contract", () => {
  it("lets model meaning and history choose the reply, with independent side-effect guards", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    const outputs = [
      {
        assistantMessage: "Hello, what would you like to explore?",
        decision: "answer",
        sellerContext: [],
        actionKeys: [],
        askedTopic: "none",
      },
      {
        assistantMessage:
          "Your reported traffic decline deserves a visibility audit. Should I save that task?",
        decision: "propose_plan",
        sellerContext: [
          {
            topic: "visibility",
            status: "reported",
            quote: "impressions fell sharply",
          },
        ],
        actionKeys: ["visibility"],
        askedTopic: "none",
      },
      {
        assistantMessage: "Invented approval must not execute.",
        decision: "accept_plan",
        sellerContext: [],
        actionKeys: [],
        askedTopic: "none",
      },
      {
        assistantMessage:
          "Your impressions fell; inventory and dispatch are healthy now.",
        decision: "answer",
        sellerContext: [
          { topic: "dispatch", status: "unknown", quote: "no dispatch delays" },
        ],
        actionKeys: [],
        askedTopic: "none",
      },
    ];
    const calls: { messages: { role: string; content: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        calls.push(JSON.parse(init.body));
        return new Response(
          JSON.stringify({
            message: { content: JSON.stringify(outputs.shift()) },
          }),
        );
      }),
    );
    const id = owner();
    const start = await startSession(id, "en-IN");
    const a = await processTurn(
      id,
      start.session.id,
      "Our impressions fell sharply. What should we do?",
    );
    expect(a.session.mode).toBe("ollama");
    expect(a.session.recommendedActions.map((x) => x.key)).toEqual([
      "visibility",
    ]);
    expect(a.assistantMessage).toContain("visibility audit");
    const b = await processTurn(
      id,
      start.session.id,
      "Explain the visibility task before I decide.",
    );
    expect(b.actions).toEqual([]);
    const c = await processTurn(
      id,
      start.session.id,
      "We have no dispatch delays and all bestsellers are in stock.",
    );
    expect(
      c.session.statements.find((x) => x.topic === "dispatch")?.status,
    ).toBe("denied");
    expect(
      c.session.statements.find((x) => x.topic === "inventory")?.status,
    ).toBe("denied");
    expect(
      calls[3].messages.filter((m) => m.role !== "system").map((m) => m.role),
    ).toEqual(["assistant", "user", "assistant", "user", "assistant", "user"]);
    expect(calls[3].messages[0].content).not.toContain(
      "Follow orchestration intent",
    );
    expect(calls[3].messages[0].content).toContain("no dispatch delays");
  });
  it("labels outages explicitly instead of claiming model reasoning", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await startSession(owner(), "en-IN");
    expect(r.session.mode).toBe("demo");
    expect(r.session.fallbackReason).toContain("unavailable");
    expect(r.actions).toEqual([]);
  });
});
