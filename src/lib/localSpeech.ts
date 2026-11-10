type ModelProgress = {
  file?: string;
  progress?: number;
  status?: string;
};
type PendingRequest = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  progress?: (value: ModelProgress) => void;
  timeout: ReturnType<typeof setTimeout>;
};
let worker: Worker | null = null;
let requestId = 0;
let lifecycle = 0;
const pending = new Map<number, PendingRequest>();

/** Keep the cached download but release model memory after a call. */
export function releaseLocalSpeech() {
  lifecycle++;
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(
      new DOMException(
        "Speech recognition stopped. Retry the microphone if needed.",
        "AbortError",
      ),
    );
  }
  pending.clear();
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./speech.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      if (data.type === "progress") {
        request.progress?.(data.progress);
        return;
      }
      clearTimeout(request.timeout);
      pending.delete(data.id);
      if (data.type === "error") request.reject(new Error(data.error));
      else request.resolve(data.text ?? "");
    };
    worker.onerror = () => {
      releaseLocalSpeech();
    };
  }
  return worker;
}

function requestSpeech(
  type: "prepare" | "transcribe",
  samples?: Float32Array,
  language?: string,
  progress?: (value: ModelProgress) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const target = getWorker();
    const id = ++requestId;
    const timeout = setTimeout(() => {
      releaseLocalSpeech();
    }, 120000);
    pending.set(id, { resolve, reject, progress, timeout });
    target.postMessage(
      { id, type, samples, language },
      samples ? [samples.buffer] : [],
    );
  });
}

function toMono16k(buffer: AudioBuffer) {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++)
      mono[i] += samples[i] / buffer.numberOfChannels;
  }

  const ratio = buffer.sampleRate / 16000;
  const output = new Float32Array(Math.floor(length / ratio));
  for (let i = 0; i < output.length; i++) {
    const position = i * ratio;
    const before = Math.floor(position);
    const after = Math.min(before + 1, mono.length - 1);
    const fraction = position - before;
    output[i] = mono[before] * (1 - fraction) + mono[after] * fraction;
  }
  return output;
}

export async function transcribeLocally(
  blob: Blob,
  language: "en-IN" | "hi-IN",
  onProgress?: (progress: ModelProgress) => void,
) {
  const generation = lifecycle;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio decoding is unavailable.");

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (generation !== lifecycle)
      throw new DOMException("Speech recognition stopped.", "AbortError");
    const samples = toMono16k(decoded);
    if (samples.length < 4000) return "";
    return transcribeSamples(samples, language, onProgress);
  } finally {
    await context.close();
  }
}

export async function prepareLocalSpeechModel(
  onProgress?: (progress: ModelProgress) => void,
) {
  await requestSpeech("prepare", undefined, undefined, onProgress);
}

export async function transcribeSamples(
  samples: Float32Array,
  language: "en-IN" | "hi-IN",
  onProgress?: (progress: ModelProgress) => void,
) {
  return requestSpeech(
    "transcribe",
    samples,
    language === "hi-IN" ? "hindi" : "english",
    onProgress,
  );
}
