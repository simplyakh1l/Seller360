# Nova startup, performance and visual review

Historical note for the implementation before the approved cobalt redesign. Current interface and verification: [verification-redesign.md](verification-redesign.md).

Verified locally on 10–11 November 2026, on an M1 Mac with 8 GB RAM.

## Delivered

- Opening and resumed greetings do not start spoken thinking cues. Actual seller questions retain the existing cues, mute behavior, and cancellation before replies.
- Local Whisper inference executes in a module worker with one WASM thread. Downloads remain cached, while the runtime is terminated when a call stops or its page unmounts. Silent recordings skip inference. Pending requests are rejected on teardown and time out after two minutes.
- The production browser uncovered an ONNX cached blob-import failure under CSP. WASM loader and binary now ship as same-origin hashed assets. No script-src relaxation was needed.
- The selected Ollama model and 8K context remain unchanged. CPU threads are limited to two, and idle keep-alive is 60 seconds instead of 15 minutes.
- UI: readable system typography, graphite surfaces, coral actions, plain account copy, a dominant monthly sales comparison, compact operational comparisons, no glossy orb or idle loops. Three navigation entries and post-call transcript behavior remain.
- Mobile drawer contents are hidden from keyboard navigation while closed. Visible focus and reduced motion remain supported.

## Evidence

| Check                                                | Result                       | Evidence                                                                                                                  |
| ---------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Startup reproducer before fix                        | Expected FAIL                | New call-ui test observed beginThinking called before the introduction                                                    |
| Silent recording and teardown reproducers before fix | Expected FAIL                | Whisper was invoked on silence; no worker release occurred                                                                |
| Local runtime settings before fix                    | Expected FAIL                | keep_alive was 15m, not 60s                                                                                               |
| Unit and integration tests                           | PASS                         | npm test: 35 tests, 8 files                                                                                               |
| TypeScript                                           | PASS                         | npm run typecheck; also runs in the production build                                                                      |
| Production build                                     | PASS                         | npm run build                                                                                                             |
| Formatting                                           | PASS                         | Prettier check on edited source, tests, and design/readme files                                                           |
| Production browser routes                            | PASS                         | Dashboard, call, actions, saved calls, settings and profile at 1440px and 390px; no overflow or page errors               |
| Call lifecycle                                       | PASS                         | Real local API: typed question stays hidden during generation; end shows exactly three ordered transcript messages        |
| Microphone / recognition lifecycle                   | PASS, mocked browser devices | Voice tests cover greeting order, permissions, retries, pauses, fallback, mute, cues, silence, teardown                   |
| Real local speech worker                             | PASS                         | Synthesized English WAV transcribed as “My order is declined last month. What should I investigate?”; no page errors      |
| Keyboard                                             | PASS                         | At mobile width first focus is Open navigation with a solid visible outline; open drawer → Actions closes drawer          |
| Reduced motion and idle work                         | PASS                         | Zero running animations at idle across tested routes; reduced-motion call check passes                                    |
| Source review                                        | PASS, scoped                 | Reviewed before/after copies of edited existing logic and new worker code; no model, key, consent or action-store changes |
| Secret / unsafe rendering grep                       | PASS, scoped                 | No matching key patterns, eval calls or dangerouslySetInnerHTML in scanned TypeScript sources                             |
| Lint                                                 | SKIPPED                      | No lint script/configuration is installed in this project                                                                 |
| Coverage                                             | NOT MEASURED                 | No coverage provider/script was added for this scoped fix                                                                 |

Browser artifacts and generated test audio are in ignored test-results/. Playwright CLI traces/snapshots are ignored in .playwright-cli/. The entire project was untracked at task start, so a normal Git diff could not provide a change baseline; focused copies were retained in /tmp/seller360-before-performance during the task. No commits were created.

## Measurements and practical limits

- Dashboard comparison chunk: 370,705 bytes before → approximately 1,240 bytes after (about 99.7% less). This refers to the chart chunk, not the whole application.
- Idle call DOM: 227 nodes → 175; running animations: 1 → 0.
- Actual model allocation during inference: 3,806,582,538 bytes. This large allocation still exists while using the same 4B model. After the idle window, Ollama /api/ps returned an empty model list.
- Actual local model smoke check: cold opening 20.1 seconds; subsequent answer 8.9 seconds. These are observations, not a guaranteed speedup or benchmark comparison.
- Real worker smoke check including first model download and initialization: 56.2 seconds. Cached subsequent use avoids that initial download, but no warm-latency claim is made.
- Limiting CPU contention may trade throughput for responsiveness; unloading trades idle RAM for a future cold start. The model can still make unsupported claims: the smoke reply mentioned customer retention, which is not supplied by the demo dataset. This task does not certify every generated answer.
- Synthetic audio validates the actual speech engine, while physical microphone hardware, individual accents, and noisy rooms require a user call to evaluate recognition quality.
- Use npm run build, then npm start with the development command stopped for ordinary local use. The current local provider needs no cloud API key. Moving inference to a cloud provider or selecting a smaller model needs separate user configuration/authorization; neither was silently changed.

## Design passes

Spacing: 4px rhythm, 20–32px panel/page insets, consistent controls. Color: graphite chrome with meaningful coral and semantic status. Icons: remove metric filler and glossy voice illustrations; retain functional Lucide controls. Copy: account review and concrete business tasks. Type: system font, 12px minimum metadata, 14px body, larger figures. Layout: dominant sales comparison, quieter supporting data, one call surface. Details: visible focus, legible risk captions, touch controls, honest demo labels. Visuals: actual totals replace decorative chart machinery. Motion: only a progress spinner during real pending work, disabled for reduced motion.

Process adapted from Unslop by Damir Sokolovsky (@heydamir), CC BY 4.0. See DESIGN.md for the product-specific direction and tokens.
