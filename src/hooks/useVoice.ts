import { useCallback, useEffect, useRef, useState } from "react";
import {
  prepareLocalSpeechModel,
  transcribeLocally,
  releaseLocalSpeech,
} from "../lib/localSpeech";
import { configureNovaSpeech, selectNovaVoice } from "../lib/novaSpeech";
type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "ended"
  | "error";
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechWindow extends Window {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
  webkitAudioContext?: typeof AudioContext;
}
interface LocalMonitor {
  context: AudioContext;
  analyser: AnalyserNode;
  frame: number;
}
export function useVoice(onUtterance: (text: string) => Promise<void>) {
  const [state, setState] = useState<VoiceState>("idle");
  const [voiceName, setVoiceName] = useState("System voice");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [available, setAvailable] = useState(false);
  const [language, setLanguage] = useState<"en-IN" | "hi-IN">("en-IN");
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const localMonitor = useRef<LocalMonitor | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const active = useRef(false);
  const inFlight = useRef(false);
  const latest = useRef(onUtterance);
  const mutedRef = useRef(muted);
  const languageRef = useRef(language);
  const endResolver = useRef<(() => void) | null>(null);
  const listenRef = useRef<() => void>(() => {});
  const autoResumeRecognition = useRef(true);
  const localMode = useRef(false);
  const playbackVersion = useRef(0);
  const thinkingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const thinking = useRef(false);
  const cueSpeaking = useRef(false);

  const endThinking = useCallback(() => {
    thinking.current = false;
    thinkingTimers.current.forEach(clearTimeout);
    thinkingTimers.current = [];
    if (cueSpeaking.current) {
      cueSpeaking.current = false;
      window.speechSynthesis?.cancel();
    }
  }, []);
  const beginThinking = useCallback(() => {
    endThinking();
    thinking.current = true;
    setState("processing");
    const cues =
      languageRef.current === "hi-IN"
        ? ["एक पल।"]
        : ["Let me think for a moment."];
    [1800].forEach((delay, index) => {
      thinkingTimers.current.push(
        setTimeout(() => {
          if (!thinking.current || mutedRef.current || !window.speechSynthesis)
            return;
          const utterance = new SpeechSynthesisUtterance(cues[0]);
          configureNovaSpeech(
            utterance,
            languageRef.current,
            window.speechSynthesis.getVoices(),
          );
          cueSpeaking.current = true;
          utterance.onend = utterance.onerror = () => {
            cueSpeaking.current = false;
          };
          window.speechSynthesis.speak(utterance);
        }, delay),
      );
    });
  }, [endThinking]);
  const discardedRecorders = useRef(new WeakSet<MediaRecorder>());

  useEffect(() => {
    latest.current = onUtterance;
  }, [onUtterance]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    languageRef.current = language;
    if (recognition.current) recognition.current.lang = language;
  }, [language]);

  const stopMonitor = useCallback(() => {
    const current = localMonitor.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    localMonitor.current = null;
    void current.context.close();
  }, []);

  const stopLocalCapture = useCallback(
    (discard: boolean) => {
      stopMonitor();
      const current = recorder.current;
      if (current && current.state !== "inactive") {
        if (discard) discardedRecorders.current.add(current);
        current.stop();
      }
    },
    [stopMonitor],
  );

  const teardown = useCallback(
    (finalState: VoiceState) => {
      endThinking();
      playbackVersion.current++;
      active.current = false;
      inFlight.current = false;
      autoResumeRecognition.current = false;
      localMode.current = false;
      recognition.current?.abort();
      recognition.current = null;
      stopLocalCapture(true);
      releaseLocalSpeech();
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaStream.current = null;
      window.speechSynthesis?.cancel();
      endResolver.current?.();
      endResolver.current = null;
      setPartial("");
      setLocalStatus(null);
      setState(finalState);
    },
    [stopLocalCapture, endThinking],
  );

  const handleTranscript = useCallback(async (text: string) => {
    const phrase = text.trim();
    if (!phrase || inFlight.current) return;
    setPartial("");
    inFlight.current = true;
    setState("processing");
    try {
      await latest.current(phrase);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The reply could not be loaded.",
      );
      setState("error");
    } finally {
      inFlight.current = false;
      if (active.current) {
        setState("listening");
        listenRef.current();
      }
    }
  }, []);

  const updateModelProgress = useCallback((progress: { progress?: number }) => {
    const percent = Math.max(
      0,
      Math.min(100, Math.round(progress.progress ?? 0)),
    );
    setLocalStatus(
      percent > 0
        ? `Downloading on-device speech model (${percent}%). It is cached after the first download.`
        : "Preparing on-device speech recognition…",
    );
  }, []);

  const startLocalCapture = useCallback(() => {
    if (
      !active.current ||
      inFlight.current ||
      !localMode.current ||
      recorder.current ||
      !mediaStream.current
    )
      return;

    const AudioContextClass =
      window.AudioContext || (window as SpeechWindow).webkitAudioContext;
    if (!AudioContextClass || !window.MediaRecorder) {
      setError(
        "Local speech recognition is unavailable in this browser. Open the app in a recent desktop Chrome browser or use the transcript field.",
      );
      setState("error");
      return;
    }

    let currentRecorder: MediaRecorder;
    let context: AudioContext;
    let analyser: AnalyserNode;
    try {
      const preferredType = "audio/webm;codecs=opus";
      const options = MediaRecorder.isTypeSupported(preferredType)
        ? { mimeType: preferredType }
        : undefined;
      currentRecorder = new MediaRecorder(mediaStream.current, options);
      context = new AudioContextClass();
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(mediaStream.current).connect(analyser);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `On-device microphone capture failed: ${cause.message}`
          : "On-device microphone capture failed. Use the transcript field.",
      );
      setState("error");
      return;
    }

    recorder.current = currentRecorder;
    const chunks: BlobPart[] = [];
    const samples = new Uint8Array(analyser.fftSize);
    let speechStarted = false;
    let silenceMs = 0;
    let lastFrame = performance.now();
    const segmentStartedAt = lastFrame;
    currentRecorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    currentRecorder.onstop = () => {
      if (recorder.current === currentRecorder) recorder.current = null;
      const discard = discardedRecorders.current.has(currentRecorder);
      if (discard || !active.current || !chunks.length) return;
      stopMonitor();
      if (!speechStarted) {
        listenRef.current();
        return;
      }

      const audio = new Blob(chunks, {
        type: currentRecorder.mimeType || "audio/webm",
      });
      inFlight.current = true;
      setState("processing");
      setLocalStatus("Transcribing this utterance on your device…");
      void transcribeLocally(audio, languageRef.current, updateModelProgress)
        .then((text) => {
          if (!active.current) return;
          inFlight.current = false;
          setLocalStatus(null);
          if (text.trim()) return handleTranscript(text);
          setState("listening");
          listenRef.current();
        })
        .catch((cause) => {
          if (!active.current) return;
          setError(
            cause instanceof Error
              ? `On-device speech recognition failed: ${cause.message}. Check your connection for the first model download, then retry.`
              : "On-device speech recognition failed. Check your connection for the first model download, then retry.",
          );
          setLocalStatus(null);
          setState("error");
          inFlight.current = false;
        });
    };

    try {
      currentRecorder.start(200);
      setState("listening");
      const tick = () => {
        if (
          !active.current ||
          recorder.current !== currentRecorder ||
          inFlight.current
        )
          return;
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const value = (sample - 128) / 128;
          energy += value * value;
        }
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        const elapsed = now - lastFrame;
        lastFrame = now;
        if (rms > 0.018) {
          speechStarted = true;
          silenceMs = 0;
        } else if (speechStarted) silenceMs += elapsed;

        if (
          (speechStarted &&
            (silenceMs > 950 || now - segmentStartedAt > 20000)) ||
          (!speechStarted && now - segmentStartedAt > 12000)
        ) {
          stopLocalCapture(false);
          return;
        }
        if (localMonitor.current) {
          localMonitor.current.frame = requestAnimationFrame(tick);
        }
      };
      localMonitor.current = {
        context,
        analyser,
        frame: requestAnimationFrame(tick),
      };
    } catch (cause) {
      recorder.current = null;
      stopMonitor();
      setError(
        cause instanceof Error
          ? `Microphone recording could not start: ${cause.message}`
          : "Microphone recording could not start.",
      );
      setState("error");
    }
  }, [handleTranscript, stopLocalCapture, stopMonitor, updateModelProgress]);

  const enableLocalMode = useCallback(() => {
    localMode.current = true;
    autoResumeRecognition.current = true;
    setError(null);
    setLocalStatus(
      "Switching to on-device speech recognition. The first model download is about 100 MB and is cached on this device.",
    );
    void prepareLocalSpeechModel(updateModelProgress).then(
      () =>
        active.current &&
        setLocalStatus(
          "On-device speech is ready. Your microphone audio stays on this device.",
        ),
      () =>
        active.current &&
        setLocalStatus(
          "On-device model download failed. Check your connection and retry the microphone.",
        ),
    );
    if (recognition.current) {
      recognition.current.abort();
      return;
    }
    startLocalCapture();
  }, [startLocalCapture, updateModelProgress]);

  const listen = useCallback(() => {
    if (!active.current || inFlight.current) return;
    if (localMode.current) {
      startLocalCapture();
      return;
    }
    if (recognition.current) return;

    const browser = window as SpeechWindow;
    const API = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!API) {
      enableLocalMode();
      return;
    }

    const current = new API();
    current.lang = languageRef.current;
    current.continuous = false;
    current.interimResults = true;
    current.maxAlternatives = 1;
    recognition.current = current;
    let finalHandled = false;
    setPartial("");
    current.onresult = (event) => {
      autoResumeRecognition.current = true;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i][0]?.transcript?.trim();
        if (!phrase) continue;
        if (event.results[i].isFinal) {
          if (!finalHandled) {
            finalHandled = true;
            void handleTranscript(phrase);
          }
        } else interim = phrase;
      }
      setPartial(interim);
    };
    current.onerror = (event) => {
      if (!active.current || inFlight.current) return;
      if (["no-speech", "aborted"].includes(event.error)) {
        setState("paused");
        return;
      }
      if (["network", "service-not-allowed"].includes(event.error)) {
        enableLocalMode();
        return;
      }
      autoResumeRecognition.current = false;
      if (event.error === "not-allowed") {
        setError(
          "Microphone access was denied. Allow it for localhost in your browser settings, then retry. You can still use the transcript field.",
        );
        teardown("error");
        return;
      }
      if (event.error === "audio-capture") {
        setError(
          "No microphone was found. Check your device settings or use the transcript field.",
        );
        setState("paused");
        return;
      }
      enableLocalMode();
    };
    current.onend = () => {
      if (recognition.current === current) recognition.current = null;
      if (
        active.current &&
        !inFlight.current &&
        autoResumeRecognition.current
      ) {
        if (localMode.current) startLocalCapture();
        else {
          setState("listening");
          if (!window.speechSynthesis?.speaking) listenRef.current();
        }
      }
    };
    try {
      current.start();
      setState("listening");
      setError(null);
    } catch {
      enableLocalMode();
    }
  }, [enableLocalMode, handleTranscript, startLocalCapture, teardown]);
  listenRef.current = listen;

  const start = useCallback(async () => {
    const browser = window as SpeechWindow;
    const audioAvailable = Boolean(
      "mediaDevices" in navigator &&
      "getUserMedia" in navigator.mediaDevices &&
      "MediaRecorder" in window &&
      (window.AudioContext || browser.webkitAudioContext),
    );
    const recognitionAvailable = Boolean(
      browser.SpeechRecognition || browser.webkitSpeechRecognition,
    );
    if (!audioAvailable && !recognitionAvailable) {
      setError(
        "Voice input is unavailable in this browser. Use the transcript field or open Seller360 in a recent desktop browser.",
      );
      setState("error");
      return;
    }
    setError(null);
    setLocalStatus(null);
    setState("connecting");
    autoResumeRecognition.current = true;
    active.current = true;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        mediaStream.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }
      if (!active.current) return;
      window.speechSynthesis?.getVoices();
      await latest.current("__START__");
      if (active.current && !recognition.current) listenRef.current();
    } catch (cause) {
      if (!active.current) return;
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser address bar and start again."
          : cause instanceof Error
            ? cause.message
            : "Microphone permission could not be checked.",
      );
      teardown("error");
    }
  }, [teardown]);

  const resumeMicrophone = useCallback(async () => {
    endThinking();
    playbackVersion.current++;
    window.speechSynthesis?.cancel();
    endResolver.current?.();
    endResolver.current = null;
    setError(null);
    autoResumeRecognition.current = true;
    if (active.current && mediaStream.current) {
      inFlight.current = false;
      listenRef.current();
      return;
    }
    setState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Microphone access is unavailable in this browser.");
      mediaStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      active.current = true;
      inFlight.current = false;
      listenRef.current();
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in the address bar, then retry."
          : cause instanceof Error
            ? cause.message
            : "Microphone permission could not be checked.",
      );
      setState("error");
    }
  }, [endThinking]);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        endThinking();
        const version = ++playbackVersion.current;
        inFlight.current = true;
        endResolver.current?.();
        endResolver.current = null;
        recognition.current?.abort();
        recognition.current = null;
        stopLocalCapture(true);
        window.speechSynthesis?.cancel();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
          if (version !== playbackVersion.current) return;
          endResolver.current = null;
          inFlight.current = false;
          if (active.current) {
            setState("listening");
            listenRef.current();
          } else setState("idle");
        };
        endResolver.current = done;
        if (mutedRef.current || !window.speechSynthesis) {
          done();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        configureNovaSpeech(utterance, languageRef.current, voices);
        setVoiceName(utterance.voice?.name || "System voice");
        utterance.onstart = () => {
          if (version === playbackVersion.current) setState("speaking");
        };
        utterance.onend = utterance.onerror = done;
        setState("speaking");
        window.speechSynthesis.speak(utterance);
      }),
    [stopLocalCapture, endThinking],
  );
  useEffect(() => {
    const refreshVoice = () =>
      setVoiceName(
        selectNovaVoice(window.speechSynthesis?.getVoices() || [], language)
          ?.name || "System voice",
      );
    refreshVoice();
    window.speechSynthesis?.addEventListener?.("voiceschanged", refreshVoice);
    return () =>
      window.speechSynthesis?.removeEventListener?.(
        "voiceschanged",
        refreshVoice,
      );
  }, [language]);

  useEffect(() => {
    const browser = window as SpeechWindow;
    const canRecord = Boolean(
      "mediaDevices" in navigator &&
      "getUserMedia" in navigator.mediaDevices &&
      "MediaRecorder" in window &&
      (window.AudioContext || browser.webkitAudioContext),
    );
    setAvailable(
      canRecord ||
        Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition),
    );
    return () => {
      endThinking();
      playbackVersion.current++;
      active.current = false;
      recognition.current?.abort();
      recognition.current = null;
      stopLocalCapture(true);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaStream.current = null;
      window.speechSynthesis?.cancel();
      endResolver.current?.();
    };
  }, [stopLocalCapture, endThinking]);

  const stop = useCallback(() => teardown("ended"), [teardown]);
  const pause = useCallback(() => {
    playbackVersion.current++;
    inFlight.current = true;
    recognition.current?.abort();
    recognition.current = null;
    stopLocalCapture(true);
    window.speechSynthesis?.cancel();
    endResolver.current?.();
    endResolver.current = null;
    setState("processing");
  }, [stopLocalCapture]);
  const resume = useCallback(() => {
    if (!active.current) return;
    inFlight.current = false;
    listenRef.current();
  }, []);
  const pauseMicrophone = useCallback(() => {
    pause();
    setState("paused");
  }, [pause]);
  const toggleMute = useCallback(() => {
    setMuted((value) => {
      mutedRef.current = !value;
      if (!value) {
        cueSpeaking.current = false;
        window.speechSynthesis?.cancel();
        endResolver.current?.();
        endResolver.current = null;
        if (active.current) listenRef.current();
      }
      return !value;
    });
  }, []);

  return {
    beginThinking,
    endThinking,
    voiceName,
    state,
    partial,
    error,
    localStatus,
    localMode: localMode.current,
    muted,
    available,
    language,
    setLanguage,
    start,
    stop,
    speak,
    toggleMute,
    pause,
    pauseMicrophone,
    resume,
    resumeMicrophone,
    setListening: listen,
    isActive: active.current,
  };
}
