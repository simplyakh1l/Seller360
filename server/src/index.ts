import "dotenv/config";
import app from "./app";
import { loadActions, loadSessions } from "./services/store";
import { ensureLocalRuntime } from "./services/localRuntime";
await ensureLocalRuntime();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "127.0.0.1";
await Promise.all([loadActions(), loadSessions()]);
const server = app.listen(port, host, () =>
  console.log("Seller360 API and frontend: http://" + host + ":" + port),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
