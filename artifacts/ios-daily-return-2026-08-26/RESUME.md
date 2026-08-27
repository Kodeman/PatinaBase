# RESUME — The Daily Return (Patina iOS client app review), 2026-08-26/27

## The ask (Kody, verbatim)
"Assemble a team of interior designers, home owners and UX UI designers. Review the Patina iOS
application and create a presentation outlining how the UI and UX flow could be updated to make the
application more sticky and make users want to return and use it everyday. And eventually purchase
through the app. The presentation should be an html presentation including mockups and UI Screen
details."

## Assumptions taken (autonomous session — see `source/plan.md`)
Client app only (`apps/mobile/Patina`); evidence = iPhone 17 Pro simulator against the LOCAL stack at
main `3cd84ecb3`, guest + signed-in walks, no device, no prod; the panel is SIMULATED and the deck
says so; Direction A within ruled canon, Direction B may amend with every amendment named + priced;
"purchase" = direct orders on the existing Stripe rail (physical goods → no IAP).

## DONE
- **Deliverable:** `presentation.html` (5.98 MB, 15 sections, 69 phone-mock fragments with screen
  sheets, 20 evidence shots, 136 finding chips, light + dark, QA'd at 1440/390) — published as an
  Artifact (URL in the session summary and the memory file).
- **Grounding** (`wf_e5e3a487-ae0`): `research/10-code-anatomy.md`, `15-task-paths.md`,
  `16-token-table.md`, `11-canon-digest.md`, `12-backend-reality.md`, `14-grounding-gaps.md`,
  `17-gap-fills.md`.
- **Evidence** (`wf_caa644ec-577`): 155 shots in `shots/` (g- guest 56, c- client 45, d- dark, x-
  Dynamic Type XXL, s- steward proofs), `research/01-shot-ledger.md`, `02-steward-boot.md` (build /
  launch / tap / sign-in recipe), `03-walk-observations.md`; 24 repro probes in `probe/`.
- **Mock kit** (`wf_f5e15a38-bda`): `mock/kit.css`, `mock/KIT.md`, `mock/kit-demo.html`, calibrated to
  ±3 px against the real shots.
- **Panel** (`wf_58898254-652`): nine seat reports `research/2x-panel-{h1,h2,h3,d1,d2,d3,u1,u2,u3}.md`
  + `.json`; 346 raw → 213 canonical (`30-collated-findings.*`) → 199 verified + 14 contested
  (`31-verified-findings.*`, verdicts `33/34/35-verify-*.json`, themes `36-findings-by-theme.md`).
- **Directions** (`wf_db2cb304-1fd`): `source/shared-planks.md` (SP-01…SP-20),
  `source/direction-a.md` "Since You Were Here" (v1 kept as `.v1.md`), `source/direction-b.md` "The
  Record", eight critiques `source/critique-{a,b}-{homeowner,designer,feasibility,canon}.md`, judges
  `source/judge-j1-homeowner-return.md` (B 32–30), `judge-j2-purchase-designer-trust.md` (B 34–27),
  `judge-j3-feasibility.md` (A 35–30), and the review lead's `source/synthesis.md`.
- **Deck** (`wf_432df3a6-c07`): parts in `mock/deck-parts/` (build with
  `node mock/deck-parts/build.mjs`, sandbox off — sips + Chromium need it), fragments in
  `mock/fragments/`, fact-check `research/60-deck-factcheck.md`, visual QA `61-deck-visualqa.md`,
  revision log `62-deck-revision-log.md`, renders `mock/deck-qa/`.

## The verdict (synthesis.md §4)
Build Direction A's first slice as Direction B's W1 — the six things both build identically (what
moved while you were away; the designer visible on Today behind the one-line `client_request_id`
filter fix; a labelled Studio door with a waiting count; push on money; the unread dot earned; direct
orders settling onto the existing fulfillment rail with attribution snapshotted) plus the repair
planks (SP-01 product-detail trap, SP-02 browse grid, SP-03 share link, SP-04 SIGNED/sign sheet,
SP-07 filter) — and put three rulings to Kody with the slice on a phone: (1) the home — Option B's
one Next Move vs B's Record card (C23, B-3/B-4); (2) the tab bar (C1, B-1/B-2); (3) Buy when a
designer is engaged + the R32 sequence reversal. Twelve questions are in the deck's penultimate
section.

## OWED / NOT DONE
- **Kody's rulings** on the twelve questions (the deck's "Twelve questions for Kody" section).
- **Nothing is built.** No app code was changed; no migration written; nothing deployed.
- **Hotfix candidates found by the walk, not in the ask:** every product detail traps the user
  (PGRST201 ambiguous `vendors(...)` embed, `ProductAPIClient.swift:99` — two FKs products→vendors on
  main); the browse grid renders cards off-canvas; an accepted proposal is labelled SIGNED; the share
  sheet hands over "Patina Designer Portal"; the client project screen leaks designer-facing copy;
  Settings → Account is inert (Sign Out stranded); proposal line prices are stripped server-side
  when `client_visibility_tier` defaults to `milestone`.
- **Device-only verification:** Apple Pay inside the hosted Checkout, push delivery end-to-end,
  LiDAR/AR/scan paths.
- **No usage data** (PostHog OAuth needed a person) and **no prod counts** (no read path without a
  secret) — every return claim is reasoned, not measured.
- The `shots/` and `probe/` PNGs (~170 MB) are NOT committed — local evidence only; the twenty the
  deck uses are embedded in `presentation.html` and downscaled in `mock/deck-assets/`.

## Environment notes (for the next walk)
- Simulator iPhone 17 Pro `973D1724-90BF-4A0A-B02D-481D561547B3` was left BOOTED, signed in as
  `client@patina.dev` (password `password123`). **`-DeploymentTarget local` must be repeated on
  EVERY `simctl launch`** — one launch without it talks to Strata prod. Recipe: `research/02-steward-boot.md`.
- blitz-iphone taps DO deliver to the simulator (July's trap did not reproduce); AppleScript fallback
  calibrated in `shots/_tap.sh`.
- Local faults that are NOT app defects: every edge function 503s locally (edge runtime cannot boot
  a worker — Companion replies and the Checkout hand-off were never seen); the OTP email carries no
  6-digit code (template server 404); the stack was booted from a deleted worktree path — restart it
  from main before the next walk; the simulator keychain outlives app deletion (`simctl keychain
  <udid> reset` for a true first launch).
- Sandbox: `xcodebuild`, `simctl`, `osascript`, `sips`, headless Chromium and the `supabase` CLI all
  need `dangerouslyDisableSandbox: true`.

## Resume prompt
"Read `artifacts/ios-daily-return-2026-08-26/RESUME.md`. The review is complete and the deck is
published; Kody has not yet ruled on the twelve questions. If he has ruled, record the rulings in
`source/rulings-<date>.md`, add a 'Twelve questions, twelve answers' section to the deck (republish
the same file path), and start with the repair planks SP-01…SP-09 + SP-07 + SP-18 + SP-20, then the
six shared first-slice items rendered Direction A's way, per `source/synthesis.md` §4."
