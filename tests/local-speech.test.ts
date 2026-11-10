// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareLocalSpeechModel,
  releaseLocalSpeech,
  transcribeSamples,
} from "../src/lib/localSpeech";

class SpeechWorker {
  static instances: SpeechWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    SpeechWorker.instances.push(this);
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}
beforeEach(() => {
  SpeechWorker.instances = [];
  vi.stubGlobal("Worker", SpeechWorker);
});
afterEach(() => {
  releaseLocalSpeech();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Local speech worker lifecycle", () => {
  it("loads only on demand, relays progress, transfers samples, and releases memory", async () => {
    expect(SpeechWorker.instances).toHaveLength(0);
    const progress = vi.fn();
    const preparing = prepareLocalSpeechModel(progress);
    const worker = SpeechWorker.instances[0];
    expect(worker.options).toEqual({ type: "module" });
    const id = worker.postMessage.mock.calls[0][0].id;
    worker.reply({ id, type: "progress", progress: { progress: 50 } });
    expect(progress).toHaveBeenCalledWith({ progress: 50 });
    worker.reply({ id, type: "result" });
    await preparing;
    const samples = new Float32Array(16000);
    const transcribing = transcribeSamples(samples, "hi-IN");
    expect(SpeechWorker.instances).toHaveLength(1);
    const [request, transfer] = worker.postMessage.mock.calls[1];
    expect(request.language).toBe("hindi");
    expect(transfer).toEqual([samples.buffer]);
    worker.reply({ id: request.id, type: "result", text: "नमस्ते" });
    expect(await transcribing).toBe("नमस्ते");
    releaseLocalSpeech();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("rejects pending work on teardown and permits a fresh retry", async () => {
    const preparing = prepareLocalSpeechModel();
    const rejected = expect(preparing).rejects.toMatchObject({
      name: "AbortError",
    });
    releaseLocalSpeech();
    await rejected;
    const retry = prepareLocalSpeechModel();
    const worker = SpeechWorker.instances[1];
    worker.reply({
      id: worker.postMessage.mock.calls[0][0].id,
      type: "result",
    });
    await retry;
  });
  it("surfaces inference errors and times out stalled worker requests", async () => {
    vi.useFakeTimers();
    const inference = transcribeSamples(new Float32Array(16000), "en-IN");
    const worker = SpeechWorker.instances[0];
    worker.reply({
      id: worker.postMessage.mock.calls[0][0].id,
      type: "error",
      error: "Model download failed",
    });
    await expect(inference).rejects.toThrow("Model download failed");
    const stalled = prepareLocalSpeechModel();
    const rejected = expect(stalled).rejects.toThrow();
    vi.advanceTimersByTime(120000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
