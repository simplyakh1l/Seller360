import "dotenv/config";
import { spawn } from "node:child_process";
const base = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(
  /\/$/,
  "",
);
const model = process.env.OLLAMA_MODEL || "qwen3:4b-instruct";
let runtime;
const online = async () => {
  try {
    return (
      await fetch(base + "/api/tags", { signal: AbortSignal.timeout(1000) })
    ).ok;
  } catch {
    return false;
  }
};
try {
  if (!(await online())) {
    runtime = spawn("ollama", ["serve"], {
      env: { ...process.env, OLLAMA_HOST: new URL(base).host },
      stdio: "ignore",
    });
    let startupError;
    runtime.on("error", (e) => (startupError = e));
    for (let i = 0; i < 30 && !(await online()); i++) {
      if (startupError)
        throw new Error(
          "Install Ollama first (https://ollama.com), then run npm run ai:setup again.",
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!(await online()))
      throw new Error("Ollama did not start. Check the local runtime.");
  }
  console.log("Preparing local model: " + model);
  const code = await new Promise((resolve, reject) => {
    const pull = spawn("ollama", ["pull", model], {
      env: { ...process.env, OLLAMA_HOST: new URL(base).host },
      stdio: "inherit",
    });
    pull.once("error", reject);
    pull.once("exit", resolve);
  });
  if (code !== 0)
    throw new Error("Model download failed. Check the network and retry.");
  console.log(
    "Local AI ready. Set LLM_PROVIDER=ollama in .env, then run npm run dev.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  runtime?.kill("SIGTERM");
}
