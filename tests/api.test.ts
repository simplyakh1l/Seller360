import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../server/src/app";

beforeEach(() => vi.stubEnv("LLM_PROVIDER", "demo"));
afterEach(() => vi.unstubAllEnvs());

describe("Seller360 REST API", () => {
  it("exposes health and the exact calculated seller dataset", async () => {
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toMatchObject({
      status: "ok",
      provider: "demo",
      configured: false,
      demoData: true,
    });
    const performance = await request(app)
      .get("/api/seller/performance")
      .expect(200);
    expect(
      performance.body.metrics.map(
        (metric: { key: string; change: number }) => [
          metric.key,
          metric.change,
        ],
      ),
    ).toEqual([
      ["sales", -32.5],
      ["orders", -32.5],
      ["cancellationRate", 6],
      ["averageSellingPrice", 0],
      ["outOfStockProducts", 260],
    ]);
  });

  it("validates requests and scopes the session to its demo owner", async () => {
    const owner = "http-test-" + crypto.randomUUID();
    const invalid = await request(app)
      .post("/api/agent/turn")
      .set("x-demo-session", owner)
      .send({ sessionId: "invalid", message: "" })
      .expect(400);
    expect(invalid.body.error).toContain("under 1,200 characters");
    const start = await request(app)
      .post("/api/agent/start")
      .set("x-demo-session", owner)
      .send({ language: "en-IN" })
      .expect(200);
    await request(app)
      .post("/api/agent/turn")
      .set("x-demo-session", "other-" + owner)
      .send({
        sessionId: start.body.session.id,
        message: "Why have my sales dropped?",
      })
      .expect(404);
    await request(app)
      .post("/api/agent/turn")
      .set("x-demo-session", owner)
      .send({
        sessionId: start.body.session.id,
        message: "Why have my sales dropped?",
      })
      .expect(200);
  });
});
