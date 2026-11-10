# Seller360 technical note

The previous agent chose questions and plans by turn count; an optional model merely rewrote the chosen script. Without a key, replies were entirely deterministic. That fixed orchestration is removed. Nova now receives the actual dialogue and decides whether to answer, clarify, ask a relevant question or propose actions.

The active workspace uses Ollama and a local Qwen language model without cloud credentials. Gemini GenerateContent and OpenAI Responses remain optional. All providers return validated structured replies containing conversational intent, selected action keys and quoted seller evidence. Dialogue is passed with correct user/assistant roles rather than a prescribed next-step intent.

Analytics remain deterministic: sales and orders fall 32.5%, cancellation rate rises 6 percentage points, stockouts rise from 5 to 18, and ASP remains ₹500. Traffic, conversion, SKU demand, competitor data and cancellation reasons are missing. The prompt separates observed metrics, seller declarations and unknown causes. Clear denials and corrections persist in memory. Questions are not seller evidence. Model-generated prose can still be wrong, so live semantic inspection supplements automated tests.

Side effects are enforced outside generated prose. Proposing a plan saves nothing. Explicit approval of a pending plan is required to create local tasks. Refusal clears approval state and thanks does not create another plan. Proposed inventory/dispatch tasks are checked against explicit denials. No marketplace system is connected.

Health checks inspect the installed local model. Startup launches Ollama if required; npm run ai:setup prepares the model once. Data & privacy reports provider/model availability; the call surface labels model outages as a limited rules-only fallback. Configuration and optional credentials live in the ignored .env file.

Voice uses browser recognition where available, with on-device Whisper Tiny when its hosted service fails. First use downloads the local model; subsequent calls reuse the browser cache. Local transcription keeps audio on-device; browser-native recognition may use a vendor service. Spoken replies pause the microphone to prevent feedback. Typed input remains available.

Tests cover model-driven decision handling, dialogue history, context corrections, unknowns, direct explanation requests, refusal, natural approval, thanks, API scoping, analytics and existing voice behaviour. A separate real-model exercise replays the original transcript and out-of-order requests. This remains a local mock-data demonstration with owner-scoped sessions and transcripts persisted locally for 30 days alongside tasks. The live interface is a single voice-call stage, with motion only during pending work; completed calls reveal their transcript and summary. Browser synthesis prefers a feminine voice at 1.16× speed. Brief thinking cues are cancelled before replies and excluded from transcripts.

The frontend is split into an accessible AppShell, shared state primitives, focused page modules and a guarded seller-data hook. Dashboard compares supplied aggregates without inventing trend points. Suggestions is nested under Actions, and history is a secondary Nova route. The intentional light theme declares only-light to resist browser auto-dark transformation.

Call cancellation invalidates the pending frontend response and aborts model requests on the API. Ending a call preserves the pending seller utterance and prevents a late response reopening the session. A seller-approved task save that has already begun may complete; its commitments are reconciled into the ended summary without saving an unfinished reply. Session ownership, action approval and configured model/provider remain unchanged.

See verification-redesign.md for the current browser and test evidence.
