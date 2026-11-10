// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentResponse, AgentSession } from "../shared/types";
const mocks = vi.hoisted(() => ({
  onUtterance: null as null | ((text: string) => Promise<void>),
  api: {
    health: vi.fn(),
    performance: vi.fn(),
    actions: vi.fn(),
    history: vi.fn(),
    start: vi.fn(),
    turn: vi.fn(),
    end: vi.fn(),
  },
  voice: {
    state: "idle",
    language: "en-IN",
    voiceName: "Samantha",
    available: true,
    muted: false,
    partial: "",
    error: null,
    localStatus: null,
    localMode: false,
    isActive: false,
    start: vi.fn(),
    stop: vi.fn(),
    speak: vi.fn(),
    pause: vi.fn(),
    pauseMicrophone: vi.fn(),
    resume: vi.fn(),
    resumeMicrophone: vi.fn(),
    beginThinking: vi.fn(),
    endThinking: vi.fn(),
    toggleMute: vi.fn(),
    setLanguage: vi.fn(),
  },
}));
vi.mock("../src/lib/api", () => ({ api: mocks.api }));
vi.mock("../src/hooks/useVoice", () => ({
  useVoice: (onUtterance: (text: string) => Promise<void>) => {
    mocks.onUtterance = onUtterance;
    return mocks.voice;
  },
}));
vi.mock("../src/components/Charts", () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="chart">{title}</div>
  ),
}));
import App from "../src/App";
import { analyzeSellerPerformance } from "../server/src/services/analytics";
const makeSession = (): AgentSession => ({
  id: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  endedAt: null,
  stage: "greeting",
  messages: [
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Hello from Nova.",
      timestamp: new Date().toISOString(),
    },
  ],
  statements: [],
  askedTopics: [],
  concern: "",
  diagnosis: {
    primaryIssue: "Review",
    supportingSignals: [],
    unresolvedQuestions: [],
  },
  recommendedActions: [],
  committedKeys: [],
  activity: [],
  summary: null,
  mode: "ollama",
  model: "test-model",
  fallbackReason: null,
  language: "en-IN",
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  localStorage.clear();
  vi.clearAllMocks();
  mocks.api.health.mockResolvedValue({
    provider: "ollama",
    configured: true,
    ready: true,
    model: "test-model",
  });
  mocks.api.performance.mockResolvedValue(analyzeSellerPerformance());
  mocks.api.actions.mockResolvedValue({ actions: [] });
  mocks.api.history.mockResolvedValue({ sessions: [] });
  mocks.voice.speak.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("Workspace failure states", () => {
  it("preserves a routed prompt under React StrictMode", async () => {
    const session = makeSession();
    mocks.api.start.mockImplementation((_lang: string, signal: AbortSignal) =>
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return { session, assistantMessage: "Hello", actions: [] };
      }),
    );
    mocks.api.turn.mockResolvedValue({
      session,
      assistantMessage: "Review dispatch",
      actions: [],
    });
    render(
      <StrictMode>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/kam",
              state: { prompt: "Review my dispatch capacity" },
            },
          ]}
        >
          <App />
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() =>
      expect(mocks.api.turn).toHaveBeenCalledWith(
        session.id,
        "Review my dispatch capacity",
        expect.any(AbortSignal),
      ),
    );
  });
  it("hands a growth note to Nova", async () => {
    const session = makeSession();
    mocks.api.start.mockResolvedValue({
      session,
      assistantMessage: "Hello",
      actions: [],
    });
    mocks.api.turn.mockResolvedValue({
      session,
      assistantMessage: "Review dispatch",
      actions: [],
    });
    render(
      <MemoryRouter initialEntries={["/growth"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.change(
      screen.getByLabelText(
        "What growth problem should Nova understand better?",
      ),
      { target: { value: "Our dispatch capacity is limited" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Share in conversation" }),
    );
    await waitFor(() =>
      expect(mocks.api.turn).toHaveBeenCalledWith(
        session.id,
        "Our dispatch capacity is limited",
        expect.any(AbortSignal),
      ),
    );
  });
  it("ends during an answer and ignores its late completion", async () => {
    const session = makeSession();
    mocks.api.history.mockResolvedValue({ sessions: [session] });
    let finish!: (r: AgentResponse) => void;
    mocks.api.turn.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    mocks.api.end.mockResolvedValue({
      session: {
        ...session,
        endedAt: new Date().toISOString(),
        stage: "ended",
      },
      assistantMessage: "",
      actions: [],
    });
    render(
      <MemoryRouter initialEntries={["/kam"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Take your time");
    let pending!: Promise<void>;
    act(() => {
      pending = mocks.onUtterance!("Review cancellations");
    });
    await waitFor(() => expect(mocks.api.turn).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await waitFor(() => expect(mocks.api.end).toHaveBeenCalledWith(session.id));
    await act(async () => {
      finish({ session, assistantMessage: "Late reply", actions: [] });
      await pending;
    });
    expect(mocks.voice.speak).not.toHaveBeenCalledWith("Late reply");
  });
  it("does not invent signals when performance fails", async () => {
    mocks.api.performance.mockRejectedValue(
      new Error("Performance unavailable"),
    );
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Performance unavailable");
    expect(screen.queryByText("Revenue is lower vs previous month")).toBeNull();
    expect(screen.queryByText("Average selling price is stable")).toBeNull();
  });
  it("shows task failures instead of an empty account", async () => {
    mocks.api.actions.mockRejectedValue(new Error("Tasks unavailable"));
    render(
      <MemoryRouter initialEntries={["/actions"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Tasks unavailable");
    expect(screen.queryByText("No tasks here yet")).toBeNull();
  });
  it("shows history failures with retry", async () => {
    mocks.api.history.mockRejectedValue(new Error("History unavailable"));
    render(
      <MemoryRouter initialEntries={["/history"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("History unavailable");
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});
describe("Nova call experience", () => {
  it("does not speak thinking cues before the introduction or a resumed greeting", async () => {
    const started = makeSession();
    let resolveStart!: (r: AgentResponse) => void;
    mocks.api.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );
    render(
      <MemoryRouter initialEntries={["/kam"]}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mocks.api.history).toHaveBeenCalled());
    let opening!: Promise<void>;
    act(() => {
      opening = mocks.onUtterance!("__START__");
    });
    await waitFor(() => expect(mocks.api.start).toHaveBeenCalledOnce());
    expect(screen.getByText("Connecting with Nova")).toBeTruthy();
    expect(mocks.voice.beginThinking).not.toHaveBeenCalled();
    await act(async () => {
      resolveStart({
        session: started,
        assistantMessage: "Hello from Nova.",
        actions: [],
      });
      await opening;
    });
    expect(mocks.voice.speak).toHaveBeenCalledWith("Hello from Nova.");
    await act(async () => {
      await mocks.onUtterance!("__START__");
    });
    expect(mocks.voice.beginThinking).not.toHaveBeenCalled();
  });
  it("has three destinations and keeps every metric on Dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("table", {
      name: "Account performance comparison",
    });
    const nav = document.querySelector(".side-nav")!;
    expect(
      [...nav.querySelectorAll("a")].map((a) => a.getAttribute("aria-label")),
    ).toEqual(["Dashboard", "Get help from Nova", "Actions"]);
    expect(
      nav.querySelector('[aria-current="page"]')?.getAttribute("href"),
    ).toBe("/");
    expect(screen.getAllByRole("rowheader").map((n) => n.textContent)).toEqual([
      "Total sales",
      "Total orders",
      "Cancellation rate",
      "Avg. selling price",
      "Out of stock",
    ]);
    expect(screen.queryByRole("link", { name: "Stats" })).toBeNull();
  });
  it("hides messages during a call and reveals a single ordered transcript after ending", async () => {
    const started = makeSession();
    let resolveTurn!: (r: AgentResponse) => void;
    mocks.api.start.mockResolvedValue({
      session: started,
      assistantMessage: "Hello from Nova.",
      actions: [],
    });
    mocks.api.turn.mockImplementation(
      () => new Promise((resolve) => (resolveTurn = resolve)),
    );
    const { container } = render(
      <MemoryRouter initialEntries={["/kam"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Prefer to type?" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to Nova" }), {
      target: { value: "Why did my sales fall?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(mocks.api.turn).toHaveBeenCalledOnce());
    expect(screen.getByText("Nova is thinking")).toBeTruthy();
    expect(container.querySelectorAll(".conversation-message")).toHaveLength(0);
    expect(screen.queryByText("Why did my sales fall?")).toBeNull();
    expect(localStorage.getItem("seller360.history")).toBeNull();
    expect(mocks.voice.beginThinking).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(mocks.api.turn).toHaveBeenCalledOnce();
    const replied: AgentSession = {
      ...started,
      messages: [
        ...started.messages,
        {
          id: crypto.randomUUID(),
          role: "seller",
          content: "Why did my sales fall?",
          timestamp: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Orders fell; let's investigate.",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    await act(async () =>
      resolveTurn({
        session: replied,
        assistantMessage: "Orders fell; let's investigate.",
        actions: [],
      }),
    );
    expect(container.querySelectorAll(".conversation-message")).toHaveLength(0);
    expect(mocks.voice.endThinking).toHaveBeenCalled();
    expect(mocks.voice.speak).toHaveBeenCalledWith(
      "Orders fell; let's investigate.",
    );
    const ended = {
      ...replied,
      endedAt: new Date().toISOString(),
      stage: "ended" as const,
    };
    mocks.api.end.mockResolvedValue({
      session: ended,
      assistantMessage: "",
      actions: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    await screen.findByText("Your conversation, ready to revisit.");
    expect(container.querySelectorAll(".conversation-message")).toHaveLength(3);
    expect(
      [...container.querySelectorAll(".seller-message .message-body p")].map(
        (n) => n.textContent,
      ),
    ).toEqual(["Why did my sales fall?"]);
    expect(
      JSON.parse(localStorage.getItem("seller360.history")!)[0].messages,
    ).toHaveLength(3);
    expect(mocks.voice.stop).toHaveBeenCalledOnce();
  });
});
