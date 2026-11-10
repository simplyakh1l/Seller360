import { spawn, type ChildProcess } from "node:child_process";
import { providerStatus } from "./llm";
export async function ensureLocalRuntime() {
  if (providerStatus().provider !== "ollama") return;
  const base = (
    process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
  const online = async () => {
    try {
      return (
        await fetch(base + "/api/tags", { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {
      return false;
    }
  };
  if (await online()) return;
  if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) return;
  let child: ChildProcess;
  try {
    child = spawn("ollama", ["serve"], {
      env: { ...process.env, OLLAMA_HOST: new URL(base).host },
      stdio: "ignore",
    });
    let failed = false;
    child.on("error", () => {
      failed = true;
      console.warn(
        "Install Ollama, then run npm run ai:setup to enable Local AI.",
      );
    });
    for (const signal of ["SIGTERM", "SIGINT"] as const)
      process.once(signal, () => child.kill("SIGTERM"));
    process.once("exit", () => child.kill("SIGTERM"));
    for (let i = 0; i < 30 && !failed; i++) {
      if (await online()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!failed)
      console.warn(
        "Local AI did not start. Check Ollama and run npm run ai:setup.",
      );
  } catch {
    console.warn("Local AI unavailable. Check Settings for details.");
  }
}
