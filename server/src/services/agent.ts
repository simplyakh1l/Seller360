import { randomUUID } from "node:crypto";
import type {
  Activity,
  AgentResponse,
  AgentSession,
  Message,
  SellerStatement,
  SessionSummary,
  Topic,
} from "../../../shared/types";
import { analyzeSellerPerformance, diagnoseSalesDecline } from "./analytics";
import {
  actionForKey,
  generateRecoveryRecommendations,
} from "./recommendations";
import {
  createActionPlan,
  getActions,
  getSession,
  storeSession,
} from "./store";
import { generateLLMResponse, providerStatus, type AgentDecision } from "./llm";
import { consent, refusal, thanks, fallbackDecision } from "./conversation";
const now = () => new Date().toISOString();
const message = (role: Message["role"], content: string): Message => ({
  id: randomUUID(),
  role,
  content,
  timestamp: now(),
});
export function logActivity(
  session: AgentSession,
  label: string,
  detail: string,
  kind: Activity["kind"],
) {
  session.activity.push({
    id: randomUUID(),
    label,
    detail,
    kind,
    timestamp: now(),
  });
}
function addStatement(
  session: AgentSession,
  topic: Topic,
  status: SellerStatement["status"],
  statement: string,
) {
  const existing = session.statements.findIndex((s) => s.topic === topic);
  const value = { topic, status, statement, timestamp: now() };
  if (existing >= 0) session.statements[existing] = value;
  else session.statements.push(value);
}
// Clear declarations protect obvious negations; the model handles conversation.
export function updateConversationContext(session: AgentSession, text: string) {
  if (/^(?:if|suppose|imagine|hypothetically|what if)\b/i.test(text.trim()))
    return;
  const tests: [Topic, RegExp][] = [
    [
      "inventory",
      /\b(stock|stockouts?|inventory|restock|unavailable|availability)\b|स्टॉक/i,
    ],
    [
      "dispatch",
      /\b(dispatch(?:es)?|shipping|shipment|pickup|fulfilment|fulfillment|deliver(?:y|ies))\b|डिस्पैच/i,
    ],
    ["visibility", /\b(impressions?|views?|traffic|visibility|clicks?)\b/i],
    ["pricing", /\b(prices?|pricing|competitors?|discounts?)\b/i],
    [
      "cancellations",
      /\b(cancel(?:led|ed)?|cancellations?|customer.side|seller.side)\b/i,
    ],
  ];
  let found = false;
  for (const raw of text.split(/[.!?;]|\bbut\b|\band\b/i)) {
    const clause = raw.trim();
    if (
      !clause ||
      /^(?:(?:okay|ok|so|then)[, ]+)?(?:why|what|how|can|could|would|should|do|does|did|is|are|have|has|tell|give|show|help|explain|please explain)\b/i.test(
        clause,
      )
    )
      continue;
    for (const [topic, pattern] of tests) {
      if (!pattern.test(clause)) continue;
      const uncertain =
        /\b(don.t know|do not know|not sure|no idea|unsure|unknown|not checked|haven.t checked|maybe|might|could be|possibly|if)\b/i.test(
          clause,
        );
      const denied =
        /\b(no|not|never|aren.t|isn.t|don.t|without)\b.{0,35}\b(shortages?|delays?|issues?|problems?|out of stock|unavailable|changed|down|declin\w*|drop\w*)\b|\b(in stock|fully stocked|stock is fine|stock is available|on time|unchanged|stable|normal)\b/i.test(
          clause,
        );
      const reported =
        /\b(low|out of|short(?:age|ages)?|unavailable|delay(?:ed|s)?|late|down|declin\w*|drop\w*|fell|fallen|less|fewer|increas\w*|higher|cheaper|mostly|mainly|because|due to)\b/i.test(
          clause,
        );
      if (!uncertain && !denied && !reported) continue;
      addStatement(
        session,
        topic,
        uncertain ? "unknown" : denied ? "denied" : "reported",
        clause,
      );
      found = true;
    }
  }
  if (
    !found &&
    /^(?:i |we )?(?:don.t know|do not know|not sure|no idea|unsure)[.! ]*$/i.test(
      text.trim(),
    )
  ) {
    const topic = session.askedTopics.at(-1);
    if (topic) addStatement(session, topic, "unknown", text);
  }
}
function isSellerDeclaration(text: string) {
  return (
    !/^(?:if|suppose|imagine|hypothetically|why|what|how|can|could|would|should|do|does|did|is|are|have|has|tell|give|show|help|explain|please)\b/i.test(
      text.trim(),
    ) &&
    !thanks(text) &&
    !consent(text)
  );
}

function refreshDiagnosis(session: AgentSession) {
  const base = diagnoseSalesDecline();
  const topics = session.statements
    .filter((s) => s.status === "reported")
    .map((s) => s.topic);
  session.diagnosis = {
    ...base,
    primaryIssue:
      topics.includes("inventory") && topics.includes("dispatch")
        ? "Inventory and dispatch risks reported by seller"
        : topics.includes("visibility")
          ? "Seller reports visibility changes; operational risks remain"
          : base.primaryIssue,
    unresolvedQuestions: base.unresolvedQuestions.filter(
      (q) =>
        !session.statements.some(
          (s) =>
            s.topic ===
              (q.includes("cancellations")
                ? "cancellations"
                : q.includes("high-demand")
                  ? "inventory"
                  : "visibility") && s.status !== "unknown",
        ),
    ),
  };
}
export function generateSessionSummary(session: AgentSession): SessionSummary {
  const a = analyzeSellerPerformance();
  return {
    concern: session.concern || "Understand business performance",
    metrics: a.metrics.map((m) =>
      m.unit === "currency"
        ? m.label +
          ": ₹" +
          m.previous.toLocaleString("en-IN") +
          " → ₹" +
          m.current.toLocaleString("en-IN") +
          (m.change === null
            ? ""
            : " (" +
              (m.change > 0 ? "+" : "") +
              Number(m.change.toFixed(1)) +
              m.changeUnit +
              ")")
        : m.label +
          ": " +
          m.previous +
          (m.unit === "percent" ? "%" : "") +
          " → " +
          m.current +
          (m.unit === "percent" ? "%" : "") +
          (m.change === null
            ? ""
            : " (" +
              (m.change > 0 ? "+" : "") +
              Number(m.change.toFixed(1)) +
              m.changeUnit +
              ")"),
    ),
    issues: a.insights
      .filter((i) => i.severity === "high")
      .map((i) => "Supplied period data — " + i.evidence),
    sellerInformation: session.statements,
    likelyContributors: session.statements
      .filter((s) => s.status === "reported")
      .map(
        (s) =>
          s.topic + ": seller-reported; contribution has not been quantified",
      ),
    recommendations: session.recommendedActions,
    commitments: session.committedKeys.map((key) => actionForKey(key).title),
    outstanding: session.diagnosis.unresolvedQuestions,
  };
}
async function respond(
  owner: string,
  session: AgentSession,
  latestText: string | null,
  signal?: AbortSignal,
): Promise<AgentResponse> {
  if (process.env.SELLER360_HOSTED === "1" && !providerStatus().configured)
    throw Object.assign(
      new Error("Configure the cloud AI API key before starting Nova."),
      { status: 503 },
    );
  const previousEvidence = JSON.stringify(session.statements);
  if (latestText) updateConversationContext(session, latestText);
  refreshDiagnosis(session);
  if (
    session.awaitingPlanConfirmation &&
    session.recommendedActions.some((a) =>
      session.statements.some(
        (s) =>
          s.status === "denied" &&
          ((a.key === "restock" && s.topic === "inventory") ||
            (a.key === "dispatch" && s.topic === "dispatch")),
      ),
    )
  ) {
    session.awaitingPlanConfirmation = false;
    session.recommendedActions = [];
    logActivity(
      session,
      "Earlier proposal needs revision",
      "New seller context contradicts the pending plan. Approval cleared.",
      "context",
    );
  }
  const explicitTopics = new Set(
    session.statements
      .filter((s) => latestText?.includes(s.statement))
      .map((s) => s.topic),
  );
  let decision: AgentDecision;
  try {
    let generated = await generateLLMResponse(session, undefined, signal);
    const previousReply = session.messages
      .slice(0, -1)
      .reverse()
      .find((m) => m.role === "assistant")?.content;
    if (
      generated &&
      latestText &&
      generated.output.assistantMessage.trim() === previousReply?.trim() &&
      !/\b(repeat|again|verbatim)\b/i.test(latestText)
    ) {
      generated = await generateLLMResponse(
        session,
        "Your draft repeated the previous assistant message verbatim. Re-read the LATEST seller message and answer that intent. A thank-you needs a short acknowledgement, with no new plan or claim that tasks were saved again. Preserve correct evidence and action state.",
        signal,
      );
    }
    if (generated) {
      decision = generated.output;
      session.mode = generated.provider;
      session.model = generated.model;
      session.fallbackReason = null;
      logActivity(
        session,
        "Language model interpreted this turn",
        generated.provider +
          " · " +
          generated.model +
          " · " +
          decision.decision,
        "system",
      );
    } else {
      session.mode = "demo";
      session.model = null;
      session.fallbackReason =
        "No language model configured; limited rules-only fallback";

      decision = latestText
        ? fallbackDecision(session, latestText)
        : greetingDecision();
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (process.env.SELLER360_HOSTED === "1")
      throw Object.assign(
        new Error(
          "Nova’s cloud AI is temporarily unavailable or its quota has been reached. Please retry later.",
        ),
        { status: 503 },
      );
    session.mode = "demo";
    session.model = null;
    session.fallbackReason =
      "Language model unavailable; limited rules-only fallback";
    logActivity(
      session,
      "Language model unavailable",
      "Using the labelled rules-only fallback for this turn. No tasks executed automatically.",
      "system",
    );
    console.warn(
      "Language model request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    decision = latestText
      ? fallbackDecision(session, latestText)
      : greetingDecision();
  }
  signal?.throwIfAborted();
  if (latestText && isSellerDeclaration(latestText))
    for (const fact of decision.sellerContext) {
      if (latestText.includes(fact.quote) && !explicitTopics.has(fact.topic))
        addStatement(session, fact.topic, fact.status, fact.quote);
    }
  if (previousEvidence !== JSON.stringify(session.statements))
    logActivity(
      session,
      "Seller context updated",
      "Recorded explicitly reported facts, negations and uncertainty from the current message.",
      "context",
    );
  refreshDiagnosis(session);
  if (
    session.awaitingPlanConfirmation &&
    session.recommendedActions.some((a) =>
      session.statements.some(
        (s) =>
          s.status === "denied" &&
          ((a.key === "restock" && s.topic === "inventory") ||
            (a.key === "dispatch" && s.topic === "dispatch")),
      ),
    )
  )
    session.awaitingPlanConfirmation = false;
  // Local side effects are guarded independently of generated prose. No turn-count transitions.
  if (latestText && thanks(latestText)) {
    decision.decision = "acknowledge";
    decision.actionKeys = [];
    decision.askedTopic = "none";
    if (
      /shall i|would you like.*save|here.*plan/i.test(decision.assistantMessage)
    )
      decision.assistantMessage = fallbackDecision(
        session,
        latestText,
      ).assistantMessage;
  }
  if (latestText && refusal(latestText) && session.awaitingPlanConfirmation) {
    decision.decision = "decline_plan";
    decision.actionKeys = [];
  }
  if (latestText && consent(latestText) && session.awaitingPlanConfirmation) {
    decision.decision = "accept_plan";
    decision.assistantMessage =
      "I’ve saved " +
      session.recommendedActions.map((a) => a.title.toLowerCase()).join("; ") +
      " to your local Action Centre. Nothing in the marketplace has been changed.";
  }
  if (decision.decision === "accept_plan") {
    if (
      session.awaitingPlanConfirmation &&
      session.recommendedActions.length &&
      latestText &&
      consent(latestText)
    ) {
      const keys = session.recommendedActions.map((a) => a.key);
      await createActionPlan(owner, keys, session.recommendedActions);
      session.committedKeys = [...new Set([...session.committedKeys, ...keys])];
      session.awaitingPlanConfirmation = false;
      session.stage = "commitment";
      logActivity(
        session,
        "Agreed action plan saved",
        keys.length + " tasks saved locally after explicit seller approval.",
        "commit",
      );
    } else {
      decision.assistantMessage = session.committedKeys.length
        ? "Your agreed tasks are already saved in Actions. No duplicate tasks have been added."
        : "No actions have been saved. Please review a proposed plan before agreeing to save it.";
    }
  } else if (decision.decision === "decline_plan") {
    session.awaitingPlanConfirmation = false;
    logActivity(
      session,
      "Seller declined the plan",
      "No task changes made. Conversation remains open to questions or revised recommendations.",
      "context",
    );
  } else if (decision.decision === "propose_plan") {
    const denied = new Set(
      session.statements
        .filter((s) => s.status === "denied")
        .map((s) => s.topic),
    );
    const keys = [...new Set(decision.actionKeys)].filter(
      (key) =>
        !(key === "restock" && denied.has("inventory")) &&
        !(key === "dispatch" && denied.has("dispatch")),
    );
    const actions = keys.length
      ? keys.map(actionForKey)
      : generateRecoveryRecommendations(session.statements);
    session.recommendedActions = actions;
    session.stage = "recommendations";
    session.awaitingPlanConfirmation = actions.some(
      (a) => !session.committedKeys.includes(a.key),
    );
    logActivity(
      session,
      "Recovery recommendations prepared",
      actions.length +
        " priorities selected for the current request and seller evidence.",
      "plan",
    );
  } else if (
    decision.askedTopic !== "none" &&
    decision.assistantMessage.includes("?")
  ) {
    if (!session.askedTopics.includes(decision.askedTopic))
      session.askedTopics.push(decision.askedTopic);
    if (session.stage !== "commitment") session.stage = "discovery";
    logActivity(
      session,
      "Relevant follow-up asked",
      "Topic: " +
        decision.askedTopic +
        ". No assumption that the seller has answered it.",
      "context",
    );
  }
  if (
    latestText &&
    !session.concern &&
    !["acknowledge", "clarify"].includes(decision.decision)
  )
    session.concern = latestText;
  if (signal?.aborted) {
    const ended = getSession(owner, session.id);
    // A task save already approved by the seller may finish during End call.
    // Reconcile that completed work without reviving the call or saving a late reply.
    if (ended?.endedAt && session.committedKeys.length) {
      ended.committedKeys = [
        ...new Set([...ended.committedKeys, ...session.committedKeys]),
      ];
      ended.awaitingPlanConfirmation = false;
      ended.summary = generateSessionSummary(ended);
      await storeSession(owner, ended);
    }
    signal.throwIfAborted();
  }
  session.messages.push(message("assistant", decision.assistantMessage));
  await storeSession(owner, session);
  return {
    session: structuredClone(session),
    assistantMessage: decision.assistantMessage,
    actions: getActions(owner),
  };
}
function greetingDecision(): AgentDecision {
  return {
    assistantMessage:
      "Hello, I’m Nova. I’ve reviewed the supplied performance: sales and orders are down 32.5%, ASP is steady, while cancellations and stockouts are higher. What would you like to understand today?",
    decision: "answer",
    askedTopic: "none",
    actionKeys: [],
    sellerContext: [],
  };
}
export async function startSession(
  owner: string,
  language: "en-IN" | "hi-IN",
  signal?: AbortSignal,
): Promise<AgentResponse> {
  const health = providerStatus();
  const session: AgentSession = {
    id: randomUUID(),
    startedAt: now(),
    endedAt: null,
    stage: "greeting",
    messages: [],
    statements: [],
    askedTopics: [],
    concern: "",
    diagnosis: diagnoseSalesDecline(),
    recommendedActions: [],
    committedKeys: [],
    activity: [],
    summary: null,
    mode: health.provider,
    model: health.model,
    fallbackReason: health.configured ? null : "No language model configured",
    language,
    awaitingPlanConfirmation: false,
  };
  analyzeSellerPerformance();
  logActivity(
    session,
    "Seller performance retrieved",
    "Loaded the two supplied monthly aggregates.",
    "data",
  );
  logActivity(
    session,
    "Monthly comparison completed",
    "Sales −32.5% · orders −32.5% · ASP unchanged.",
    "analysis",
  );
  logActivity(
    session,
    "Business risks identified",
    "Order decline, higher cancellations and inventory risk; root causes unconfirmed.",
    "analysis",
  );
  return respond(owner, session, null, signal);
}
const turnsInFlight = new Map<
  string,
  { controller: AbortController; session: AgentSession }
>();
export async function processTurn(
  owner: string,
  sessionId: string,
  text: string,
  signal?: AbortSignal,
): Promise<AgentResponse> {
  const original = getSession(owner, sessionId);
  if (!original || original.endedAt)
    throw Object.assign(
      new Error("This session is no longer active. Start a new conversation."),
      { status: 404 },
    );
  if (turnsInFlight.has(sessionId))
    throw Object.assign(
      new Error(
        "Nova is still answering the previous message. Please wait for the reply.",
      ),
      { status: 409 },
    );
  const controller = new AbortController();
  const session = structuredClone(original);
  session.messages.push(message("seller", text));
  turnsInFlight.set(sessionId, { controller, session });
  try {
    // Persist the seller utterance before inference so another serverless instance
    // can end the call without losing the pending question.
    await storeSession(owner, session);
    return await respond(
      owner,
      session,
      text,
      signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    );
  } finally {
    turnsInFlight.delete(sessionId);
  }
}
export async function endSession(
  owner: string,
  id: string,
): Promise<AgentResponse> {
  const session = getSession(owner, id);
  if (!session)
    throw Object.assign(new Error("Session not found."), { status: 404 });
  const pending = turnsInFlight.get(id);
  if (pending) {
    pending.controller.abort();
    // Preserve what the seller said, but never save an unfinished assistant reply.
    session.messages = pending.session.messages.filter(
      (m) =>
        m.role !== "assistant" ||
        session.messages.some((old) => old.id === m.id),
    );
    session.statements = pending.session.statements;
    refreshDiagnosis(session);
  }
  if (!session.endedAt) {
    session.endedAt = now();
    session.stage = "ended";
    session.summary = generateSessionSummary(session);
    logActivity(
      session,
      "Session summary generated",
      "Captured metrics, reported context, recommendations, commitments and unknowns.",
      "system",
    );
    await storeSession(owner, session);
  }
  return {
    session: structuredClone(session),
    assistantMessage: "",
    actions: getActions(owner),
  };
}
