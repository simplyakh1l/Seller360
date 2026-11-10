# Seller360 approved redesign verification

Verified on 11 November 2026 in the local Seller360 workspace. This report describes the implemented cobalt redesign. The earlier verification-nova-performance.md is historical.

## Completed milestones

| Phase                          | Changes                                                                                                                                                                                                                                                                                          | Verification                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1. Functional and truthfulness | Failed performance requests show an error instead of fabricated fallback insight; Actions and History separate failure from empty; Growth notes reach the actual Nova request; call cancellation invalidates late responses and aborts provider requests; truthful timestamps and account labels | Failure/handoff/cancellation tests reproduced failures before repair; final suite passes        |
| 2. Foundations                 | Cobalt #315FDB interactions; neutral light canvas; self-hosted Source Sans 3; shared headings/notices; three-destination shell; skip link, visible focus, route heading focus and responsive bottom navigation                                                                                   | Typecheck/build, keyboard journey and actual Brave inspection                                   |
| 3. Dashboard                   | One sales comparison, orders/ASP arithmetic, five-row evidence table, one Nova handoff; no invented time series or causal attribution                                                                                                                                                            | Calculations/tests and desktop/mobile screenshots                                               |
| 4. Nova and secondary screens  | Single call surface, one neutral delayed thinking cue only after a real question, optional captions, post-call transcript; Suggestions under Actions; saved-call deep links within Nova; account/data privacy pages                                                                              | Voice lifecycle tests; task persistence journey; controlled growth/cancel/history browser check |
| 5. Verification/refinement     | Production checks, responsive screenshots, short-screen call refinement, active voice resource sampling, documentation                                                                                                                                                                           | Results below                                                                                   |

## Theme discrepancy resolved

Before redesign, actual Brave showed browser theme Dark and Auto Dark Mode for Web Contents Enabled. Source CSS and a clean Chromium session rendered light. That browser transformation explained the dark screenshot. No browser preference was changed.

The approved interface intentionally uses a light canvas, cobalt actions/navigation/focus and coral only in the logo. CSS color-scheme: only light and matching metadata protect the deliberate palette from automatic dark transformation. Actual Brave was revisited at 127.0.0.1:5173 after implementation: the light canvas, cobalt active Dashboard and comparison bar were visually confirmed while the browser flag remained enabled. Clean Chromium was also checked with a dark system preference; computed scheme was light only.

## Automated checks

| Check                                              | Result                                            |
| -------------------------------------------------- | ------------------------------------------------- |
| npm test                                           | PASS: 42 tests across 8 files                     |
| npm run typecheck                                  | PASS                                              |
| npm run build                                      | PASS                                              |
| Prettier on changed frontend/API/tests/docs/script | PASS                                              |
| Reusable production browser check                  | PASS: scripts/verify-ui.cjs                       |
| Lint                                               | SKIPPED: project has no lint script/configuration |
| Coverage                                           | NOT MEASURED: no coverage provider was installed  |

Cancellation regressions include a deliberately delayed model response and an approved task save finishing after End call. The latter initially failed, then passed after preventing the canceled turn reopening the ended session. Already-approved task commitments are reconciled into the ended summary. StrictMode routed-prompt mounting also has a regression test, avoiding a development-only lost handoff.

No package dependency was added or removed. Source Sans 3 and its OFL license were added as static assets. The selected model, provider, credentials, 8K context, action approval and ownership conventions were preserved.

## Real browser results

Production server on port 3101 used a separate SELLER360_DATA_DIR under ignored test-results/redesign/runtime. Task writes used an isolated browser workspace ID, rather than the user's tasks.

- Seven screens: Dashboard, Nova, Actions, Suggestions, Saved calls, Seller account, Data & privacy.
- Five sizes: 1440×900, 1280×800, 768×1024, 390×844 and 320×667.
- All 35 combinations: no horizontal document overflow, exactly three primary links, zero running idle animations, and no page errors or unexpected API failures.
- One sample-data disclosure on Data & privacy; zero source-disclosure banners elsewhere.
- Real API journey: add suggestion, start task, complete, reopen and reload persisted status.
- Keyboard: skip link reaches main, keyboard navigation works, route heading receives focus.
- Controlled failures: performance, task and history errors show Retry; successful retry restores content rather than false empty or fabricated figures.
- Legacy Growth and Analytics links redirect to Actions/Suggestions and Dashboard/performance.
- Controlled browser call responses: Growth note handed off verbatim; End call reachable at 320px; late reply ignored; saved-call detail opens. These controlled responses validate UI races, not real-model reasoning.

Playwright CLI was used in an isolated named Chromium session; a reusable script also runs with the existing project Playwright dependency. Screenshot inspection prompted smaller call spacing on short screens, clearer call preparation text and quieter page chrome. Dashboard document height at 1440px is 1,359px versus the original 2,687px; at 390px, 2,257px versus 5,130px. Those are composition measurements, not a runtime speed benchmark.

A rapid earlier development reload sweep hit the existing API rate limit (429). The final production sweep and normal journeys completed with no unexpected API errors.

## Active voice resource profile

Actual production UI, getUserMedia, MediaRecorder, the Whisper WASM worker, Ollama qwen3:4b-instruct and browser SpeechSynthesis were exercised. The browser used a controlled synthesized WAV as a fake microphone and its native speech recognition was disabled only in the harness to force the real local fallback. No physical microphone was recorded.

262 OS process samples cover about 304 seconds. Browser figures are scoped to that profile browser's process subtree; model figures include the separate llama-server process. RSS is resident memory, not total macOS unified/GPU allocation; maxima need not be simultaneous.

| Observation                                 | Measured result                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Profile browser subtree peak RSS            | 957 MiB                                                                                     |
| Local model runner peak RSS                 | 3,580 MiB (about 3.50 GiB)                                                                  |
| Profile browser accumulated CPU             | 74.1 CPU seconds across the observation window; not a peak-CPU percentage                   |
| Call click to actual model opening response | 31.4 seconds                                                                                |
| First recognized utterance and Ollama reply | Received at 163.7 seconds from harness start, including first-use speech setup and playback |
| Second utterance and model reply            | Received at 278.4 seconds                                                                   |
| Audio capture / speech worker               | One getUserMedia call and one speech worker observed                                        |
| Idle model release                          | Later /api/ps check returned zero loaded models                                             |

The harness waited for a heading, but the call title intentionally has role=status. That incorrect selector timed out even while two real model turns completed. The timeout is recorded as a harness defect; it is not represented as a passing wait or an app recognition failure. API response logs and spoken-output instrumentation establish the completed turns. The looping audio repeated its phrase and transcription rendered “sales fall” imperfectly as “sales for.”

These measurements do **not** establish a performance improvement over a controlled baseline. The 4B model still consumes substantial memory on an 8 GB M1; first-use Whisper download/setup and response latency remain significant. Page/CDP observations were taken under load and are retained, not converted into a promise of smooth calls. A smaller model or hosted reasoning would be a separate configuration decision; neither was silently selected. For ordinary local use, stop development watchers, build once and run npm start.

Physical microphone reliability, noisy rooms, individual accents and perceived synthesized-voice quality still require a user call. The actual model also produced an overconfident causal phrase despite existing evidence instructions. The Dashboard and suggestions avoid that claim; arbitrary language-model replies cannot be certified as factually correct by this redesign. Data & privacy explicitly asks users to check replies against their records.

## Files changed

- Frontend foundations: src/App.tsx, src/style.css, index.html, src/components/AppShell.tsx, src/components/Workspace.tsx.
- Page modules: src/pages/Dashboard.tsx, Actions.tsx, Nova.tsx, History.tsx, Account.tsx.
- Data and voice: src/hooks/useSellerData.ts, src/hooks/useVoice.ts, src/lib/api.ts, src/lib/history.ts. Existing local speech worker, recognition/provider choices and speech preferences are retained.
- Minimal API cancellation: server/src/app.ts, server/src/services/agent.ts, server/src/services/llm.ts.
- Regression coverage: tests/call-ui.test.tsx, tests/model-state.test.ts, tests/voice.test.tsx; scripts/verify-ui.cjs.
- Design/assets/docs: DESIGN.md, public/fonts/source-sans-3.ttf, public/fonts/OFL.txt, README.md, docs/TECHNICAL_NOTE.md, docs/DEMO_RECORDING.md, this report and historical-note pointer.

The repository had no initial commit and every source file was untracked at task start. Normal git diff cannot provide an original tracked baseline. Original App.tsx/style.css and the dashboard screenshot were retained in test-results/redesign/baseline, alongside focused failure-before/green-after logs. No commit was created and .env was not changed.

## Evidence locations

Ignored test-results/redesign contains browser-verification.json/log, final-tests.log, final-typecheck.log, final-build.log, formatting.log, final-*.png, voice-profile-extended.json/log, voice-profile-summary.json, generated synthetic audio and original baseline copies. Screenshots were inspected, not merely captured. Browser screenshots cover layout/state, not physical microphone behavior.

Reproduce browser QA against an isolated server:

```sh
PORT=3101 SELLER360_DATA_DIR=test-results/redesign/runtime npm start
SELLER360_QA_URL=http://127.0.0.1:3101 node scripts/verify-ui.cjs
```

Design process follows Akhil Frontend Workflow, Frontend Design, UI/UX Pro Max and Unslop. Unslop methodology adapted from Damir Sokolovsky (@heydamir), CC BY 4.0.
