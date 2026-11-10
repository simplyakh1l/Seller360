# Seller360 design system

## Approved direction

A compact monthly seller account review: understand the change, investigate the evidence, and track agreed work. Calm, direct, useful. Paired monthly figures and operational questions are the signature; no decorative hero, card wall, or invented trend data.

## Theme evidence, 11 November 2026

The source and a clean Chromium session render light. The actual Brave interface was inspected: browser theme is Dark and Auto Dark Mode for Web Contents is Enabled. This browser transformation explains the dark screenshot. Browser preferences were not changed. The approved product uses an intentional light canvas with cobalt interactions. Declare color-scheme: only light and matching metadata, then verify both clean Chromium and actual Brave; do not add a speculative dark theme.

## Tokens

Canvas #F5F7FA; surface #FFFFFF; ink #1F2933; secondary #53616F; border #DCE2E7; interaction #315FDB (hover #244BC0); selection #EDF2FF. Logo only: coral #EC553E. Risk #B6413C; success #26704F; warning #8A5A10. Semantic color always has a text equivalent. No arbitrary per-chart palette.

Source Sans 3 with system sans fallback. Hindi uses the system Devanagari fallback. Body 16px, controls 14px, metadata 12–13px, headings 28–32px, principal figures 40px. Tabular numerals for comparisons. Use 400/500/600/700 weights; no artificial monospace labels or tracked uppercase kickers.

4px spacing scale; 32px desktop and 16px mobile gutters. 6–8px corner radii for controls and major surfaces. Dividers organize related content, rather than nested cards. Shadows only for transient notifications. No idle animation; feedback during work only. Respect reduced motion.

## Information architecture

Exactly three primary destinations: Dashboard, Get help from Nova, Actions. Desktop sidebar; bottom navigation below 760px. Saved calls belongs to Nova. Suggestions belongs to Actions. Legacy /growth redirects to /actions?view=suggestions, /analytics to /#performance. Profile and Data & privacy are secondary account destinations.

Dashboard: one sales comparison, orders/ASP arithmetic, one five-row evidence table with concise questions, one contextual handoff. Dates are not invented for undated source periods. No source freshness claim based on analysis time.

Nova: one focused call stage, controls reachable on mobile, immediate cancellation during processing. Captions are optional, transcript appears after completion. One brief neutral delayed cue after a real request; no cue before a greeting. Retain English/Hindi and installed feminine-voice preference.

Actions: saved work list and Suggestions subview. Details expand inline. Add/start/complete/reopen remain real persisted operations. Suggestions derive evidence from the shared source rather than duplicated figures.

## Truth and state rules

One discreet sample-data disclosure in Data & privacy explains fixture, missing granularity and absent marketplace connection. No repeated demo banners. No fabricated account-active or data-freshness label. AI readiness belongs in Data & privacy, with actionable offline state. Runtime fallback in a call is still disclosed because it changes the capability being offered.

Loading, unavailable, empty, stale cache and success are separate states. No default risk/positive diagnosis without data. A failed refresh may retain the previous comparison with an explicit last-successful-analysis label, never a false fresh-data claim. Task/history read errors have retry. Failed handoffs preserve entered context.

## Accessibility and responsive behavior

Semantic main/nav/headings; skip link; aria-current on active destination; route focus to main heading; visible cobalt focus ring. No navigation drawer requiring a focus trap. Minimum 44px primary touch targets. Stack comparison rows on narrow screens, preserve labels, no global overflow below 320px. Call controls remain reachable. Text wraps safely. Status announcements are concise; errors use role=alert.

## Implementation milestones

1. Correct failure states, handoff and cancellation; regression tests.
2. Tokens, typography, shell and accessible primitives; typecheck.
3. Dashboard composition and evidence semantics; component/browser checks.
4. Nova, Actions, saved calls and account pages; journey checks.
5. Full tests, typecheck/build, real desktop/mobile screenshots, visual refinement, active voice resource profile.

## Verification

Record actual commands, screenshots, resource samples and limitations in docs/verification-redesign.md. Do not equate fake microphone input with physical microphone reliability. Do not change models/providers or add dependencies for this redesign.

## Attribution

Design process adapted from Unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
