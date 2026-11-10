import type { AgentSession, Topic } from "../../../shared/types";
import type { AgentDecision } from "./llm";
import { generateRecoveryRecommendations } from "./recommendations";
export function consent(text: string) {
  if (
    refusal(text) ||
    /\b(why|whether|before|if|should i|should we)\b/i.test(text)
  )
    return false;
  return (
    /^(?:(?:yes(?: please)?|yeah|yep|sure|okay|ok|agreed|i agree|please do|go ahead|sounds good|let'?s do it|हाँ|हां)[\s,.!]*)+$/i.test(
      text.trim(),
    ) ||
    (/^(?:(?:yes|sure|okay|ok)[,.! ]+)?(?:please\s+)?(?:can you\s+)?(add|save|accept|approve)\b.{0,35}\b(actions?|plan|tasks?|recommendations?|it|them|those)\b/i.test(
      text,
    ) &&
      !refusal(text))
  );
}
export function refusal(text: string) {
  return /^(no\b|nope\b|not now\b|no thanks\b)|\b(do not|don't|dont|not|never)\s+(save|add|accept|approve)|\b(do not|don't|dont|not)\s+(suggest|propose|create)\s+(?:a |the |another )?plan|\b(don't want|do not want|decline|reject)\b/i.test(
    text,
  );
}
export function thanks(text: string) {
  return /^(okay[, ]*)?(thanks?|thank you|thankyou|bye|goodbye|that's all|that is all)[\s,.!]*$/i.test(
    text.trim(),
  );
}
export function requestedPlan(text: string) {
  return (
    !refusal(text) &&
    /\b(plan|recommend(?:ation|ations)?|next steps|action(?:s)?|what should|what can i do|how (?:can|do) (?:i|we) (?:recover|improve))\b|प्लान|योजना/i.test(
      text,
    )
  );
}
function reply(
  assistantMessage: string,
  decision: AgentDecision["decision"] = "answer",
  extra: Partial<AgentDecision> = {},
): AgentDecision {
  return {
    assistantMessage,
    decision,
    askedTopic: "none",
    actionKeys: [],
    sellerContext: [],
    ...extra,
  };
}
export function fallbackDecision(
  session: AgentSession,
  text: string,
): AgentDecision {
  const t = text.trim();
  if (
    /hard.?cod|script|fixed (?:answer|response)|are you (?:an? )?(?:ai|real|robot)|use.*(?:brain|model)/i.test(
      t,
    )
  )
    return reply(
      "You are right to question it. I am currently in rules-only fallback mode because no language model is connected. I can explain the supplied metrics and track tasks, but I cannot offer open-ended reasoning until a local or cloud model is running.",
    );
  if (thanks(t))
    return reply(
      session.committedKeys.length
        ? "You’re welcome. Your agreed tasks are already saved in Actions; no new plan has been created."
        : "You’re welcome. We can leave it here, or return to any part of your performance when you are ready.",
      "acknowledge",
    );
  if (refusal(t) && session.awaitingPlanConfirmation)
    return reply(
      "Understood. I have not saved that plan. Tell me which part you disagree with or what you want explained instead.",
      "decline_plan",
    );
  if (consent(t) && session.awaitingPlanConfirmation)
    return reply(
      "I’m saving the agreed recommendations to your local Action Centre. No marketplace settings have changed.",
      "accept_plan",
    );
  if (/\b(summary|summari[sz]e)\b/i.test(t))
    return reply(
      "Sales and orders are down 32.5%, while ASP remains ₹500. Cancellations rose from 8% to 14% and unavailable products from 5 to 18; these are risks, not proven causes. " +
        (session.committedKeys.length
          ? "Your agreed actions are already saved."
          : "No actions have been saved without your approval."),
    );
  if (requestedPlan(t)) {
    const actions = generateRecoveryRecommendations(session.statements);
    return reply(
      "Based on the available evidence, I suggest " +
        actions.map((a) => a.title.toLowerCase()).join("; ") +
        ". These are preliminary priorities, not a proven attribution of the decline. Would you like to save these tasks?",
      "propose_plan",
      { actionKeys: actions.map((a) => a.key) },
    );
  }
  if (
    /(?:why|reason|cause|understand|explain|responsible|all the points|overall)/i.test(
      t,
    ) &&
    /(sales|orders?|revenue|series|declin|down|drop|business|reason|cause)/i.test(
      t,
    )
  )
    return reply(
      "The direct explanation is fewer orders: 270 versus 400, with ASP steady at ₹500. Three areas need investigation: availability (18 stockouts versus 5), cancellations (14% versus 8%), and visibility or conversion, for which we have no traffic data. Dispatch delays and competitor offers are other possible factors, but are not established by these aggregates. I cannot truthfully name one proven root cause or quantify each factor without SKU demand, cancellation codes and traffic data.",
    );
  if (
    /\b(cancel|cancellations?|dispatch|shipping)\b/i.test(t) &&
    /\?|why|explain|what|how/i.test(t)
  )
    return reply(
      "The cancellation rate increased from 8% to 14%, a rise of 6 percentage points. The dataset has no reason codes, so stock shortages, delayed dispatch and customer cancellations must be checked separately. Exporting reason codes and comparing missed dispatch deadlines would distinguish them.",
    );
  if (
    /\b(stock|inventory|availability)\b/i.test(t) &&
    /\?|why|explain|what|how/i.test(t)
  )
    return reply(
      "Unavailable products rose from 5 to 18. That can constrain orders, especially for high-demand items, but we do not have SKU demand or dates to prove the impact. Compare the unavailable products with top sellers before deciding what to restock.",
    );
  if (
    /\b(price|pricing|discount|competitor)\b/i.test(t) &&
    /\?|why|explain|what|how/i.test(t)
  )
    return reply(
      "Aggregate selling price stayed at ₹500, so average price alone does not explain the revenue decline. Individual product prices and competitor offers may still have changed; compare like-for-like products and delivery fees before testing a discount.",
    );
  if (
    /\b(traffic|visibility|views?|impressions?|conversion)\b/i.test(t) &&
    /\?|why|explain|what|how/i.test(t)
  )
    return reply(
      "Traffic, impressions and conversion were not supplied. Compare those metrics over the same two periods: fewer views would suggest a visibility issue, whereas steady views with fewer orders would direct us to conversion and availability.",
    );
  const reported = session.statements.filter((s) => s.status === "reported");
  if (
    reported.some((s) => s.topic === "inventory") &&
    reported.some((s) => s.topic === "dispatch")
  ) {
    const actions = generateRecoveryRecommendations(session.statements);
    return reply(
      "You report both stock shortages and dispatch delays. Prioritise " +
        actions.map((a) => a.title.toLowerCase()).join("; ") +
        ". Those reports guide the plan but do not quantify causation. Shall I save these tasks?",
      "propose_plan",
      { actionKeys: actions.map((a) => a.key) },
    );
  }
  if (/^(hi|hello|hey)[.!\s]*$/i.test(t))
    return reply(
      "Hello. We can focus on sales, inventory, cancellations or a specific concern. What would you like to understand?",
      "acknowledge",
    );
  if (consent(t))
    return reply(
      "Understood. No new tasks were saved. What would you like to explore next?",
      "acknowledge",
    );
  if (session.statements.some((s) => s.statement === t)) {
    const resolved = new Set(session.statements.map((s) => s.topic));
    const topic = (
      ["cancellations", "inventory", "visibility"] as Topic[]
    ).find((x) => !resolved.has(x) && !session.askedTopics.includes(x));
    if (topic) {
      const question =
        topic === "cancellations"
          ? "Do you have cancellation reason codes showing stock, dispatch or customer reasons?"
          : topic === "inventory"
            ? "Have any high-demand items been unavailable?"
            : "Have product impressions or views changed over the same period?";
      return reply(
        "I have recorded that as seller-reported context. " + question,
        "ask_question",
        { askedTopic: topic },
      );
    }
    return reply(
      "I have recorded your context. It helps narrow the investigation, although the effect on sales still needs verification.",
    );
  }
  return reply(
    "I may have misunderstood that message. Could you rephrase what you want to know? I have not added it as a business fact or changed your action plan.",
    "clarify",
  );
}
