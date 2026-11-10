# Seller360 hosted runtime

The current cloud provider is Gemini 3.1 Flash-Lite. A real model opening and analytical response were verified on 11 November 2026. The key is read only by server code and is never compiled into Vite assets. Netlify stores it as a production environment secret available to Functions. On this account it has builds, functions and runtime scope, excluding post-processing; no paid scope upgrade was enabled.

## Hosting contract

- Node.js 24; npm ci; npm run build.
- Vite dist is static output. /api routes enter the native Netlify Function in netlify/functions/api.ts and the existing Express application. The native runtime preserves the full Blobs strong-consistency context and provides the client IP to Express.
- Required hosting runtime settings: LLM_PROVIDER=gemini, GEMINI_MODEL=gemini-3.1-flash-lite, LLM_TIMEOUT_MS=25000, SELLER360_HOSTED=1, APP_URL=https://seller360-akhil.netlify.app. Config-file build defaults alone do not configure deployed Functions.
- Required secret: GEMINI_API_KEY. Never set VITE_GEMINI_API_KEY.
- Netlify Blobs uses its platform-provided identity and strong reads; no separate database account is required.
- Owner workspaces hold tasks and up to 30 conversations. Writes use ETags to avoid blind last-write overwrites. Ended calls reject later active-session writes. Workspace AI allowance defaults to 20 requests/hour.
- Approved tasks are app records, not marketplace operations. Supplied sample totals remain unchanged. Calculations are deterministic; Nova's conversational interpretation uses Gemini.

The sample-data portfolio site uses a random browser bearer identifier and has no multi-user login. Do not enter private marketplace/customer records. A browser workspace ID is not a substitute for account authentication. Requests are origin checked, limited and validated. Platform/provider quotas still apply; no billing or paid upgrade is enabled by the app.

## Verification

51 tests across 11 files passed after cloud adaptation, including the native request/IP adapter, restored task/call state in separate request scopes, owner isolation, ended-call write rejection, hourly allowance, production origin and missing-provider errors. Production build and typecheck passed. npm audit --omit=dev reported zero known vulnerabilities. Local secrets, transcripts, runtime JSON, test artifacts and hosting state are ignored by Git.

Two production dependencies were necessary for hosting: @netlify/blobs for durable platform storage and serverless-http for the existing Express API adapter. Netlify CLI is invoked as tooling rather than added to application dependencies.

Cloud keys and provider quota must be checked in the provider's console. Free tiers are subject to limits and availability; no unlimited-token promise is made. Hosted model failures produce a clear retry error rather than silently switching to the rules-only local demonstration.

Browser speech fallback still runs Whisper on the visitor's device if browser recognition is unavailable, so switching language-model inference to the cloud does not eliminate every possible voice resource cost. English/Hindi system voices, optional captions, cancellation, transcripts and action approvals remain supported.

## Published project

- Live application: https://seller360-akhil.netlify.app
- Repository: https://github.com/simplyakh1l/Seller360
- Seller360 is pinned on the owner’s GitHub profile alongside the existing projects.
- Deployments are currently published with the authenticated Netlify CLI. GitHub Actions runs tests, typecheck and the production build on pushes and pull requests; it does not automatically deploy.

The HTTPS smoke check on 11 November 2026 (India time) verified Gemini readiness, a real generated opening and sales analysis, ending and restoring a call, creating/completing/reloading a task, and workspace isolation. The measured opening took 1.7 seconds and the analytical turn 9.3 seconds in that run; these are observations, not latency guarantees.

Repeat the real-provider check with SELLER360_QA_URL=https://seller360-akhil.netlify.app node scripts/verify-hosted.mjs. It uses a fresh workspace and consumes two model requests. Test reports remain ignored under test-results/deploy.

The deployed browser sweep also passed 35 route/viewport combinations at 1440, 1280, 768, 390 and 320 pixels, with no horizontal overflow, browser runtime errors or unexpected API errors. Task lifecycle, keyboard navigation, retry states, legacy redirects and cancellation were exercised; failure/cancellation scenarios used explicitly controlled browser responses. A separate real Gemini browser conversation verified typed input, a context-aware reply, end-call saving, transcript reopening and persistence after reload. Screenshots were inspected for desktop Dashboard and 320-pixel Nova. Physical microphone capture was not retested during deployment.

Release fixes: the legacy Blobs connector lacked the uncached endpoint needed for strong reads; the native Functions adapter preserves the platform context. Production runtime variables were set through the Netlify API after CLI commands failed to persist them; their presence was verified by the live provider response. Subsequent function logs contained no errors during the successful checks.

Saved-call summaries now label historical metric evidence as supplied period data instead of repeating a generic inventory instruction that could contradict the seller’s current stock report. This has a regression test.
