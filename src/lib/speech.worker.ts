import { env, pipeline } from "@huggingface/transformers";
import wasmFactoryURL from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import wasmBinaryURL from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

// One WASM thread outside the page keeps typing and call controls responsive.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL(wasmFactoryURL, globalThis.location.href).href,
    wasm: new URL(wasmBinaryURL, globalThis.location.href).href,
  };
}
// The HTTP cache handles these same-origin assets; avoid blob module imports
// that would require weakening the application's script-src policy.
env.useWasmCache = false;
env.allowLocalModels = false;
type Transcriber = (
  audio: Float32Array,
  options: { language: string; task: "transcribe" },
) => Promise<{ text?: string }>;
let model: Promise<Transcriber> | null = null;
const scope = globalThis as unknown as {
  onmessage: (
    event: MessageEvent<{
      id: number;
      type: string;
      samples?: Float32Array;
      language?: string;
    }>,
  ) => void;
  postMessage: (value: unknown) => void;
};
// Preparation and transcription share a single model and execute serially.
let queue = Promise.resolve();
scope.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      model ??= pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-tiny",
        {
          dtype: "q4",
          device: "wasm",
          progress_callback: (progress: unknown) =>
            scope.postMessage({ id: data.id, type: "progress", progress }),
        },
      ) as unknown as Promise<Transcriber>;
      const transcriber = await model;
      const result =
        data.type === "transcribe" && data.samples
          ? await transcriber(data.samples, {
              language: data.language ?? "english",
              task: "transcribe",
            })
          : null;
      scope.postMessage({
        id: data.id,
        type: "result",
        text: result?.text?.trim() ?? "",
      });
    } catch (error) {
      model = null;
      scope.postMessage({
        id: data.id,
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "Local transcription failed.",
      });
    }
  });
};
