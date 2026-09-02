# First Flight — program architecture (Fable, 2026-09-01)

> ## ⚠ SUPERSEDED IN DETAIL BY `build/PROGRAM.md`
>
> This file is the architecture **as first drafted**. It was expanded, critiqued and re-cut; where it
> and PROGRAM.md disagree, **PROGRAM.md wins**. Read this for lane shape and for the reasoning; read
> PROGRAM.md for what a lane owns, what it closes, and what a command actually is. The deltas:
>
> 1. **Finding-id collision — the most dangerous one.** `findings.json` carries **two** `GAP1-NN`
>    series and **two** `GAP7-NN` series: the pre-resume workflow lane's (`GAP1-*`, `GAP7-*`) and the
>    resumed ledgers' (`GAP1B-*`, `GAP7B-*`). **Every `GAP1-`/`GAP7-` reference in §3 and §4 below means
>    the `B` series.** Concretely: §3's "GAP1-01/02 = T0 blockers (consent/defer sheets)" are
>    `GAP1B-01`/`GAP1B-02` (in `findings.json`, `GAP1-01` is "Companion orb overprints" and `GAP1-02` is
>    "consent sheet never shows the price"); §4's L1-C "GAP1-03" is `GAP1B-03` (`findings.json`'s
>    `GAP1-03` is the `.medium` detent row); "GAP1-07/08" are `GAP1B-07`/`GAP1B-08` (`findings.json`'s
>    `GAP1-07`/`GAP1-08` are the "Choose this" slab and a Companion promotion, both minors); §4's L1-C
>    orb-inset list cites "GAP1-15", which in `findings.json` is *"'Sign in with Apple' label does not
>    scale"* in **L1-A** — the orb-overprint row it means is `GAP1-01`, and `GAP1B-15` does not exist;
>    §4's L1-E "room CTA grammar (B-20, GAP1-18)" means **`GAP1-12`** (*"'Browse pieces for the
>    {room.name}' prepends a definite article"*, L1-E) — `findings.json`'s `GAP1-18` is a universal-link
>    cold-start tooling caveat in L2-G, and `GAP1B-18` does not exist. **Resolve every id against
>    PROGRAM.md §3's lane tables, never by grepping `findings.json` for the number written here.**
> 2. **Tier counts.** §3's T0 = 160 / 18 blockers / 131 majors / 11 minors, T1 = 350, T2/cut = 97 are
>    superseded by PROGRAM.md §1: **T0 = 163** (16 / 136 / 11 — four rows closed by the production
>    reconciliation), **T1 = 361**, T2 = 98, cut = 3. Wave counts differ again, because **ruling D12**
>    schedules twelve T1 rows in W1: **W0 34 · W1 141 · W2 349 · W3 101**.
> 3. **Lanes.** §4 has six W0 lanes; PROGRAM.md has **eight** — `L0.2b` (the designer-portal read paths
>    00555 breaks) and `L0.7` (the daily-surfaces coverage walk gate G5 has no evidence for) are new.
> 4. **Owned file sets.** §4's globs are superseded by PROGRAM.md §3's glob tables. In particular
>    `Patina/Design/Tokens/**` **does not exist**; `Design/**` is L1-C's and the tokens are in
>    `PatinaDesignKit/Sources/PatinaDesignKit/Tokens/`; `AppCoordinator.swift`, `DailyRoomView.swift`,
>    `APIConfiguration.swift` and `RecommendationsView.swift` each have exactly one named owner; and
>    L1-E owns a reviewed **copy deck**, not "string literals anywhere".
> 5. **L0.2.** §4's list includes applying 00533–00540 and deploying `delete-account` — both already
>    done on Strata (re-verified 2026-09-01). Its `handle_new_user` homeowner default **is** in
>    PROGRAM.md's 00555 outline, alongside a `WITH CHECK` on `"Users can update own profile"` that §4
>    did not anticipate.
> 6. **Gates.** §6 puts `ios-gate.sh archive` on the integration gate; PROGRAM.md moves it to R1 Step 2
>    (Kody-run) because a steward subagent cannot satisfy `-allowProvisioningUpdates`.

This is the architecture the PROGRAM.md writer expands and the plan critic attacks. Facts come from the
audit (`research/40-workflow-result.json`, the lane ledgers, `research/A2-config.md`, `research/A3-prod.md`,
`research/G-gate.md`, `research/GAP1.md`, `research/GAP7.md`). Vision authority: `docs/vision/VISION.md`
(the iOS app is the studio's front door; the first homeowner cohort is Middle West's active design
clients; never "AI"; no tab/zone/dashboard UI, badges, red/green status; "launching to an empty room —
slip rather than demo something broken").

## 1. What the audit found (the shape, not the list)

- 607 confirmed findings (28 refuted, 189 duplicates folded) across 26 lanes; 45 of 100 screens
  photographed; nothing device-verified; no production signed-in session was possible.
- **Release does not compile** (G-01: four `#Preview` blocks reference `#if DEBUG` fixtures) — no archive
  has ever been produced for this app. Everything downstream of an archive is unproven.
- **Production is not the app's backend yet**: migrations 00533–00540 (the Daily Return contract) were
  never applied to Strata; `delete-account` was never deployed; `get_direct_order_terms` and
  `increment_scan_upload_attempt` do not exist; every save 400s; the roster view and presence table 404.
- **Production is an empty room**: 1 published catalogue product (a $20 "Smoke Test Ceramic Lamp", no
  image), `get_recommendations` returns zero rows for every caller, editorial stories have no hero
  images. The style quiz → "View Recommendations" → save loop terminates on nothing.
- **Two live data exposures on production**: `profiles` (24 rows: emails, Stripe customer ids, phone,
  address) readable by the anon key shipped in the binary; `notification_preferences` grants ALL to
  unauthenticated callers; `vendors` internal notes readable. These must close before any tester signs up.
- **The first screen fails**: "Continue with Google" is the first button and the provider is disabled on
  Strata (raw server string); a failed sign-in leaks its error onto the Welcome root and shifts the
  stack 33 pt; one mis-tap lands in an inescapable guest flow; the advertised tester credential
  (tester@patina.cloud / 000000) does not work in the app; Sign in with Apple creates the tester as a
  designer.
- **Crash-loop risk**: `ModelContainer` failure is a `fatalError` with no migration plan (build 2 with a
  schema change bricks every installed app); `BoardModel` is fetched against a schema that does not
  contain it.
- **TestFlight/ASC configuration**: CFBundleVersion 1 is below the build already on App Store Connect
  (1.0 (2), uploaded 2026-05-12); iPad is a supported family with no iPad layout; beta review details and
  test information are empty; no PrivacyInfo.xcprivacy; no encryption key; App Store provisioning profile
  INVALID, none for the widget; CODE_SIGN_IDENTITY hard-set to "Apple Development" in Release; deployment
  target 26.5 with no 26.5-only API.
- **Systemic UI defects** (each one finding with many faces): the Companion orb occludes content on every
  scrollable screen (no bottom inset derived from `CompanionHearthMetrics`; 20 hard-coded clearances);
  dark mode fails on hard-coded fills (orb invisible, `pearl` hairline used 89×, `clay` labels 2.33:1,
  SIWA button black-on-black); primary buttons at ~2.2:1; Dynamic Type breaks headlines mid-word and
  pushes Approve/Cancel off the decision consent and defer sheets (blockers at accessibility sizes);
  three empty states indistinguishable from failure; no pull-to-refresh on any root; four spellings of
  "Something went wrong" and raw PostgREST/Swift-enum strings on the design-request and AR surfaces;
  first-launch tour copy in Sanity describes a retired UI and overrides the correct in-app fallback; all
  six `?` help doors open on "No help articles yet".
- **What is already world-class** (keep, and use as the template): the payment-failure state ("We
  couldn't start this payment. Nothing has been charged."), the push-permission primer, the Studio money
  lane's loading → error → empty ladder with pull-to-refresh, the invoice detail, the typographic system,
  Reduce Motion in the Companion, session survival through a backend outage, the icon (Icon Composer,
  light/dark/tinted), the AASA ↔ DeepLinkHandler match, the phase machine and SessionScope.
- **Tests**: 1523 unit tests pass; the UI suite is dead (7 of 11 fail against a first-run spec retired
  months ago; the 4 passing tests are Xcode stubs); no gate builds Release; lint reports 421 errors
  (396 are `identifier_name`).

## 2. The bar for round one, restated through the vision

Round one = **Leah's active design clients** (activeProject tier, a live designer, real proposals /
decisions / invoices). For them the app's job is "engaged daily, one agreed direction": the Record,
the decisions, the proposals, the invoices, the designer seat, messages. Browse/saved is secondary but
must not be an empty room. Purchase (direct-orders) is pre-empted for them by design (R3) and stays
off. The four-tab bar (`house-first`) stays off — it is also the natural first-launch state and the
vision says no to tab bars. Nothing in the app says "AI".

Therefore the round-one gate is: (1) it archives and uploads; (2) production carries the contract the
binary calls; (3) the two exposures are closed; (4) the first screen and the first sign-in cannot fail
for a real client; (5) the Studio surfaces the client uses daily are polished; (6) the marketplace shows
real pieces or an honest "still curating" state; (7) nothing crash-loops on build 2; (8) a device pass
on Kody's iPhone 17 Pro Max has covered the device-only claims.

## 3. Tiers → waves

- **T0 (must fix before build 1 reaches a tester)** = 160 findings (18 blockers, 131 majors, 11 minors).
- **T1 (before build 2, the first week)** = 350 (4 blockers, 124 majors, 182 minors, 40 polish).
- **T2 / cut** = 97 later.
- The GAP1B-/GAP7B- findings (two resumed lanes; ledgers only, never judged) are folded in by the writer
  with the tier the lane proposed: GAP1-01/02 = T0 blockers (consent/defer sheets unusable at
  accessibility sizes); GAP7B-02/03/04/05/09 = T0 majors (widget and deep-link behaviour in the exact
  TestFlight first-launch state); the rest T1/T2 as written.

## 4. Waves and lanes

Every wave is one Workflow (the Daily Return pattern in
`artifacts/ios-daily-return-2026-08-26/RESUME.md` "How a wave runs"): steward (worktrees
`.codex/worktrees/agent-ff-<wave>-<lane>`, branches `first-flight/<wave>-<lane>`, Secrets.swift copied
in, ONE simulator clone per lane, never shared — tonight's gap round proved two lanes on one clone
manufacture fake defects) → lanes with OWNED FILE SETS (task list first in writing-plans format at
`build/waves/<wave>/<lane>-tasks.md`; tests first; the whole PatinaTests tier on the lane's clone;
pathspec commits; integration notes for cross-lane needs) → separate-context reviews (every finding,
confidence + severity) → fix rounds → steward integration on `first-flight/integration` (`ios-gate.sh all`
+ the new `release` tier + lint-delta, steward-only) → ONE walker per clone on the review simulator →
Fable merges to main (`--no-ff`, read the merge log), retires worktrees/clones.

### W0 — Unblock (days 1–3; the long pole is content)

- **L0.1 Build & configuration** (iOS, one lane, agent): wrap the four `#Preview` blocks in `#if DEBUG`
  (G-01); add `release` and `archive` tiers to `apps/mobile/Patina/scripts/ios-gate.sh` (Release generic
  build; archive with `-allowProvisioningUpdates`); CURRENT_PROJECT_VERSION → 3 on BOTH targets via one
  `Config/Version.xcconfig` (A2-01) with a documented bump rule; TARGETED_DEVICE_FAMILY → 1 on both
  targets (A2-03, C7-11) — pending D4; IPHONEOS_DEPLOYMENT_TARGET → 26.0 (A2-13) — pending D6;
  `ITSAppUsesNonExemptEncryption = NO` (A2-06); `PrivacyInfo.xcprivacy` with the required-reason APIs
  A2 enumerated (A2-02); remove the hard-set Release `CODE_SIGN_IDENTITY` (A2-23); accent colour
  (A2-10); launch-screen background (A2-14/C-29); delete the empty appiconset trap (A2-22); unify the
  permission strings to one set, in Info.plist, rewritten in brand voice (A2-12); PostHog: make
  `analyticsEnabled` real (A2-15) and turn on error tracking (A2-16); one product name (A2-21).
  Gate: `ios-gate.sh all` + `ios-gate.sh release` + `ios-gate.sh archive` (the archive must succeed on
  Kody's machine with automatic signing; the widget appex inside; entitlements listed).
- **L0.2 Production backend** (Kody-run — hook-blocked for agents; an agent prepares and probes):
  apply 00533–00540 selectively (procedure in the repo-cleanup plan Part D1 — all eight audited safe);
  deploy `delete-account` and `create-checkout-session`; mint **00555_ios_round_one_security**: replace
  the `profiles` "viewable by everyone" policy with `auth.uid() = id` plus a narrow public view
  (display_name, avatar_url) for the columns other users need; drop the `notification_preferences`
  ALL-to-public policy and REVOKE INSERT/UPDATE/DELETE from anon; hide `vendors.notes` (and any other
  internal column) from anon; sweep every `auth.uid() IS NULL` policy; add
  `increment_scan_upload_attempt` (or remove the call); `handle_new_user` defaults app sign-ups to
  `homeowner`. Probe each object read-only after apply. Then the security advisor re-run.
- **L0.3 The room is not empty** (content, Kody + Leah; an agent builds the seeding script and the
  image pipeline; the prod write is Kody-run): ≥30 Patina-grade pieces (`layer='catalog'`,
  `status='published'`, brand/vendor resolvable, images in Storage, price, category in the app's
  vocabulary, `published_at`, `quality_score`, a `product_style_spectrum`/DNA row so the matcher
  returns them); 3 editorial stories with hero images and honest `read_minutes`. Fallback if content
  slips: the app ships an honest "still curating" state on every product surface (A4-02's second half)
  and round one centres on the Studio surfaces. Decision D2.
- **L0.4 Help & tour content** (Sanity; Kody authorizes the writes): publish the W3 tour copy
  (`artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md`); create or hide the 20 missing
  `ios-app/*` documents — for round one, hide every `?` door whose surface has no article (C5-02, R-10),
  and never show "No help articles yet".
- **L0.5 App Store Connect** (Kody-run, an agent drafts every text): beta review details with a demo
  account (requires L1-A's test-login path, D7); test information (beta description, feedback email,
  privacy URL); What to Test for build 1; age rating (messaging + UGC = yes); encryption declaration;
  let automatic signing regenerate the App Store profiles for both bundle ids (A2-19); add Kody + Leah
  to an internal group; the `MiddleWest Client` external group stays empty until the beta review passes.
- **L0.6 PostHog** (Kody): flags `house-first`, `direct-orders`, `house-widget` exist and target nobody
  for round one (D1); error tracking project confirmed; the Debug kill-switch verified.

### W1 — The first five minutes and the daily surfaces (T0 in-app; 6 lanes; days 3–8)

Owned-file lanes (the writer assigns every T0 finding to exactly one lane by its `where`):

- **L1-A Welcome, sign-in, onboarding** — `Features/Authentication/**`, `Features/Onboarding/**`,
  `Features/FirstLaunch/**`, `Features/StyleQuiz/**`, `Features/StyleConversation/**`,
  `Features/StyleReveal/**`, `Services/Auth/**`, `Features/Account/**`, `ContentView.swift` (auth cases).
  Includes: providers shown only when GoTrue `/auth/v1/settings` says enabled (A3-06, D3); errors never
  on the root and space reserved (P-29); the guest flow escapable (P-18); in-flight state on every
  sign-in button (C1-05); invalid-email message (P-20); OTP banners exclusive and Verify visible
  (P-22, C1-37); Apple sign-in passes `role: homeowner` (A3-07); the `test-account-login` fallback wired
  for the tester/demo account (A3-16, D7); one name for the email code (P-30); Privacy Policy links to
  /privacy (C5-04, C1-30); delete-account copy (A-101); a sign-in route for guests from Settings and
  the Studio card (B-12, C1-14, B-13); Skip skips (A-05); returning accounts never forced through the
  quiz (B-21); quiz submit feedback (C1-04); dead "Next question →" (A-13); keyboard dismiss (C9-08);
  SIWA button in dark mode (C3-03); disabled/enabled inversion (C3-06); auth icon idioms (A-03, P-02).
- **L1-B Data, persistence, resilience** — `Core/Persistence/**`, `Core/Network/**`, `Core/State/**`,
  `Services/Analytics/**`, `Services/Sync/**`, `Features/Collections/**` (schema side),
  `Features/RoomScan/**` (fallback flow), `Features/Rooms/**` (room lifecycle). Includes: a
  `SchemaMigrationPlan` and no `fatalError` (C7-01); `BoardModel` in the schema (C7-02); `.launching`
  timeout (C1-19); pull-to-refresh on every root and Studio detail (C4-12, R-03); loading vs empty vs
  error honesty everywhere (C4-03, A-80, R-01, R-02); request timeouts (C4-16); a bounded telemetry
  queue (C7-13); product selects without the two vectors (A3-18); the remaining all-or-nothing decodes
  (C7-17); one match score per product per session (A-34, C-11); Rescan and the fallback entry are not
  dead ends and dimensions are not pre-filled (GAP4-25, GAP4-02, GAP4-03); a deleted room leaves
  Studio and the counts (B-03, B-04); one attention count (A-81).
- **L1-C Layout, Companion, Dynamic Type** — `Design/**`, `Features/Companion/**`,
  `Features/Home/**` (layout), `Features/Decisions/**`, `Features/Help/**` (tour/coach-mark layout),
  `Features/Settings/**`, `Features/ProductDetail/**` (chrome), `Features/Navigation/**`. Includes: one
  bottom content inset derived from `CompanionHearthMetrics` on every scrollable screen (A-88, C-03,
  C-28, C9-04, C9-05, GAP1-15, A-64, B-28); the orb never overprints a sheet's buttons; consent and
  defer sheets usable at accessibility sizes (GAP1-01, GAP1-02: `.large` detent + scroll + bottom
  buttons pinned); headlines never break mid-word (C-06, GAP1-03, P-34); the back button gets a
  material (A-89); product-detail top controls stay reachable (A-45); the Settings sheet has a dismiss
  and follows appearance (A-99, A-100, C-23); tooltips and coach marks never cover what they explain
  (B-07, B-10, A-50, C-18); tour buttons use Patina colour (B-09); the Reveal CTA visible in light mode
  (GAP4-16); room-type chips labelled and scalable (C6-18); one sheet chrome; tap targets ≥ 44 pt on
  the decision sheets and auth links (GAP1-07, GAP1-08).
- **L1-D Tokens, dark mode, contrast, iconography** — `apps/mobile/PatinaDesignKit/**`,
  `Design/Tokens` and every view that hard-codes a colour or font (the writer lists files from C3's
  ledger). Includes: the orb in dark mode (C-01, C-02); `pearl` → a dynamic hairline (C3-01); `clay`
  fills ≥ 4.5:1 (C3-05); tan primary buttons and "Pay" (A-73, A-90); primary CTA in dark mode (P-35);
  one primary-button style (C-41); dark-mode meta/body text (C-20); the 46 inline custom fonts →
  PatinaTypography (C3-15); emoji out of the quiz (A-11); money formatting (C5-14); missing-image
  state (A-36, C-27, B-18, GAP7B-11); the story card without a hero (A3-17).
- **L1-E Copy** — every user-visible string (C5's inventory `research/C5-strings.txt`), owned as
  strings not files: one error voice modelled on MoneyFailureCopy (C5-11, C4-09, C4-08); one noun per
  thing — Piece, Room, Studio, Companion, Record (C5-09, A3-28, C-22); sentence case per surface
  (C5-10); greeting windows (C5-06); pluralisation (C-30); room CTA grammar (B-20, GAP1-18); the
  portrait/privacy claim (B-23); guest promises (A-52, A-79); the tour's "Your profile" → "Studio"
  (A-60); brand-voice violations (C5-20, "journey"); boilerplate card copy (C-38); UNKNOWN MAKER
  (C5-16); the "AI" sweep (VISION §6 — zero occurrences in user-facing copy); the delete-account
  sentence (with L1-A). Copy changes to files owned by other lanes go through integration notes; the
  lane edits string literals only.
- **L1-F Notifications, messaging, widget, deep links** — `Features/Notifications/**`,
  `Services/Notifications/**`, `Services/Badges/**`, `Features/Messaging/**`, `PatinaWidget/**`,
  `PatinaWidgetShared/**`, `App/DeepLinking/**`, `Core/Persistence/WidgetSnapshot.swift`. Includes:
  badge stale after reading (C2-07); "Turn on notifications" when denied (C2-09); empty state while
  loading (A-80) and the narrow button (A-63); thread header and the system line (C-13, C-14); silent
  send failure (C4-04); composer under the dock (with L1-C, C9-05); snapshot cleared on sign-out and
  keyed by account (B-16); the flag-off widget renders the snapshot, not a placeholder (GAP7B-02, D5);
  row titles never truncate mid-word (GAP7B-03); per-row deep links and a routed first row (GAP7B-04,
  GAP7B-05); `.systemMedium` (GAP7B-07); links dropped before configure and links tapped signed-out
  (C2-02, C2-21, GAP7B-09); eyebrow date logic (GAP7B-06); overdue-before-asked guard (GAP7B-15).

W1 exit: every lane's review closed; `ios-gate.sh all` + `release` + `archive` green on the
integration tip; ONE walker per surface on the review simulator, flags off, against the LOCAL stack
with the 00555 migration applied locally, then a second short walk against PRODUCTION signed in as
the tester account (now possible via D7) — the audit's unmet reconciliation ("what a tester sees" vs
"what production holds") is closed here.

### R1 — Build 1 (day 8–9)

Steward: `ios-gate.sh archive` → export (App Store Connect method, automatic signing) → `asc publish
testflight --wait` → What to Test → internal group (Kody, Leah). **Device pass on Kody's iPhone 17 Pro
Max** (DEVELOPER_DIR=Xcode-beta, the traps in memory `ios-device-automation-traps`): cold launch time;
Sign in with Apple; email code from a real inbox; LiDAR scan + upload + server-side row; camera QR
approval with Face ID; a push round trip from `apns-send` (APNS_* presence confirmed by Kody, D9); a
universal link from Mail while signed in AND signed out; the widget on the Home Screen; Apple Pay on
an invoice only if a live Stripe key is on Strata (else the failure state); dark mode and the largest
Dynamic Type on Today, a decision, an invoice; airplane mode. Every claim reported at its level.
Then beta review submission with the demo account → `MiddleWest Client` gets build 1.

### W2 — Build 2 (the first tester week; T1)

Same six lanes, the 350 T1 findings (writer assigns them the same way), plus: **L2-G Tests & gates** —
rewrite `PatinaUITests` against the real first-run path (the 7 dead tests) so the UI tier asserts the
product; `identifier_name` rule tuned or the 396 errors fixed; the Swift 6 concurrency warnings
triaged into a backlog (1330 warnings — not a round-one fix); a Release gate in `ios-gate.sh all`.
Plus a tester-feedback intake: TestFlight feedback + PostHog error tracking reviewed daily; every
tester-reported defect becomes a W2 finding with its id.

### W3 — After round one (T2, polish, measurement)

The 97 T2/polish findings; Instruments passes on the device for the C7 performance claims; iPad
decision revisited; `house-first` / `direct-orders` flips are separate programs with their own gates.

## 5. Decisions for Kody (block or shape the work)

- **D1 Cohort and flags.** Round one = Leah's active clients; `house-first`, `direct-orders` OFF; the
  Record and Studio surfaces are the product. Recommended: yes (vision §1/§2/§6).
- **D2 Catalogue.** Who supplies ≥30 pieces with images and by when; if not by day 6, build 1 ships the
  honest "still curating" state. Recommended: Leah's library first; the 14 Chrome-capture rows are
  Kody's personal layer and stay invisible.
- **D3 Google sign-in.** Enable the provider on Strata (needs a Google OAuth client) or drop the
  button for round one. Recommended: drop; show providers from `/auth/v1/settings`.
- **D4 iPad.** Drop the family (iPhone-only round one). Recommended: yes.
- **D5 Widget.** Ship it in build 1 with the flag-off rendering fixed (the widget renders its snapshot;
  the flag gates in-app promotion only), or hold the extension. Recommended: ship, fixed.
- **D6 Deployment target.** 26.0 instead of 26.5 (no 26.5-only API found). Recommended: 26.0.
- **D7 Demo account.** Wire the `test-account-login` fallback into the app for `tester@patina.cloud`
  so beta review, agents and Kody can sign in on production without a mailbox. Recommended: yes (small).
- **D8 Security migration timing.** 00555 goes to Strata before anyone new signs up — independent of
  TestFlight. Recommended: today.
- **D9 Push credentials.** Confirm APNS_AUTH_KEY / KEY_ID / TEAM_ID / TOPIC on the edge runtime (memory
  says the .p8 was owed for arrival-arc). Needed before the device pass.
- **D10 Stripe on production** for invoice payment in round one (live key + Tax ruling — still owed from
  the Daily Return). If not ready, the invoice Pay path shows the world-class failure state and the
  What to Test says so.

## 6. Gates (every claim at its level)

- Lane: `ios-gate.sh build`; `xcodebuild test -only-testing:PatinaTests` on the lane's own clone;
  the lane's own new tests; `ios-gate.sh release` (new); pathspec commits; review closed.
- Integration (steward only): `ios-gate.sh all` + `release` + `archive` + lint-delta; SQL: `supabase db
  reset` + pgTAP when 00555 is in the wave; one walker per surface, one clone per walker.
- Build: archive → export → upload → processing VALID → What to Test → internal group → device pass →
  beta review → external group. Never a placeholder in a command; grep the archive's Info.plist for the
  version/build after export.
- Claim levels: compile-green < sim-verified < device-verified; device-only claims listed in R1.

## 7. Risks

- Content is the long pole and is not an engineering task; the honest empty state is the hedge.
- Prod mutations are Kody-run (hook-blocked) — six of them in W0; sequence: security first.
- The Companion inset change (L1-C) touches every screen; it needs its own walk before other lanes merge.
- Two agents on one simulator manufacture fake defects (tonight) — one clone per lane is a hard rule.
- The device pass depends on Xcode-beta for Kody's iOS 27 phone; the iPhone 13 Pro on the network is an
  alternative LiDAR device on a release iOS.
