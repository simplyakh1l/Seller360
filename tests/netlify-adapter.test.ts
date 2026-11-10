import { describe, expect, it, vi } from "vitest";
const serve = vi.hoisted(() =>
  vi.fn(async () => ({
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: '{"ok":true}',
    isBase64Encoded: false,
  })),
);
vi.mock("serverless-http", () => ({ default: () => serve }));
vi.mock("../server/src/app", () => ({ default: {} }));
import handler from "../netlify/functions/api";
describe("Netlify native request adapter", () => {
  it("keeps the native runtime context and adapts URL, body and client IP for Express", async () => {
    const request = new Request(
      "https://seller360.netlify.app/api/agent/start?test=1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"language":"en-IN"}',
      },
    );
    const response = await handler(request, { ip: "203.0.113.8" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/agent/start",
        httpMethod: "POST",
        body: '{"language":"en-IN"}',
        queryStringParameters: { test: "1" },
        requestContext: { identity: { sourceIp: "203.0.113.8" } },
      }),
      expect.anything(),
    );
  });
});
