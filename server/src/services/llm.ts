import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { AgentSession, Health } from "../../../shared/types";
import { analyzeSellerPerformance } from "./analytics";
import { actionForKey } from "./recommendations";
export const llmOutputSchema = z.object({
  decision: z.enum([
    "answer",
    "ask_question",
    "propose_plan",
    "accept_plan",
    "decline_plan",
    "acknowledge",
    "clarify",
  ]),
  askedTopic: z.enum([
    "inventory",
    "dispatch",
    "cancellations",
    "visibility",
    "pricing",
    "none",
  ]),
  actionKeys: z
    .array(
      z.enum(["restock", "dispatch", "cancellations", "visibility", "pricing"]),
    )
    .max(3),
  sellerContext: z
    .array(
      z.object({
        topic: z.enum([
          "inventory",
          "dispatch",
          "cancellations",
          "visibility",
          "pricing",
        ]),
        status: z.enum(["reported", "denied", "unknown"]),
        quote: z.string().min(1).max(1200),
      }),
    )
    .max(5),
  assistantMessage: z.string().min(1).max(3000),
});
export type AgentDecision = z.infer<typeof llmOutputSchema>;
const system = [
  "You are Nova, a thoughtful seller business consultant. Respond to what the seller ACTUALLY says using the dialogue history. Independent mock-data concept.",
  "There is NO fixed sequence. Answer direct questions first. If asked for all causes, explain all evidence and limitations. Respond to interruptions. NEVER force a plan because a number of turns elapsed.",
  "Use supplied deterministic facts exactly. Sales and orders fell 32.5%; cancellation rate rose 6 percentage points; stockouts rose from 5 to 18; ASP remained 500 rupees. These are facts. Inventory, cancellations, dispatch, visibility, conversion and competition are POSSIBLE causes, not proven attribution. Stable ASP does not prove every product price unchanged. Traffic and SKU demand are unknown. Never invent facts or guaranteed recovery.",
  "Use 2-6 concise spoken sentences; more detail if requested. At most ONE optional relevant follow-up. Do not repeat answered or already asked topics. Questions are NOT seller facts. Unclear speech needs clarification.",
  "Choose decision: answer for a direct question or explanation; ask_question for one relevant discovery question with askedTopic; propose_plan only for requested actions or useful NEW operational evidence, with 1-3 available actionKeys; accept_plan ONLY for explicit agreement to save the CURRENT pending plan when awaitingPlanConfirmation=true; decline_plan for refusal; acknowledge for thanks/goodbye/short acknowledgement; clarify for ambiguous speech.",
  "Okay sure means consent only while awaitingPlanConfirmation=true. No, thanks alone, or generic acknowledgements are not consent. Never propose a plan after thank you. If asked whether hardcoded, truthfully explain the active language model plus deterministic metric tools. Do not switch to stock questions or plans.",
  "propose_plan explains chosen actions and asks whether to save if not saved. Proposing NEVER saves. accept_plan says actual pending tasks are being saved LOCALLY. Never claim real marketplace changes.",
  "Keep categories separate: OBSERVED = sales, orders, ASP, cancellation rate, stockout counts. SELLER REPORTED = supplied declarations. UNKNOWN = impressions, traffic, conversion, competitors, SKU demand and reason codes unless explicitly reported. Never describe unknown metrics as observed. The 32.5% fewer orders at the same ASP explains the sales arithmetic, not the underlying cause.",
  "Latest corrections override earlier reports and aggregate risks. In stock means denied inventory issue; no dispatch delays means denied dispatch issue; impressions fell means reported visibility issue. Do not recommend restocking or faster dispatch when those problems are denied.",
  "When the seller rejects a plan and also asks a question, answer the question. Requested plans must describe exactly the selected actionKeys. Investigate unknown causes without pretending they are established.",
  "For an overall sales explanation cover: orders 400 to 270 with constant ASP; stockouts 5 to 18; cancellations 8% to 14%; then unknown traffic/conversion, dispatch reasons, competition/demand. Cancellations INCREASED, never say their rate dropped. Customer dissatisfaction is unverified. You cannot determine exact attribution from monthly totals.",
  "sellerContext contains ONLY explicit facts from the latest seller message with EXACT quotes. Empty for questions, hypothetical scenarios, thanks or unclear speech. Respect negation and uncertainty. askedTopic=none except discovery question. actionKeys=[] except propose_plan. In spoken replies say 'you report healthy stock', not internal terms like 'inventory denied'.",
  "Hindi for hi-IN, English for en-IN. Return JSON matching schema with all fields. No markdown fences.",
  "Before answering, check EVERY causal claim: the data does not show customer dissatisfaction, frustration, a conversion drop, or that stockouts caused cancellations. Never assert those. Say a risk MAY contribute and state what evidence would confirm it. Historical counts do not prove root causes. If the seller says thanks, acknowledge briefly; do not repeat the previous reply or claim to save tasks again.",
].join("\n");
export function providerStatus(): Health {
  const p =
    process.env.LLM_PROVIDER ??
    (process.env.GEMINI_API_KEY
      ? "gemini"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : "demo");
  const configured =
    p === "ollama" ||
    (p === "gemini" && !!process.env.GEMINI_API_KEY) ||
    (p === "openai" && !!process.env.OPENAI_API_KEY);
  return {
    status: "ok",
    provider: ["ollama", "gemini", "openai"].includes(p)
      ? (p as Health["provider"])
      : "demo",
    model:
      p === "demo"
        ? null
        : p === "ollama"
          ? (process.env.OLLAMA_MODEL ?? "qwen3:4b-instruct")
          : p === "gemini"
            ? (process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite")
            : (process.env.OPENAI_MODEL ?? "gpt-4.1-mini"),
    configured,
    demoData: true,
  };
}
function ollamaURL() {
  return (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
}
export async function getProviderHealth(): Promise<Health> {
  const s = providerStatus();
  if (s.provider !== "ollama")
    return {
      ...s,
      ready: s.configured,
      detail: s.configured
        ? "Cloud language model configured"
        : s.provider === "demo"
          ? "Rules-only demo. Configure a model for open conversation."
          : "Cloud API key missing. Configure the selected provider on the server.",
    };
  try {
    const r = await fetch(ollamaURL() + "/api/tags", {
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) throw Error("offline");
    const d = (await r.json()) as { models?: { name: string }[] };
    const ready = !!d.models?.some((m) => m.name === s.model);
    return {
      ...s,
      ready,
      detail: ready
        ? "Local language model ready"
        : "Local model missing. Run npm run ai:setup.",
    };
  } catch {
    return {
      ...s,
      ready: false,
      detail: "Local AI is offline. Restart npm run dev.",
    };
  }
}
export async function generateLLMResponse(
  session: AgentSession,
  correction?: string,
  signal?: AbortSignal,
) {
  const s = providerStatus();
  if (!s.configured) return null;
  const timeout = Math.min(
    120000,
    Math.max(
      1000,
      Number(process.env.LLM_TIMEOUT_MS) ||
        (s.provider === "ollama" ? 90000 : 20000),
    ),
  );
  const context = JSON.stringify({
    task: "Respond directly to the latest seller message.",
    language: session.language,
    activeModel: s.model,
    verifiedBusinessData: {
      observed: analyzeSellerPerformance().metrics.map((m) => ({
        metric: m.label,
        previous: m.previous,
        current: m.current,
        change: m.change,
        changeUnit: m.changeUnit,
      })),
      unknown: [
        "traffic",
        "conversion",
        "cancellation reasons",
        "SKU demand",
        "competitor pricing",
      ],
      attribution:
        "Order volume multiplied by stable ASP explains sales arithmetic. Root causes and contribution of each risk remain unconfirmed.",
    },
    sellerReportedContext: session.statements,
    alreadyAskedTopics: session.askedTopics,
    pendingPlan: session.recommendedActions,
    awaitingPlanConfirmation: session.awaitingPlanConfirmation ?? false,
    committedKeys: session.committedKeys,
    availableActions: (
      ["restock", "dispatch", "cancellations", "visibility", "pricing"] as const
    )
      .filter(
        (key) =>
          !session.statements.some(
            (s) =>
              s.status === "denied" &&
              ((key === "restock" && s.topic === "inventory") ||
                (key === "dispatch" && s.topic === "dispatch")),
          ),
      )
      .map((key) => {
        const a = actionForKey(key);
        return { key, title: a.title, purpose: a.description };
      }),
  });
  const dialogue = session.messages.slice(-16).map((m) => ({
    role: m.role === "seller" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
  if (!dialogue.length)
    dialogue.push({
      role: "user",
      content:
        "Start the call: brief greeting, observed signals, then ask what I want to focus on.",
    });
  const messages = [
    {
      role: "system" as const,
      content:
        system +
        "\nBUSINESS CONTEXT:\n" +
        context +
        (correction ? "\nREVISE YOUR DRAFT:\n" + correction : ""),
    },
    ...dialogue,
  ];
  if (s.provider === "ollama") {
    const r = await fetch(ollamaURL() + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
      body: JSON.stringify({
        model: s.model,
        stream: false,
        think: false,
        keep_alive: "60s",
        messages,
        format: z.toJSONSchema(llmOutputSchema),
        options: {
          temperature: 0.25,
          num_ctx: 8192,
          num_predict: 950,
          num_thread: 2,
        },
      }),
    });
    if (!r.ok) throw Error("Local AI request failed (" + r.status + ")");
    const result = (await r.json()) as { message?: { content?: string } };
    return {
      output: llmOutputSchema.parse(JSON.parse(result.message?.content ?? "")),
      provider: "ollama" as const,
      model: s.model,
    };
  }
  if (s.provider === "openai") {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout,
      maxRetries: 0,
    });
    const r = await client.responses.parse(
      {
        model: s.model!,
        input: messages,
        text: { format: zodTextFormat(llmOutputSchema, "nova_response") },
        max_output_tokens: 1500,
      },
      { signal },
    );
    if (!r.output_parsed) throw Error("Invalid structured response");
    return {
      output: llmOutputSchema.parse(r.output_parsed),
      provider: "openai" as const,
      model: s.model,
    };
  }
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout },
  });
  const r = await client.models.generateContent({
    model: s.model!,
    contents: dialogue.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    config: {
      systemInstruction: messages[0].content,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(llmOutputSchema),
      maxOutputTokens: 1500,
      abortSignal: signal,
    },
  });
  return {
    output: llmOutputSchema.parse(JSON.parse(r.text ?? "")),
    provider: "gemini" as const,
    model: s.model,
  };
}
