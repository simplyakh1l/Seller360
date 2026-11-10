# Seller360 hosted runtime

The current cloud provider is Gemini 3.1 Flash-Lite. A real model opening and analytical response were verified on 11 November 2026. The key is read only by server code and is never compiled into Vite assets. Netlify stores it as a Functions-scoped environment secret.

## Hosting contract

- Node.js 24; npm ci; npm run build.
- Vite dist is static output. /api routes enter netlify/functions/api.ts and the existing Express application.
- LLM_PROVIDER=gemini, GEMINI_MODEL=gemini-3.1-flash-lite, LLM_TIMEOUT_MS=25000, SELLER360_HOSTED=1.
- Required secret: GEMINI_API_KEY. Never set VITE_GEMINI_API_KEY.
- Netlify Blobs uses its platform-provided identity and strong reads; no separate database account is required.
- Owner workspaces hold tasks and up to 30 conversations. Writes use ETags to avoid blind last-write overwrites. Ended calls reject later active-session writes. Workspace AI allowance defaults to 20 requests/hour.
- Approved tasks are app records, not marketplace operations. Supplied sample totals remain unchanged. Calculations are deterministic; Nova's conversational interpretation uses Gemini.

The sample-data portfolio site uses a random browser bearer identifier and has no multi-user login. Do not enter private marketplace/customer records. A browser workspace ID is not a substitute for account authentication. Requests are origin checked, limited and validated. Platform/provider quotas still apply; no billing or paid upgrade is enabled by the app.

## Verification

49 tests across 10 files passed after cloud adaptation, including restored task/call state in separate request scopes, owner isolation, ended-call write rejection, hourly allowance, production origin and missing-provider errors. Production build and typecheck passed. npm audit --omit=dev reported zero known vulnerabilities. Local secrets, transcripts, runtime JSON, test artifacts and hosting state are ignored by Git.

Two production dependencies were necessary for hosting: @netlify/blobs for durable platform storage and serverless-http for the existing Express API adapter. Netlify CLI is invoked as tooling rather than added to application dependencies.

Cloud keys and provider quota must be checked in the provider's console. Free tiers are subject to limits and availability; no unlimited-token promise is made. Hosted model failures produce a clear retry error rather than silently switching to the rules-only local demonstration.

Browser speech fallback still runs Whisper on the visitor's device if browser recognition is unavailable, so switching language-model inference to the cloud does not eliminate every possible voice resource cost. English/Hindi system voices, optional captions, cancellation, transcripts and action approvals remain supported.
