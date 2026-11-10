import serverless from "serverless-http";
import app from "../../server/src/app";

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}
const serve = serverless(app);

// The native Functions runtime supplies Blobs' complete consistency context.
// The legacy connectLambda adapter drops the uncached endpoint required by strong reads.
export default async function handler(
  request: Request,
  context: { ip: string },
): Promise<Response> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers);
  headers["x-forwarded-for"] = context.ip;
  const result = (await serve(
    {
      httpMethod: request.method,
      path: url.pathname.replace(/^\/\.netlify\/functions\/api/, "") || "/",
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? null
        : await request.text(),
      isBase64Encoded: false,
      queryStringParameters: Object.fromEntries(url.searchParams),
      requestContext: { identity: { sourceIp: context.ip } },
    },
    context,
  )) as LambdaResponse;
  return new Response(
    result.isBase64Encoded ? Buffer.from(result.body, "base64") : result.body,
    { status: result.statusCode, headers: result.headers as HeadersInit },
  );
}
