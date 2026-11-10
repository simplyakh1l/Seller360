// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const localSpeech = vi.hoisted(() => ({
  prepare: vi.fn(async () => {}),
  transcribe: vi.fn(async () => "Recognized by local Whisper."),
  release: vi.fn(),
}));
vi.mock("../src/lib/localSpeech", () => ({
  prepareLocalSpeechModel: localSpeech.prepare,
  transcribeLocally: localSpeech.transcribe,
  releaseLocalSpeech: localSpeech.release,
}));
import { useVoice } from "../src/hooks/useVoice";

class MockRecognition {
  static instances: MockRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: never) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  aborted = false;
  constructor() {
    MockRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.aborted = true;
  }
  abort() {
    this.aborted = true;
  }
  emit(transcript: string, isFinal: boolean) {
    const result = Object.assign([{ transcript }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] } as never);
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }
  state: RecordingState = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    MockMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.onstop?.();
  }
  emit() {
    this.ondataavailable?.({ data: new Blob(["mock audio"]) });
  }
}

class MockAudioContext {
  static hasSpeech = false;
  sampleRate = 48000;
  async close() {}
  createAnalyser() {
    return {
      fftSize: 0,
      getByteTimeDomainData: (samples: Uint8Array) =>
        samples.fill(MockAudioContext.hasSpeech ? 140 : 128),
    };
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
}

class MockUtterance {
  lang = "";
  rate = 0;
  pitch = 0;
  voice?: { lang: string };
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
  constructor(readonly text: string) {}
}

const utterances: MockUtterance[] = [];
const speech = {
  speaking: false,
  speak: vi.fn((utterance: MockUtterance) => {
    utterances.push(utterance);
    speech.speaking = true;
    utterance.onstart?.();
  }),
  cancel: vi.fn(() => {
    speech.speaking = false;
    const current = utterances.at(-1);
    current?.onerror?.();
  }),
  getVoices: vi.fn(() => [{ lang: "en-IN" }, { lang: "hi-IN" }]),
};
const stopTrack = vi.fn();
const getUserMedia = vi.fn(async () => ({
  getTracks: () => [{ stop: stopTrack }],
}));

beforeEach(() => {
  MockAudioContext.hasSpeech = false;
  MockRecognition.instances = [];
  MockMediaRecorder.instances = [];
  localSpeech.prepare.mockReset().mockResolvedValue(undefined);
  localSpeech.release.mockClear();
  localSpeech.transcribe
    .mockReset()
    .mockResolvedValue("Recognized by local Whisper.");
  utterances.length = 0;
  stopTrack.mockClear();
  getUserMedia.mockReset().mockImplementation(async () => ({
    getTracks: () => [{ stop: stopTrack }],
  }));
  speech.speaking = false;
  speech.speak.mockClear();
  speech.cancel.mockClear();
  speech.getVoices.mockClear();
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: MockRecognition,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: speech,
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    value: MockUtterance,
  });
  Object.defineProperty(window, "MediaRecorder", {
    configurable: true,
    value: MockMediaRecorder,
  });
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: MockAudioContext,
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: vi.fn(() => 1),
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("Virtual KAM browser voice controls", () => {
  it("checks microphone access, listens in English (India), sends a final utterance once, and resumes", async () => {
    const onUtterance = vi.fn(async () => {});
    const { result } = renderHook(() => useVoice(onUtterance));

    await act(async () => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(stopTrack).not.toHaveBeenCalled();
    expect(MockRecognition.instances.at(-1)).toMatchObject({
      lang: "en-IN",
      started: true,
      continuous: false,
      interimResults: true,
    });

    await act(async () => result.current.setLanguage("hi-IN"));
    expect(MockRecognition.instances.at(-1)?.lang).toBe("hi-IN");

    const first = MockRecognition.instances.at(-1)!;
    act(() => first.emit("My orders declined.", false));
    expect(result.current.partial).toBe("My orders declined.");
    act(() => first.emit("My orders declined.", true));
    act(() => first.emit("A different final result from the same turn.", true));
    act(() => first.onend?.());
    await waitFor(() => expect(onUtterance).toHaveBeenCalledTimes(2));
    expect(onUtterance).toHaveBeenNthCalledWith(1, "__START__");
    expect(onUtterance).toHaveBeenNthCalledWith(2, "My orders declined.");
    await waitFor(() =>
      expect(MockRecognition.instances.length).toBeGreaterThan(1),
    );
    await waitFor(() => expect(result.current.state).toBe("listening"));
    act(() => result.current.stop());
    expect(result.current.state).toBe("ended");
    expect(result.current.isActive).toBe(false);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("waits for the opening greeting to finish before listening", async () => {
    const { result } = renderHook(() =>
      useVoice(async (text) => {
        if (text === "__START__") {
          await result.current.speak("Welcome to Seller360.");
        }
      }),
    );

    let starting!: Promise<void>;
    act(() => {
      starting = result.current.start();
    });
    await waitFor(() => expect(speech.speak).toHaveBeenCalledOnce());
    expect(MockRecognition.instances).toHaveLength(0);
    expect(result.current.state).toBe("speaking");

    await act(async () => {
      speech.speaking = false;
      utterances[0].onend?.();
      await starting;
    });
    expect(MockRecognition.instances).toHaveLength(1);
    expect(result.current.state).toBe("listening");
    act(() => result.current.stop());
  });

  it("pauses recognition during spoken playback and starts listening again afterwards", async () => {
    const { result } = renderHook(() => useVoice(async () => {}));
    await act(async () => result.current.start());
    const first = MockRecognition.instances.at(-1)!;

    let spoken!: Promise<void>;
    act(() => {
      spoken = result.current.speak("Nova is speaking.");
    });
    expect(first.aborted).toBe(true);
    expect(speech.speak).toHaveBeenCalledOnce();
    expect(utterances[0].voice?.lang).toBe("en-IN");
    expect(result.current.state).toBe("speaking");

    await act(async () => {
      speech.speaking = false;
      utterances[0].onend?.();
      await spoken;
    });
    await waitFor(() =>
      expect(MockRecognition.instances.length).toBeGreaterThan(1),
    );
    expect(result.current.state).toBe("listening");
    act(() => result.current.stop());
  });

  it("surfaces microphone denial, supports a retry and cleans up the active session", async () => {
    getUserMedia.mockRejectedValueOnce(
      new DOMException("Permission denied", "NotAllowedError"),
    );
    const { result } = renderHook(() => useVoice(async () => {}));

    await act(async () => result.current.start());
    expect(result.current.state).toBe("error");
    expect(result.current.error).toMatch(/Microphone access was denied/i);
    expect(MockRecognition.instances).toHaveLength(0);

    await act(async () => result.current.resumeMicrophone());
    expect(result.current.isActive).toBe(true);
    expect(result.current.state).toBe("listening");

    act(() => result.current.stop());
    expect(result.current.state).toBe("ended");
    expect(speech.cancel).toHaveBeenCalled();
  });

  it("reacquires the microphone when resuming a saved session after reload", async () => {
    const onUtterance = vi.fn(async () => {});
    const { result } = renderHook(() => useVoice(onUtterance));

    await act(async () => result.current.resumeMicrophone());
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(MockRecognition.instances.at(-1)?.started).toBe(true);
    expect(onUtterance).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(true);
    act(() => result.current.stop());
  });

  it("switches a browser speech-service failure to private local transcription", async () => {
    const onUtterance = vi.fn(async () => {});
    const { result } = renderHook(() => useVoice(onUtterance));
    await act(async () => result.current.start());
    const failed = MockRecognition.instances[0];

    act(() => failed.onerror?.({ error: "network" }));
    act(() => failed.onend?.());
    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(1));
    expect(result.current.localMode).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("listening");

    act(() => {
      const frames = vi.mocked(window.requestAnimationFrame).mock.calls;
      // A non-silent analyser sample establishes actual speech before stopping.
      MockAudioContext.hasSpeech = true;
      frames.at(-1)?.[0](performance.now());
      MockMediaRecorder.instances[0].emit();
      MockMediaRecorder.instances[0].stop();
    });
    await waitFor(() =>
      expect(onUtterance).toHaveBeenCalledWith("Recognized by local Whisper."),
    );
    expect(localSpeech.transcribe).toHaveBeenCalledWith(
      expect.any(Blob),
      "en-IN",
      expect.any(Function),
    );
    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(2));
    act(() => result.current.stop());
    expect(localSpeech.release).toHaveBeenCalled();
  });

  it("does not run Whisper inference for a silent recording", async () => {
    const { result } = renderHook(() => useVoice(async () => {}));
    await act(async () => result.current.start());
    act(() => MockRecognition.instances[0].onerror?.({ error: "network" }));
    act(() => MockRecognition.instances[0].onend?.());
    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(1));
    act(() => {
      MockMediaRecorder.instances[0].emit();
      MockMediaRecorder.instances[0].stop();
    });
    expect(localSpeech.transcribe).not.toHaveBeenCalled();
    expect(MockMediaRecorder.instances).toHaveLength(2);
    act(() => result.current.stop());
  });

  it("keeps spoken responses muted without suppressing transcript delivery", async () => {
    const { result } = renderHook(() => useVoice(async () => {}));
    await act(async () => result.current.start());
    act(() => result.current.toggleMute());

    await act(async () =>
      result.current.speak("Transcript remains available."),
    );
    expect(result.current.muted).toBe(true);
    expect(speech.speak).not.toHaveBeenCalled();
    expect(result.current.state).toBe("listening");
    act(() => result.current.stop());
  });
});

describe("Nova thinking audio and voice preference", () => {
  it("prefers an available feminine voice and speaks faster", async () => {
    speech.getVoices.mockReturnValueOnce([
      { name: "Rishi", lang: "en-IN" },
      { name: "Samantha", lang: "en-US" },
      { name: "Veena", lang: "en-IN" },
    ] as never);
    const { result } = renderHook(() => useVoice(async () => {}));
    speech.getVoices.mockReturnValueOnce([
      { name: "Rishi", lang: "en-IN" },
      { name: "Samantha", lang: "en-US" },
      { name: "Veena", lang: "en-IN" },
    ] as never);
    let spoken!: Promise<void>;
    act(() => {
      spoken = result.current.speak("Your orders declined.");
    });
    expect(utterances[0].voice).toMatchObject({ name: "Veena" });
    expect(utterances[0].rate).toBe(1.16);
    await act(async () => {
      utterances[0].onend?.();
      await spoken;
    });
  });
  it("keeps the microphone paused through thinking cues and cancels them before the reply", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { result, unmount } = renderHook(() => useVoice(async () => {}));
      await act(async () => result.current.start());
      const count = MockRecognition.instances.length;
      act(() => {
        result.current.pause();
        result.current.beginThinking();
      });
      act(() => vi.advanceTimersByTime(900));
      expect(utterances).toHaveLength(0);
      act(() => vi.advanceTimersByTime(1000));
      expect(utterances).toHaveLength(1);
      expect(utterances[0].text).toMatch(/Hmm|think|check/i);
      act(() => utterances[0].onend?.());
      expect(result.current.state).toBe("processing");
      expect(MockRecognition.instances).toHaveLength(count);
      let reply!: Promise<void>;
      act(() => {
        reply = result.current.speak("The actual answer.");
      });
      act(() => vi.advanceTimersByTime(20000));
      expect(utterances.map((u) => u.text)).toEqual([
        utterances[0].text,
        "The actual answer.",
      ]);
      await act(async () => {
        speech.speaking = false;
        utterances[1].onend?.();
        await reply;
      });
      expect(result.current.state).toBe("listening");
      expect(MockRecognition.instances.length).toBeGreaterThan(count);
      unmount();
      act(() => vi.runOnlyPendingTimers());
      expect(utterances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("mutes thinking cues and never speaks them after stopping", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { result, unmount } = renderHook(() => useVoice(async () => {}));
      act(() => result.current.toggleMute());
      act(() => {
        result.current.pause();
        result.current.beginThinking();
      });
      act(() => vi.advanceTimersByTime(10000));
      expect(utterances).toHaveLength(0);
      act(() => {
        result.current.toggleMute();
        result.current.beginThinking();
        result.current.stop();
      });
      act(() => vi.advanceTimersByTime(20000));
      expect(utterances).toHaveLength(0);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
