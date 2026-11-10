import { withCloudWorkspace, claimCloudUsage } from "./services/cloudStore";
import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  analyzeSellerPerformance,
  getBusinessInsights,
} from "./services/analytics";
import { endSession, processTurn, startSession } from "./services/agent";
import { getProviderHealth, providerStatus } from "./services/llm";
import {
  createActionPlan,
  getActions,
  getHistory,
  updateAction,
} from "./services/store";
const app = express();
if (process.env.NETLIFY || process.env.SELLER360_HOSTED === "1")
  app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "connect-src": [
          "'self'",
          "https://huggingface.co",
          "https://*.huggingface.co",
          "https://*.hf.co",
          "https://cdn.jsdelivr.net",
        ],
        "script-src": ["'self'", "'wasm-unsafe-eval'"],
        "worker-src": ["'self'", "blob:"],
        "img-src": ["'self'", "data:"],
        "upgrade-insecure-requests": null,
      },
    },
  }),
);
app.use(express.json({ limit: "12kb", strict: true }));
app.use(
  "/api/agent",
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/actions",
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use((req, _res, next) => {
  const origin = req.get("origin");
  const allowed = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.APP_URL,
  ]
    .filter((value): value is string => !!value)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    });
  if (
    origin &&
    !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) &&
    !allowed.includes(origin)
  )
    return next(Object.assign(new Error("Forbidden."), { status: 403 }));
  next();
});
app.use((req, res, next) => {
  const owner = req
    .get("x-demo-session")
    ?.replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  res.locals.owner = owner || "local-demo";
  next();
});
app.use(async (req, res, next) => {
  if (process.env.SELLER360_HOSTED !== "1" || !req.path.startsWith("/api"))
    return next();
  if (
    !req.get("x-demo-session") ||
    !/^[a-zA-Z0-9_-]{20,80}$/.test(req.get("x-demo-session")!)
  )
    return res
      .status(400)
      .json({ error: "A valid browser workspace is required." });
  try {
    if (
      req.method === "POST" &&
      ["/api/agent/start", "/api/agent/turn"].includes(req.path) &&
      !providerStatus().configured
    )
      return res.status(503).json({
        error: "Configure the cloud AI API key before starting Nova.",
      });
    if (
      [
        "/api/health",
        "/api/seller/performance",
        "/api/seller/insights",
      ].includes(req.path)
    )
      return next();
    await withCloudWorkspace(res.locals.owner, async () => {
      if (
        req.method === "POST" &&
        ["/api/agent/start", "/api/agent/turn"].includes(req.path)
      )
        await claimCloudUsage(res.locals.owner);
      next();
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/health", async (_req, res) =>
  res.json({
    ...(await getProviderHealth()),
    timestamp: new Date().toISOString(),
  }),
);
app.get("/api/seller/performance", (_req, res) =>
  res.json(analyzeSellerPerformance()),
);
app.get("/api/seller/insights", (_req, res) =>
  res.json({ insights: getBusinessInsights() }),
);
function disconnectSignal(res: Response) {
  const controller = new AbortController();
  res.once("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}
const lang = z.enum(["en-IN", "hi-IN"]).default("en-IN");
app.post("/api/agent/start", async (req, res, next) => {
  try {
    const body = z.object({ language: lang }).safeParse(req.body ?? {});
    if (!body.success)
      return res
        .status(400)
        .json({ error: "Choose English or Hindi for the demo." });
    res.json(
      await startSession(
        res.locals.owner,
        body.data.language,
        disconnectSignal(res),
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/agent/turn", async (req, res, next) => {
  try {
    const body = z
      .object({
        sessionId: z.string().uuid(),
        message: z.string().trim().min(1).max(1200),
      })
      .safeParse(req.body);
    if (!body.success)
      return res.status(400).json({
        error: "A session and a message under 1,200 characters are required.",
      });
    res.json(
      await processTurn(
        res.locals.owner,
        body.data.sessionId,
        body.data.message,
        disconnectSignal(res),
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/agent/end", async (req, res, next) => {
  try {
    const body = z.object({ sessionId: z.string().uuid() }).safeParse(req.body);
    if (!body.success)
      return res.status(400).json({ error: "A valid session is required." });
    res.json(await endSession(res.locals.owner, body.data.sessionId));
  } catch (e) {
    next(e);
  }
});
app.get("/api/agent/history", (req, res) =>
  res.json({ sessions: getHistory(res.locals.owner) }),
);
app.get("/api/actions", (req, res) =>
  res.json({ actions: getActions(res.locals.owner) }),
);
app.post("/api/actions", async (req, res, next) => {
  try {
    const parsed = z
      .object({
        key: z.enum([
          "restock",
          "dispatch",
          "cancellations",
          "visibility",
          "pricing",
        ]),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Choose an available recommendation." });
    if (!getActions(res.locals.owner).some((a) => a.key === parsed.data.key))
      await createActionPlan(res.locals.owner, [parsed.data.key]);
    res.status(201).json({ actions: getActions(res.locals.owner) });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/actions/:id", async (req, res, next) => {
  try {
    const parsed = z
      .object({ status: z.enum(["suggested", "started", "completed"]) })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Choose suggested, started or completed." });
    const action = await updateAction(
      res.locals.owner,
      req.params.id,
      parsed.data.status,
    );
    if (!action) return res.status(404).json({ error: "Action not found." });
    res.json({ action, actions: getActions(res.locals.owner) });
  } catch (e) {
    next(e);
  }
});
app.use(express.static("dist", { maxAge: "1h", etag: true, index: false }));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile("index.html", { root: "dist" }, (err) => {
    if (err) next(err);
  });
});
app.use(
  (
    err: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (res.destroyed) return;
    if (err.name === "AbortError") {
      res.status(409).json({ error: "This reply was cancelled." });
      return;
    }
    console.error("Request error:", err.name, err.message);
    res.status(err.status ?? 500).json({
      error:
        err.status && (err.status < 500 || err.status === 503)
          ? err.message
          : "A temporary service error occurred. Your demo session is safe; please try again.",
    });
  },
);
export default app;
