import { connectLambda } from "@netlify/blobs";
import serverless from "serverless-http";
import app from "../../server/src/app";
const serve = serverless(app);
export const handler = async (
  event: { blobs: string; headers: Record<string, string>; path: string },
  context: object,
) => {
  connectLambda(event);
  return serve(
    {
      ...event,
      path: event.path.replace(/^\/\.netlify\/functions\/api/, "") || "/",
    },
    context,
  );
};
