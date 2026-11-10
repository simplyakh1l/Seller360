import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../server/src/app";
import { providerStatus } from "../server/src/services/llm";
afterEach(() => vi.unstubAllEnvs());
describe("Hosted deployment boundaries", () => {
  it("allows the configured production origin", async () => {
    vi.stubEnv("URL", "https://seller360.netlify.app");
    await request(app)
      .get("/api/seller/performance")
      .set("Origin", "https://seller360.netlify.app")
      .expect(200);
  });
  it("still rejects unrelated origins", async () => {
    vi.stubEnv("URL", "https://seller360.netlify.app");
    await request(app)
      .get("/api/seller/performance")
      .set("Origin", "https://unrelated.example")
      .expect(403);
  });
  it("reports a missing configured Gemini key without pretending a local model is ready", () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(providerStatus()).toMatchObject({
      provider: "gemini",
      configured: false,
      model: "gemini-3.1-flash-lite",
    });
  });
  it("does not replace failed hosted reasoning with scripted replies", async () => {
    vi.stubEnv("SELLER360_HOSTED", "1");
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await request(app)
      .post("/api/agent/start")
      .set("x-demo-session", crypto.randomUUID())
      .send({ language: "en-IN" })
      .expect(503);
    expect(result.body.error).toMatch(/configure|available|key/i);
  });
});
