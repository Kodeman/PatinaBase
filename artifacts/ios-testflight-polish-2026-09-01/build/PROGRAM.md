# First Flight — the Patina iOS app's first TestFlight round

**Build program charter · 2026-09-01 · program folder `artifacts/ios-testflight-polish-2026-09-01/`**

> **For agentic workers:** each wave runs as ONE Workflow. Each lane's implementer writes its own
> bite-sized task list (superpowers `writing-plans` format: failing test → run → implement → run →
> pathspec commit) into `artifacts/ios-testflight-polish-2026-09-01/build/waves/<wave>/<lane>-tasks.md`
> **before** writing code; its reviewer checks that task list against this charter, against the exact
> finding ids the lane owns, and against the ledger sections cited in each row. Every finding id in
> your lane's table must appear in your task list or in a written "not this wave, because…" line in
> your report. Cite finding ids in commit bodies (`fix(first-flight): reserve the Companion inset
> (A-88, C-03, C9-04)`). Report every claim at its level — **compile-green < sim-verified <
> device-verified** — and never round a compile-green claim up.

**Goal.** Put a build of `cloud.patina.app` into the hands of Leah's active design clients that reads
as a finished iOS app: it archives and uploads; production carries the contract the binary calls; the
two live anon-key data exposures are closed; the first screen and the first sign-in cannot fail for a
real client; the daily Studio surfaces are polished; the marketplace shows real pieces or an honest
"still curating" state; nothing crash-loops on build 2; and a device pass on Kody's iPhone has covered
every device-only claim. Round one is the studio's front door (VISION §1.2), not a consumer launch.

**Architecture.** SwiftUI client (`apps/mobile/Patina`, 435 Swift files / ~92k LOC, `PatinaTests` =
Swift Testing 1523 tests, `PatinaUITests` = XCTest, `PatinaWidget` app-extension, design kit
`apps/mobile/PatinaDesignKit`) against Supabase "Strata" (`bkvcixdmuyejfzcijpdg`) over PostgREST +
GoTrue + Storage + Deno edge functions. No new NestJS service. Backend deltas are hand-numbered
migrations and edge functions only. Distribution is `xcodebuild archive` → `-exportArchive`
(App Store Connect method, automatic signing) → `asc publish testflight`. Feature flags resolve once
at launch from PostHog's cached payload; in a Release build the **first** launch after install has
every flag OFF, which is the state round one ships in (`house-first`, `direct-orders`, `house-widget`
all off — D1).

**Tech stack.** Swift 6 language mode (1330 of the 1604 build warnings are `this is an error in the
Swift 6 language mode` — a W2 triage item, not a round-one fix) · SwiftUI · SwiftData
(`PersistenceController`) · Swift Testing · supabase-swift 2.40.0 · posthog-ios 3.48.0 (pulls
PLCrashReporter 1.12.2) · SwiftLintPlugins · WidgetKit · Postgres 15 + RLS + pgTAP-shaped psql tests ·
Deno edge functions · Sanity (`kv3qrinl` / `production`) for help + tour copy · App Store Connect via
the `asc` CLI in `~/.blitz/bin/asc` (app id **6762007888**).

**Spec.** `build/PLAN-SKELETON.md` — **the architecture as first drafted, superseded in detail by this
file**. Where the two disagree, PROGRAM.md wins: the skeleton's §3 tier counts, its §4 owned file sets,
its `GAP1-`/`GAP7-` finding ids (they collide with a different series in `findings.json` — see the
warning at the head of the skeleton) and its L0.2 scope are all re-cut here. Read it for lane *shape*
and for the reasoning; read this file for what a lane owns and closes. Plus the lane ledgers in
`research/` — `A.md`, `A1-anatomy.md`, `A2-config.md`, `A3-prod.md`, `A4-reconciliation.md`, `B.md`,
`C.md`, `C1`–`C9`, `G-gate.md`, `P.md`, `R.md`, `GAP1`–`GAP8`, `00-steward.md`. Machine-readable
finding set: `build/findings.json` (629 rows; `wave`, `tier` and the `promotedBy`/`closedBy` fields
carry this revision). Lane assignment: `build/findings-by-lane.md` — **authoritative for which finding
sits in which lane**; the owned globs it was cut against are superseded by §3's glob tables here.
Vision authority: `docs/vision/VISION.md` (when this charter and any other document disagree, VISION
wins). Program pattern Kody knows:
`artifacts/ios-daily-return-2026-08-26/source/build-plan.md` and its `RESUME.md` "How a wave runs".

## Global constraints (every task inherits these)

- **Auth is Supabase Auth (GoTrue) only.** Never NextAuth, never a second identity path. Data access
  from the app goes through the existing clients in `Core/Network`; new server logic is a migration or
  an edge function.
- **Migrations are hand-numbered `NNNNN_slug.sql`** and never created with `supabase migration new`.
  This program reserves **00555** (`build/migrations-draft/00555_ios_round_one_security.sql`, drafted,
  never applied) and **00556** if L0.2's `increment_scan_upload_attempt` needs its own file. Numbers
  are provisional: re-run `ls supabase/migrations/*.sql | sort | tail -5` and `supabase migration list`
  immediately before each apply and renumber on collision.
- **Every new function gets `REVOKE EXECUTE … FROM PUBLIC, anon`**, and SECURITY DEFINER service
  functions additionally `FROM authenticated` (GRANT to `service_role` only). RLS policies are written
  `TO authenticated`. No policy may carry `auth.uid() IS NULL` as its predicate — that shape grants the
  table to the unauthenticated key and nothing to `service_role`, which is BYPASSRLS (00555 §d).
- **Prod mutations are Kody-run.** Agents prepare, draft, and probe read-only. The Bash prod-mutation
  hook does **not** cover Supabase MCP writes, so an MCP `apply_migration` needs the same explicit ship
  request a `psql` apply does.
- **Git.** Pathspec commits only — never `git add -A`. One worktree per lane
  (`.codex/worktrees/agent-ff-<wave>-<lane>` on branch `first-flight/<wave>-<lane>`); `git worktree
  add` and `git merge` run unsandboxed; copy `Patina/App/Configuration/Secrets.swift` into every new
  worktree and never commit it. No push from a subagent. Integration branch `first-flight/integration`;
  Fable merges to `main` with `--no-ff` and reads the merge log, not `tail -1`. Husky rejects `merge:`
  commit subjects — use `chore(first-flight): integrate …`.
- **One simulator clone per lane, never shared.** Tonight's gap round proved the cost: GAP1 and GAP7
  drove clone C simultaneously and manufactured two phantom defects ("the app is crashing", "cold
  launch shows a sign-in wall to a signed-in user") that took a re-run each to withdraw. Explicit udid
  on every `simctl`/blitz call **and inside `ios-gate.sh`** (its `sim_destination()` scrapes
  `simctl list | head -1` today and will happily seize another lane's clone or the protected review
  device — L0.1 adds the `IOS_GATE_UDID` requirement); never `booted`.
- **One writer per file, and one merge order.** Every file in the app belongs to exactly one lane per
  wave (§3's glob tables; the residue is listed there as "no lane"). A lane that needs a change in
  another lane's file sends an integration note with the exact final text; the owner applies it as a
  task in its own list. W1's merge order is fixed: **L1-C → L1-D → L1-B → L1-F → L1-A → L1-E**, and
  L1-E rebases and re-applies its copy deck last.
- **Every lane runs a VISION check over its own fixes.** One line in the task list: *name any finding
  whose fix would add or entrench something VISION §6 refuses (tab / zone / dashboard UI, shadows,
  red/green status, badges, engagement optimisation, the "AI" label) and say why it survives.* A fix
  that cannot answer becomes an integration note to Fable, not a commit.
- **Claim levels.** compile-green < sim-verified < device-verified. Universal links from Mail, App
  Groups on glass, APNs delivery, Apple Pay, LiDAR/AR, widget-on-Home-Screen and real cold-launch time
  are **device claims** and are only closed in R1.
- **Copy rules.** Zero occurrences of "AI", "A.I.", "artificial intelligence", "machine learning" in
  anything a tester reads (VISION §6) — the compiled-string sweep is currently **clean** (assignment
  note 9), so the job is to keep it clean and to re-check the Sanity-hosted tour and help copy at L0.4
  publish time, because that copy lives outside the repo. Brand voice per
  `.claude/skills/patina-brand-voice/SKILL.md`: confident and unpretentious, sensory, plain-spoken
  Midwest; no "journey", no "curated", no "elevated", no "bespoke" unless literally custom. Never print
  a vendor or server error string to a homeowner.
- **VISION rules that bind the UI.** No tab/zone/dashboard framing, no badges as decoration, no
  red/green status as the carrier of meaning, no engagement optimisation. "Launching to an empty room —
  slip rather than demo something broken" is the program's stop rule (§8).
- **Screen capture.** Simulator evidence comes only from `xcrun simctl io <udid> screenshot` or
  `mcp__blitz-iphone__get_screenshot`. **Never** desktop `screencapture` — the desktop is Kody's.
- **Never install a build made with `CODE_SIGNING_ALLOWED=NO` for a walk.** It strips entitlements, the
  keychain rejects every call, sessions never persist, and writes silently no-op. The steward's signed
  Debug build is the only install a walker uses.

---

## 0. The VISION test, run on this program itself

VISION §8 says: *before building — which surface (§1), which studio moment (§2), which stream (§3),
which promise (§4)? If the answer is "none of them," it's a side journey.* This program commits eight
days, six parallel Opus lanes plus a steward, reviewers and walkers, and a week of Leah's time. It owes
the test an answer in writing.

| VISION question | This program's answer |
|---|---|
| **Which surface (§1)?** | **#2 — the iOS app, "the studio's front door. A marketing and qualification instrument the studio owns; not a consumer product in its own right."** Not #1. The Document is Patina for the next twelve months and this program does not advance it. |
| **Which studio moment (§2)?** | Leah's studio has active design clients today and no way to put a decision, a proposal or an invoice in front of them on glass. The app is how her existing clients stay engaged without her sending another email. It serves §2's studio by taking work off §2's owner. |
| **Which stream (§3)?** | **Upside.** A homeowner who is engaged daily is a homeowner who approves a piece. The app is the qualification instrument in front of the marketplace till; it is not the floor stream and it does not sell to homeowners. |
| **Which promise (§4)?** | The homeowner half, verbatim: *"you're engaged every day, and you and your designer are looking at the same agreed direction."* That sentence is the round-one bar in §2 and the reason the Studio surfaces outrank Browse. |

**What The Document gives up for these eight days.** Kody and Leah are the whole company. Eight days on
surface #2 is eight days The Document's roadmap does not move — that is a real cost and it is Kody's to
accept, not this charter's to assume. Two guard rails come out of it:

1. **The Document never breaks to unblock the app.** The security migration this program mints (00555)
   changes read paths the designer portal uses. It ships **after** its code follow-ups are merged and
   the portal is redeployed (**L0.2b**, **D8**) — never the other way round. A program for surface #2
   that takes surface #1 down on day one has failed its own VISION test.
2. **Two open rulings feed this program's own cohort decision.** VISION §7 **V3** — *"Pause the consumer
   Founding Circle (0/200) until at least one studio beyond Leah's is live?"*, with the note *"the
   marketing engine has been pointed at the wrong door for ten weeks"* — and VISION §2's own
   parenthetical on the beta cohort: *"(Kody's words: 'active Patina customers' — read as the studio's
   current clients; **confirm**)"*. Both are inputs to **D1**, and both are listed there. Round one as
   scoped here is explicitly **not** the consumer Founding Circle; if V3 rules the other way, D1 is
   re-opened before any invite goes out.

---

## 1. The verdict

The Patina iOS app is a well-made piece of software that has never been shipped, and every one of its
problems follows from that one fact. Its unit tier is genuinely healthy (1523 tests, 164 suites, zero
failures, 4.7 s of execution); its icon is a complete iOS 26 Icon Composer build with light, dark and
tinted renditions; its typographic system, its payment-failure copy, its push primer, its Studio money
ladder and its Reduce-Motion handling are the work of someone who cares. And it **does not compile in
Release** — four `#Preview` blocks reference `#if DEBUG` fixtures, so no archive has ever been produced
and everything downstream of an archive is unproven. Production has caught up on the server contract
since the audit was written (00533–00540 are applied; `delete-account` is deployed — re-verified this
session, see the reconciliation below) but production is still an **empty room**: one published
catalogue product, a $20 "Smoke Test Ceramic Lamp" with no image, so `get_recommendations` returns zero
rows for every caller and the quiz → "View Recommendations" → save loop terminates on nothing. **Three**
live data exposures remain open to unauthenticated callers: two to the anon key compiled into the binary
— all 24 `profiles` rows with emails, Stripe customer ids, phones and addresses, and
`notification_preferences` with SELECT, INSERT, UPDATE **and** DELETE — and a third that has nothing to
do with the app at all: `apps/designer-portal/src/app/api/catalog/vendors/route.ts:5-13` and
`[id]/route.ts:5-18` both `.select('*')` on `vendors` with **no `getUser()` guard**, and the portal
middleware passes `/api/*` through, so all thirteen internal trade columns are a `curl` away from
`https://app.patina.cloud/api/catalog/vendors`. That third one is on VISION's surface #1, is not fixed
by 00555, and is **broken worse** by it unless the route is guarded first (§0 guard rail 1, **L0.2b**).
The first screen offers "Continue with Google"
first and the provider is disabled on Strata, a failed sign-in leaks a raw GoTrue string onto the
Welcome root and shifts the stack 33 pt, one mis-tap lands in an inescapable guest flow, and the
advertised tester credential does not work in the app at all. The Companion orb occludes content on
every scrollable screen; dark mode fails on hard-coded fills; primary buttons sit at ~2.2:1; at
accessibility text sizes Approve and Cancel go off-screen on the app's own e-signature sheet. Round one
is not a design problem. It is eight days of unblocking, one archive, and a device pass.

### The audit in numbers

| | |
|---|---:|
| Confirmed findings from the workflow | 607 |
| Refuted / duplicates folded out | 28 / 189 |
| Ledger-only rows folded in (`GAP1B-*`, `GAP7B-*`) | 24 |
| Rows merged by root cause (`GAP7-03`, `GAP7-04` → `GAP7B-09`) | −2 |
| Filed by W0 · L0.7's coverage walk (`L07-01`…`L07-11`) *(amended 2026-09-02)* | +11 |
| **Findings this program owns** | **640** *(amended 2026-09-02; was 629)* |
| Audit lanes · screens photographed | 26 · 45 of 100 |
| Device-verified findings | 0 |

**One ledger row reconciles to nothing, and it is named here rather than lost.** `GAP7.md`'s
`GAP7-06` ("the companion bubble parks on top of content on two more screens" — the Today designer-seat
card clipping *"Leah Hart[well]"* / *"Aspen Loft Re[fresh]"*, and the message-thread composer) was
folded by the workflow as `dupOf: A-108`. `A-108` ("the Companion orb covers the primary AND the
destructive action on Room Settings", `research/A.md:726`) appears in **none** of the workflow's three
dispositions — not confirmed, not refuted, not duplicated — so the fold landed on a row that is not in
the 629. Both are the same defect as `A-88` / `C-03` / `C9-04` (no bottom content inset derived from
`CompanionHearthMetrics` anywhere in the app) and the composer half is `C9-05`; all four are **W1**.
L1-C's `CompanionInsetTests` asserts the *class*, not a screen list, so Room Settings, the Today seat
card and the thread composer are all covered by it — but the walker's W1 acceptance script names those
three screens explicitly so the coverage is proved and not assumed.

Of those 640, **four are closed by the production reconciliation below** and carry no work
(`A3-03`, `A4-03`, `A4-04`, `A3-02` — all four premised on a migration gap that no longer exists).
They are `tier: "closed"` in `findings.json` and appear in the reconciliation table, not in a lane
table. **636 findings are scheduled.** *(amended 2026-09-02: was "of those 629 … 625 scheduled".)*

**Every number in the four tables below was amended on 2026-09-02** by two changes recorded in full in
§11: ruling **D1**'s re-tier of twelve rows (`build/waves/w0/retier-D1.md`) and the placement of
**L0.7's eleven new findings** (`build/waves/w0/l0.7-coverage-walk.md`). The pre-amendment value is
given beside each changed number. `build/findings.json` and `build/findings-by-lane.md` carry the
amended figures as their live values; **§3's and §5's per-lane tables were deliberately not rewritten**
— §11 names every line in them that is now stale.

| Wave | Findings | blocker | major | minor | polish |
|---|---:|---:|---:|---:|---:|
| **W0** Unblock (days 1–3) | 34 | 8 | 19 | 7 | 0 |
| **W1** The first five minutes and the daily surfaces (days 3–8) | **137** *(amended; was 141)* | **14** *(was 12)* | **119** *(was 125)* | 4 | 0 |
| **W2** Build 2, the first tester week (days 10–17) | **365** *(amended; was 349)* | 0 | **130** *(was 121)* | **195** *(was 188)* | 40 |
| **W3** After round one (backlog, unscheduled) | **100** *(amended; was 101)* | 0 | 5 | **42** *(was 45)* | **53** *(was 51)* |
| **Scheduled** | **636** *(was 625)* | **22** *(was 20)* | **273** *(was 270)* | **248** *(was 244)* | **93** *(was 91)* |
| *closed by reconciliation* | *4* | *4* | *—* | *—* | *—* |
| **Total** | **640** *(was 629)* | **26** *(was 24)* | **273** *(was 270)* | **248** *(was 244)* | **93** *(was 91)* |

| Tier | blocker | major | minor | polish | Total | Wave |
|---|---:|---:|---:|---:|---:|---|
| **T0** — must fix before build 1 reaches a tester | **18** *(amended; was 16)* | **138** *(was 136)* | 11 | 0 | **167** *(was 163)* | W0 + W1, **and 8 in W2** *(amended: D1 moved eight flags-off-only T0 rows to W2 with their tier held — they are T0-severity defects on a root no tester opens unless the kill switch is pulled)* |
| **T1** — before build 2, the first week | 4 | **130** *(was 129)* | **195** *(was 188)* | 40 | **369** *(was 361)* | W2, **less the 12 promoted into W1 by D12** |
| **T2** — after round one | 0 | 5 | **42** *(was 45)* | **50** *(was 48)* | **97** *(was 98)* | W3 |
| **cut** — recorded, not scheduled | 0 | 0 | 0 | 3 | **3** | W3 |
| **closed** — premise gone, see the reconciliation | 4 | 0 | 0 | 0 | **4** | — |

**Tier is the audit's judgement; wave is this program's schedule, and they are no longer identical.**
Twelve T1 rows are scheduled in W1 under ruling **D12** because build 1 walks a tester straight into
them: `GAP4-02`, `GAP4-03`, `GAP4-25` (the room-scan fallback: a dead end, developer default dimensions
committed as the client's real room, and a "Rescan" that strands until force-quit), `GAP4-16` (the
Reveal's only CTA invisible in light mode), `GAP1B-03`, `GAP1B-07`, `GAP1B-08`, `C-23` (the Dynamic-Type
and tap-target rows L1-C's own W1 tests already assert), `GAP2-24` (the Pay button below the fold, the
sibling of W1's `B-28`), and `B-15`, `C2-06`, `GAP3-18` (account isolation across a sign-out — the one
defect class where a first-round client can see another client's data). Each is marked **⇧D12** in its
W1 lane table and struck from W2, never scheduled twice.

| Lane | W0 | W1 | W2 | W3 | Total |
|---|---:|---:|---:|---:|---:|
| L0.1 Build & configuration (iOS, agent) | 18 | | 9 | 4 | **31** |
| L0.2 Production backend (Kody-run; agent prepares and probes) | 3 | **1** *(amended)* | 3 | 4 | **11** *(was 10)* |
| L0.2b The Document's read paths (portal + shared hooks, agent) | 0 | | | | **0** |
| L0.3 The room is not empty (content; agent builds the pipeline) | 3 | | 2 | 1 | **6** |
| L0.4 Help & tour content (Sanity; Kody authorizes) | 4 | | 1 | 1 | **6** |
| L0.5 App Store Connect (Kody-run; agent drafts every text) | 5 | | | 1 | **6** |
| L0.6 PostHog (Kody) | 1 | | | | **1** |
| L0.7 Daily-surfaces coverage walk (agent; files findings, fixes nothing) | 0 | | | | **0** |
| L1-A Welcome, sign-in, onboarding | | 27 | 41 | 11 | **79** |
| L1-B Data, persistence, resilience | | **28** *(was 27)* | 52 | 11 | **91** *(was 90)* |
| L1-C Layout, Companion, Dynamic Type | | **28** *(was 35)* | **125** *(was 114)* | **33** *(was 35)* | **186** *(was 184)* |
| L1-D Tokens, dark mode, contrast, iconography | | 18 | 51 | **11** *(was 9)* | **80** *(was 78)* |
| L1-E Copy | | 18 | **48** *(was 46)* | 10 | **76** *(was 74)* |
| L1-F Notifications, messaging, widget, deep links | | **17** *(was 16)* | **27** *(was 24)* | **12** *(was 13)* | **56** *(was 53)* |
| L2-G Tests & gates | | | 6 | 1 | **7** |
| **Total (scheduled)** | **34** | **137** *(was 141)* | **365** *(was 349)* | **100** *(was 101)* | **636** *(was 625)* |
| *closed by reconciliation (L0.2 ×3, L1-A ×1)* | | | | | *4* |

`L0.2b` and `L0.7` carry **zero** rows from the audit and exist anyway: L0.2b because 00555's own
required code follow-ups land in files no lane owned (§0 guard rail 1), and L0.7 because the audit never
walked the surfaces gate **G5** is written about — it will *produce* findings, not close them.
*(Amended 2026-09-02: L0.7 produced eleven — `L07-01`…`L07-11` — and they are owned by the lanes above,
which is why L0.7's own row is still 0. §11 places them.)*

Tester-visible: **521 yes / 119 no** *(amended 2026-09-02; was 510/119)*. Effort: **S 465 · M 153 · L 22** *(was S 456 · M 151 · L 22)*.

Gate state at charter time (`research/G-gate.md`, all gate-verified):

| Tier | Result |
|---|---|
| `PatinaTests` (unit) | **PASS** — 1523 tests / 164 suites / 0 failures in 4.7 s (610 s wall clock: a `simctl diagnose` stall, G-10) |
| `PatinaUITests` (UI) | **FAIL** — 7 of 11; all seven wait on `otherElements["threshold.enterButton"]`, an identifier with **zero hits** in the app source. The four that pass are unmodified Xcode template stubs. Zero passing assertions about the product. |
| Release compile | **FAIL** — exit 65, 6 errors, 4 files (G-01) |
| Archive dry run | **FAIL** — same compile break; `.build/Patina.xcarchive` never created. Signing resolved cleanly *before* the failure: both certificates valid, both team profiles valid to 2027-08-29, widget signed. |
| SwiftLint (full) | 933 violations — 512 warning / **421 error**; 396 of the errors are `identifier_name` on snake_case DTO properties, so `swiftlint lint` is structurally incapable of exiting 0 and only `lint-delta` is usable (G-11) |
| Build warnings | 1604 total; 1330 are `this is an error in the Swift 6 language mode` |

### Production reconciliation — re-verified 2026-09-01, this session

`research/A3-prod.md` recorded `supabase_migrations.schema_migrations` jumping **00532 → 00541** and
treated 00533–00540 as unapplied. **That is no longer true.** Re-probed directly against Strata
(not read off the ledger):

| A3 claim | State now | Consequence |
|---|---|---|
| 00533–00540 never applied (`A3-03`) | **Applied.** Ledger runs 00530…00554 unbroken. | `A3-03` closes; `A4-03`, `A3-10`, `A3-14`, `GAP8-03`, `GAP8-04` lose their blocking premise |
| `saved_items.price_cents_at_save` missing (`A4-03`) | **Column exists** | remote saves no longer 400 on the missing field — **re-probe with a real save before believing it** |
| `client_designer_roster` view 404s (`A3-10`) | **Exists** | roster read resolves |
| `profile_presence` table 404s | **Exists** | presence write resolves |
| `get_direct_order_terms` missing | **Exists** | purchase terms resolve (still gated off by `direct-orders`) |
| `delete-account` 404s (`A3-02`, `A4-04`) | **Deployed, ACTIVE v1**; unauthenticated POST returns **401**, not 404 | the App Review 5.1.1(v) blocker is closed at the deploy level; `A-101`'s **copy** defect stands |
| `increment_scan_upload_attempt` missing (`A3-12`) | **Still missing** (0 rows in `pg_proc`) | stands — L0.2 writes it or L1-B drops the call |
| `profiles` "Profiles are viewable by everyone" (`A3-04`) | **Still present** | stands — the headline exposure |
| `notification_preferences` ALL-to-public (`A3-05`) | **Still present** | stands |
| 1 published catalogue product of 15 (`A3-01`, `A4-02`) | **Still 1 of 15**; 24 `profiles` rows | stands — the long pole |

**What this changes:** W0's L0.2 shrinks from "apply eight migrations and deploy two functions" to
"mint and apply 00555, add `increment_scan_upload_attempt`, and re-probe every object A3 named". It does
**not** change W0's critical path, because the security migration and the catalogue were always the long
poles. Every lane that cited a missing server object must re-probe before writing a client-side hedge:
the hedge may now be unnecessary.

#### The four rows this closes — they are NOT in any lane table

An implementer reading only its lane table must not schedule work that is already done, or worse,
re-deploy something live. These four are `tier: "closed"` / `wave: "closed"` in `findings.json`, with
`closedBy: "production reconciliation 2026-09-01"`:

| id | was | why it is closed | what remains |
|---|---|---|---|
| `A3-03` | T0/blocker/L0.2, effort **L** — "apply 00533–00540 selectively to Strata" | The ledger runs 00530…00554 unbroken. All eight are applied. | Nothing. L0.2 re-probes read-only as its first task. |
| `A4-03` | T0/blocker/L0.2 — "every remote save 400s: `saved_items.price_cents_at_save` missing" | The column exists. | A **re-probe with a real save** before the claim is trusted — one line in L0.2's probe set, not a task. |
| `A4-04` | T0/blocker/L0.2 — "Delete Account cannot work (function + RPC both absent)" | `delete-account` is deployed, ACTIVE v1; an unauthenticated POST returns **401**, not 404. `purge_client_account` exists. | Nothing. Same deploy as `A3-02`. |
| `A3-02` | T0/blocker/L1-A — "`supabase functions deploy delete-account`" | Same deploy, filed twice in two lanes. | Nothing at the deploy level. **`A-101` — the delete-account *copy* — stays in L1-A/L1-E and is still a live App Review 5.1.1(v) risk.** |

L0.2's W0 work is therefore **00555 plus one re-probe**, not five blockers. If a probe disagrees with
this table, open a new finding with today's evidence — do not resurrect these ids.

### What is already world-class — keep these, and use them as the template

Nothing in this list may be "improved" by a lane without an explicit ruling. They are the standard the
rest of the app is being brought up to.

1. **The payment-failure state.** "We couldn't start this payment. Nothing has been charged." —
   `MoneyFailureCopy` is the model for every error sentence L1-E writes.
2. **The push-permission primer** (`PushPrimerView`) — asks after the value is visible, in the app's
   own words.
3. **The Studio money lane's loading → error → empty ladder**, with pull-to-refresh, and the invoice
   detail. Three honest states where the rest of the app has one.
4. **The typographic system** — Playfair headlines, Inter body, DM Mono labels, applied with intent.
5. **Reduce Motion in the Companion** — honoured where it matters most.
6. **Session survival through a backend outage** (`R.md`): the session holds; the screens lie about the
   data, which is L1-B's job, not the session's.
7. **The app icon.** Icon Composer source with light / dark / tinted renditions and the layered groups
   intact — `assetutil` confirms all three 1024×1024 fallbacks. This is the part most apps get wrong.
8. **AASA ↔ `DeepLinkHandler` match**, including the singular aliases — `/piece/*`, `/invoices/*`,
   `/proposals/*`, `/decisions/*` on `client.patina.cloud`, live and exact.
9. **The phase machine and `SessionScope`** — one reset on the auth seam, 72 `static let shared`
   holders enumerated and pinned.
10. **`apns-send` picking the APNs host per token** from a recorded environment, with
    `PushTokenService` deriving it from the embedded provisioning profile rather than `#if DEBUG` — a
    trap consciously avoided.
11. **Defensive product decoding** — `FailableDecodable` drops one bad row instead of the array;
    `ProductCategory(normalizing:)` absorbs the `chair`/`sofa` vocabulary drift.
12. **`withholdingUnresolvedMakers`** — refusing to print "Unknown Maker" on a provenance marketplace
    is the right call. It just has nothing left to show today, which is L0.3's problem, not this rule's.
13. **`test-account-login`** — fail-closed on missing config, identical 403 on every failure path, rate
    limits checked before any write, constant-time compare.
14. **Account deletion, client-side** — own JWT only, no id in the body, local store wiped, one human
    sentence on failure.
15. **The Release build settings** — dSYMs, stripped, validated, testability off, whole-module,
    dead-code stripping on. Correct for TestFlight before anyone tried.
16. **The three error-severity design-system custom rules** (`disallow_foregroundcolor`,
    `disallow_cornerradius`, `disallow_navigation_bar_hidden`) have **zero hits**. Those codemod sweeps
    genuinely landed; do not regress them.

---

## 2. The round-one bar, and the gate that proves it

### The bar (skeleton §2, read through VISION)

Round one is **Leah's active design clients** — `activeProject` tier, a live designer, real proposals,
decisions and invoices. For them the app's job is the promise in VISION §4: *engaged every day, you and
your designer looking at the same agreed direction*. That means the Record, the decisions, the
proposals, the invoices, the designer seat and the messages are the product. Browse and Saved are
secondary but must not be an empty room. Purchase (`direct-orders`) is pre-empted for these clients by
design (ruling R3) and stays off. The four-tab bar (`house-first`) stays off — it is also the natural
first-launch state in a Release build, and VISION §6 says no to tab bars. Nothing anywhere says "AI".

Therefore the round-one gate is eight claims:

- [ ] **G1 — It archives and uploads.** `ios-gate.sh archive` succeeds on Kody's machine with automatic
      signing, the widget appex is inside `PlugIns/`, the export's `embedded.mobileprovision` shows
      `aps-environment: production` and no `get-task-allow`, and ASC reports `processingState VALID`.
- [ ] **G2 — Production carries the contract the binary calls.** Every object the app reads exists and
      answers: re-probed, not read off the migration ledger.
- [ ] **G3 — All three exposures are closed, and The Document still works.** `profiles` and
      `notification_preferences` return 401 to the anon key; `vendors` returns its public face and
      401s on `notes`/`trade_terms`; **and the HTTP route** —
      `curl -s -o /dev/null -w '%{http_code}' https://app.patina.cloud/api/catalog/vendors` — does not
      return 200 with trade columns to an unauthenticated caller. The PostgREST probe and the route
      probe are two different principals and G3 needs both. Plus the L0.2b regression walk: the
      designer portal's vendors catalogue, the comms vendor picker, `people_directory` and roster
      avatars all still render after 00555.
- [ ] **G4 — The first screen and the first sign-in cannot fail for a real client.** No disabled
      provider on screen, no raw server string on the root, no inescapable guest flow, and a working
      demo credential (**D11** names which account that is).
- [ ] **G5 — The daily Studio surfaces do not lie, and the ones nobody walked have been walked.**
      Today, decisions, the designer seat and the Record each have loading / empty / error states that
      tell the truth, and pull-to-refresh — those are the surfaces W1 owns and can prove. **Proposals,
      invoices, documents, projects and message *send* were never walked by the audit** (`A.md`
      §Coverage gaps: *"Step 8: proposal signing, deciding a decision, documents, sending a message,
      design requests, orders — NOT executed (time)"*; `B.md` §Not verified; `GAP2.md`: *"Proposals and
      Messages were reached only incidentally and are not reported"*) and carry **8 findings across all
      629**, none in W0 or W1. G5 is therefore split:
      **G5a** — Today, decisions, the designer seat and the Record are honest at all three states with
      pull-to-refresh (W1 · L1-B · `LoadStateHonestyTests`, `RefreshableSurfacesTests`).
      **G5b** — **L0.7** has walked proposal detail + signing, decision detail, message send, documents,
      projects and orders as a signed-in `activeProject` client on the local stack, filed whatever it
      found, and Fable has tiered it. G5b passes when the walk has run and **no blocker came out of it**;
      a blocker that does come out is scheduled into W1 before build 1 or named in What to Test.
      G5 cannot be claimed on findings that were never looked for.
- [ ] **G6 — The marketplace shows real pieces or an honest "still curating" state.** Never a grid of
      grey blocks.
- [ ] **G7 — Nothing crash-loops on build 2.** `ModelContainer` failure is recoverable; there is a
      `SchemaMigrationPlan`; `BoardModel` is in the schema it is fetched from.
- [ ] **G8 — A device pass on Kody's iPhone 17 Pro Max has closed every device-only claim** (R1's
      checklist, §4).

### The gate checklist (skeleton §6 — every claim at its level)

**Lane gate** (run by the implementer, on the lane's own clone, before the review). Every tier that
touches a simulator takes an explicit udid — `IOS_GATE_UDID` is exported for the whole session and
`ios-gate.sh` **fails** without it (L0.1's change; today it scrapes `head -1` and can steal another
lane's clone):

```bash
export IOS_GATE_UDID=<THE LANE'S OWN CLONE UDID>
```

- [ ] `apps/mobile/Patina/scripts/ios-gate.sh build`
- [ ] `xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug -destination "platform=iOS Simulator,id=$IOS_GATE_UDID" -only-testing:PatinaTests` — the **whole** tier, not just the lane's new suites
- [ ] the lane's own new suites, named in its task list, green
- [ ] `apps/mobile/Patina/scripts/ios-gate.sh release` (the new tier — see L0.1; agent-runnable, `CODE_SIGNING_ALLOWED=NO`)
- [ ] the lane's VISION check line answered (global constraints)
- [ ] pathspec commits only; `git status` clean of anything the lane does not own
- [ ] separate-context review closed with zero blocking findings

**Integration gate** (steward only, on `first-flight/integration`). **`archive` is not on this list** —
it needs an authenticated Xcode account, `-allowProvisioningUpdates` network round trips to ASC and a
distribution keychain that can prompt, none of which a steward subagent can satisfy. Archive-green is
**R1 Step 2**, on Kody's machine:

- [ ] `ios-gate.sh all` (= `build + unit + lint-delta`; `release` stays a separate tier until L2-G
      measures the whole-module Release compile time in W2 — see L0.1 and §5)
- [ ] `ios-gate.sh release`
- [ ] `ios-gate.sh lint-delta` (never full `lint` — it cannot exit 0 until G-11 is fixed in W2)
- [ ] when the wave carries a migration: `pnpm supabase:reset` then the **whole** SQL suite, as
      00555's own AFTER-APPLY block instructs — not just the one new file:
      `bash scripts/run-sql-tests.sh` and diff the failures against `supabase/tests/KNOWN_FAILURES.md`
      (a new name in the failure list fails the gate)
- [ ] one walker per surface, one clone per walker, on the steward's **signed** Debug build

**Build gate** (R1, §4 — Kody-run):

- [ ] `ios-gate.sh archive` green on Kody's machine with automatic signing
- [ ] archive → export → upload → `processingState VALID` → What to Test → internal group → device pass
      → beta review → external group
- [ ] never a placeholder in a command; after export, `grep` the archived `Info.plist` for
      `CFBundleVersion` / `CFBundleShortVersionString` and read the entitlements out of the exported
      `.app`

---

## 3. Waves

### W0 — Unblock (days 1–3; the long pole is content) — 34 findings, 8 lanes

W0 is mostly not a code wave. Five of its eight lanes are Kody's hands on a dashboard or a prod
connection; three are agent lanes — L0.1 (make an archive possible at all), **L0.2b** (guard the
designer-portal read paths 00555 changes, so The Document does not break to unblock the app) and
**L0.7** (walk the surfaces the audit never reached, so gate G5 has evidence behind it). Nothing in W1
can be walked, and nothing in R1 can be built, until L0.1 and L0.2 are done.

**Sequence, and it matters:**

1. **Day 1.** L0.3's content request goes to Leah (longest pole, and the only duration Kody does not
   control). L0.1 starts with `A2-07`'s throwaway archive dry run. L0.2's agent drafts and re-probes;
   L0.2b starts immediately, because it gates L0.2's apply. L0.7 walks.
2. **Day 2.** L0.2b's three code follow-ups are merged and the **designer portal is redeployed**
   (`./infra/deploy-portal.sh designer`). Only then is 00555 clear to apply.
3. **Day 2–3.** Kody applies 00555 (**D8**), then the L0.2b regression walk, then the read-only probes.
   ASC (L0.5), PostHog (L0.6) and Sanity (L0.4) run in parallel — none of them gates anything else.
4. **End of day 3.** W0 exit criteria (below). L0.3 continues into W1 and is called on day 6 (**D2**).

**The rule the sequence encodes:** The Document never breaks to unblock the app (§0). 00555 is a
security fix and it is urgent — but "urgent" is two days of ordering, not a same-day apply that returns
500s on `app.patina.cloud`.

---

#### L0.1 — Build & configuration · *iOS · one agent lane · Opus*

**Purpose.** Make `-configuration Release` compile, make `archive` a gate, and fix every project-level
setting that would reject the upload or embarrass the binary. This lane gates every other lane in the
program.

**Owned files (exact globs).**

```
apps/mobile/Patina/Patina.xcodeproj/project.pbxproj
apps/mobile/Patina/Config/Version.xcconfig            (new)
apps/mobile/Patina/Patina/Info.plist
apps/mobile/Patina/Patina/PrivacyInfo.xcprivacy        (new)
apps/mobile/Patina/PatinaWidget/PrivacyInfo.xcprivacy  (new — the appex needs its OWN, see below)
apps/mobile/Patina/Patina/Patina.entitlements
apps/mobile/Patina/PatinaWidget/Info.plist
apps/mobile/Patina/Patina/Assets.xcassets/**
apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift          (the #Preview block only)
apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryCard.swift          (the #Preview block only)
apps/mobile/Patina/Patina/Features/Home/Views/DailyStoryDetailView.swift    (the #Preview block only)
apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift (the #Preview block only)
apps/mobile/Patina/scripts/ios-gate.sh
apps/mobile/Patina/scripts/ExportOptions.plist         (new — see §4)
apps/mobile/Patina/Patina/App/Configuration/AppConfiguration.swift
apps/mobile/Patina/Patina/Services/Analytics/PostHogService.swift
apps/mobile/Patina/Patina/PatinaApp.swift              (the PostHog init guard only)
apps/mobile/Patina/.gitignore-adjacent: repo .gitignore lines 53, 57
```

**Findings it closes (T0 · W0 · 18).**

_count: 18 · blocker 3 · major 10 · minor 5 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A2-01` | T0/blocker | S | CFBundleVersion 1 is BELOW the build already on App Store Connect — next upload is rejected | apps/mobile/Patina/Patina.xcodeproj/project.pbxproj (CURRENT_PROJECT_VERSION = 1 in all 8 targ… | Bump CURRENT_PROJECT_VERSION to 3 in BOTH the Patina and PatinaWidget configs (they must stay identical or the widget trips ITMS-… |
| `A2-03` | T0/blocker | S | iPad idiom + portrait-only + no UIRequiresFullScreen — iPad multitasking validation error on upload | project.pbxproj TARGETED_DEVICE_FAMILY = "1,2" (both targets, all configs) + INFOPLIST_KEY_UIS… | Set TARGETED_DEVICE_FAMILY = 1 on Patina and PatinaWidget. Honest for a round-1 iPhone 17 Pro audience and removes the whole clas… |
| `G-01` | T0/blocker | S | Release configuration does not compile — no TestFlight archive is possible | apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift:98-99; Features/Home/Views/… | Wrap the four #Preview blocks in #if DEBUG / #endif, or lift the fixtures out of the DEBUG gate. Gate command: xcodebuild build -… |
| `A2-02` | T0/major | M | No PrivacyInfo.xcprivacy while the app uses required-reason APIs — ITMS-91053 at processing | apps/mobile/Patina/Patina/ (no .xcprivacy anywhere); Patina/Core/Persistence/ScanDiskBudget.sw… | Add Patina/PrivacyInfo.xcprivacy: NSPrivacyTracking=false, empty NSPrivacyTrackingDomains, NSPrivacyCollectedDataTypes (email / u… |
| `A2-07` | T0/major | M | The Release/archive path has never been run for this app — the riskiest step is unproven and on the critical… | whole project / release process | Before anything else in the fix program, run one throwaway `xcodebuild archive -destination generic/platform=iOS` + `-exportArchi… |
| `A2-10` ⇢L1-D | T0/major | S | Global accent colour is undefined — system controls tint iOS blue inside a warm Patina palette | Patina/Assets.xcassets/AccentColor.colorset/Contents.json; project.pbxproj ASSETCATALOG_COMPIL… | Give AccentColor a real light/dark value from PatinaColors, or delete the colorset and set `.tint(...)` once on the root WindowGr… |
| `A2-12` ⇢L1-E | T0/major | S | Two competing permission-string sets; build settings silently win and the surviving copy is marketing prose | project.pbxproj INFOPLIST_KEY_NS*UsageDescription (:695-699 Debug, :747-751 Release) vs Patina… | Pick one source (the build settings, since they win), delete the duplicated keys from Info.plist, drop NSPhotoLibraryUsageDescrip… |
| `A2-13` | T0/major | S | Deployment target 26.5 with no 26.5-only code — excludes any tester not yet on that point release | project.pbxproj IPHONEOS_DEPLOYMENT_TARGET = 26.5 (project + both targets); built plist Minimu… | Set 26.0 (matching the only gates in the code) and let a build prove it. A homeowner on 26.0–26.4 currently opens the invite and… |
| `A2-15` ⇢L0.6 | T0/major | S | The analytics kill-switch is dead code — Debug builds report into the production PostHog project | Patina/App/Configuration/AppConfiguration.swift:50-52; Patina/PatinaApp.swift:74-76 | Either delete analyticsEnabled or actually gate on it. Preferred: keep PostHog initialised in Debug but pointed at a separate dev… |
| `A2-16` ⇢L0.6 | T0/major | M | No crash or error reporting in the TestFlight build | Patina/Services/Analytics/PostHogService.swift:58-66 | Enable PostHog error tracking (@_spi(Experimental) import PostHog; config.errorTrackingConfig.autoCapture = true) and turn errorT… |
| `C-29` ⇢L1-D | T0/major | S | The launch screen is a blank rectangle whose colour does not match the app ground, in both appearances | shots/C/04-dark-launch-0.4s.png, 05, 43-light-launch-0.35s.png | Add a launch screen storyboard with the app ground colour and the PATINA mark (the mark already exists on the Welcome screen). |
| `C7-11` ⇢L1-C | T0/major | S | iPad ships as a device family with no iPad design and zero size-class handling in 435 files | Patina.xcodeproj/project.pbxproj:511,543,712,760,781,803 (TARGETED_DEVICE_FAMILY = "1,2"); :69… | Set TARGETED_DEVICE_FAMILY = 1 for round 1. iPad support is a design program, not a build setting. |
| `G-02` ⇢L2-G | T0/major | S | No gate anywhere builds Release or archives, which is how G-01 reached main | apps/mobile/Patina/scripts/ios-gate.sh:50-63; .github/workflows/policy-quality.yml:93-99 | Add a `release` tier to ios-gate.sh (xcodebuild build -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALL… |
| `A2-06` | T0/minor | S | No ITSAppUsesNonExemptEncryption and no encryption declaration — every upload parks in Missing Compliance | apps/mobile/Patina/Patina/Info.plist (key absent); ASC appEncryptionDeclarations | Add <key>ITSAppUsesNonExemptEncryption</key><false/> to Patina/Info.plist. The app uses only HTTPS/TLS plus Apple/swift-crypto fo… |
| `A2-14` ⇢L1-D | T0/minor | S | Launch screen has no declared background — the cold-launch flash does not match the app in either appearance | project.pbxproj INFOPLIST_KEY_UILaunchScreen_Generation = YES with no UIColorName; built plist… | Add a LaunchBackground colorset (light off-white / dark warm-graphite) and set INFOPLIST_KEY_UILaunchScreen_UIColorName = LaunchB… |
| `A2-21` ⇢L1-E | T0/minor | S | Three different names for the same product (Patina Design / Patina / com.patina.app) | ASC app name; built plist CFBundleName; Patina/Info.plist:21 | Decide one. If 'Patina' is the product, rename the ASC record (still PREPARE_FOR_SUBMISSION) so the TestFlight card and the home-… |
| `A2-23` | T0/minor | S | CODE_SIGN_IDENTITY = "Apple Development" is hard-set in the Release configs | project.pbxproj :487 (PatinaWidget Release), :747 (Patina Release) — unconditional, not [sdk=i… | Remove the override (inherit) or scope it CODE_SIGN_IDENTITY[sdk=iphoneos*] = "Apple Distribution" for Release. Combined with a s… |
| `A2-24` ⇢L1-F | T0/minor | S | aps-environment is 'development' in the shipped entitlements — push may register sandbox tokens in TestFlight | Patina/Patina.entitlements:5-6 | Part of the A2-07 dry run: unzip the exported IPA and run `codesign -d --entitlements` on the .app to confirm aps-environment: pr… |

##### Two mechanics this lane gets wrong if it is not told (and only an archive would catch it)

**1. `Config/Version.xcconfig` does not move the build number on its own.** `A2-01`'s own `where` says
`CURRENT_PROJECT_VERSION = 1` **in all 8 target configurations**, and Xcode resolves target-level build
settings *above* xcconfig values. Adding the file changes nothing. The task list must carry all three
steps, in order:

1. **Delete** `CURRENT_PROJECT_VERSION` and `MARKETING_VERSION` from all eight configurations
   (`Patina` Debug/Release, `PatinaWidget` Debug/Release, and the project-level pair for each) in
   `project.pbxproj`.
2. Set `baseConfigurationReference` to `Config/Version.xcconfig` on **every** configuration of **both**
   targets — not just Release, or a Debug build reports a different version than the archive.
3. Assert the **resolved** value, fast: `ReleaseConfigurationTests` reads
   `Bundle.main.infoDictionary?["CFBundleVersion"]` on a Debug simulator run, so a mis-wire fails in
   4.7 s rather than after a 20-minute archive. The archive-time `plutil` check in R1 Step 2 stays as
   the backstop, not the first signal.

**2. The widget needs its own privacy manifest.** `research/A2-config.md`, `A2-02`'s fix line:
*"Add it to the Patina target's Copy Resources (the synchronized group picks it up automatically).
**Widget needs its own if it touches UserDefaults — it does, via the App Group.**"* ITMS-91053 is
evaluated **per binary**, so an app-only manifest still parks processing on `PatinaWidget.appex`. Both
files ship, and both are asserted.

**Tests this lane must add.**

- `PatinaTests/ReleaseConfigurationTests.swift` — assert `Bundle.main.infoDictionary` carries
  `ITSAppUsesNonExemptEncryption == false`, `UIDeviceFamily == [1]`, the **resolved**
  `CFBundleVersion == "3"` (mechanic 1 above), and that it equals `PatinaWidget`'s `CFBundleVersion`
  (read the appex plist out of `PlugIns/`). This is the test that would have caught A2-01 and A2-03.
- `PatinaTests/PrivacyManifestTests.swift` — **two** assertions, not one: the app's own
  `PrivacyInfo.xcprivacy` resource exists at the bundle root, **and** the appex's copy is readable at
  `PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy`. For each: `NSPrivacyTracking` is `false`,
  `NSPrivacyTrackingDomains` is empty, and `NSPrivacyAccessedAPITypes`
  contains `NSPrivacyAccessedAPICategoryUserDefaults` (`CA92.1`),
  `NSPrivacyAccessedAPICategoryDiskSpace` (`E174.1`) and
  `NSPrivacyAccessedAPICategoryFileTimestamp` (`C617.1`) — the widget's needs at minimum `CA92.1`,
  which is why it exists.
- `PatinaTests/AnalyticsKillSwitchTests.swift` — `AppConfiguration.analyticsEnabled == false` prevents
  `PostHogService.shared.initialize()` from configuring a client (A2-15's regression guard).
- Extend `PatinaTests/PermissionStringTests.swift` (new if absent) — every `NS*UsageDescription` the
  app can trigger is present in the **merged** plist and is non-empty; no two sources disagree (A2-12,
  G-07).

**Gate command lines (verbatim).**

```bash
export IOS_GATE_UDID=<L0.1 CLONE UDID>
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination "platform=iOS Simulator,id=$IOS_GATE_UDID" -only-testing:PatinaTests
```

`ios-gate.sh archive` is **not** a lane command. It is R1 Step 2, on Kody's machine (see below).

The changes this lane writes into `ios-gate.sh` are, verbatim:

```bash
# --- the destination is explicit, or the gate refuses to guess -----------------
# Today: `simctl list … | head -1`, which with six lane clones named ff-w1-* plus
# the protected review device 973D1724-90BF-4A0A-B02D-481D561547B3 present will
# happily run one lane's tests on another lane's clone. That is the program's
# Hard Rule 1, broken by the gate that enforces it.
sim_destination() {
  if [[ -n "${IOS_GATE_UDID:-}" ]]; then
    echo "platform=iOS Simulator,id=$IOS_GATE_UDID"; return 0
  fi
  echo "ERROR: IOS_GATE_UDID is unset. The unit/ui tiers need an explicit clone udid." >&2
  echo "       export IOS_GATE_UDID=<this lane's own clone>  (never 'booted')"        >&2
  exit 2
}

# --- per-worktree DerivedData: six lanes compiling into one shared tree -------
# produces transient failures the Daily Return already paid for.
DERIVED="$PROJECT_DIR/.build/DerivedData"

cmd_release() {
  echo "▶ release compile (generic iOS device, no signing)"
  run_xcb xcodebuild build \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO
}

cmd_archive() {
  echo "▶ archive (Release, automatic signing) — Kody's machine only"
  run_xcb xcodebuild archive \
    -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$PROJECT_DIR/.build/archives/Patina.xcarchive" \
    -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates
}
```

`cmd_build` and `cmd_test` gain the same `-derivedDataPath "$DERIVED"`, and `.build/` is already
gitignored.

**`all` stays `build + unit + lint-delta`.** L0.1 adds `release` and `archive` as their own tiers and
wires `release` into every lane-gate block and the integration gate explicitly — it does **not** fold
`release` into `all`. Reason: `release` is a whole-module optimised compile of 92k LOC, and `all` runs
on every fix round in six concurrent lanes; the cost has never been measured on this project. **L2-G
measures it in W2 and folds it into `all` then** (G-02 is satisfied either way — the gate exists and
the integration gate runs it). `archive` stays out of both: it needs an authenticated Xcode account, a
network round trip to ASC and a distribution keychain that can prompt.

**Exit criteria.**

- `ios-gate.sh release` exits 0. (Today: exit 65, 6 errors, 4 files.) **This is the criterion W1's exit
  and the integration gate depend on.**
- `ios-gate.sh unit` refuses to run with `IOS_GATE_UDID` unset, and runs on exactly that device when set.
- `ReleaseConfigurationTests` reports resolved `CFBundleVersion == "3"` on a Debug simulator run — the
  fast proof that `Config/Version.xcconfig` is actually wired (mechanic 1).
- **Kody-run, once, in W0 and again as R1 Step 2:** `ios-gate.sh archive` produces
  `apps/mobile/Patina/.build/archives/Patina.xcarchive`, and `plutil -p` of the archived `Info.plist`
  shows `CFBundleVersion 3`, `CFBundleShortVersionString 1.0`, `MinimumOSVersion 26.0`,
  `UIDeviceFamily [1]`, `ITSAppUsesNonExemptEncryption false`.
- `PatinaWidget.appex` is inside `Products/Applications/Patina.app/PlugIns/` in the archive, with the
  **same** `CFBundleVersion`.
- `find` inside the archived `.app` returns `PrivacyInfo.xcprivacy` **twice** — once at the app root and
  once at `PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy` (today it returns only the three vendored
  ones, and ITMS-91053 is evaluated per binary):
  ```bash
  find "$A/Products/Applications/Patina.app" -name PrivacyInfo.xcprivacy \
    | grep -E 'Patina\.app/PrivacyInfo\.xcprivacy|PlugIns/PatinaWidget\.appex/PrivacyInfo\.xcprivacy'
  # want: both paths present
  ```
- `codesign -d --entitlements :- ` on the **exported** `.app` shows `aps-environment: production` and
  no `get-task-allow` (this closes A2-24 and G-12, and is the one item that can only be checked after
  the export in §4 — the lane reports it as *pending export*, not as done).

**The lane's own W0 archive is Kody's, not the agent's.** `A2-07`'s throwaway dry run and the exit-criteria
archive both run on Kody's machine with his signing identity. The agent reports `release` green and
hands over; the archive result comes back as evidence the agent reads, not a command it runs.

**Integration notes.**

- A2-10 (accent colour), A2-14 (launch background) and A2-22 (empty appiconset) touch
  `Assets.xcassets`, which L1-D also reads. L0.1 owns the asset catalogue for W0; L1-D consumes the
  tokens it creates and does not edit the catalogue.
- A2-12 rewrites permission strings; the **wording** is L1-E's call. L0.1 moves the strings to one
  source (the build settings, which already win) and files an integration note for L1-E with the seven
  final sentences.
- A2-15/A2-16 are PostHog behaviour; the flag and project configuration half is L0.6.
- A2-20 (age rating) is answered in ASC by L0.5; L0.1 owns nothing but the note that the app really
  does ship messaging and UGC.
- **D4 gates A2-03 / C7-11** (drop the iPad family) and **D6 gates A2-13** (26.0 instead of 26.5).
  Both are recommended-yes; if either is refused, the lane stops on that row and says so rather than
  guessing.

---

#### L0.2 — Production backend · **KODY-RUN** · *an agent prepares and probes*

> ### ⚠ KODY-RUN LANE
> Every mutation below is a production write. An agent may draft the SQL, write the tests, run the
> read-only probes and read the advisors. An agent may **not** apply. The Bash prod-mutation hook does
> **not** cover Supabase MCP writes — `mcp__claude_ai_Supabase__apply_migration` will not be stopped by
> the guard rail, so it needs the same explicit ship request a `psql` apply does.

**Purpose.** Close the two live anon-key exposures before any new tester signs up, close the role
self-elevation vector the app's own Apple-sign-in fix would otherwise rest on, add the one RPC that
is still genuinely missing, and re-verify — object by object, not from the migration ledger — that
production carries the contract the binary calls.

**This lane does not apply until L0.2b has shipped.** 00555's own head-of-file block names three
REQUIRED CODE FOLLOW-UPS; two of them are in the **live designer portal**, and applying the migration
before they merge takes VISION's surface #1 down to unblock surface #2. See §0 guard rail 1, L0.2b, and
**D8**.

**Owned files.**

```
supabase/migrations/00555_ios_round_one_security.sql        (drafted: build/migrations-draft/)
supabase/tests/rls/00555_ios_round_one_security.test.sql    (drafted: build/migrations-draft/)
supabase/migrations/00556_increment_scan_upload_attempt.sql (new, if D13 says keep the call)
supabase/seed/00-legacy-grants.sql                          (regenerated, never hand-edited)
packages/supabase/src/database.types.ts                     (regenerated)
apps/mobile/Patina/Patina/Services/Sharing/ScanSharingService.swift  (the searchDesigners follow-up)
```

Everything under `apps/designer-portal/**` and `packages/supabase/src/hooks/**` belongs to **L0.2b**,
not here. L0.2 writes the SQL those follow-ups call (`search_shareable_designers`,
`list_vendor_profiles`); L0.2b wires the callers.

**Findings it closes (W0 · 3 — three more rows were closed by the reconciliation in §1 and are listed there).**

_count: 3 · blocker 2 · major 1 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-04` | T0/blocker | S | All 24 production profiles — emails, Stripe customer ids, phone, address — are readable by the anon key compi… | pg_policies: public.profiles; probe GET /rest/v1/profiles?select=* with Secrets.supabaseAnonKey | Replace the policy with `USING (auth.uid() = id)` plus an explicit narrow policy (or a SECURITY DEFINER view) for the columns oth… |
| `A3-05` | T0/blocker | S | anon holds SELECT/INSERT/UPDATE/DELETE on notification_preferences and a policy that grants ALL to unauthenti… | pg_policies + has_table_privilege: public.notification_preferences | Drop the policy and rely on service_role's RLS bypass; REVOKE INSERT/UPDATE/DELETE on the table from anon. Then re-probe. The sam… |
| `A3-15` | T0/major | S | tester@patina.cloud's notification feed is four designer-portal messages, one deep-linking to a host the app… | public.notification_log where user_id='86cdd0aa-403c-4154-ae63-69105425e506' | Give the first round a clean, purpose-built client account (consumer role, no designer sequences), or filter the iOS notification… |

**Reconciliation before anything else.** `A3-03` (and with it `A4-03`, `A4-04`/`A3-02`, `A3-10`,
`A3-14`) rests on a ledger gap that no longer exists. The first task in this lane is the re-probe,
read-only, and the finding rows are then closed or re-opened on the evidence:

```bash
ls supabase/migrations/*.sql | sort | tail -5
supabase migration list
```

```sql
SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '00528' ORDER BY version;
-- expect 00530…00554 unbroken (verified 2026-09-01)

SELECT
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_direct_order_terms')          AS get_direct_order_terms,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='increment_scan_upload_attempt')   AS increment_scan_upload_attempt,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='client_designer_roster')          AS client_designer_roster,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='profile_presence')                AS profile_presence,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
   AND table_name='saved_items' AND column_name='price_cents_at_save')       AS price_cents_at_save;
-- verified 2026-09-01 → 1, 0, 1, 1, 1
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/delete-account \
  -H 'Content-Type: application/json' -d '{}'
# 401 = deployed and verify_jwt is on (verified 2026-09-01). 404 = not deployed.
```

Only `increment_scan_upload_attempt` came back missing. Everything else A3 listed as absent now exists.

##### The 00555 migration — outline (drafted in full at `build/migrations-draft/00555_ios_round_one_security.sql`)

The number is provisional: head on `main` is `00554_onboarding_review_fixes.sql`, other programs mint in
this band, and the file has never been applied anywhere, so **editing it in place is the correct
remediation** until it lands. Policy names below are quoted verbatim from `pg_policy` on Strata,
read 2026-09-01 (`research/A3-prod.md` §"Anon-readability sweep"):

```
profiles                 | "Profiles are viewable by everyone"
                         | polcmd r | polroles {0} (PUBLIC) | qual: true
notification_preferences | "Service role full access to notification preferences"
                         | polcmd * (ALL) | polroles {0} (PUBLIC) | qual: (auth.uid() IS NULL)
vendors                  | "Allow anon read access to vendors"
                         | polcmd r | polroles {anon} | qual: true
```

```sql
BEGIN;

-- ─── (a) profiles: owner + counterparty, and a narrow public face ───────────
CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- true when the caller has a working relationship with p_profile_id:
  -- roster, project, project team, proposal, proposal team, invoice, lead,
  -- shared room scan, live message thread, active non-guest studio co-membership
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_select_counterparty ON public.profiles;
CREATE POLICY profiles_select_counterparty ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_view_profile(id));

-- 00013's INSERT policy carries `OR (auth.uid() IS NULL)`, and anon holds INSERT:
-- an anon caller can insert an arbitrary profiles row. handle_new_user() is
-- SECURITY DEFINER and every invite path is service_role, so the leg has no
-- legitimate caller.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

REVOKE ALL PRIVILEGES ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
REVOKE DELETE ON public.profiles FROM authenticated;

-- ─── (a2) profiles.role: close the self-elevation the UPDATE policy leaves ──
-- 00013_profiles_table.sql:60-61 is
--   CREATE POLICY "Users can update own profile" ON profiles
--     FOR UPDATE USING (auth.uid() = id);
-- No WITH CHECK, no column list. With the UPDATE grant above, ANY authenticated
-- user can set their own profiles.role to 'designer'. A3-07's client-side fix
-- (the Apple path writing role: homeowner after sign-in) rides on exactly this
-- policy, so without the two changes below the migration would ENTRENCH a
-- privilege-escalation path that the app then depends on.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING  ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p
                                    WHERE p.id = (SELECT auth.uid()))
  );

-- and put the default back on the SERVER, where the skeleton had it. Today
-- handle_new_user() COALESCEs raw_user_meta_data->>'role' and an Apple sign-up
-- carries no metadata at all, which is how A3-07's tester became a designer.
CREATE OR REPLACE FUNCTION public.handle_new_user() … -- unchanged body EXCEPT:
--   role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'homeowner')
-- (today the fallback resolves to 'designer' on the metadata-less path).
-- With this, A3-07's client-side write is re-scoped to display_name only and the
-- role is never the app's to set.

-- ─── (b) notification_preferences: drop the ALL-to-PUBLIC policy ────────────
DROP POLICY IF EXISTS "Service role full access to notification preferences"
  ON public.notification_preferences;
REVOKE SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.notification_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
-- owner-scoped policies already on Strata are kept as-is:
--   "Users can read own notification preferences"   / "…insert…" / "…update…"
--   "Admins can read all notification preferences"
-- a DO $$ guard re-creates the SELECT one if a replay ever arrives without it.

-- ─── (c) vendors: keep the maker's public face, drop the trade file ─────────
-- COLUMN grants, not a view: the iOS product read is a PostgREST EMBED
--   productSelect = "*,vendors!products_vendor_id_fkey(name,made_in,brand_story)"
-- (ProductAPIClient.swift:122) and an embed resolves through the FK on the BASE
-- table. Point it at a view and the join disappears, withholdingUnresolvedMakers
-- drops every product, and A3-01 reproduces itself.
REVOKE SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.vendors FROM anon;
GRANT SELECT (id, name, website, logo_url, hero_image_url, market_position,
              production_model, founded_year, ownership, headquarters_city,
              headquarters_state, parent_company_id, primary_category,
              secondary_categories, designer_rating_avg, review_count,
              lead_times, social_links, brand_story, made_in, is_patina_catalog,
              founding_circle, created_at, updated_at)
  ON public.vendors TO anon;
-- removed from anon: trade_terms, notes, contact_info, preferred_contact,
-- orders_email, trade_account_email, trade_portal_url,
-- trade_account_established_at, default_payment_terms, nomination_status,
-- nominated_by, nominated_at, contact_profile_id.
-- "Allow anon read access to vendors" is deliberately KEPT: with the column
-- grant it now means "anon may read a maker's public face".

-- ─── (d) the rest of the `auth.uid() IS NULL` family ───────────────────────
-- FOR ALL, TO PUBLIC, qual `(auth.uid() IS NULL)` — satisfied by exactly one
-- principal, the unauthenticated key. service_role is BYPASSRLS and needs none.
DROP POLICY IF EXISTS "Service role full access on audience_segments"    ON public.audience_segments;
DROP POLICY IF EXISTS "Service role full access on automated_sequences"  ON public.automated_sequences;
DROP POLICY IF EXISTS "Service role full access on campaign_analytics"   ON public.campaign_analytics;
DROP POLICY IF EXISTS "Service role full access on campaigns"            ON public.campaigns;
DROP POLICY IF EXISTS "Service role full access on email_templates"      ON public.email_templates;
DROP POLICY IF EXISTS "Service role full access on sequence_enrollments" ON public.sequence_enrollments;
DROP POLICY IF EXISTS "Service role full access to user sessions"        ON public.user_sessions;

-- NOT dropped, recommendation only (each needs a product ruling, not a sweep):
--   engagement_events "Service role can insert engagement events"          INSERT
--   founding_designer_applications / maker_applications /
--   newsletter_subscribers / waitlist "Service role can insert …"          INSERT
--     → rename to intent (`TO anon WITH CHECK (true)`) AND check that anon does
--       not also hold SELECT on them. Today it does. That read is its own
--       exposure and its own migration.
--   notification_log "Service role can insert/update notification logs"    INSERT/UPDATE
--     → droppable by the same argument, but notification_log is on the live
--       email/cron rail 00552–00554 just moved; drop it where it can be verified
--       against that rail.
--   profiles "Designers can create homeowner profiles"
--     WITH CHECK ((auth.uid() IS NOT NULL) AND (role = 'homeowner')) — any
--     authenticated user may insert a profiles row with any id. Flagged, untouched.

-- ─── verification: fail the transaction rather than half-apply ─────────────
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.profiles'::regclass
                     AND polname='Profiles are viewable by everyone');
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policy p
                     WHERE p.polcmd='*' AND p.polroles='{0}'
                       AND pg_get_expr(p.polqual,p.polrelid)='(auth.uid() IS NULL)');
  ASSERT NOT has_table_privilege('anon','public.profiles','SELECT');
  ASSERT NOT has_table_privilege('anon','public.notification_preferences','SELECT');
  ASSERT NOT has_function_privilege('anon','public.can_view_profile(uuid)','EXECUTE');
  -- the UPDATE policy now carries a WITH CHECK (polwithcheck is NOT NULL)
  ASSERT (SELECT p.polwithcheck IS NOT NULL FROM pg_policy p
          WHERE p.polrelid='public.profiles'::regclass
            AND p.polname='Users can update own profile');
END $$;

COMMIT;
```

**What this outline deliberately does NOT create.** The drafted migration once carried a
`public.profile_cards` view — "the narrow public face", `security_invoker`, `GRANT SELECT TO
authenticated`. **It is cut.** Nothing in this program moves a caller onto it: L0.2's only client-side
file is `ScanSharingService.swift` (which moves to `search_shareable_designers`, not the view), no iOS
finding cites it, and L0.2b's fix for `useVendorProfiles` is an RPC. A new public surface with no reader
is dead weight, and worse, its presence reads as though the counterparty paths are covered when the
migration's own READERS block lists **nine silent degradations** that are not. `profile_cards` returns
with its first consumer, in the migration that needs it. The nine degradations are tracked instead —
see "The follow-up list this migration creates" below.

##### The three code changes 00555 forces — all three ship BEFORE it, not with it

The migration's own head-of-file block is titled **"REQUIRED CODE FOLLOW-UPS (ship with, or before,
this migration)"** and its READERS block §4 is titled **"HARD BREAKS — these throw"**. Take both at
their word. One is iOS (this lane); **two are the live designer portal (L0.2b)**.

| # | File | Today | After 00555, unfixed |
|---|---|---|---|
| 1 | `apps/mobile/Patina/…/Services/Sharing/ScanSharingService.swift:373-380` `searchDesigners()` | An unscoped free-text search over every `is_designer = true` profile that hands any signed-in client every designer's **email** | Returns `[]`; the share-with-a-designer picker goes silently empty |
| 2 | `apps/designer-portal/src/app/api/catalog/vendors/route.ts:5-13` and `[id]/route.ts:5-18` | `createServerClient()` + `.select('*')` on `vendors` with **no `getUser()` guard**; the portal middleware passes `/api/*` through — a **live unauthenticated leak** of all 13 trade columns to anyone who curls it | The anon column grant no longer covers `*`, so both routes **return 500** — the vendors catalogue page breaks |
| 3 | `packages/supabase/src/hooks/use-comms.ts:1060-1065` `useVendorProfiles` | `.from('profiles').select('id, full_name, avatar_url').eq('role','vendor')` — a whole-table directory with no caller scoping | **It does not return an empty array. It THROWS 42501** (`permission denied for table profiles`) because the revoke is a grant, and the hook's `if (error) throw` surfaces it. Every screen calling it shows an **error state** |

**Remedies.** (1) A SECURITY DEFINER RPC `search_shareable_designers(text)` returning
id / display_name / business_name / avatar_url only — no email — with a minimum query length and a row
cap, `REVOKE EXECUTE … FROM PUBLIC, anon`. (2) Add a `getUser()` guard **and** name the columns — the
guard is the fix whether or not 00555 ever lands, because the leak is live today. (3) A
`list_vendor_profiles()` SECURITY DEFINER RPC of the same shape (the migration's recommendation (i);
its option (ii), a `USING (role = 'vendor')` policy leg, re-opens every vendor profile's full row to
every signed-in user and is not taken).

L0.2 writes the SQL for (1) and (3) inside 00555. **L0.2b owns (2) and (3)'s caller and ships first.**

##### The follow-up list this migration creates

The READERS block enumerates **nine silent degradations** — reads that will answer `200` with a `null`
embed, so nothing logs and nothing throws and a name simply disappears: `use-proposals.ts:1542`
(proposal viewer byline), `use-commercial-documents.ts:1290` (acceptance recorder — an **audit** field),
the two `api/comms/v1/threads` routes (departed participants), `use-room-scans.ts:108,160` and
`use-rooms.ts:122,170` (scan/room owner), Capture's `SupabaseSiteRequestService.swift:53` (approver),
`use-vendors.ts:319` (a review's author — **always** null, since a reviewer is never a counterparty),
`use-availability.ts:51`, and `public.people_directory`'s phone/email COALESCE. Plus five SECURITY
INVOKER views, of which `project_unbilled_time` **INNER JOINs** profiles and therefore *loses rows* and
understates unbilled time.

Today those exist only as a SQL comment. They are hereby a tracked list with an owner:
**W3 · L0.2 · `build/waves/w3/00555-degradations.md`**, opened by L0.2's agent at apply time with one
line per site and a verdict (cosmetic / audit-relevant / row-losing). `project_unbilled_time` and
`use-commercial-documents.ts:1290` are the two that are not cosmetic and are flagged to Kody in the
apply report, not left in the list.

##### Kody's apply steps, in order

**Step 0 is not SQL.** `git log --oneline -1 -- apps/designer-portal packages/supabase/src/hooks` must
show L0.2b's follow-ups merged, and `wrangler deployments list --name patina-designer-portal` must show
a deployment newer than that commit. If either is false, **stop** — applying now returns 500s on
`app.patina.cloud/api/catalog/vendors` and a 42501 error state on every comms screen that lists vendors.

```bash
# 1. re-check the band (a `db push` would drag every local migration Strata lacks)
ls supabase/migrations/*.sql | sort -V | tail -5
supabase migration list

# 2. prove it locally FIRST — the whole suite, not the one new file, which is
#    what 00555's own AFTER-APPLY block instructs
pnpm supabase:reset
bash scripts/run-sql-tests.sh 2>&1 | tee /tmp/first-flight-sql.log
# every failure name must already be in supabase/tests/KNOWN_FAILURES.md;
# a NEW name is a stop, not a note.
diff <(grep -oE '^[a-z0-9_/.-]+\.test\.sql' /tmp/first-flight-sql.log | sort -u) \
     <(grep -oE '[a-z0-9_/.-]+\.test\.sql' supabase/tests/KNOWN_FAILURES.md | sort -u)

# 3. apply THIS ONE FILE, not the branch
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00555_ios_round_one_security.sql
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('00555','ios_round_one_security') ON CONFLICT DO NOTHING;"

# 4. regenerate what the migration invalidates
python3 scripts/generate-legacy-grants.py         # never hand-edit 00-legacy-grants.sql
pnpm db:generate && git diff --stat packages/supabase/src/database.types.ts
```

**The read-only probe an agent runs after** (full script: `build/migrations-draft/00555_probes.md`):

```bash
ANON=<the committed NEXT_PUBLIC_SUPABASE_ANON_KEY literal from apps/client-portal/wrangler.jsonc:23>
API=https://bkvcixdmuyejfzcijpdg.supabase.co/rest/v1

# 1 — the headline regression: anon can no longer read profiles     before 200 (24) → after 401
curl -s -o /dev/null -w '%{http_code}\n' "$API/profiles?select=*"        -H "apikey: $ANON"
# 2 — anon can no longer read notification_preferences               before 200 (1)  → after 401
curl -s -o /dev/null -w '%{http_code}\n' "$API/notification_preferences?select=*" -H "apikey: $ANON"
# 3a — the maker's public face still reads                           200, 4 rows, unchanged
curl -s -o /dev/null -w '%{http_code}\n' "$API/vendors?select=id,name,made_in,brand_story" -H "apikey: $ANON"
# 3b — the trade file does not                                       before 200 → after 401/42501
curl -s -o /dev/null -w '%{http_code}\n' "$API/vendors?select=notes,trade_terms" -H "apikey: $ANON"
# 3c — the wildcard, which is how a scraper asks                     before 200 → after 401
curl -s -o /dev/null -w '%{http_code}\n' "$API/vendors?select=*"         -H "apikey: $ANON"
# 4 — the iOS product read still works as a guest, byte-for-byte
curl -s -o /dev/null -w '%{http_code}\n' \
  "$API/products?select=*,vendors!products_vendor_id_fkey(name,made_in,brand_story)&limit=1" -H "apikey: $ANON"
# 5 — THE THIRD EXPOSURE, and a different principal: the portal's own HTTP route.
#     Must NOT be a 200 carrying trade columns. G3 checks this, not just PostgREST.
curl -s -o /dev/null -w '%{http_code}\n' https://app.patina.cloud/api/catalog/vendors
curl -s https://app.patina.cloud/api/catalog/vendors | head -c 400   # no notes/trade_terms
```

```sql
-- 9b. nothing PUBLIC + FOR ALL + auth.uid() IS NULL survives  → 0 rows
SELECT n.nspname, c.relname, p.polname
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE p.polcmd='*' AND p.polroles='{0}'
  AND pg_get_expr(p.polqual,p.polrelid) = '(auth.uid() IS NULL)';

-- 9d. vendors column allowlist → the 24 public-face columns only
SELECT column_name FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='vendors'
  AND grantee='anon' AND privilege_type='SELECT' ORDER BY column_name;

-- 9f. the role self-elevation is closed: the UPDATE policy has a WITH CHECK
SELECT polname, pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy WHERE polrelid='public.profiles'::regclass AND polcmd='w';
-- want: "Users can update own profile" with a NON-NULL with_check naming role
```

Then `mcp__claude_ai_Supabase__get_advisors(project_id="bkvcixdmuyejfzcijpdg", type="security")`:
the `security_definer_view` ERROR count must stay at **21**. (With `profile_cards` cut, 00555 creates no
view at all, so the count cannot move for that reason; a 22nd means something else was added.)

**Rollback** (do not reach for it silently — it re-opens the exposure):

```sql
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
GRANT SELECT ON public.profiles TO anon;
```

**Exit criteria.**

- Probes 1–5 and 9b/9d/9f return the "after" values; the advisor `security_definer_view` count holds at
  **21**.
- `bash scripts/run-sql-tests.sh` on a fresh `pnpm supabase:reset` produces **no failure name that is
  not already in `supabase/tests/KNOWN_FAILURES.md`**, and `00555_ios_round_one_security.test.sql` is
  among the passes. Its cases include one that a plain `authenticated` user **cannot raise their own
  `profiles.role`** — the regression guard for the vector `A3-07`'s client fix used to depend on.
- **The Document still works** (this is half of G3, and it is a *walk*, not a probe): on
  `app.patina.cloud`, signed in as Kody — the vendors catalogue page renders its rows; a vendor detail
  opens; the comms vendor picker lists vendors and does **not** show an error state; the People
  directory shows names, emails and phones; roster and team avatars resolve. Screenshots to
  `shots/w0/l0.2b-portal-after/`. Any regression is an immediate rollback, not a follow-up.
- `increment_scan_upload_attempt` either exists (mirroring `mark_scan_upload_complete`'s shape and
  grants — non-DEFINER, anon+authenticated EXECUTE) or the call at
  `RoomScanSyncService+AdvancedBundle.swift:649` is removed by L1-B under an integration note. **D13**
  rules; the default is *write the function* (00556), because removing a call is a behaviour change in
  a lane that is not otherwise touching the upload path.
- `A3-15` (the demo account's feed is four designer-portal messages, one deep-linking to
  `https://app.patina.cloud/help`, a host this app does not claim) is answered by **D11**, not by this
  lane's judgement. If D11 mints a clean purpose-built client account, this lane mints it before L0.5
  writes the beta review notes. If D11 keeps `tester@patina.cloud`, `A3-15` becomes a **W1 · L1-F** row
  (filter the iOS feed to client entity types) and this lane records the ruling and moves on.

**Integration notes.** `A3-18` (the `*` product select pulling two 768-dim vectors, 20.7 KB/row, ~90%
waste) is filed here but the edit is in `ProductAPIClient.swift:113` — **L1-B applies it**, L0.2 supplies
the exact 24-column list. `A3-14`/`A3-10` are re-probes now, not work. `A3-21`/`A3-22` moved to L0.3
because the fix is the seed, not the schema. The `handle_new_user` homeowner default (a2) removes the
*need* for `A3-07`'s role write; L1-A keeps a display-name write only, and its `AppleSignInRoleTests`
asserts the resulting `profiles.role` rather than the client-side write.

---

#### L0.2b — The Document's read paths · *agent lane · Opus · **ships before 00555***

**Purpose.** Make 00555 safe to apply. Two of its three required code follow-ups are in the live
designer portal, and one of those is a **live unauthenticated leak today**, independent of the
migration. VISION §1 ranks The Document first; this program does not break it to unblock the app
(§0 guard rail 1).

**Owned files (exact globs).**

```
apps/designer-portal/src/app/api/catalog/vendors/route.ts
apps/designer-portal/src/app/api/catalog/vendors/[id]/route.ts
packages/supabase/src/hooks/use-comms.ts          (useVendorProfiles only — lines 1060-1065)
```

No other file under `apps/designer-portal/**` or `packages/supabase/**` is in this program at all.
A change this lane wants outside those three files is an integration note to Fable and a separate
decision, not a commit.

**Findings it closes.** **None** — and that is the point. The audit was an iOS audit; these three sites
surfaced in 00555's own adversarial review and appear in no finding id. They are recorded here as
`FF-01a/b/c` in `build/waves/w0/l0.2b-tasks.md`, not as audit rows.

| ref | file | fix | effort |
|---|---|---|---|
| FF-01a | `api/catalog/vendors/route.ts:5-13` | Add `const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });` **and** replace `.select('*')` with the named public-face columns the page renders. The guard is required whether or not 00555 ever lands. | S |
| FF-01b | `api/catalog/vendors/[id]/route.ts:5-18` | Same guard, same column naming. The detail route additionally renders trade fields for a signed-in designer — keep them **behind the guard**, do not remove them. | S |
| FF-01c | `packages/supabase/src/hooks/use-comms.ts:1060-1065` | Swap the `.from('profiles')` directory read for `.rpc('list_vendor_profiles')` (L0.2 ships the SECURITY DEFINER RPC inside 00555: returns `id, full_name, avatar_url` for `role = 'vendor'`, `REVOKE EXECUTE … FROM PUBLIC, anon`, `GRANT … TO authenticated`). Keep the `if (error) throw` — with the RPC it can no longer throw 42501. | S |

**Tests this lane must add.**

- `apps/designer-portal/src/app/api/catalog/vendors/__tests__/auth-guard.test.ts` — an unauthenticated
  request to both routes returns **401**, and an authenticated one returns rows. This is the test that
  makes the leak un-reintroducible.
- Extend the `packages/supabase` vitest suite for `useVendorProfiles`: it calls the RPC, not
  `.from('profiles')`; a 42501 from the old path would fail the assertion.
- `supabase/tests/rls/00555_ios_round_one_security.test.sql` gains a case: `anon` cannot
  `EXECUTE list_vendor_profiles`, `authenticated` can, and its return shape carries no `email`.

**Gate command lines (verbatim).**

```bash
pnpm --filter @patina/supabase test
pnpm --filter designer-portal test -- src/app/api/catalog/vendors
pnpm --filter designer-portal build      # admin/designer builds enforce types
pnpm type-check
```

**The deploy, and it is Kody's.**

```bash
# after the PR merges to main
./infra/deploy-portal.sh designer          # THE ONLY portal deploy path
npx wrangler deployments list --name patina-designer-portal   # oldest-first: read the BOTTOM row
```

**The read-only probe an agent runs after.**

```bash
# 401 before a session, 200 with one — the leak is closed at the route
curl -s -o /dev/null -w '%{http_code}\n' https://app.patina.cloud/api/catalog/vendors     # want 401
# and grep the served chunk for the guard, because /version proves nothing
curl -s https://app.patina.cloud/api/catalog/vendors | head -c 200
```

**Exit criteria.** Both routes 401 unauthenticated on production; the vendors catalogue page and the
comms vendor picker render for a signed-in designer; `wrangler deployments list`'s bottom row is newer
than the merge commit; and **only then** is L0.2 clear to apply 00555 (**D8**).

**Integration notes.** This lane's PR merges to `main` on its own, ahead of the first-flight
integration branch — it is a designer-portal fix, not an iOS one, and it must not wait for W1. The
nine silent degradations 00555 also creates are **not** this lane's; they are the tracked W3 list above.

---

#### L0.3 — The room is not empty · **KODY + LEAH** · *an agent builds the seeding script and the image pipeline; the prod write is Kody-run*

> ### ⚠ KODY-RUN LANE (content)
> An agent writes the seeding script, the image pipeline and the acceptance probe, and runs both
> against **local**. Kody runs the script against Strata. Leah supplies the pieces. This is the only
> lane whose duration the program does not control — start it on day 1.

**Purpose.** Make `get_recommendations` return rows, so the style quiz → "View Recommendations" → save
loop has somewhere to land, and so Browse is a marketplace rather than a grid of grey blocks.

**Owned files.**

```
supabase/seed/catalog/first-flight-catalog.sql       (new — the generated seed)
scripts/first-flight/build-catalog.py                (new — the pipeline: CSV/sheet → rows + images)
scripts/first-flight/upload-catalog-images.py        (new)
scripts/first-flight/build-spectrums.py              (new — the DNA rows; see "the decisive column")
supabase/seed/products.sql                           (local mirror, so a fresh stack matches prod)
artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-manifest.csv  (Leah's input)
```

**Findings it closes (T0 · W0 · 3).**

_count: 3 · blocker 1 · major 2 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-02` | T0/blocker | M | U38/U39 lineage: the marketplace returns zero pieces on production | Strata bkvcixdmuyejfzcijpdg — public.get_recommendations / public.get_aesthete_matches / publi… | Run the aesthete catalogue pass over the 8 published products (or seed product_style_spectrum rows) so the matcher returns them.… |
| `A3-21` ⇢L1-B | T0/major | M | The production category vocabulary cannot fill the app's six-category model — every catalog row is 'lighting' | public.products.category; Core/Models/ProductModel.swift:283-297 (ProductCategory + normalizin… | Fold into the catalogue seed (A3-01): cover all six categories, and normalize the stored vocabulary to the enum's raw values so `… |
| `A3-22` ⇢L1-B | T0/major | S | published_at is NULL on all 15 products and quality_score on all catalog rows, so every piece renders as 'new… | public.products; get_recommendations tier CASE; ProductModel.swift (matchLabel, tier); Product… | Set published_at and quality_score as part of the catalogue seed. Reconcile the two match-score defaults so one piece has one num… |

##### The catalogue row contract

`get_aesthete_matches` (the engine behind `get_recommendations`) forces `v_layer := 'catalog'` for any
caller with `auth.uid() IS NULL`, and `get_recommendations` never passes `p_layer`, so it defaults to
`'catalog'` for signed-in callers too. Stage 0 filters `p.layer='catalog' AND p.status='published'`.
Today that universe is **one row** — `a7fa2107-8d2e-4131-8b8f-f5dd9826fdac`, "Smoke Test Ceramic Lamp",
`images []`, `vendor_id NULL`, `brand NULL`, `published_at NULL`, `quality_score NULL`, `price_retail
2000` — and it still returns zero, for three compounding reasons the seed must each defeat.

Every row must carry **all** of the following. A row missing any one of them is invisible or renders
broken:

| Column | Requirement | Which failure it defeats |
|---|---|---|
| `layer` | `'catalog'` | Stage-0 filter |
| `status` | `'published'` | Stage-0 filter |
| `vendor_id` | a real `vendors.id` whose `name` is **not** `'Unknown Maker'` | `maker_name` is `COALESCE(v.name,'Unknown Maker')`, and `Product.resolvedMakerName` (`ProductModel.swift:222-231`) rejects that literal, so `withholdingUnresolvedMakers` drops the row client-side |
| `brand` | non-null (belt and braces with `vendor_id`) | `GAP8-04` — brand reaches the client only through 00533's widened projection |
| `images` | non-empty array of **public** `product-images` URLs | `A-36`, `C-27`, `B-18` — a missing image renders as a flat colour block |
| `price_retail` | integer cents, true | `A3-01`; money formatting is L1-D's (`C5-14`) |
| `category` | one of the six `ProductCategory` **raw values** — the whole set covered across the seed | `A3-21` — today every catalog row is `'lighting'`, which cannot fill the app's six-category model |
| `published_at` | a real timestamp, staggered across the last 8 weeks | `A3-22` (everything renders as "new"), `GAP8-01` (Today's only content is a 57-day-old story), `GAP8-03` (NEW THIS WEEK needs ≤ 7 days) |
| `quality_score` | set, so the `get_recommendations` tier CASE has something to sort on | `A3-22` — one piece must have **one** number; reconcile with the client-side default so `A-34`/`C-11`/`GAP6-11` stop showing three scores for one piece |
| `dimensions`, `lead_time_weeks`, `finish`, `description`, `source_url` | present where true, **absent** where not — never placeholdered | the piece detail's spec rows; honesty rule |
| `patina_managed` | `true` on the pieces meant to be buyable later | `A3-20` — only 1 product is `patina_managed`, 0 vendors are `is_patina_catalog`, so `create_direct_order`'s gate can pass for at most one row |
| `photo_verified_at`, `shipping_flat_cents` | set where known | the W5 buyability gate; `direct-orders` is off for round one but the columns should not lie |
| `product_style_spectrum` / DNA row | **one row per product**, so `_aesthete_product_spectrum(p.id)` returns non-null `spectrums` | the decisive one: the anon caller resolves to the neutral profile `ae460000-0000-4000-8000-00000000e057` (`style_vector IS NULL`, confidence 0.2) so `v_query` is NULL and the ANN insert is skipped; the spectrum-only fallback then requires `b.pspec IS NOT NULL`, which is `null` today, so `_ae_cand` is empty and zero rows come out |

Target: **≥ 30 pieces**, covering all six categories, at least 3 makers, at least 8 with
`published_at` inside the last 7 days so NEW THIS WEEK can draw (it needs ≥ 3 rows or it does not
render). Plus **3 editorial stories** with real hero images and `read_minutes` derived from the body
(`A3-17`, `GAP8-12`: today the three rows claim a 3–5 minute read on bodies of 386 / 387 / 489
characters, with `hero_image_url NULL`).

##### The image path convention

The `product-images` bucket is public for read and its INSERT policy (00542) requires the **first**
folder segment to equal `auth.uid()::text`:

```
product-images/<uploader auth uid>/<product_id>/<uuid>.<ext>
```

The upload therefore runs as the catalogue owner's own account (Kody's prod UUID
`74056c2a-866d-42b0-9e2a-d473c2484316`), producing paths like
`74056c2a-866d-42b0-9e2a-d473c2484316/9f3c…/0f1e….jpg`, and `products.images` stores the **public** URL

```
https://bkvcixdmuyejfzcijpdg.supabase.co/storage/v1/object/public/product-images/<path>
```

Never a hot-link to a third-party CDN: `A3-25` records 14 dev-capture rows whose images point at
`images.hermanmiller.group` and `www.masayaco.com`. Those rows are `layer='personal'`, invisible to
anyone but Kody by RLS, and must be cleaned or deleted before anything is promoted to `catalog`.
Images are pre-sized before upload (the app renders at ≤ 402 pt logical width; ship ≤ 1600 px on the
long edge, JPEG q80) — a Record and a Browse grid on cellular is the audit's `A3-18` lesson.

##### The decisive column, and who produces it — a **day 2** task, not a day 6 discovery

`product_style_spectrum` is the row in the table above that decides whether the whole lane worked. The
anon caller resolves to the neutral profile `ae460000-0000-4000-8000-00000000e057` (`style_vector IS
NULL`, confidence 0.2), so `v_query` is NULL and the ANN insert is skipped; the spectrum-only fallback
then requires `b.pspec IS NOT NULL`, which is `null` today, so `_ae_cand` is empty and **zero rows come
out no matter how many products are published**. Seeding 30 beautiful products with no spectrum rows
reproduces `A4-02` exactly.

`A4-02`'s own fix line names two mechanisms — *"run the aesthete catalogue pass over the 8 published
products **or** seed `product_style_spectrum` rows"* — and the program picks one:

> **Hand-authored spectrum rows from a documented mapping, generated by
> `scripts/first-flight/build-spectrums.py`, owned by this lane's agent, due end of day 2.**
> `services/aesthete-inference` is a Python service with its own deployment, API keys the memory file
> records as missing, and no runbook for a catalogue pass; standing it up is a program, not a task in a
> content lane. The mapping is deterministic: each manifest row carries a `style` column from Leah's
> vocabulary, the script maps it to the spectrum dimensions `_aesthete_product_spectrum` reads, and the
> mapping table lives in the script with a comment naming who chose each value. When the inference
> service is real, it replaces the script and the rows are recomputed — the column is the contract, not
> the generator.

**The local proof, before Kody writes anything to Strata** (this is the agent's, and it is read-only
against a local stack it seeded itself):

```sql
select count(*)                                                       as publishable,
       count(*) filter (where public._aesthete_product_spectrum(p.id) is not null) as with_spectrum
from public.products p
where p.layer='catalog' and p.status='published';
-- want: publishable = with_spectrum, and both ≥ 30
```

A row without a spectrum is not publishable. The seeding script refuses to emit it.

##### The acceptance probe — **KODY-RUN, and it WRITES**

```sql
select count(*) > 0 from get_recommendations(null, null, 20, 0);
```

That is the audit's own gate for `A4-02` and it must return **true** for the anon caller. It is **not**
a read-only probe and an agent does not run it against production: calling `get_recommendations` writes
a `match_events` row and can insert a `client_style_profiles` row (`A3-24`). Kody runs it, twice —
once anonymous, once as the demo account (**D11**) with a completed quiz, because the signed-in path
resolves a different profile — and records the row ids:

```sql
select id, created_at from public.match_events order by created_at desc limit 4;
-- note these four ids in the apply report; they are deliberate test rows, not traffic
```

The **agent's** pre-check is genuinely read-only and runs first: the five honesty counts below plus the
spectrum count above. If the honesty numbers do not hold, the acceptance probe will fail and there is no
reason to spend a write finding that out.

Follow it with the honesty checks:

```sql
select count(*) filter (where layer='catalog' and status='published') as publishable,
       count(*) filter (where layer='catalog' and status='published' and images = '[]'::jsonb) as imageless,
       count(*) filter (where layer='catalog' and status='published' and vendor_id is null) as makerless,
       count(distinct category) filter (where layer='catalog' and status='published') as categories,
       count(*) filter (where layer='catalog' and status='published'
                        and published_at > now() - interval '7 days') as new_this_week
from public.products;
-- want: publishable ≥ 30 · imageless 0 · makerless 0 · categories 6 · new_this_week ≥ 3
```

**Tests this lane must add.** `supabase/tests/catalog/first_flight_catalog_test.sql` — a psql script in
the `supabase/tests/**` house style (plain psql, `ON_ERROR_STOP=1`, DO-block ASSERTs, ROLLBACK; **not**
pgTAP) asserting the five numbers above against a locally seeded stack, plus one assertion that
`_aesthete_product_spectrum` returns non-null for every publishable row. On the client side, extend
`PatinaTests/ProductDecodingTests` with a fixture built from a real seeded row so the decode contract is
pinned to the shape the seed actually produces.

**Gate command lines (verbatim).**

```bash
pnpm supabase:reset
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/tests/catalog/first_flight_catalog_test.sql
python3 scripts/first-flight/build-catalog.py --check artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-manifest.csv
```

**Exit criteria.** The acceptance probe returns true on prod for both callers; the five honesty numbers
hold; Browse on the review simulator against **production** shows a full grid with real photography and
resolvable makers. **Fallback if content slips past day 6 (D2):** the app ships an honest "still
curating" state on every product surface — the second half of `A4-02`'s fix — and round one centres on
the Studio surfaces. That fallback is L1-B's `PatinaEmptyState` work, and L0.3 must call it by end of
day 6 so L1-B has time.

**Integration notes.** `A-36`, `C-27`, `B-18` (missing-image rendering) are L1-D's, and are needed
**whether or not** the catalogue lands — a designed placeholder is the hedge. `A3-21`/`A3-22` carry
`alsoTouches: L1-B` because the client-side normalisation (`ProductCategory(normalizing:)` already
absorbs `chair`/`sofa`) is the second hedge. `A-96` (photography absent app-wide) is filed in W2/L1-D
but is really this lane's output.

---

#### L0.4 — Help & tour content · **SANITY · Kody authorizes the writes**

> ### ⚠ KODY-RUN LANE (Sanity `kv3qrinl` / `production`)
> An agent drafts and stages; Kody publishes. Sanity **wins over the binary fallback**:
> `FirstLaunchTour.swift` renders `loaded?.body ?? step.fallback?.body`, so wrong copy in Sanity
> overrides correct copy in the app.

**Purpose.** Stop the app's first sentence from being false, and stop all six `?` doors from opening on
"No help articles yet".

**Owned files.** No repo files. Sanity documents `_type == "helpContent"` under `surfaceKey`
`ios-app/*`, plus `apps/mobile/Patina/Patina/Features/Help/**` for the **hide-the-door** change
(which L1-C applies under an integration note).

**Findings it closes (T0 · W0 · 4).**

_count: 4 · blocker 0 · major 4 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-01` ⇢L1-C | T0/major | S | U32: production Sanity still serves the retired tour copy on all three steps | Sanity kv3qrinl/production, three helpContent docs under surfaceKey 'ios-app/first-launch-tour… | Publish the three bodies from artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md to the three surface keys in Sanit… |
| `C5-01` ⇢L1-C | T0/major | S | First-launch tour's LIVE Sanity copy describes a UI that no longer exists, and it overrides the correct in-ap… | apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:274-298 (fallbacks) + :881-905 (… | Update the three Sanity coachmarkContent docs to match defaultSteps' fallbacks (Kody's RESUME already lists this as OWED); or mak… |
| `C5-02` ⇢L1-C | T0/major | M | All six `?` help doors open on 'No help articles yet' — zero ios-app/* help articles exist in production Sani… | DailyRoomView.swift:188, ProfileView.swift:182, YourSpacesView.swift:114, QRScannerView.swift:… | Author the six ios-app/* root articles in Sanity before the invite, or hide the `?` until fetchArticles returns non-empty. |
| `R-10` ⇢L1-B | T0/major | M | The Help sheet renders an HTTP 400 as "No help articles yet … on the way", and tells the reader to pull down… | Today > Help; shots/R/01-preflight-after.png; app log 17:21:58.668 | Fix the malformed GROQ request (the `$sk` param is being sent as part of the query string rather than as `$sk` params), and split… |

**The exact dashboard steps.**

1. Open Sanity Studio for project `kv3qrinl`, dataset `production`.
2. Find the three `helpContent` documents with `surfaceKey` `ios-app/first-launch-tour/step-1`,
   `…/step-2`, `…/step-3`. All three last changed `2026-07-28T19:44:27Z`; step 1 still reads
   *"Welcome to Patina — This is your Daily Room — picks and stories chosen for your space."*
   Step 2 still reads *"Add pieces to a room with + Add"*, whose anchor (the `+ Add` capsule on
   `DailyProductCard`) was retired in the Daily Return's W2, so that step has not rendered since.
   Step 3 still says *"Your profile / Rooms, saved pieces, and settings live here"*.
3. Replace all three bodies with the copy already written and reviewed at
   `artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md` — step 1 becomes
   *"This is Today — what moved in your house, and what is waiting on you."*, step 3 names **Studio**,
   not "Your profile" (`A-60` depends on this).
4. Publish. Do not leave them as drafts — the app's GROQ reads published documents.
5. **Re-run the "AI" sweep on the published bodies** before closing the lane: the repo-side sweep
   (assignment note 9) covers compiled strings only, and this copy lives outside the repo.
6. For the 20 missing `ios-app/*` surface keys (`A3-09`: 16 of 36 have a document — present are
   `first-launch-tour/step-1..3`, `home` + 6 children, `product-detail` + 5 children; missing are the
   `first-launch-tour` root, all 4 `ios-app/companion/*`, all 5 `ios-app/profile*`, all 5
   `ios-app/qr-auth*`, all 5 `ios-app/rooms*`): for round one, **hide every `?` door whose surface has
   no article** rather than authoring 20 documents under time pressure. That is `C5-02` + `R-10`, and
   the code half is an integration note to L1-C.
7. Note the persona trap: every iOS document is `persona: "all"`, the app's `Persona` enum is
   `designer|maker|consumer|admin`, and the primary GROQ is `persona == $p`. Resolution depends
   entirely on the fallback chain reaching the persona-less document. If step 1 does not change on the
   next launch after publishing, that is where to look.

**The read-only probe an agent runs after.**

```
mcp__claude_ai_Sanity__query_documents(
  projectId="kv3qrinl", dataset="production",
  query='*[_type=="helpContent" && surfaceKey match "ios-app/first-launch-tour*"]
          {surfaceKey, title, "body": pt::text(body), _updatedAt}')
```

Expect three rows, `_updatedAt` today, step 1's body containing "This is Today", step 3's containing
"Studio", and no occurrence of `AI`, `Daily Room`, or `+ Add`. Then, on the review simulator against
production, cold-launch a freshly reset install and read the first tour card off a screenshot — the
`R-10` half (the Help sheet rendering an HTTP 400 as "No help articles yet … on the way", app log
`17:21:58.668`) needs the malformed GROQ fixed before the probe means anything, and that fix is L1-B's.

**Exit criteria.** The three tour bodies match `n3-sanity-copy.md` in production; a cold launch shows
step 1's new sentence; no `?` door in the shipped build opens on "No help articles yet"; the Help sheet
distinguishes *failed to load* from *nothing here yet*.

---

#### L0.5 — App Store Connect · **KODY-RUN** · *an agent drafts every text*

> ### ⚠ KODY-RUN LANE (ASC app **6762007888**, `asc` CLI at `~/.blitz/bin/asc`)
> An agent may run `asc … list` / `view` (read-only) and drafts every word below. Kody runs every
> `create` / `update`. Credentials live at `~/.blitz/asc-credentials.json`.

**Purpose.** Make the upload legal and the external group reachable, and make the tester's first
impression — the TestFlight card, before the app even opens — read like a finished product.

**Findings it closes (T0 · W0 · 5).**

_count: 5 · blocker 2 · major 1 · minor 2 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A2-04` | T0/blocker | S | Beta App Review details are empty — the external tester group can never be served a build | ASC app 6762007888, betaAppReviewDetails/6762007888 | Fill contact details; set demoAccountRequired=true with a working production account (try tester@patina.cloud / 000000 first); no… |
| `A2-05` | T0/blocker | S | No TestFlight test information (beta description, feedback email) — external submission blocked and testers g… | ASC app 6762007888, betaAppLocalizations | Create the en-US betaAppLocalization (description, feedbackEmail, marketingUrl https://patina.cloud/app, privacyPolicyUrl https:/… |
| `A2-20` ⇢L0.1 | T0/major | S | Age-rating declaration denies messaging and user-generated content that the app ships | ASC ageRatingDeclarations/d405ec23-68bb-4dfd-b971-18a6c4847ac2 | Re-answer the questionnaire honestly — messaging/chat yes (moderated, 1:1 with a professional), user-generated content per Apple'… |
| `A2-18` | T0/minor | S | Zero beta testers registered; both groups were created today and are empty | ASC app 6762007888 | Add Kody and any internal accounts to Internal Patina first and prove the whole chain on an internal build (no Beta App Review),… |
| `A2-19` | T0/minor | S | The only App Store provisioning profile is INVALID and none exists for the widget | ASC signing (bundle ids 47UZT5FK2Y cloud.patina.app, ACZ5623YSY cloud.patina.app.widget) | Let the A2-07 dry-run archive regenerate both; if it fails, delete the INVALID profile and re-archive. Verify the exported embedd… |

**Exact steps.** Three values are deliberately left as shell variables below — Kody's feedback address,
his contact email and his phone number. The audit did not guess them and no agent may invent them; they
are the *only* substitutions in this runbook, they are **assigned as variables at the top** and never
typed inline, and **an angle bracket must never reach a command line** (the 2026-08-26 placeholder
incident). Every command below was checked against `asc <cmd> --help` on the installed binary.

```bash
ASC=~/.blitz/bin/asc
APP=6762007888
FEEDBACK_EMAIL=          # Kody fills these three in before running anything
CONTACT_EMAIL=
CONTACT_PHONE=

# read the current (empty) state first — this is what an agent may run
$ASC testflight review view --app $APP                 # → "attributes": {} ; note the DETAIL ID
$ASC testflight app-localizations list --app $APP      # → data: [], total 0
$ASC testflight testers list --app $APP                # → data: [], total 0
$ASC encryption declarations list --app $APP           # → data: []
$ASC builds list --app $APP --paginate                 # → one build, version "2", 2026-05-12, expired
$ASC testflight groups list --app $APP                 # → the two group IDs, needed in R1 Step 5

# Kody runs these
$ASC testflight app-localizations create --app $APP --locale en-US \
  --description "$(cat artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/beta-description.md)" \
  --feedback-email "$FEEDBACK_EMAIL" \
  --marketing-url "https://patina.cloud/app" \
  --privacy-policy-url "https://patina.cloud/privacy"

# The review detail is edited BY ITS OWN ID, not by --app. There is no
# `testflight review update`. Resolve the id from the view above:
DETAIL_ID=$($ASC testflight review view --app $APP --output json | jq -r '.data[0].id')
$ASC testflight review edit --id "$DETAIL_ID" \
  --contact-first-name Kody --contact-last-name Kochaver \
  --contact-email "$CONTACT_EMAIL" --contact-phone "$CONTACT_PHONE" \
  --demo-account-required true \
  --demo-account-name "$DEMO_ACCOUNT_EMAIL" \
  --demo-account-password "$DEMO_ACCOUNT_CODE" \
  --notes "$(cat artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/beta-review-notes.md)"
```

`DEMO_ACCOUNT_EMAIL` / `DEMO_ACCOUNT_CODE` come from **D11**, not from this lane. Until D11 is answered
the two files above are drafted with a placeholder *inside the markdown* — which is fine, because a
markdown draft is not a command line — and the lane does not run `review edit`.

Then in the ASC UI, because they are not CLI-shaped:

- **Age rating** — re-answer the questionnaire honestly: *messaging/chat* **yes** (moderated, 1:1 with
  the professional designer engaged on the project); *user-generated content* **yes** per Apple's
  definition (room photos and scans the client captures, plus notes to their designer). Today the
  declaration (`ageRatingDeclarations/d405ec23-68bb-4dfd-b971-18a6c4847ac2`) says **false** to both and
  the app ships `Patina/Features/Messaging/` and room-photo upload — `A2-20`.
- **Encryption** — with `ITSAppUsesNonExemptEncryption = NO` in the plist (L0.1 / A2-06) the question
  stops being asked per upload. Answer it once if ASC still prompts.
- **App name** — the ASC record is "Patina Design", the built `CFBundleName` is "Patina", and
  `Info.plist:21` carries a third string (`A2-21`). Pick **Patina**; the version is still
  `PREPARE_FOR_SUBMISSION`, so renaming the record is free.
- **Signing** — let L0.1's archive with `-allowProvisioningUpdates` regenerate the App Store profiles
  for **both** bundle ids (`47UZT5FK2Y cloud.patina.app`, `ACZ5623YSY cloud.patina.app.widget`). Today
  the only App Store profile is `"cloud.patina.app App Store"`, state **INVALID**, and there is none for
  the widget (`A2-19`). If the archive does not fix it, delete the INVALID profile and re-archive.
- **Groups** — add Kody and Leah to **Internal Patina** and prove the whole chain on an internal build,
  which skips Beta App Review entirely (`A2-18`). **MiddleWest Client** stays empty until the beta
  review passes.

**The read-only probe an agent runs after.**

```bash
$ASC testflight review view --app $APP            # attributes populated; demoAccountRequired true
$ASC testflight app-localizations list --app $APP # total 1, locale en-US, feedbackEmail set
$ASC testflight testers list --app $APP           # ≥ 2 internal testers
$ASC profiles list --profile-type IOS_APP_STORE   # two VALID profiles, app + widget
#                  ^ the flag is --profile-type. There is no --filter-profile-type.
```

##### Draft — TestFlight beta description (`betaAppLocalization.description`, ≤ 4000 characters)

> Patina is where you and your designer keep one picture of your home.
>
> Your designer already works in Patina every day. This app is your side of it — the direction you
> agreed on, the decisions waiting on you, the proposals to sign, the invoices to pay, and the rooms
> you are building together. Open it in the morning and you know what moved.
>
> **What you can do here**
>
> See what moved. Today shows what changed on your house since you last looked, and what needs you.
>
> Answer a decision. When your designer needs a choice, it arrives here with the options side by side.
> Your answer goes straight back to her, with a record of what you agreed and when.
>
> Sign a proposal, pay an invoice. The numbers are the same ones your designer is looking at.
>
> Message your designer without leaving the app.
>
> Add a room. Capture its shape with your iPhone if it has LiDAR, or type the dimensions.
>
> Browse pieces. Midwest makers, chosen by designers, with the maker's name and where it was made on
> every label.
>
> **Who makes it**
>
> Patina is built by Middle West Studio in Madison, Wisconsin. Two people build this — Kody and Leah.
> If something reads wrong, feels slow, or does not do what you expected, tell us. The feedback button
> in TestFlight comes straight to us and we read all of it.
>
> Privacy: https://patina.cloud/privacy

##### Draft — What to Test, build 1 (`builds test-notes create`, per build)

> **THE STANDING RULE, and it governs every build's notes:** *What to Test may not send a tester at a
> surface that carries an open blocker.* Every numbered item below was checked against the W1 lane
> tables before it was written. When a blocker on a named surface is still open on the morning of the
> invite, the item comes out and the surface moves to "already known" with a plain sentence — it is
> never left in silently.

> **1.0 (3) — the first one. Thank you for opening it.**
>
> Please walk it the way you would on a normal morning, then tell us what felt wrong. Twenty minutes is
> plenty.
>
> **Worth your attention**
>
> 1. **The first two minutes.** Sign in with your email — we send a six-digit code, not a link to click.
>    Tell us if the code is slow to arrive, if any sentence reads oddly, or if you got stuck.
> 2. **Today.** Does the top of the screen tell you the truth about your project? If a number looks
>    wrong, screenshot it — screenshots come through with your feedback automatically.
> 3. **A decision.** Open one, read both options, and either approve it or say "not yet" with a note.
>    The approval sheet is the screen we most want your eye on.
> 4. **A proposal and an invoice.** Open both. Check the totals against what your designer told you.
> 5. **Messages.** Send your designer a note and make sure it arrives.
> 6. **Your rooms.** Add one. If your iPhone can scan a room, walk it; otherwise type the dimensions in.
>    Tell us if anything strands you — this is the newest part of the app.
> 7. **Dark Mode and larger text.** Settings → Display & Brightness, and Settings → Accessibility →
>    Display & Text Size. Both should still look like Patina, and every button should still be reachable.
>
> **Already known in this build — no need to report**
>
> - Browse and Saved are thin. We are still bringing makers on.
> - Buying a piece inside the app is switched off for this round; your designer sources for you.
> - A few "?" buttons have no article behind them yet.
> - Notifications may be quiet.
>
> **Please do report** anything that quits unexpectedly, any screen that spins and never finishes, any
> sentence that reads as though a machine wrote it, and anything that looks broken in Dark Mode or at
> large text sizes.

**Why items 6 and 7 read as they do.** As first drafted, item 6 sent a client straight into three
findings the plan had scheduled for build 2 — `GAP4-02` (the scan fallback entry screen is a hard dead
end: no back, no cancel, dead interactive pop), `GAP4-03` (developer defaults `length="18"`,
`width="14"` pre-filled and committed as her real room), `GAP4-25` ("Rescan" strands on a permanently
blank screen; only force-quitting recovers) — and item 7 invited the accessibility sizes where
`GAP1B-03`, `GAP1B-07` and `GAP1B-08` live, while "already known" mentioned none of it. **Ruling D12
promotes all six into W1**, plus `GAP4-16` and `GAP2-24`, which is why both items can stand as written.
If D12 is refused, item 6 is deleted and the accessibility half of item 7 becomes an "already known"
line reading *"Very large text sizes still push a couple of buttons off screen — we know, and it's the
next thing."*

*(If D2 lands the catalogue, delete the first "already known" bullet before this build ships — it would
be a false apology. If D2 slips, keep it and it is the honest note.)*

##### Draft — Beta App Review notes (`betaAppReviewDetail.notes`)

> Patina connects a homeowner with the interior designer already engaged on their home. Every screen
> behind sign-in belongs to one client's own project, so a demo account is required.
>
> **Demo account**
> Email: `$DEMO_ACCOUNT_EMAIL`
> Sign-in code: `$DEMO_ACCOUNT_CODE`
>
> **How to sign in**
> 1. Launch the app. On the Welcome screen, tap "Continue with email".
> 2. Enter the address above and tap Continue.
> 3. Enter the six-digit code above and tap Verify.
>
> This account accepts the fixed code above without needing a mailbox. It is a test-only account on our
> own domain and holds no real customer data. Real accounts receive a one-time code by email.
>
> You can also tap "Look around first" on the Welcome screen to browse without an account.
>
> **Notes**
> - Account deletion is at Settings → Account → Delete account. It deletes the Patina account and its
>   server-side data.
> - Messaging is 1:1 between a homeowner and the professional designer engaged on their project. There
>   is no public feed and no user-to-user discovery.
> - User-generated content is limited to photos and room captures the client makes of their own home,
>   plus notes to their designer. It is visible only to that client and their designer.
> - Purchases are disabled in this build.
> - The camera is used to capture the shape of a room and to scan a QR code when signing in on the web.
>   Face ID confirms a web sign-in request.
>
> Contact: Kody Kochaver, Middle West Studio LLC — `$CONTACT_EMAIL` — `$CONTACT_PHONE`

**The demo-account identity is D11, and it is not settled.** L0.2's exit criteria wants round one on a
*clean, purpose-built client account*, because `A3-15` records that `tester@patina.cloud`'s notification
feed is **four designer-portal messages, one deep-linking to `https://app.patina.cloud/help`** — a host
this app does not claim. As drafted, an Apple reviewer would sign in and land on a feed of internal
designer mail with a dead link, on the screen this program is trying to make world-class. Meanwhile D7
wires the `test-account-login` fallback for `tester@patina.cloud` specifically, and R1's **D-04** proves
that exact credential. **Both cannot be right.** D11 rules; the recommendation is a purpose-built
account, minted by L0.2 **before** this lane writes `beta-review-notes.md` and before D7's fallback
allowlist is finalised. Until D11 lands, this lane drafts the markdown and does not run `review edit`.

**Exit criteria.** `testflight review view` returns populated attributes with
`demoAccountRequired: true` and a demo account name that matches **D11's ruling**; one `en-US`
betaAppLocalization exists with a feedback email; the age rating declares messaging and UGC; two VALID
`IOS_APP_STORE` profiles exist; Kody and Leah are on Internal Patina; MiddleWest Client is still empty;
and the group IDs from `testflight groups list` are recorded in `build/waves/r1/asc-ids.md` for R1
Step 5.

**Blocked by.** **D11** (which account) and **D7** (that the account can sign in at all — the
`test-account-login` fallback wired into `AuthService.verifyOtp`, L1-A). Until both land the notes above
are a promise the app cannot keep; `A3-16` is the finding and L1-A is the lane.

---

#### L0.6 — PostHog · **KODY**

> ### ⚠ KODY-RUN LANE (PostHog project 326191)

**Purpose.** Make the three flags exist and target nobody, so the Release first-launch state (every flag
false) is also the *deliberate* state, and turn on the error tracking that is the only way Kody will see
a TestFlight crash.

**Findings it closes (T0 · W0 · 1).**

_count: 1 · blocker 0 · major 1 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-12` | T0/major | S | A4-12: OWED (Kody) — PostHog flags house-first / direct-orders / house-widget never targeted | artifacts/ios-daily-return-2026-08-26/RESUME.md OWED list; apps/mobile/Patina/Patina/Core/Stat… | Kody's call: target the round-one testers in PostHog before the invites go out, or ship the three flags on for 1.0. Config, not c… |

**Exact dashboard steps.**

1. Confirm the three feature flags exist with these exact keys: `house-first`, `direct-orders`,
   `house-widget`. Create any that do not.
2. Set each to **0% rollout, no cohort, no individual overrides** for round one (D1). Do not delete
   them — `FeatureFlags.resolveAtLaunch()` reads PostHog's cached payload and a missing key resolves
   false anyway, but an explicit 0% flag is the auditable state.
3. Confirm the project is the one `Secrets.postHogAPIKey` points at (host `https://us.i.posthog.com`).
   Today Debug builds report into the **production** project because `AppConfiguration.analyticsEnabled`
   is declared and referenced nowhere (`A2-15`) — L0.1 fixes the code; this lane confirms the project
   split.
4. Turn on **Error tracking** for the project. `A2-16`: `PostHogService.swift:58-66` never sets
   `errorTrackingConfig.autoCapture`, so there is no crash or error reporting in the TestFlight build
   at all. The SDK half is L0.1's (`@_spi(Experimental) import PostHog`); the project half is here.
5. Verify the Debug kill-switch: with `analyticsEnabled == false` a Debug launch must produce **zero**
   events in the project's live feed.

**The read-only probe an agent runs after.** Ask PostHog for the three flags and read back
`active`, `rollout_percentage` and the release-condition set; then, on the review simulator, launch the
Release-configured build with **no** `-PatinaFlags` argument and confirm from the app log that
`FeatureFlags` resolved all three false. `GAP7B-02` is the one that bites if this is wrong: with
`house-widget` OFF — the TestFlight first-launch condition — a **placed** widget stays on "Open Patina
to see your house" until Kody targets that tester and they relaunch. D5's answer decides whether the
widget ships ungated instead.

**Exit criteria.** Three flags, 0%, no targets; error tracking on and receiving; a Debug launch emits
nothing.

---

#### L0.7 — The daily-surfaces coverage walk · *agent lane · Sonnet, Opus reviews* · **files findings, fixes nothing**

**Purpose.** Gate **G5** is written about proposals, invoices, the designer seat, documents and
messages — the surfaces round one's cohort uses daily. **The audit never walked most of them**, and the
ledgers say so in their own words:

- `A.md` §Coverage gaps — *"Step 8: proposal signing, deciding a decision, documents, sending a message,
  design requests, orders — **NOT executed (time)**"*
- `B.md` §Not verified in lane B — *"Messages send, design-request detail, proposals detail, decisions
  detail, orders detail"*
- `GAP2.md` — *"Proposals and Messages were reached only incidentally and are not reported"*; documents
  *"NOT REACHABLE with the seeded client"*

Counted across all 629 findings: `Features/Proposals` **1**, `Features/Invoices` **2**,
`Features/Money` **0**, `Features/Documents` **1**, `Features/Projects` **1**, `Features/QRAuth` **2** —
and **none of those nine is in W0 or W1**. A gate cannot be earned on findings nobody looked for. This
lane looks.

**Owned files.** None. It writes evidence and findings only:
`build/waves/w0/l0.7-coverage-walk.md`, shots under `shots/w0-l0.7/`.

**Findings it closes.** Zero. It **produces** them; Fable tiers what comes back and places it into a
W1 lane (blocker or major on a G5 surface) or W2 (everything else), by the same rule the collator used.

**The walk — local stack, signed in as a seeded `activeProject` client, flags OFF.** The seed must
carry at least one proposal in `sent` state, one decision awaiting the client, one open invoice, one
`client_visible` document, one project, one order, and one live message thread; `GAP2.md`'s "not
reachable with the seeded client" is a seed gap, not a product finding, and fixing the seed is this
lane's first task.

1. **Proposal detail → signing.** Open a sent proposal. Read the totals, the line items, the terms.
   Sign it. Does the signature sheet work at `content_size large` **and** at
   `accessibility-extra-large`? Does the state change land without a manual refresh?
2. **Decision detail → approve and → defer.** Both paths, both sheets, both text sizes. (The two sheets
   themselves are `GAP1B-01`/`GAP1B-02`, already W1 blockers; this walk covers the *screen* around them.)
3. **Message send.** Compose, send, and confirm arrival. Then send with the local stack **stopped** and
   read what the app says (`C4-04` says: nothing at all).
4. **Documents.** Open the list, open a document, and try one that fails to open.
5. **Projects and orders.** Open the project detail (`C4-05` records six of seven reads as `try?`, so a
   half-failed load renders as a half-empty screen) and one order.
6. **Invoices.** The detail, the Pay path to its failure state, and a refresh that fails while rows are
   on screen (`C4-13`).
7. Each of 1–6 again with the stack **stopped**, then restarted — the three-state honesty check G5a
   asserts, on the surfaces L1-B's table does not name.

**Gate command lines (verbatim).**

```bash
export IOS_GATE_UDID=<L0.7 CLONE UDID>
pnpm supabase:reset                       # seeded with the activeProject fixture above
apps/mobile/Patina/scripts/ios-gate.sh build
xcrun simctl io "$IOS_GATE_UDID" screenshot \
  artifacts/ios-testflight-polish-2026-09-01/shots/w0-l0.7/<step>.png
```

**Exit criteria.** Every one of the seven steps has a screenshot and a written verdict; every defect is
filed with an id (`L07-NN`), a `where` at file:line, evidence, and a proposed tier; Fable has placed
each one; and **G5b** can be checked — the walk ran, and either nothing blocking came out or what did
is scheduled into W1 before build 1.

**Integration notes.** Anything this lane finds on `Features/Decisions/**`, `Features/Home/**` or
`Features/Settings/**` goes to L1-C; on `Features/Messaging/**` to L1-F; on load-state honesty to L1-B;
on wording to L1-E. The four Features directories nobody owned before this revision —
`Proposals`, `Invoices`, `Money`, `Documents`, `Projects` — are assigned in §3's residue table.

---

**W0 exits when:** `ios-gate.sh release` is green and Kody's archive dry run has succeeded (L0.1) ·
L0.2b's three follow-ups are merged and the designer portal is redeployed · 00555 is applied and probes
1–5 return the "after" values, with the portal regression walk clean (L0.2 + L0.2b) · the catalogue
probe returns true **or** D2's fallback is called (L0.3) · the three tour bodies are published and every
doorless `?` is hidden (L0.4) · `testflight review view` returns populated attributes (L0.5) · the three
flags read 0% (L0.6) · the coverage walk has run and its findings are placed (L0.7).

---

### W1 — The first five minutes and the daily surfaces (days 3–8) — 141 findings

Six lanes with **owned file sets**: 129 T0 rows plus the 12 T1 rows **D12** promotes (marked ⇧D12 in
the tables). A lane that needs a change in another lane's file writes it as an integration note at
`build/waves/w1/<lane>-notes.md` carrying the exact final text; **the owner applies it as a numbered
task in its own list**, and its exit criteria says so. An integration note that no owner scheduled is
not a plan, it is a hope.

#### The ownership model, rebuilt from `findings.json`

The globs below were re-derived by resolving every W1 finding's `where`/`fix` to a file and assigning
each file to exactly one lane. Twenty-one rows previously sat in files their lane did not own;
`Patina/Design/Tokens/**` did not exist; `Design/**` and `Features/Authentication/**` were claimed
twice. **These are the four contested files, and each now has one owner:**

| File | Findings on it | Owner | The other lanes' route |
|---|---|---|---|
| `Features/Home/Views/DailyRoomView.swift` | `C4-12`, `R-03` (L1-B) · `A4-07` (L1-C) · `C5-06` (L1-E) · `C2-07` (L1-F) | **L1-C** (it is the app's biggest layout surface and L1-C rewrites its header for `C-06`/`GAP1B-03`) | integration notes, applied by L1-C: L1-B's `.refreshable`, L1-E's greeting strings, L1-F's badge binding |
| `App/Coordinators/AppCoordinator.swift` | `C1-18`, `C1-19` (L1-B) · `C2-21`, `GAP7B-09`, `C2-06` (L1-F) | **L1-F** (four of five rows are the deep-link queue, which is the harder change) | L1-B's `.launching` watchdog arrives as a note with the exact 5–8 s timeout and the fallback line |
| `Services/API/APIConfiguration.swift` | `C1-04` (L1-A) · `C4-16` (L1-B) | **L1-B** (it owns `Core/Network/**` and the timeout budgets) | L1-A's quiz-RPC timeout drop (30 s → ~8 s) is a note |
| `Features/Recommendations/Views/RecommendationsView.swift` | `C4-12` (L1-B) · `A1-04`, `R-06` (L1-C) | **L1-C** (two of three rows are layout; `R-06` is the root fill) | L1-B's `.refreshable` is a note |

**Merge order, stated in full:** **L1-C → L1-D → L1-B → L1-F → L1-A → L1-E.** L1-C first because the
Companion bottom-inset change touches every scrollable screen and every later conflict would otherwise
be a layout conflict; L1-D second because its token changes are the other whole-app sweep; L1-E **last**
because its deliverable is a copy deck applied into other lanes' files (see its section) and it rebases
onto everything. Each merge is followed by `ios-gate.sh build + release` on the integration tip before
the next one starts — a conflict found at merge 6 that was introduced at merge 2 costs the wave a day.

#### The residue — files with W1 findings and no lane, now assigned

| Path | Why it had no owner | Assigned to |
|---|---|---|
| `Features/Splash/**` | `C1-18`/`C1-19` resolve here as well as to `AppCoordinator` | **L1-B** (the watchdog's other half) |
| `Core/Models/**` | `C7-02` (`BoardModel` not in the schema) | **L1-B** |
| `Features/Walk/**` | `C7-05` (a `CIContext` per hero frame, on the main actor) | **L1-B** |
| `Features/Profile/Views/ProfileView.swift` | `C4-12` (pull-to-refresh) and `R-03`'s sibling | **L1-C** (it already owns `StudioHubView.swift`, the other half of the same screen) |
| `Features/ARPlacement/**`, `Services/DesignServices/**`, `Features/DesignServices/DesignRequestFlowView+Steps.swift` | `C4-08`, `C4-09`, `C5-11` — all three are error **strings** | **L1-E**, and they are the reason L1-E's deck has an *apply* owner: L1-C for the DesignServices views, L1-B for the upload-phase mapping |
| `Features/QRAuth/**` | 2 findings, none in W0/W1 — and R1's **D-06** exercises it on Kody's phone | **L1-A** (it is the auth seam; `C1-14`'s "hide the QR row for guests" already reaches into it). A W1 acceptance step walks the scanner on the simulator so D-06 is not the first time anyone opens it. |
| `Features/Proposals/**`, `Features/Invoices/**`, `Features/Money/**`, `Features/Documents/**`, `Features/Projects/**` | 8 findings across all 629; the audit never walked them (**L0.7**) | **L1-B** for load-state honesty, **L1-C** for layout and chrome, **L1-E** for wording — placed by Fable when L0.7's findings come back, before W1 opens |
| `Features/Purchase/**`, `Features/Orders/**`, `Features/Budget/**`, `Features/Conversation/**`, `Features/Collections/Views/**` beyond the schema side | **No lane, no W1 work.** `direct-orders` is off for round one (D1) and these carry no T0 row. | — (W2/W3) |

---

#### L1-A — Welcome, sign-in, onboarding · *Opus*

**Purpose.** The first five minutes cannot fail. Today they can fail six different ways before the
tester ever sees a room.

**Owned files (exact globs).**

```
apps/mobile/Patina/Patina/Features/Authentication/**
  EXCEPT Views/SignInWithAppleButton.swift             → L1-D (C3-03, P-35: the colour-scheme switch)
apps/mobile/Patina/Patina/Features/Onboarding/**
apps/mobile/Patina/Patina/Features/FirstLaunch/**
apps/mobile/Patina/Patina/Features/StyleQuiz/**
apps/mobile/Patina/Patina/Features/StyleConversation/**
apps/mobile/Patina/Patina/Features/StyleReveal/**
  EXCEPT Views/RevealView.swift                        → L1-D (C3-15 PlayfairDisplay-Light, GAP4-16 ⇧D12)
apps/mobile/Patina/Patina/Services/Auth/**
apps/mobile/Patina/Patina/Features/Account/**
apps/mobile/Patina/Patina/Features/QRAuth/**           (the auth seam; C1-14 reaches into it)
apps/mobile/Patina/Patina/ContentView.swift            (the .auth phase cases only)
```

**Not this lane, despite appearances:** `Features/Settings/Views/SettingsView.swift` (`C1-14`'s other
half) is **L1-C**'s — send the guest Account row as an integration note with the exact final copy.
`Services/API/APIConfiguration.swift` (`C1-04`'s quiz-RPC timeout) is **L1-B**'s — same route.

**Findings it closes (T0 · W1 · 27 — `A3-02` closed by the §1 reconciliation and listed there).**

_count: 27 · blocker 3 · major 23 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-101` ⇢L1-E | T0/blocker | S | Delete-account copy scopes deletion to the device only (App Review 5.1.1(v) risk) | Settings → Delete account; shots/A/59-delete-account.png | State that the Patina account and its server data are deleted, name what is retained for legal/financial reasons and for how long… |
| `A3-06` | T0/blocker | S | "Continue with Google" is the first button on the welcome screen and Google is disabled on Strata — the teste… | Features/Authentication/Views/AuthScreenView.swift:82; Services/Auth/AuthService.swift:400-420… | Either enable the Google provider on Strata (client id + secret + redirect) or remove the button from AuthScreenView for this rel… |
| `P-29` | T0/blocker | S | Failed-sign-in error leaks onto the Welcome root, shifts the stack 33 pt, and the mis-tap lands the tester in… | Welcome home + Sign In sheet; shots/P/34-cancel-from-password.png, 35-welcome-shifted-33pt.png… | Never render sheet errors on the auth root; if a root status is needed, reserve its space so nothing moves. Fix P-18 independentl… |
| `A-03` | T0/major | S | Three different icon idioms in three stacked auth buttons | Welcome screen; shots/A/01-cold-t12.png, 68-universal-piece.png | Use Google's official G mark per their branding guidelines and an SF Symbol envelope; strip the glyph from the accessibility labe… |
| `A-05` | T0/major | S | "Skip" on the onboarding carousel does not skip — it lands in the same 5-question quiz | Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift:83-85; shots/A/02,04 | Either let Skip reach browsable content (with a "take the quiz later" entry point) or rename it "Next"; keep it visible on the la… |
| `A-13` ⇢L1-E | T0/major | S | A dead "Next question →" static text sits 26 pt above the real Continue button | Style quiz Q2; shots/A/08-quiz-q2-selected.png | Remove the static line (or make it the only affordance). |
| `A3-07` | T0/major | S | Sign in with Apple creates the tester as profiles.role = 'designer' | Services/Auth/AuthService.swift:354-383 (signInWithApple); public.handle_new_user() | Pass the same role metadata on the Apple path — supabase-swift's signInWithIdToken has no data: parameter, so follow success with… |
| `A3-16` | T0/major | M | The advertised tester credential (tester@patina.cloud / 000000) does not work in the iOS app — the test-login… | Services/Auth/AuthService.swift:583-601 (verifyOtp); supabase/functions/test-account-login/ind… | Either add the fallback to AuthService.verifyOtp (POST the pair, then verifyOTP with the returned token_hash when the plain path… |
| `B-12` | T0/major | S | A guest has no in-app sign-in route at all — the only action offered is a QR scan | Settings ▸ Account as guest — shots/B/23-guest-account.png, 24-guest-signin-web.png | Add a 'Sign in' / 'Create account' row to Account and Settings for guests that re-presents the auth sheet. |
| `B-13` ⇢L1-C | T0/major | S | The guest Studio's sign-in card offers 'Open settings' instead of a sign-in action | Studio as guest — shots/B/19-guest-studio.png, 75-guest-after-signout.png | Make the CTA 'Sign in' and present the auth sheet directly. |
| `B-21` | T0/major | M | An existing account is forced through the first-run intro and a mandatory 5-question quiz with no back, skip… | After signing in as client@patina.dev on a fresh install — shots/B/30-post-signin.png, 31-afte… | Link onboarding/quiz completion to the account, not the install; add a Back control and an 'I'll do this later' exit on every qui… |
| `C1-04` | T0/major | S | Quiz submit shows nothing for up to 30 seconds — isSubmitting has no reader | Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:160-199; Services/API/APIConfiguration.… | Render a 'Reading your answers…' state off isSubmitting; drop the quiz RPC timeout to ~8s (the local result is already the fallba… |
| `C1-05` | T0/major | S | Welcome screen has no in-flight state for any of its four sign-in buttons | Features/Authentication/Views/AuthScreenView.swift:14-31; ContentView.swift:36-70 | Thread AuthService.shared.isLoading in; disable the stack and spin the pressed row. |
| `C1-14` ⇢L1-C | T0/major | S | Settings → Account is a dead end for a guest, and Settings offers no way to sign in | Features/Settings/Views/SettingsView.swift:61-95; Features/Account/AccountView.swift:109-126,1… | A signed-out Account state that is one sentence and a 'Create your account' button raising presentedSheet = .auth; hide the QR ro… |
| `C1-28` | T0/major | S | Quiz answers survive only an explicit "Save progress & exit" | Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift:80-99; StyleQuizView.swift:81-84 | Call saveProgress() on .onDisappear / scenePhase != .active; restore already covers both mounts. |
| `C1-30` | T0/major | S | "Privacy Policy" and "Terms of Service" open the same page | Features/Authentication/Views/AuthScreenView.swift:175-176 | Publish /privacy and point at it; until then render one link labelled 'Terms & Privacy'. |
| `C1-37` | T0/major | S | Six digits entered does not verify, and the green success banner stays up over the red failure | Features/Authentication/Views/AuthenticationView.swift:326-347,352-377; ViewModels/AuthViewMod… | Auto-verify on the sixth digit; clear successMessage when an error lands. |
| `C3-03` ⇢L1-D | T0/major | S | Sign in with Apple is hard-coded `.black` — 1.27:1 on the dark canvas, the button vanishes | Features/Authentication/Views/SignInWithAppleButton.swift:41 | Read @Environment(\.colorScheme) and pass `.signInWithAppleButtonStyle(scheme == .dark ? .white : .black)`. |
| `C3-06` ⇢L1-D | T0/major | S | The auth form's DISABLED state is painted in the brand accent and ENABLED in neutral charcoal — inverted affo… | Features/Authentication/Views/AuthenticationView.swift:519 (submitButton) and :366-370 (OTP Ve… | One filled style (charcoal + Text.inverse) with .opacity(0.4) when disabled. |
| `C5-04` ⇢L1-E | T0/major | S | 'Privacy Policy' on the first screen links to the Terms page; a real /privacy page exists and is never linked | apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:174-175 (termsURL… | privacyURL = URL(string: "https://patina.cloud/privacy")! |
| `C9-08` | T0/major | M | No keyboard-dismiss affordance exists anywhere in the app (numeric pads have no exit) | AuthenticationView.swift:327; RoomBudgetSheet.swift:61; ManualRoomEntryView.swift:65,133; Room… | One shared .keyboardDoneToolbar() applied to every numeric field, .scrollDismissesKeyboard(.interactively) on form scroll views,… |
| `P-02` | T0/major | S | "Continue with email" uses an emoji envelope and "Continue with Google" a plain letter G, on the app's first… | Welcome home, auth.welcome.emailButton / googleButton; shots/P/01-welcome-cold.png | SF Symbol envelope tinted to the ink token; ship the official Google G mark; strip glyphs from accessibility labels. |
| `P-18` | T0/major | M | After one tap on "Look around first", the sign-in screen is unreachable on every later launch and the quiz re… | Guest intro / style quiz; shots/P/14-relaunch2-root.png, 15-skip-destination.png, 16-relaunch3… | Persist quiz progress; put a persistent "I already have an account — Sign in" on every guest onboarding and quiz screen; make the… |
| `P-20` | T0/major | S | An invalid email produces no message at all — the button silently does nothing | Continue with email sheet; shots/P/20-email-malformed.png | Inline validation copy under the field plus a visibly inert disabled state. |
| `P-22` | T0/major | S | After a failed code the success and error banners show at once, and Verify is pushed off the bottom of the sh… | Sign-in code screen; shots/P/26-verify-t0.png, 28-verify-t5.png | One status region that replaces its contents; pin the CTA. |
| `P-30` | T0/major | S | One mechanism, three names — "Continue with email", "sign-in code", "magic link" — and "magic link" is factua… | shots/P/19-email-form.png, 23-code-requested-t0.png, 31-password-sheet.png | One name everywhere. |
| `A-21` | T0/minor | S | The quiz progress bar reads 100 % while the last question is unanswered | Style quiz Q5; shots/A/11-quiz-q5.png, 05 | Base the fraction on answers recorded, not on the index of the question being shown. |

**Tests this lane must add.**

- `PatinaTests/AuthProviderVisibilityTests.swift` — providers render **only** when GoTrue
  `/auth/v1/settings` reports them enabled. Fixture the live shape
  (`external: { apple: true, email: true, google: false, … }`) so `A3-06` cannot regress when someone
  later enables Google. Assert the button count and order for both shapes.
- `PatinaTests/AuthErrorRoutingTests.swift` — a sheet-level failure never sets a root-level message,
  and the root reserves its status space so nothing moves (`P-29`). Assert the root's rendered height is
  identical with and without a pending error.
- `PatinaTests/TestAccountLoginFallbackTests.swift` — `AuthService.verifyOtp` falls back to
  `test-account-login` (POST the pair, then `verifyOTP` with the returned `token_hash`) exactly when the
  plain GoTrue path fails, and never sends the pair for a non-test address (`A3-16`, D7).
- `PatinaTests/AppleSignInRoleTests.swift` — the Apple path writes `role: "homeowner"`.
  `supabase-swift`'s `signInWithIdToken` has no `data:` parameter, so the fix is a follow-up profile
  write; the test pins that the write happens and that it is idempotent (`A3-07`).
- `PatinaTests/GuestEscapeTests.swift` — from every guest onboarding and quiz screen there is a
  reachable "I already have an account — Sign in" affordance, and quiz progress persists across a
  relaunch (`P-18`, `C1-28`).
- `PatinaTests/OnboardingResumptionTests.swift` — an account that has already completed onboarding is
  never re-run through the intro or the five-question quiz (`B-21`), and completion is keyed to the
  account, not the install.
- Extend `PatinaTests/AuthSheetPresentationTests` — Settings and the Studio guest card both raise
  `presentedSheet = .auth` (`B-12`, `B-13`, `C1-14`).
- `PatinaTests/LegalLinkTests.swift` — Privacy resolves to `https://patina.cloud/privacy` and Terms to
  the terms page; they are never the same URL (`C1-30`, `C5-04`).

**Gate command lines (verbatim).**

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-A CLONE UDID>' -only-testing:PatinaTests
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-A CLONE UDID>' \
  -only-testing:PatinaTests/AuthProviderVisibilityTests \
  -only-testing:PatinaTests/TestAccountLoginFallbackTests \
  -only-testing:PatinaTests/GuestEscapeTests
```

**Exit criteria.** On the lane's clone, against the **local** stack and then against **production**:
a fresh install reaches a working sign-in in under 60 seconds with no dead button, no raw server string
anywhere, no layout shift on a failed attempt, and an escape from the guest flow on every screen; a
second launch after "Look around first" still offers sign-in; `tester@patina.cloud` / `000000` signs in
**in the app** (D7); an Apple sign-in produces `profiles.role = 'homeowner'`; Delete Account's copy
states that the Patina account and its server-side data are deleted and names what is retained and for
how long (`A-101`, an App Review 5.1.1(v) risk).

**Integration notes.** `P-34` (the Welcome screen collapsing at the largest Dynamic Type) is filed to
L1-C and is **the same screen** — L1-C owns the layout, L1-A owns the controls; agree the split in
writing on day 1. `C3-03` / `C3-06` / `A-73` / `P-35` (SIWA in dark mode, the inverted
disabled/enabled affordance, tan-button contrast) are L1-D's tokens applied to L1-A's screens. `A-11`
(emoji as the quiz's production iconography) is L1-D's. `C2-21` / `GAP7B-09` (a deep link tapped while
signed out) is L1-F's queue with an L1-A acknowledgement line on the auth screen. `A4-04` is now a
re-probe (the function is deployed) — but the **copy** half stands.

---

#### L1-B — Data, persistence, resilience · *Opus*

**Purpose.** Stop the app lying about what it knows. Today three empty states are indistinguishable
from a failed fetch, two of them to a client who *has* data; a cold launch during an outage silently
deletes badge counts, the designer seat and a record row; and a `ModelContainer` failure is a
`fatalError` with no migration plan, which means a schema change in build 2 bricks every install.

**Owned files (exact globs).**

```
apps/mobile/Patina/Patina/Core/Persistence/**          EXCEPT WidgetSnapshot.swift,
                                                       RecordSnapshotStore.swift → L1-F
apps/mobile/Patina/Patina/Core/Network/**              EXCEPT EditorialStoriesAPIClient.swift → L1-D (A3-17)
apps/mobile/Patina/Patina/Core/Models/**
apps/mobile/Patina/Patina/Core/State/**                EXCEPT FeatureFlags.swift → L1-F (GAP7B-02)
apps/mobile/Patina/Patina/Services/Analytics/**
apps/mobile/Patina/Patina/Services/Sync/**
apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift
apps/mobile/Patina/Patina/Features/Collections/**      (schema side)
apps/mobile/Patina/Patina/Features/RoomScan/**         (fallback flow, incl. GAP4-02/03/25 ⇧D12)
apps/mobile/Patina/Patina/Features/Walk/**             (C7-05)
apps/mobile/Patina/Patina/Features/Splash/**           (C1-18/C1-19, the watchdog's other half)
apps/mobile/Patina/Patina/Features/Rooms/**            (room lifecycle)
  EXCEPT Components/RoomTypePillRow.swift              → L1-C (C6-18)
  EXCEPT the string literals in Components/RoomItemRow.swift, Views/ItemActionMenu.swift,
         Views/MoveOrCopyItemSheet.swift               → L1-E's deck, applied HERE (C5-16)
```

**Not this lane:** `AppCoordinator.swift` is **L1-F**'s (four of its five W1 rows are the deep-link
queue) — `C1-18`/`C1-19`'s `.launching` watchdog goes to L1-F as an integration note carrying the exact
5–8 s timeout and the fallback sentence. `DailyRoomView.swift` and `RecommendationsView.swift` are
**L1-C**'s — `C4-12`/`R-03`'s `.refreshable` goes there as a note naming the exact work each root's
`.task` does.

**Findings it closes (W1 · 27 — 21 T0 + 6 promoted from W2 by D12, marked ⇧D12).**

_count: 27 · blocker 5 · major 21 · minor 1 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C7-01` | T0/blocker | M | ModelContainer failure is fatalError — no fallback, no MigrationPlan; a build-2 schema change crash-loops eve… | apps/mobile/Patina/Patina/Core/Persistence/PersistenceController.swift:25-48 | Add a SchemaMigrationPlan; on catch, move the old store aside and open a fresh one (or in-memory) behind a designed 'we had to st… |
| `C7-02` | T0/blocker | S | BoardModel is fetched and inserted against a container whose Schema does not contain it (Saved / Collections) | PersistenceController.swift:26-35 vs Core/Models/BoardModel.swift:12-13; Features/Collections/… | Add BoardModel.self to the schema (and to LocalStoreReset), or remove the boards feature from CollectionsView before shipping. |
| `GAP4-02` ⇧D12 | T1/blocker | S | The fallback entry screen is a hard dead end: no back, no cancel, and the interactive-pop gesture is dead | ScanFallbackEntryView.swift (whole view) presented from QuietConversationFlowHost.swift:195-20… | Give the host a persistent "Not now" / ✕ that calls leaveFlow(landingOn: .heroFrame), and re-enable the interactive pop for the .… |
| `GAP4-03` ⇧D12 | T1/blocker | S | Developer default dimensions are pre-filled and become the tester's real room data | ScanFallbackEntryView.swift:27-28 (length="18", width="14") + :283-287 (isValid); shots/GAP4/1… | Start the fields empty with real placeholders, disable Continue until both are entered, or label the row as a suggestion. |
| `GAP4-25` ⇧D12 | T1/blocker | S | BLOCKER: "Rescan" on the floor plan strands the tester on a permanently blank screen; only force-quitting rec… | QuietConversationFlowHost.swift:337-346 (resetForRescan) + :145-152 (bootstrap) + content rout… | Have resetForRescan() call bootstrap() (or set the step directly), and give `.initial` a real loading state instead of a bare bac… |
| `A-34` ⇢L1-D | T0/major | M | Every recommendation scores 40–46 % match after a five-question quiz | Browse pieces; shots/A/14,15,16 | Either rescale/normalise the score so a good match reads as one, or stop showing a percentage and use a qualitative band ("Strong… |
| `A-81` | T0/major | M | Four different counts of "what needs you" on one screen | Daily Room home; shots/A/44-home-signedin.png | Derive every badge from one "needs you" query, or label each count with what it counts. |
| `A3-18` ⇢L0.2 | T0/major | S | Every product fetch pulls two 768-dim vectors the app never decodes — 20.7 KB per row, ~90% waste | Core/Network/ProductAPIClient.swift:113 (productSelect = "*,vendors!products_vendor_id_fkey(..… | Replace `*` with the ~24 columns RawProductWithVendor actually decodes. One-line change, ~10x smaller payload on the Record and o… |
| `B-03` | T0/major | S | A deleted room stays in Studio and the room count never updates | Studio after deleting 'Audit Room B' — shots/B/48-signedin-studio.png, 49-studio-scroll1.png,… | Invalidate/refetch the rooms query and the profile-stats query on room deletion, or drive both from one observable store. |
| `B-04` | T0/major | S | Deleting a room strands the user on the dead detail screen showing a hedged not-found error | Room detail immediately after Delete — shots/B/47-after-delete.png | Pop the navigation stack to the rooms list on successful delete; keep the not-found state only for genuine deep-link misses, and… |
| `C-11` ⇢L1-D | T0/major | M | The same product shows three different match scores in one session: 73%, 57%, 50% | Heirloom Oak Dining Table — shots/C/52-flagson-pieces.png (73%), 11-dark-browse.png (57%), 12-… | Compute the match once against a single scope and pass it through, or label each score with its scope ("73% for your home / 57% f… |
| `C1-19` | T0/major | S | .launching has no timeout: if auth readiness never lands, the splash is terminal | App/Coordinators/AppCoordinator.swift:258-262; Features/Splash/Views/SplashView.swift:55-59 | A 5–8s watchdog that forces .auth with a one-line 'We couldn't reach Patina — try again'. |
| `C4-03` | T0/major | M | Three empty states are indistinguishable from a failed fetch — two of them lie to a client who has data | apps/mobile/Patina/Patina/Features/Rooms/RoomSyncCoordinator.swift:189-197 + Features/Rooms/Vi… | Add lastLoadFailed to both view models and an error branch on the OrderDetailView.swift:41 model, which already distinguishes "we… |
| `C4-12` | T0/major | M | No pull-to-refresh on any of the four tab roots, or on three of four Studio detail screens | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:245 (Today), Features/Rooms/… | Add .refreshable to the four roots wired to the same work their .task blocks do, and to the three detail screens; InvoiceDetailVi… |
| `C4-16` | T0/major | S | supabase-swift reads inherit URLSession.shared timeouts (60 s request / 7-day resource), not the app's 30 s | apps/mobile/Patina/Patina/Core/Network/SupabaseClient.swift:54-63; budgets at Services/API/API… | Pass a configured URLSession into SupabaseClientOptions.GlobalOptions(session:) with timeoutIntervalForRequest = 30 and timeoutIn… |
| `C7-05` | T0/major | S | A fresh CIContext() is constructed per captured hero frame, on the main actor, mid-scan | apps/mobile/Patina/Patina/Features/Walk/Services/FrameCaptureService.swift:17 (@MainActor), :2… | Hoist to one lazily-created CIContext and move the encode off the main actor. |
| `C7-13` | T0/major | S | Telemetry queue re-queues failed batches without bound and rewrites the whole file every 30 s | apps/mobile/Patina/Patina/Services/Analytics/DailyRoomBatchQueue.swift:70-78,81-90,94-101; end… | Cap pending (drop oldest), add backoff on repeated failure, stop persisting on every failed tick. |
| `C7-15` | T0/major | S | A forced GoTrue token refresh runs before every single artifact upload | apps/mobile/Patina/Patina/Services/Sync/BackgroundScanUploader.swift:146-156 | Read auth.session (which refreshes only when expired) once per bundle rather than calling refreshSession() per artifact. |
| `C7-17` | T0/major | S | The U39 all-or-nothing decode still stands on the saved-pieces and single-piece reads | apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:170-174 and :146-148 | Wrap both in FailableDecodable exactly as decodeProducts already does. |
| `R-01` | T0/major | M | Studio asserts the client has nothing (0 decisions, 0 records, no messages) for ~50 s during an outage, under… | Studio screen; shots/R/12a-studio-retry-t50-spinner.png, shots/R/13a-studio-false-empty.png | Never render section empty-states from a failed fetch. Give each Studio section three distinct states (loading / loaded-empty / f… |
| `R-02` | T0/major | M | Cold launch with the backend down silently deletes badge counts, the designer seat and a record row; the bell… | Today; shots/R/16-cold-3.png, 17b-cold-t22.png, 18-cold-today-bottom.png vs 00-preflight-befor… | Persist the last successful badge counts, designer seat and record rows; on a failed refresh keep showing them (optionally dimmed… |
| `R-03` | T0/major | S | Today has no pull-to-refresh and no staleness signal — the only way to recover is to background the app | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:249; shots/R/03a-ptr.png, 03… | Add `.refreshable` to the DailyRoomView ScrollView calling the same sequence as the scenePhase handler, and show a 'last updated'… |
| `R-05` | T0/major | M | Proposal shows a blank page with "One moment…" for 65-185 s before admitting failure | Proposal detail; shots/R/14a-proposal-t2.png … 14d-proposal-t185.png, 15a/15b | Cap the proposal fetch at ~10 s, render the proposal title/summary from the record row that launched it while loading (skeleton,… |
| `B-15` ⇧D12 | T1/major | M | The previous account's taste portrait survives sign-out and shows under the Guest avatar | Studio as guest after signing James out — shots/B/75-guest-after-signout.png | Clear the on-device taste portrait, onboarding flags and companion state in the sign-out path, keyed by owner user id. |
| `C2-06` ⇧D12 | T1/major | S | Sign-out leaves the previous account's screens on the navigation stack | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:276-280 and :223-225; Patina/C… | In beginSplashTransition() (or on the .main -> .auth/.launching transition) clear navigationPath, screenStack, every tabs stack,… |
| `GAP3-18` ⇧D12 | T1/major | M | After sign-out the Guest profile still lists the previous account's rooms | ProfileView / DailyRoomView room rails after AuthService sign-out · shots/GAP3/22-guest-entry.… | Extend the sign-out LocalStoreReset to the room list/room-count sources, or scope those reads by `local_store_owner_user_id` the… |
| `C1-18` | T0/minor | S | The splash holds 1.5s on every cold launch and its own animation never finishes | App/Coordinators/AppCoordinator.swift:77-81,258-262; Features/Splash/Views/SplashView.swift:41… | Bring the wordmark fade to ≤1.2s and drop the floor to ~0.6s (or 0 when isAuthStateReady is already true). |

**Tests this lane must add.**

- `PatinaTests/PersistenceMigrationTests.swift` — a `SchemaMigrationPlan` exists and names every
  `VersionedSchema`; a deliberately corrupt store opens into the designed recovery path instead of
  trapping; `BoardModel.self` is in the container's `Schema` **and** in `LocalStoreReset`
  (`C7-01`, `C7-02`). This is the test that prevents a build-2 crash loop.
- `PatinaTests/LoadStateHonestyTests.swift` — for each of the nine list surfaces, the three states
  (`loading`, `loaded-empty`, `failed`) are distinct values and a failed fetch never renders the empty
  copy (`C4-03`, `A-80`, `R-01`, `R-02`). Table-driven over the view models so it grows with the app.
- `PatinaTests/NetworkBudgetTests.swift` — the `SupabaseClientOptions.GlobalOptions(session:)` carries
  `timeoutIntervalForRequest = 30` and a bounded `timeoutIntervalForResource`; no client inherits
  `URLSession.shared`'s 60 s / 7-day defaults (`C4-16`).
- `PatinaTests/LaunchWatchdogTests.swift` — `.launching` falls through to `.auth` with a one-line
  message after the deadline when auth readiness never lands (`C1-19`).
- `PatinaTests/TelemetryQueueBoundsTests.swift` — the pending queue is capped, drops oldest, backs off
  on repeated failure, and stops rewriting the file on every failed tick (`C7-13`).
- `PatinaTests/ProductSelectShapeTests.swift` — `productSelect` names the ~24 columns
  `RawProductWithVendor` decodes and contains neither `embedding` nor `aesthete_vector`; a golden-file
  assertion so the string cannot drift back (`A3-18`, 20,706 bytes/row of which 90% is unused).
- Extend `PatinaTests/ProductDecodingTests` — the saved-pieces and single-piece reads use
  `FailableDecodable` exactly as `decodeProducts` already does (`C7-17`).
- `PatinaTests/MatchScoreResolverTests.swift` — one piece resolves to **one** score per session, for a
  given room context, on every surface (`A-34`, `C-11`).
- `PatinaTests/RoomLifecycleTests.swift` — deleting a room pops to the rooms list, removes it from
  Studio and decrements the profile stat in one transaction (`B-03`, `B-04`).
- `PatinaTests/AttentionCountTests.swift` — one derived count feeds every "needs you" surface
  (`A-81`).
- `PatinaTests/RefreshableSurfacesTests.swift` — every root and every Studio detail exposes a refresh
  action wired to the same work its `.task` does (`C4-12`, `R-03`).

**Gate command lines (verbatim).**

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-B CLONE UDID>' -only-testing:PatinaTests
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-B CLONE UDID>' \
  -only-testing:PatinaTests/PersistenceMigrationTests \
  -only-testing:PatinaTests/LoadStateHonestyTests \
  -only-testing:PatinaTests/ProductSelectShapeTests
```

**Exit criteria.** With the local Supabase stack **stopped**, every root and every Studio detail draws
an error state with a retry inside 12 seconds and never an empty state; with the stack restarted, one
pull-to-refresh restores each; a corrupted SwiftData store opens into the recovery path and the app
still launches; the proposal detail never shows a blank "One moment…" for more than ~10 s (`R-05`
measured 65–185 s).

**The six ⇧D12 rows, and why they are here.** `GAP4-25`, `GAP4-02` and `GAP4-03` are T1 by tier and W1
by schedule under **D12**: What to Test item 6 sends a client to add a room in week one, and all three
live on that path — `GAP4-25` strands her on a permanently blank screen recoverable only by
force-quitting, `GAP4-02` is a hard dead end with no back and no cancel, and `GAP4-03` writes developer
defaults (`length="18"`, `width="14"`) into her real room. `B-15`, `C2-06` and `GAP3-18` are the
account-isolation set: the previous account's taste portrait, navigation stack and room list all survive
a sign-out. R1's device row **D-17** claims *"nothing of account A survives into account B"* and cites
all three plus `B-16`; leaving them in W2 would have scheduled that row to fail on three of four
sub-claims, on the one defect class where a first-round client can see another client's data. **They are
struck from the W2 table, not duplicated.**

This lane's task list therefore gains two suites beyond the ones listed above:
`PatinaTests/ScanFallbackEntryTests.swift` (a working exit from every step of the fallback host;
dimension fields start empty; `resetForRescan()` calls `bootstrap()` and `.initial` has a real loading
state) and `PatinaTests/AccountIsolationTests.swift` (after a sign-out, the taste portrait, the room
list, the room count and the navigation stack are all empty or the new account's — `B-15`, `C2-06`,
`GAP3-18`, and the app-side half of `B-16`).

**Integration notes.** `A4-03` / `A3-10` / `A3-14` are **re-probes**, not code, after L0.2's
reconciliation — but a client-side hedge for `client_designer_roster` reading as *"no designer yet"*
rather than an error is still worth having and is cheap. `A3-21` / `A3-22` (category vocabulary,
`published_at`/`quality_score`) are L0.3's seed; L1-B owns the normalising hedge only. `R-10`'s malformed
GROQ (`$sk` sent inside the query string instead of as a param) lives in the Help fetch and is L1-B's;
the **copy** split between "couldn't load" and "nothing here yet" is L1-E's. `A-80` is primarily L1-F.

---

#### L1-C — Layout, Companion, Dynamic Type · *Opus · merges first*

**Purpose.** Give the Companion orb a reserved footprint everywhere instead of twenty hard-coded
clearances, and make the app survive accessibility text sizes — including the two sheets where it
currently cannot be used at all.

**Owned files (exact globs).**

```
apps/mobile/Patina/Patina/Design/**
  EXCEPT Components/TierPill.swift                     → L1-D (C3-05, a clay-filled control)
  EXCEPT Components/CompanionSafeArea.swift            → shared with L1-F for C9-05; L1-C owns the
                                                         file, L1-F sends `.threadDetail` as a note
apps/mobile/Patina/Patina/Features/Companion/**
apps/mobile/Patina/Patina/Features/Home/**             (the whole tree, layout AND DailyRoomView.swift)
apps/mobile/Patina/Patina/Features/Decisions/**
apps/mobile/Patina/Patina/Features/Help/**             (tour + coach-mark layout)
apps/mobile/Patina/Patina/Features/Settings/**
apps/mobile/Patina/Patina/Features/ProductDetail/**    (chrome)
apps/mobile/Patina/Patina/Features/Navigation/**
apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift
apps/mobile/Patina/Patina/Features/Profile/Views/StudioHubView.swift
apps/mobile/Patina/Patina/Features/Profile/Views/ProfileView.swift
apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift
apps/mobile/Patina/Patina/Features/Rooms/Components/RoomTypePillRow.swift   (C6-18)
```

**Notes this lane applies** (each is a numbered task in its list, not a hope): L1-B's `.refreshable` on
`DailyRoomView`, `ProfileView`, `YourSpacesView` and `RecommendationsView` (`C4-12`, `R-03`); L1-E's
greeting strings on `DailyRoomView` (`C5-06`) and its Help Center row copy on `SettingsView`
(`C5-05`); L1-A's guest sign-in row on `SettingsView` (`C1-14`, `B-13`); L1-F's `.threadDetail` entry
in `CompanionSafeArea`'s `yieldsToPinnedFooter` (`C9-05`).

**Findings it closes (W1 · 35 — 29 T0 + 6 promoted from W2 by D12, marked ⇧D12).**

_count: 35 · blocker 3 · major 32 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `GAP1B-01` ⇢L1-E | T0/blocker | M | Approve and Cancel are off-screen on the decision consent sheet at accessibility text sizes | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:368-448 (DecisionC… | Replace the fixed [.medium,.large] with a content-driven detent (or .large alone at accessibility sizes via @Environment(\.dynami… |
| `GAP1B-02` | T0/blocker | S | Send is clipped and Cancel is gone on the decision defer sheet at accessibility text sizes | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDeferSheet.swift:26-79, presented a… | As GAP1B-01: content-driven detent plus a pinned bottom button pair. |
| `GAP4-16` ⇢L1-D ⇧D12 | T1/blocker | S | The Reveal's only CTA is invisible in light mode: charcoal capsule on a charcoal ground | RevealView.swift:34 (PatinaColors.charcoal ground) + StyleContinueButton.swift:36-40 + PatinaC… | Paint the Reveal with the semantic inverse-surface tokens, or give StyleContinueButton an explicit on-charcoal fill variant. |
| `A-100` | T0/major | S | The Settings sheet has no dismiss control | Settings; shots/A/54, 55 | Add a "Done" toolbar item (or .presentationDragIndicator(.visible)). |
| `A-45` ⇢L1-D | T0/major | S | Back, Share and Save scroll off the top of the product detail | Product detail; shots/A/19-product-detail-scrolled.png | Pin the overlay controls (or collapse them into a real navigation bar with a material) instead of letting them scroll with the he… |
| `A-50` | T0/major | S | The Companion's first-run coach mark covers the menu it is explaining | Companion menu, first open; shots/A/20-companion-menu.png | Anchor the coach mark below the menu (or dim the menu and highlight one row) so the described content stays visible. |
| `A-64` | T0/major | S | The home's only conversion CTA is truncated by the Companion orb at rest | Guest Daily Room home, default scroll position; shots/A/27-guest-home.png vs 28 | Bottom content inset (see A-88); move the sign-in prompt above the editorial card. |
| `A-88` | T0/major | M | The floating Companion orb occludes content on every screen — no bottom content inset anywhere | 8 screens; shots/A/14,18,27,44,46,47,49,50,71,72 | Add a safeAreaInset(edge: .bottom) sized to the orb + caption on every scroll container that hosts it, and drop the caption or mo… |
| `A-89` | T0/major | M | The circular Back button floats over scrolling content with no bar or material behind it | Studio, invoice detail, notifications, room detail; shots/A/47-studio-scroll1.png, 50-invoice-… | Give the back control a real navigation bar with a scroll-edge material, or a top content inset. |
| `A-99` | T0/major | S | Switching Appearance back to Light leaves the Settings sheet dark | Settings → Appearance; shots/A/57, 60, 63, 64, 65 | Apply the preferredColorScheme at the window/scene level (or pass it into the sheet's environment) instead of on the presenting v… |
| `A1-03` | T0/major | S | 'Browse pieces' has no Today door on either root | apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:273-297 (HomeComposition.… | Add a 'Browse pieces' tail to NewThisWeekRail, or restore a marketplace-links row to HomeComposition. |
| `A1-04` | T0/major | S | A guest can save pieces but has no door to Saved except the Companion orb | apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:293; apps/mobile/Patina/P… | Drop isSignedIn from the savedSummary gate, or draw SavedDoorRow unconditionally on Browse. |
| `A1-14` | T0/major | S | DesignerConsultationView shows a hard-coded placeholder 'Matched Designer' card | apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:55-75 | Replace the card with the flow's own value proposition, or delete it and let the screen be the hero + 'Start a request'. |
| `A4-07` | T0/major | M | U24/U44: the flag-off Today root has no door to Browse pieces or to design help | apps/mobile/Patina/Patina/Features/Home/Models/TodayExperience.swift:196-211,273-297; Features… | Either target `house-first` for testers (A4-12), or restore a Browse/Saved affordance and a 'Get design help' row to the flag-off… |
| `B-07` | T0/major | S | The inline help tooltip's text overflows its own bubble top and bottom | Today, small (?) beside 'Good afternoon.' — shots/B/17-guest-inline-help.png | Size the bubble from its text (fixedSize / intrinsic content height) instead of a fixed frame, and add vertical padding. |
| `B-09` | T0/major | S | The first-launch tour's Skip/Next are stock iOS system blue — the only blue in the app | Today, first-launch tour — shots/B/14-guest-today.png, 15-tour-step2.png, 66-relaunch-james.pn… | Set an app-wide .tint to the Patina brown and restyle the tour bubble to the app's card/typography system. |
| `B-10` | T0/major | M | Every coach mark covers the content it is describing | Today tour step 1, Companion first-open card — shots/B/14-guest-today.png, 68-companion-open.p… | Anchor the bubble below/beside its target with a highlight cut-out, or dim everything except the target. |
| `B-27` | T0/major | M | The pinned 'Your Studio' capsule title floats over and hides list content as the page scrolls | Studio — shots/B/19,20,49,57 | Use a real collapsing navigation title with a scroll-edge material, or drop the capsule and inset the content below it. |
| `B-28` | T0/major | S | After a payment failure the Pay button is pushed entirely behind the tab bar and the error panel is clipped | Invoice detail after tapping Pay — shots/B/54-pay-result-b.png + scan_ui | Scroll the failure into view, add a bottom safe-area inset for the tab bar, and keep Pay visible (or make the retry the primary b… |
| `B-60` | T0/major | S | The 'Add a new room' sheet mixes three background materials and two icon systems | Add a new room sheet — shots/B/39-add-room.png | Give the sheet one opaque background at a fixed detent and use the same tile treatment for both rows. |
| `C-03` ⇢L1-D | T0/major | M | The fixed Companion orb and its caption overprint live content on every scrollable screen | Messages 26-dark-messages.png; Studio 16/17; Browse 11; Today 30-xxxl; Room 10 | Add a bottom safe-area inset equal to the orb+caption height to every scroll container, or move the caption inside the orb. Note… |
| `C-05` | T0/major | S | Four "?" controls at three sizes on one header; three share the identical label "More information" | Your Spaces; shots/C/09-dark-spaces.png, 51-flagson-spaces.png | Collapse to one help affordance per screen; give any remaining ones distinct labels naming their subject. |
| `C-06` ⇢L1-D | T0/major | M | Dynamic Type breaks headline text mid-word — "Good / afternoo / n." at XXXL, six fragments at AX sizes | shots/C/30-xxxl-today.png, 35-ax3xl-today.png, 36/37-ax3xl-companion, 38-ax3xl-spaces | Let the header stack switch to a vertical layout above .xxLarge (ViewThatFits / dynamicTypeSize check), and add minimumScaleFacto… |
| `C-18` | T0/major | S | The greeting "?" tooltip clips its own copy at the top AND the bottom, and the trigger is unreachable by Voic… | Today; shots/C/07-dark-greeting-help.png | Size the bubble to its content, make it opaque, and either give the trigger a real accessibility label or delete it (it duplicate… |
| `C-28` | T0/major | S | On the room detail the orb covers the inner bottom corner of both "Edit dimensions" and "Edit budget" | shots/C/10-dark-room.png | Same bottom-inset fix as C-03. |
| `C5-05` ⇢L1-E | T0/major | S | Settings → 'Help Center' opens a 404 (silently lands on the marketing home page) | apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:153-155 | Point at a page that exists, or remove the row until one does. |
| `C6-18` | T0/major | S | Room-type chips: six in a fixed row, 24pt tall, colour-only selection, no labels | Features/Rooms/Components/RoomTypePillRow.swift:24-45 (used by Name Your Room, Manual Entry an… | Give each chip a 44pt min height, add .isSelected, and let the row wrap (ViewThatFits or a flow layout) at accessibility sizes. |
| `C9-04` | T0/major | M | Twenty hard-coded bottom clearances, none derived from CompanionHearthMetrics | DailyRoomView.swift:371, ProfileView.swift:167, YourSpacesView.swift:97, CrossRoomView.swift:4… | Replace all twenty with CompanionHearthMetrics.pinnedFooterClearance(houseFirst:) (or the reservation modifier where the screen s… |
| `P-34` ⇢L1-A | T0/major | M | At the largest Dynamic Type size the first screen collapses: every button label truncates, text breaks the gu… | Welcome home at content_size accessibility-extra-extra-extra-large; shots/P/40-welcome-ax3xl.p… | ScrollView fallback above .accessibility1; minimumScaleFactor/multi-line button labels; stacked legal links; let the Apple button… |
| `R-06` | T0/major | S | Browse / Recommendations does not fill the screen in its loading, error AND empty states — a cream band float… | apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:59 and :145… | Add `.frame(maxWidth:.infinity, maxHeight:.infinity, alignment:.top)` to the root VStack before the `.background`, so the cream g… |
| `GAP1B-03` ⇢L1-D ⇧D12 | T1/major | M | "Good evening." breaks mid-word on the Today home at accessibility text sizes | Today home header (DailyRoomView) — the greeting shares a horizontal band with the bell/help/S… | Give the greeting the full content width and move the bell/help/Studio cluster to its own row (or a toolbar) at dynamicTypeSize >… |
| `GAP1B-07` ⇢L1-D ⇧D12 | T1/major | S | "Cancel" on both decision sheets is a 17.6 pt tap target | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:438-441 and Decisi… | Give .ghost the same 44 pt min height and full-width frame as the other PatinaButton styles. |
| `GAP1B-08` ⇢L1-A ⇧D12 | T1/major | S | The auth screen’s text links are all ~15-17 pt tall | Welcome + Sign In screens (Features/Authentication) — measured via idb ui describe-all | .frame(minHeight: 44).contentShape(Rectangle()) on each link. |
| `C-23` ⇧D12 | T1/major | S | Two different sheet chromes: Settings has no dismiss control and no grabber, Help has both | shots/C/29-dark-settings.png vs 32-xxxl-help-panel.png | Pick one sheet pattern and apply it everywhere; give Settings a Done button. |
| `GAP2-24` ⇧D12 | T1/major | S | The "Pay $4,250.00" button starts one point below the fold on an iPhone 17 Pro | Invoice detail — shots/GAP2/51-invoice-detail.png (at rest) vs 52-invoice-detail-bottom.png | Pin the pay button to the bottom safe area (this screen earns a fixed footer), or shorten the sections above it. |

**Tests this lane must add.**

- `PatinaTests/CompanionInsetTests.swift` — **the lane's keystone.** Enumerate every scroll container
  that hosts the Companion and assert each one's bottom inset is derived from
  `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)`, not a literal. Assert the count of
  hard-coded bottom clearances in `Features/**` is **zero** (today it is twenty — `C9-04` names them:
  `DailyRoomView.swift:371`, `ProfileView.swift:167`, `YourSpacesView.swift:97`, `CrossRoomView.swift`,
  and the rest). A source-scanning test is legitimate here and is the only thing that stops the twenty
  coming back.
- `PatinaTests/DecisionSheetDetentTests.swift` — the consent and defer sheets use a content-driven
  detent (or `.large` at `dynamicTypeSize >= .accessibility1`) and pin Approve/Cancel and Send/Cancel
  in a bottom `safeAreaInset`, so both are on screen at `accessibility-extra-large` (`GAP1B-01`,
  `GAP1B-02`). Measured today: Approve at `y=857.0 h=49.9` on an 874 pt screen (~17 pt visible), Cancel
  at `y=931.9` — 58 pt below the display edge.
- `PatinaTests/DynamicTypeLayoutTests.swift` — the Today greeting reflows to its own row above
  `.accessibility1` and never shares a horizontal band with the bell/help/Studio cluster; assert no
  rendered greeting line breaks inside a word (`C-06`, `GAP1B-03`, `P-34`).
- `PatinaTests/TapTargetTests.swift` — every control in `Features/Decisions/**` and
  `Features/Authentication/**` reports a hit region ≥ 44 pt in both axes (`GAP1B-07` measured Cancel at
  **17.6 pt**; `GAP1B-08` measured the auth links at 14.67–17.0 pt).
- `PatinaTests/SheetChromeTests.swift` — one `patinaSheet()` modifier carries detents, corner radius,
  grabber policy and background; Settings has a dismiss control and follows the app's appearance
  (`A-99`, `A-100`, `C-23`).
- `PatinaTests/CoachMarkAnchorTests.swift` — a coach mark's frame never intersects its own target's
  frame (`A-50`, `B-07`, `B-10`, `C-18`).
- Extend `PatinaTests/FirstLaunchTourTests` — tour buttons use the Patina tint, not system blue
  (`B-09`), and the step count is deterministic.
- `PatinaTests/RecommendationsFillTests.swift` — the Browse root fills the screen in loading, error
  **and** empty states; no cream band floats on the page ground (`R-06`).

**Gate command lines (verbatim).**

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-C CLONE UDID>' -only-testing:PatinaTests
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-C CLONE UDID>' \
  -only-testing:PatinaTests/CompanionInsetTests \
  -only-testing:PatinaTests/DecisionSheetDetentTests \
  -only-testing:PatinaTests/TapTargetTests
```

Plus, because this lane is a layout lane, **its own walk before it merges** (see exit criteria).

**Exit criteria.** On the lane's clone, at `content_size large` and again at
`accessibility-extra-extra-extra-large`, in light and dark:

```bash
U=<L1-C CLONE UDID>
for size in large accessibility-extra-large accessibility-extra-extra-extra-large; do
  xcrun simctl ui $U content_size $size
  for scheme in light dark; do
    xcrun simctl ui $U appearance $scheme
    xcrun simctl terminate $U cloud.patina.app || true
    xcrun simctl launch $U cloud.patina.app -DeploymentTarget local
    # Today · a decision · the consent sheet · the defer sheet · Studio · a room · Browse · Settings
    xcrun simctl io $U screenshot artifacts/ios-testflight-polish-2026-09-01/shots/w1-c/$size-$scheme-<screen>.png
  done
done
```

Every screenshot read back and confirmed: no control under the orb, no headline broken mid-word,
Approve/Cancel and Send/Cancel **visible and ≥ 44 pt tappable** at every size (the "tappable" half is
`GAP1B-07`, measured at 17.6 pt — it is a ⇧D12 row in this lane's table, which is what makes the
criterion meetable), no coach mark over its own target, and the Reveal's CTA visible in **light** mode
(`GAP4-16`, also ⇧D12).

**Every W1 fix in this lane is demonstrated with the flags OFF.** Four rows in this lane's table were
evidenced against a flags-**on** build — `B-28` ("pushed entirely behind the tab bar": the tab bar only
exists with `house-first` ON), `C-05` (`shots/C/51-flagson-spaces.png`), `C-27`
(`shots/C/52-flagson-pieces.png`, the "Pieces tab") and `C-11`'s third match score, read partly off the
same shot. Round one ships every flag off (**D1**), so the acceptance for those four is re-framed
against the shipping route: **`B-28`** → the Pay button and the failure panel clear the *Companion dock*
on the invoice detail (the same clearance `GAP2-24` ⇧D12 measures at one point below the fold);
**`C-05`** → the four "?" controls on the Your Spaces header reached via the Companion dock →
Spaces; **`C-27`** → a product card with no image, reached via Companion → Browse; **`C-11`** → the same
piece opened twice by two different flags-off routes shows one score. The walker's screenshots are taken
on the flags-off root or they do not close the row.

**Integration notes.** This lane merges **first**. `A-45` (product-detail top controls), `B-13`
(guest Studio card CTA), `C-22` ("Your studio" / "Your profile" / "Studio" landing on one screen),
`C5-05` (Help Center 404) and `C1-14` (Settings → Account dead end for a guest) are shared with L1-A,
L1-D and L1-E — the concern decides the lane (assignment note 5): layout and chrome here, colour and
type in L1-D, the words in L1-E, states in L1-B. `A4-01` / `C5-01` / `C5-02` are L0.4's Sanity writes;
the **hide-the-doorless-`?`** code change is this lane's.

---

#### L1-D — Tokens, dark mode, contrast, iconography · *Opus*

**Purpose.** One colour system that survives dark mode, one type ramp, one primary button, one money
format, one designed missing-image state. Today the Companion orb is invisible in dark mode at 1.15:1,
`pearl` is a light-only hairline used **89×**, `clay` fills carry white labels at 2.33:1, the primary
CTA is pure black on near-black, and 46 inline `.font(.custom(…))` calls bypass the type system — one of
them naming a face (`PlayfairDisplay-Light`) that is not shipped.

**Owned files (exact globs).**

```
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/**      ← the tokens live HERE
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/**
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/**
apps/mobile/Patina/Patina/Design/Components/TierPill.swift          (C3-05)
apps/mobile/Patina/Patina/Features/Shared/**                        (ProductCard, CurrencyFormatting)
apps/mobile/Patina/Patina/Features/Authentication/Views/SignInWithAppleButton.swift   (C3-03, P-35)
apps/mobile/Patina/Patina/Features/StyleReveal/Views/RevealView.swift                 (C3-15, GAP4-16)
apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift                (A3-17)
# plus, by integration note, the exact colour/font literals inside files other lanes own —
# the C3 ledger enumerates all 89 `pearl` sites, all 46 inline `.font(.custom(...))` sites,
# and the ~15 `clay`-filled selection controls.
```

`apps/mobile/Patina/Patina/Design/Tokens/**` **does not exist** and is not this lane's — `Design/`
contains only `Accessibility`, `Animations`, `Components`, `DesignKitReexport.swift`, `Gestures` and
`PatinaLog.swift`, and every token is in `PatinaDesignKit/Sources/PatinaDesignKit/Tokens/`. The rest of
`Design/**` is **L1-C**'s. The two `Features/**` files above are carved out of L1-A's globs by name so
each has exactly one owner; L1-A is told so in its own section.

**Findings it closes (T0 · W1 · 18).**

_count: 18 · blocker 1 · major 17 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-01` | T0/blocker | M | Every product surface is empty on production: get_recommendations returns zero rows for every tester | Strata public.products / get_aesthete_matches; ProductAPIClient.swift:80-92 (withholdingUnreso… | Seed a real catalogue: >=30 layer='catalog' status='published' products with brand or vendor, images, price, category and a produ… |
| `A-11` ⇢L1-A | T0/major | M | Full-colour system emoji are the production iconography of the style quiz | Style quiz Q2/Q4/Q5; shots/A/07,08,10,11 | Replace with SF Symbols or the brand's line icons, in a single weight and one colour; strip the glyph from the accessibility labe… |
| `A-36` ⇢L0.3 | T0/major | S | Missing images render as flat colour blocks with no missing-image state | Browse pieces; shots/A/15-browse-scroll1.png, 16 | Add a designed placeholder (brand mark on a tint) plus a shimmer for the loading case, and distinguish loading from permanently-m… |
| `A-73` ⇢L1-A | T0/major | S | White-on-tan primary buttons fail contrast (~2.2:1) | Auth, coach mark, invoice; shots/A/34,38,20,50 | Darken the tan for filled buttons or use ink text on tan; validate every filled-button pairing. |
| `A-90` | T0/major | S | "Pay $4,250.00" is painted in the app's disabled-button tan at ~2.2:1 contrast | Invoice detail; shots/A/50-invoice-bottom.png vs 34/37 | Give enabled/disabled genuinely different treatments (black = enabled, reduced-opacity grey = disabled) and never reuse the accen… |
| `A3-17` ⇢L0.3 | T0/major | M | The three editorial stories have no hero images and claim a 3–5 minute read on ~400-character bodies | public.editorial_stories (3 rows); Core/Network/EditorialStoriesAPIClient.swift | Commission real bodies and hero images for at least these three rows, or compute read_minutes from the body and hide the badge be… |
| `B-18` ⇢L0.3 | T0/major | L | Product photography contradicts the product, and a missing image renders as a bare grey block | Pieces grid and product detail — shots/B/13-guest-home-today.png, 34-signedin-today-b.png, 67-… | Re-shoot/re-map the seeded catalogue imagery, and give the image slot a designed placeholder (mark + product name) instead of an… |
| `C-01` | T0/major | S | Companion orb is invisible in dark mode — hardcoded fill, 1.15:1 against the page | Today/all flags-OFF screens; shots/C/06-dark-launch-2.0s.png vs 00-preflight-before.png | Give the orb an adaptive fill (invert to a light disc in dark mode) or add a border/shadow token. Same fix covers the Companion p… |
| `C-02` | T0/major | S | Companion status line is dark-on-dark in dark mode (1.11:1) while the title stays white | Companion sheet; shots/C/crop-dark-companion-header.png vs crop-light-companion-header.png | The panel is a fixed dark surface; the subtitle uses a colour that flips with the system appearance. Pin the subtitle to the pane… |
| `C-20` | T0/major | S | Dark-mode text contrast fails WCAG on the de-emphasised rows: meta 2.66:1, body 4.27:1 | Today "MOVED" rows; shots/C/06-dark-launch-2.0s.png | Raise the dark-mode de-emphasised ink to ≥4.5:1 (body) and ≥3:1 (meta). |
| `C-27` ⇢L0.3 | T0/major | S | Pieces tab renders a missing product image as a blank cream rectangle, with overlay chrome at 2.01:1 on it | "Wool Kilim Runner"; shots/C/52-flagson-pieces.png | Add a branded image placeholder and a failed-load state; give the overlay chrome a guaranteed scrim so it holds contrast over lig… |
| `C-41` | T0/major | S | Two competing primary-button styles: solid gold vs near-white pill | shots/C/20-dark-proposal-scrolled.png and 23-dark-invoice-bottom.png (gold) vs 10-dark-room.pn… | One primary token; pick a different disabled treatment. |
| `C3-01` | T0/major | M | `pearl` is a light-only hairline used 89x as the app's border/divider colour — 12.8:1 in dark mode where 1.2:… | PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:43 + 89 call sites (PatinaTa… | Add Border.hairline / Border.strong semantic tokens built with Color.patinaDynamic(light: pearl, dark: <graphite +1 notch>), then… |
| `C3-05` | T0/major | M | White/off-white labels on `clay` fills are 2.33:1 across ~15 selected-state controls, including a PatinaButto… | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:94,105; RoomTypePillRow.… | Route filled selection states through FilterChip / PatinaButton(.primary) (charcoal + Text.inverse), or use clayDeep for filled s… |
| `C3-15` | T0/major | M | 46 inline `.font(.custom("Face", size:))` bypass PatinaTypography — and one names PlayfairDisplay-Light, whic… | Features/StyleReveal/Views/RevealView.swift:85 (the bug) and :127; ScanFloorPlanPreviewView.sw… | Ship PlayfairDisplay-Light or change that call to -Regular; promote the 46 inline sites to named PatinaTypography tokens; raise t… |
| `C5-14` ⇢L1-E | T0/major | M | Two money formats ship at once — Today shows $4,200 and $4.2K for the same piece one tap apart | canonical Features/Shared/CurrencyFormatting.swift; bypasses at ProductModel.swift:181-187, Sa… | Route all ten through PatinaCurrency; if a compact 'K' form is wanted, put it inside PatinaCurrency so there is one rule. |
| `P-25` | T0/major | S | The OTP field's placeholder is "000000", exposed as its accessibility value, and a filled field looks almost… | auth.otp.tokenField; shots/P/23-code-requested-t0.png vs 25-code-entered.png | AXValue empty, accessibilityLabel "Sign-in code"; six digit boxes or a clearly distinct filled state; a placeholder that isn't a… |
| `P-35` | T0/major | S | In dark mode the primary CTA is pure black on a near-black ground | Welcome home, appearance dark; shots/P/39-welcome-dark.png | Switch the Apple button style with the colour scheme. |

**Tests this lane must add.**

- `PatinaDesignKitTests/ContrastTests.swift` — a computed-contrast assertion over every
  foreground/background token pairing the kit publishes, in **both** appearances: body text ≥ 4.5:1,
  meta ≥ 3:1, filled-button label on its fill ≥ 4.5:1. Today this test fails on
  `clay` + white (2.33:1), tan + white (~2.2:1), dark-mode meta (2.66:1) and dark-mode body (4.27:1).
- `PatinaDesignKitTests/DynamicTokenTests.swift` — no token resolves to the same value in light and
  dark unless that is deliberate and annotated; `Border.hairline` / `Border.strong` exist and are built
  with `Color.patinaDynamic(light:dark:)` (`C3-01`).
- `PatinaTests/TypographyAdoptionTests.swift` — zero `.font(.custom(` call sites remain in
  `Features/**` and `Design/**`; every face named by a token is present in the bundle — the assertion
  that catches `PlayfairDisplay-Light` (`C3-15`).
- `PatinaTests/CurrencyFormattingTests.swift` — every money string in the app routes through
  `PatinaCurrency`; `$4,200` and `$4.2K` cannot both be produced for the same value one tap apart
  (`C5-14`).
- `PatinaTests/CompanionOrbAppearanceTests.swift` — the orb and its caption resolve to an adaptive
  fill and hold ≥ 3:1 against the page ground in both appearances (`C-01`, `C-02`).
- `PatinaTests/ImagePlaceholderTests.swift` — a product with no image renders the designed placeholder
  (mark on a tint) and never a bare fill; loading, loaded and permanently-missing are three distinct
  states (`A-36`, `C-27`, `B-18`).
- `PatinaTests/PrimaryButtonStyleTests.swift` — one primary style; disabled is a reduced-opacity
  treatment, never the accent colour (`C-41`, `A-90`, `C3-06`).

**Gate command lines (verbatim).**

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
swift test --package-path apps/mobile/PatinaDesignKit
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-D CLONE UDID>' -only-testing:PatinaTests
apps/mobile/Patina/scripts/ios-gate.sh lint-delta
```

`lint-delta` is named here because `disallow_font_custom_in_features` (the PT-1-1 custom rule) has 48
hits today and this lane is the one that drives it toward zero; a lane that *adds* one must not pass.

**Exit criteria.** The contrast test suite is green in both appearances; `pearl` has zero direct call
sites outside the token file; zero `.font(.custom(` in `Features/**`; one money format; the Companion
orb is visible in dark mode; a screenshot pass of Today / Browse / a decision / an invoice / the
Companion sheet in dark mode at default size shows no invisible control and no 2:1 text.

**Integration notes.** `A3-01` sits in this lane's W1 table because its *visible* consequence is the
empty product surface, but the **fix is L0.3's seed** — L1-D owns only the honest empty state and the
placeholder. `A-11` (quiz emoji) and `A-73` (tan buttons) are painted on L1-A's screens; `A-45` is on
L1-C's chrome; `C5-14` is L1-E's noun and L1-D's formatter. `A3-17` (editorial stories with no hero) is
L0.3's content with L1-D's fallback.

---

#### L1-E — Copy · *Sonnet, reviewed by Opus*

**Purpose.** One voice. Today there are four spellings of "Something went wrong", three names for the
email sign-in mechanism, three nouns for a piece, two nouns for the client's own space, a promise that
the taste portrait "stays on this device" while the answers are POSTed, raw PostgREST and Swift-enum
strings on two surfaces, and a headline that says "Good night." for eight hours a day.

**Ownership rule — a reviewed copy deck, not a licence to edit every file.** The first draft of this
charter let L1-E "edit string literals anywhere", which in a six-worktree wave guarantees a textual
conflict with L1-C's and L1-D's rewrites of the same view bodies — and puts the resolution of those
conflicts nowhere. The model is inverted:

> **L1-E's deliverable is `build/waves/w1/l1-e-copy-deck.md`** — one row per change:
> `finding id · file:line · the string today · the exact final string · owning lane`.
> Fable and an Opus reviewer sign it off as a whole, before any lane applies it.
> **Each owning lane then applies its own rows inside its own worktree, as numbered tasks in its own
> task list**, and its exit criteria says the rows are applied. L1-E edits, in its own worktree, only
> the three files it owns outright (below) and any file no other W1 lane owns.

That makes every copy change a one-line edit made by the lane that is already rewriting the surrounding
code, so there is no conflict to resolve. **L1-E still merges last** (see the merge order), rebases onto
the integrated tip, and re-runs its own suites to prove the deck actually landed — a row in the deck
that no lane applied fails `NounConsistencyTests` or `ErrorVoiceTests` and comes back as a fix round.

The lane's inventory is `research/C5-strings.txt` (303 KB, the extracted user-facing string set).

```
# files it owns outright, and edits itself
apps/mobile/Patina/Patina/Features/Purchase/OrderFailureCopy.swift
apps/mobile/Patina/Patina/Design/Components/PatinaErrorState.swift
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift
apps/mobile/Patina/Patina/Features/ARPlacement/**            (C4-08 — no other W1 lane owns it)
apps/mobile/Patina/Patina/Services/DesignServices/**         (C5-11 — likewise)
apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift  (C4-09)

# everything else goes through the deck. Rows by owning lane, from this lane's table:
#   L1-A  A-52, A-79, C5-20, A-06        (Companion guest copy, claim sheet, onboarding)
#   L1-B  C4-09's upload-phase mapping, C5-16's resolvedMakerName guard
#   L1-C  A-60, C-22, C-30, C-38, C5-05, C5-06, B-20   (tour, Studio nouns, greeting, Settings)
#   L1-D  C5-14                                        (the money formatter's output strings)
#   L1-F  (none in W1)
#   L0.1  A2-12's seven permission sentences — the build settings win, so L0.1 pastes them
```

**Findings it closes (T0 · W1 · 18).**

_count: 18 · blocker 0 · major 16 · minor 2 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-52` | T0/major | S | The Companion promises a designer and a home to an anonymous guest | Companion menu (guest); shots/A/21-companion-menu-open.png | Branch the Companion copy on auth state; for guests say what signing in would unlock rather than asserting a relationship. |
| `A-60` | T0/major | S | The tour calls the destination "Your profile"; the button it points at says "Studio" | Coach tour step 2; shots/A/26-tour-step2.png | Pick one name for the client's own space and use it in the pill, the tour, the section header and the Companion menu. |
| `A-79` | T0/major | S | The guest→account migration sheet names data the user does not have | Immediately after sign-in; shots/A/42-signed-in-home.png | Compose the sentence from actual counts ("Keep the 1 piece you saved on this phone?"), and omit the sheet entirely when there is… |
| `A3-28` | T0/major | M | 'client', 'homeowner' and 'designer' are three words for two kinds of person in profiles.role | public.profiles.role; handle_new_user(); AuthService.sendMagicLink / signUp | Pick one word, migrate the rows, and flip handle_new_user's COALESCE fallback to that word so an unlabelled signup is never a des… |
| `B-20` | T0/major | S | Room CTA is built as 'for the ' + room name, producing ungrammatical copy | Room detail primary button — shots/B/43-room-detail.png | Drop the article: 'Browse pieces for Audit Room B', or use a fixed label 'Browse pieces for this room'. |
| `B-23` | T0/major | S | 'Your portrait stays on this device' but the quiz answers are POSTed to the backend | Taste Portrait footnote — shots/B/11-quiz-done-a.png, 32-portrait-signedin.png | Either stop sending guest answers, or reword to what is true ('Your portrait is yours — reset it any time in Settings'). |
| `C-22` ⇢L1-C | T0/major | M | "Your studio", "Your profile" and the "Studio" pill all land on one screen, and the promised "Portal" does no… | shots/C/16-dark-studio.png vs 27-dark-profile.png (identical) | Split profile from studio, or relabel the Companion rows to match the single destination and drop the Portal promise. |
| `C-30` | T0/major | S | "1 ROOMS" — pluralisation bug on the profile stat (the accessibility label gets it right) | Studio/profile hub; shots/C/16-dark-studio.png | Use a String.LocalizedStringResource with an inflection rule for the visible label too. |
| `C-38` | T0/major | S | Identical truncated boilerplate on every browse card: "Selected from Patina's room-aware edit for Gu…" | Room-scoped browse grid; shots/C/11-dark-browse.png | Delete the line (as the Pieces tab already does) or move it to a one-time section note. |
| `C4-08` | T0/major | S | AR "Save View" toast prints a Swift enum's default description, module name and all | apps/mobile/Patina/Patina/Features/ARPlacement/Views/ARPlacementView.swift:111-113 | Map to app copy in the view model; and make RoomsAPIError conform to LocalizedError so no other caller can repeat it. |
| `C4-09` | T0/major | M | The design-request send screen prints storage / Postgres error strings to a homeowner | apps/mobile/Patina/Patina/Features/RoomScan/Shared/Components/ScanUploadProgressView.swift:57-… | A ScanUploadFailureCopy mapping upload phase → app sentence; lastError becomes a diagnostic column no view reads. |
| `C5-06` | T0/major | S | Today's headline says 'Good night.' for 8 hours a day, 'Early morning.' at dawn and 'Good day.' at midday | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift:26-41, rendered as… | night → 'Good evening.', day → 'Good afternoon.', dawn → 'Good morning.'; drop the terminal periods. |
| `C5-09` | T0/major | M | Third noun collision — Piece / Product / Item — plus a SwiftUI class name printed as a button label | ItemActionMenu.swift:31 ('View Product Detail'); PatinaDesignKit/.../PatinaEmptyState.swift:66… | 'piece' everywhere in consumer copy (the brand's and the tab's word); ItemActionMenu row → 'See the piece' (the phrase OrderPlace… |
| `C5-10` | T0/major | M | Title Case and sentence case collide inside single screens (Settings, the auth sheet, onboarding) | SettingsView.swift:81 'Sign Out' vs :89 'Delete account' (adjacent rows; same pair AccountView… | Adopt sentence case except proper nouns (what the newer copy already does) and sweep. Settings and the auth sheet are the highest… |
| `C5-11` | T0/major | M | Four spellings of 'Something went wrong', and a raw interpolated error on the design-request send screen | PatinaErrorState.swift:41,49; CompanionAPIModels.swift:291; ScanReviewView.swift:128; DesignRe… | One PatinaErrorState sentence; delete the two raw arms; rewrite .submissionFailed as "We couldn't send your request. Nothing was… |
| `C5-16` ⇢L1-B | T0/major | S | Room rows still print the literal 'UNKNOWN MAKER' that the Browse grid was fixed (SP-10) to suppress | Features/Rooms/Components/RoomItemRow.swift:43 and :89; Features/Rooms/Views/ItemActionMenu.sw… | Give SavedItem the same resolvedMakerName guard and drop the line when nil. |
| `A-06` | T0/minor | S | Apostrophes are mixed within one three-page carousel | Patina/Features/Onboarding/Views/OnboardingFlowView.swift:31,37,57,58 | Sweep every user-facing string for U+2019; add a lint rule. |
| `C5-20` | T0/minor | S | 'Start Your Journey' and 'Join the furniture discovery journey' are brand-voice violations | OnboardingFlowView.swift:32; AuthenticationView.swift:134 | "Let's begin" (already page 3's CTA) and a signup subtitle that says what an account buys. |

**Tests this lane must add.**

- `PatinaTests/ErrorVoiceTests.swift` — every user-facing failure string is produced by one of a small
  named set (modelled on `MoneyFailureCopy`), no string interpolates a thrown error or a server field,
  and the four "Something went wrong" variants collapse to one (`C5-11`, `C4-08`, `C4-09`). Assert by
  scanning the string inventory, not by hand.
- `PatinaTests/NounConsistencyTests.swift` — the consumer lexicon is fixed: **Piece · Room · Studio ·
  Companion · Record**. Assert zero user-facing occurrences of "Product", "Item", "Your profile",
  "Portal", "Daily Room", "UNKNOWN MAKER" (`C5-09`, `A-60`, `C-22`, `C5-16`, `A3-28`).
- `PatinaTests/BrandVoiceLintTests.swift` — zero occurrences, case-insensitive, of `journey`,
  `curated`, `elevated`, `disrupt`, `revolutionize`, and zero occurrences of `AI` as a word, `A.I.`,
  `artificial intelligence`, `machine learning`, `GPT`, `LLM` in any user-facing string. The repo-side
  sweep is clean today (assignment note 9) — this test is what keeps it clean.
- `PatinaTests/GreetingWindowTests.swift` — the four `TimeOfDay` windows produce "Good morning." /
  "Good afternoon." / "Good evening." across a 24-hour sweep, with no "Good night." for eight hours and
  no "Early morning." at dawn (`C5-06`).
- `PatinaTests/PluralisationTests.swift` — counts inflect ("1 ROOM", not "1 ROOMS") in the **visible**
  label, not only in the accessibility label (`C-30`).
- `PatinaTests/SentenceCaseTests.swift` — within one screen's string set, casing is consistent
  (`C5-10`); Settings and the auth sheet are the two highest-density offenders.
- `PatinaTests/GuestPromiseTests.swift` — Companion copy branches on auth state and never asserts a
  designer or a home to an anonymous guest (`A-52`); the claim sheet composes its sentence from actual
  counts and is omitted at zero (`A-79`); the portrait footnote states what is true (`B-23`).

**Gate command lines (verbatim).**

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-E CLONE UDID>' -only-testing:PatinaTests
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-E CLONE UDID>' \
  -only-testing:PatinaTests/ErrorVoiceTests \
  -only-testing:PatinaTests/NounConsistencyTests \
  -only-testing:PatinaTests/BrandVoiceLintTests
```

**Exit criteria.** The copy deck is signed off by Fable and an Opus reviewer **before day 5**, so the
owning lanes have time to apply it inside their own waves. After the last merge: all seven suites green
on the integration tip; a re-extraction of the string inventory shows one error voice, one noun per
thing, one name for the email code, zero brand-voice violations, zero "AI"; every deck row is either
applied or carries a written "not this wave, because…"; the delete-account sentence names what is
deleted, what is retained and for how long, agreed with L1-A.

**Integration notes.** `A2-12`'s seven permission strings arrive from L0.1 for rewriting; the **file**
they live in is L0.1's (the build settings win over `Info.plist`), so they go back to L0.1 in the deck.
`A-13` (a dead "Next question →" static line), `C-38` (boilerplate card copy) and `C5-05` (Help Center
404) each need a structural edit as well as a string — the deck row names the string, the owning lane
does the edit. `GAP1B-01` appears in L1-C's table with an `⇢L1-E` cross-reference: the sheet is L1-C's,
the sentence is a deck row L1-C applies.

---

#### L1-F — Notifications, messaging, widget, deep links · *Opus*

**Purpose.** A tester who taps a link in Mail, taps a widget, or opens a thread must land where they
expected. Today a universal link that arrives before `configure(coordinator:)` is dropped **and
reported handled** (measured drop rate: 2 of 8 runs), a link tapped while signed out is never delivered
even after signing in, the whole small widget is one tap target pointed at its first row, that first row
is a story with no route at all, the message thread has no header, and a failed send is completely
silent.

**Owned files (exact globs).**

```
apps/mobile/Patina/Patina/Features/Notifications/**
apps/mobile/Patina/Patina/Services/Notifications/**
apps/mobile/Patina/Patina/Services/API/PushTokenService.swift
apps/mobile/Patina/Patina/Services/Badges/**
apps/mobile/Patina/Patina/Features/Messaging/**
apps/mobile/Patina/PatinaWidget/**                     (except PrivacyInfo.xcprivacy → L0.1)
apps/mobile/Patina/PatinaWidgetShared/**
apps/mobile/Patina/Patina/App/DeepLinking/**
apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift   ← the WHOLE file, not a slice
apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift           (GAP7B-02's mirror)
apps/mobile/Patina/Patina/Core/Persistence/WidgetSnapshot.swift
apps/mobile/Patina/Patina/Core/Persistence/RecordSnapshotStore.swift
```

`AppCoordinator.swift` carries five W1 rows across two lanes — `C2-21`, `GAP7B-09`, `C2-06` here and
`C1-18`, `C1-19` in L1-B. Four of five are the deep-link queue, which is the harder change, so this
lane owns the file outright and applies L1-B's `.launching` watchdog from an integration note (the note
carries the exact timeout and the exact fallback sentence; L1-B's `LaunchWatchdogTests` still lives in
L1-B and must pass on the integrated tip).

**Findings it closes (T0 · W1 · 16).**

_count: 16 · blocker 0 · major 16 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-63` | T0/major | S | The notifications empty-state "Sign in" button is a circle narrower than its own label | Notifications (guest); shots/A/29-guest-bell.png | Use a capsule with intrinsic width and horizontal padding instead of a fixed square frame + Circle clip. |
| `A-80` ⇢L1-B | T0/major | S | The notifications screen shows its EMPTY state while data is still loading | Notifications, immediately after sign-in; shots/A/43-after-migrate.png vs 45 | Add a loading state (skeleton rows) and only fall through to the empty state once the fetch has resolved with zero rows. |
| `B-16` | T0/major | S | The widget App-Group snapshot is not cleared on sign-out and carries no account identifier | group.cloud.patina.app container — research/B.md §Step 12 | Write an owner user id into the snapshot, and truncate/replace both files with a signed-out placeholder on sign-out, then WidgetC… |
| `C-13` | T0/major | S | The message thread has no header at all — the tester is never told who they are messaging | shots/C/26-dark-messages.png; full describe_screen | Add a conversation header with the designer's name, avatar and project. |
| `C-14` | T0/major | S | The message thread's only content is a system log line, "Project conversation opened." | shots/C/26-dark-messages.png | Replace with a real empty state ("Say hello to Leah — she usually replies within a day") and suppress the audit line. |
| `C2-02` ⇢L1-B | T0/major | S | Universal link arriving before configure(coordinator:) is dropped, yet reported handled | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:64-71 (vs the correct pattern… | Use the same stash-or-open pair the widget branch uses: when coordinator == nil, set pendingRoute = route. |
| `C2-07` | T0/major | S | The bell's unread badge stays stale after reading the feed | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:28,106-108,258; Patina/Featu… | Source the unread count from one shared @Observable service (BadgeCountService is already refreshed on the same triggers), or rel… |
| `C2-09` | T0/major | S | "Turn on notifications" is a silent no-op when authorization was already denied | apps/mobile/Patina/Patina/Services/API/PushTokenService.swift:66-77; Patina/Features/Notificat… | Read notificationSettings().authorizationStatus before asking; on .denied print the equivalent of InvoiceReminder.deniedLine and… |
| `C2-21` ⇢L1-A | T0/major | M | A deep link tapped while signed out is queued invisibly, only drains at .main, and holds one URL | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:94-97,243-246; Patina/App/Deep… | Queue for every non-.main phase, acknowledge it on the auth screen in one line, and hold a small FIFO rather than one slot. |
| `C4-04` | T0/major | S | A failed message send in a conversation is completely silent | apps/mobile/Patina/Patina/Features/Messaging/ViewModels/MessagingViewModel.swift:246-258 + Fea… | Render viewModel.error above the composer regardless of messages.isEmpty, with a Retry that re-sends draft; better, an unsent bub… |
| `C9-05` ⇢L1-C | T0/major | S | The message composer is drawn under the Companion dock — threadDetail never yields | Features/Messaging/Views/ThreadDetailView.swift:28-58,264-289; Design/Components/CompanionSafe… | Add .threadDetail to yieldsToPinnedFooter (dock steps aside to the 44 pt corner mark) and give the composer .safeAreaPadding(.bot… |
| `GAP7B-02` ⇢L0.6 | T0/major | M | With house-widget OFF — the TestFlight first-launch condition — the PLACED widget stays on "Open Patina to se… | apps/mobile/Patina/Patina/Core/State/FeatureFlags.swift (mirror); WidgetSnapshot.flagOn; Patin… | Ship the widget ungated for the TestFlight round (D5), or hide it from the gallery while the flag is off, or make the no-data car… |
| `GAP7B-03` | T0/major | S | Every row title on the small widget truncates mid-word | PatinaWidget/HouseWidgetViews.swift (small family row titles) | Two-line titles with lineLimit(2) + minimumScaleFactor, or a smaller type ramp for the title. Adding .systemMedium (GAP7B-07) als… |
| `GAP7B-04` | T0/major | M | The whole small widget is one tap target pointed at the FIRST row, so tapping the second row opens the first… | apps/mobile/Patina/PatinaWidget/HouseWidgetViews.swift:38 — .widgetURL(PatinaWidgetLinks.link(… | Either draw one row on systemSmall with a real destination, or make the card’s tap target visibly the whole record ("See what mov… |
| `GAP7B-05` | T0/major | M | The first widget row is a "story" with no route at all, so the widget’s only live tap target lands on Today | house-record.json (row story:a8b3f8a0-… has no route key); App/DeepLinking/DeepLinkHandler.rou… | Give story rows a destination, or exclude rows with no route from the widget projection. |
| `GAP7B-09` ⇢L1-A +GAP7-03,GAP7-04 | T0/major | M | A link tapped while signed out is not queued, not acknowledged, and never arrives — not even after signing in | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:94-97,243-246; App/DeepLinking… | Queue for every non-.main phase, hold a FIFO not one slot, persist the pending destination (App Group/UserDefaults with a short T… |

**Tests this lane must add.**

- `PatinaTests/DeepLinkQueueTests.swift` — **the lane's keystone.** A route arriving in any non-`.main`
  phase is queued (a small FIFO, not one slot), persisted across a cold launch with a short TTL, and
  drained on arrival at `.main`; a universal link arriving with `coordinator == nil` is **stashed**, not
  dropped, and `handle` does not return `true` for a link it discarded (`C2-02`, `C2-21`, `GAP7B-09`,
  which absorbs `GAP7-03` and `GAP7-04`).
- `PatinaTests/WidgetProjectionTests.swift` — every row the widget projects carries a route; rows
  without one are excluded (`GAP7B-05`); `systemSmall` either draws one row with a real destination or
  makes the whole card's destination visibly the record (`GAP7B-04`); row titles wrap to two lines with
  `minimumScaleFactor` rather than truncating mid-word (`GAP7B-03`); the eyebrow date logic matches the
  snapshot's `sinceDate` (`GAP7B-06`); an overdue row is never drawn before the client has been asked
  (`GAP7B-15`).
- `PatinaTests/WidgetSnapshotOwnershipTests.swift` — the App-Group snapshot carries an owner user id
  and is replaced with a signed-out placeholder on sign-out, then `WidgetCenter.reloadTimelines` is
  called (`B-16`).
- `PatinaTests/WidgetFlagOffRenderingTests.swift` — with `house-widget` **off** — the TestFlight
  first-launch condition — a placed widget renders the snapshot rather than "Open Patina to see your
  house" (`GAP7B-02`, D5).
- `PatinaTests/BadgeFreshnessTests.swift` — the bell's unread count is sourced from the one shared
  `BadgeCountService` and updates after the feed is read (`C2-07`).

  > **The VISION check on `C2-07`, run and ruled, because it is the one row in this lane that VISION §6
  > names.** §6 refuses *"tab / zone / dashboard UI, shadows, red/green status, **badges**"*, and this
  > lane's fix makes a badge *correct* rather than asking whether the app should carry one. **Ruling:
  > it stays, in one form only** — a single count of *what needs you*, the same derived number
  > `A-81` mandates in L1-B ("four different counts of 'what needs you' on one screen" → one query),
  > rendered on the bell and mirrored to the app icon. That is the homeowner half of VISION §4 ("you're
  > engaged every day"), not decoration, and it is one number rather than four. What does **not**
  > survive: any second badge, any badge on a surface that is not the bell or the icon, and any
  > red-as-meaning. `BadgeFreshnessTests` asserts the count comes from `BadgeCountService`;
  > `AttentionCountTests` (L1-B) asserts there is only one such count in the app. Both, together, are
  > the rule.
- `PatinaTests/PushAuthorizationCopyTests.swift` — "Turn on notifications" reads
  `notificationSettings().authorizationStatus` first and, on `.denied`, prints the app's own sentence
  plus a Settings door instead of silently doing nothing (`C2-09`).
- `PatinaTests/ThreadHeaderTests.swift` — a thread renders the designer's name, avatar and project
  (`C-13`), the system audit line is suppressed in favour of a real empty state (`C-14`), and a failed
  send renders above the composer with a retry that re-sends the draft (`C4-04`).
- `PatinaTests/NotificationsLoadStateTests.swift` — skeleton rows while loading; the empty state only
  after a resolved zero-row fetch; the sign-in affordance is a capsule sized to its label
  (`A-80`, `A-63`).

**Gate command lines (verbatim).**

```bash
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-F CLONE UDID>' -only-testing:PatinaTests
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=<L1-F CLONE UDID>' \
  -only-testing:PatinaTests/DeepLinkQueueTests \
  -only-testing:PatinaTests/WidgetProjectionTests \
  -only-testing:PatinaTests/WidgetSnapshotOwnershipTests
```

**Exit criteria — including the empirical one.** Re-run GAP7's own eight-run protocol on the lane's
clone and require **8 of 8**, not 4 of 8:

```bash
U=<L1-F CLONE UDID>
for i in $(seq 1 8); do
  xcrun simctl terminate $U cloud.patina.app || true
  xcrun simctl launch    $U cloud.patina.app -DeploymentTarget local
  sleep 0.25
  xcrun simctl openurl   $U https://client.patina.cloud/proposals/b0000000-0000-0000-0000-000000000002
  sleep 6
  xcrun simctl io $U screenshot artifacts/ios-testflight-polish-2026-09-01/shots/w1-f/coldlink-$i.png
done
```

Then the signed-out variant: launch with no arguments (production), fire the same link, sign in, and
require the destination to arrive after sign-in. Then sign out and confirm the App-Group snapshot has
been replaced.

**Integration notes.** `A-80` carries `alsoTouches: L1-B` (the load-state machinery) and `C9-05`
carries `alsoTouches: L1-C` (the composer under the Companion dock — the dock must step aside to the
44 pt corner mark via `.threadDetail` in `yieldsToPinnedFooter`). `GAP7B-02` is gated on **D5**: ship
the widget with flag-off rendering fixed, or hold the extension. `A3-15` (the tester's four
designer-portal notifications, one deep-linking to `https://app.patina.cloud/help`, a host this app does
not claim) is **D11**'s ruling; if the answer is "keep `tester@patina.cloud` and filter the feed", the
filter becomes a **W1** row in this lane and this lane's count goes to 17.

**W1 exits when:**

1. every lane's review is closed with zero blocking findings, and every ⇧D12 row is closed or carries a
   written "not this wave, because…";
2. `ios-gate.sh all` **and** `ios-gate.sh release` are green on `first-flight/integration`
   (**not `archive` — that is R1 Step 2 on Kody's machine**, see §2's gate checklist and §4);
3. L1-E's copy deck is fully applied, or every unapplied row is named;
4. one walker per surface has walked the review simulator with **flags off**, on the steward's **signed**
   Debug build, against the **local** stack with 00555 applied locally — and the walk's script names
   Room Settings, the Today designer-seat card and the message-thread composer explicitly (the three
   screens `GAP7-06`/`A-108` describe, which no finding id covers);
5. **the production reconciliation walk has run — and it is Kody-supervised, with a write allowlist.**

**On (5).** The audit's brief says plainly *"Do NOT create data on production"*, and this charter's own
global constraints say agents probe read-only. A signed-in walk on production is not read-only: it
writes `profile_presence`, a `match_events` row and possibly a `client_style_profiles` row on any
recommendations view, `saved_items` on any save, a `style_quiz` submission, `rooms` if the walker adds
one, and read-state on `notifications`. So the walk is scoped, not banned:

- **Runs with Kody present**, signed in as the demo account (**D11**), on the review simulator.
- **May write, and only, these tables:** `profile_presence`, `match_events`, `client_style_profiles`,
  `notification_read_state`. Nothing else. It does **not** save a piece, submit a quiz, add a room,
  sign a proposal, send a message or pay an invoice on production — every one of those is proved on the
  local stack instead.
- **Its purpose is reconciliation, not coverage:** sign in, screenshot each root and each Studio detail,
  and compare *what the tester sees* with *what production holds* (the SQL side is read-only and runs in
  parallel). That is the audit's one unmet reconciliation, and it needs no writes beyond the four above.
- **Accounting:** before and after, `select count(*) from public.match_events;` and the same for
  `client_style_profiles`; the delta goes in the walk report. A delta larger than the walk explains is a
  finding.

---

## 4. R1 — Build 1 (day 8–9)

> ### ⚠ KODY-RUN RELEASE
> The archive, the export, the upload and the device pass happen on Kody's machine with his signing
> identity. An agent may run every read-only `asc … list` / `view` afterwards, and drives the device
> **only** with Kody's phone connected and Kody watching. **Never a placeholder in a command** — the
> 2026-08-26 deploy incident is in memory for a reason: paste real values, or do not run it.

The build is cut from `first-flight/integration` **after** Fable has merged W1 to `main`, so the
archive comes from a `main` checkout. Version at cut: `MARKETING_VERSION 1.0`,
`CURRENT_PROJECT_VERSION 3` (ASC already holds build **"2"**, uploaded 2026-05-12 and now expired —
`A2-01`), identical on the `Patina` and `PatinaWidget` targets or the widget trips ITMS-90473.

### Step 1 — Pre-flight (read-only, an agent may run this)

```bash
cd /Users/kody/Code/patina-merged
git log --oneline -1                                  # must be the integrated main tip
grep -n 'CURRENT_PROJECT_VERSION\|MARKETING_VERSION' apps/mobile/Patina/Config/Version.xcconfig
ls supabase/migrations/*.sql | sort | tail -3         # 00555 landed?
~/.blitz/bin/asc builds list --app 6762007888 --paginate    # highest existing build number
~/.blitz/bin/asc testflight review view --app 6762007888    # attributes populated (L0.5)
~/.blitz/bin/asc testflight app-localizations list --app 6762007888   # total 1
```

`CURRENT_PROJECT_VERSION` must be **strictly greater** than every number `builds list` returns.

### Step 2 — Archive · **the first Kody-only gate, and W1 does not wait on it**

W1 exits on `ios-gate.sh release` green. `archive` is here, and only here, because it needs an
authenticated Xcode account, `-allowProvisioningUpdates` network round trips to App Store Connect and a
distribution keychain that can raise a prompt — none of which a steward subagent can satisfy. It is a
checkbox on this runbook, not on the integration gate.

- [ ] `ios-gate.sh archive` exits 0 on Kody's machine with automatic signing

```bash
export IOS_GATE_UDID=973D1724-90BF-4A0A-B02D-481D561547B3   # unused by archive; set for the session
apps/mobile/Patina/scripts/ios-gate.sh archive
```

which is, expanded:

```bash
xcodebuild archive \
  -project /Users/kody/Code/patina-merged/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /Users/kody/Code/patina-merged/apps/mobile/Patina/.build/archives/Patina.xcarchive \
  -allowProvisioningUpdates
```

Then read the archive before exporting it:

```bash
A=/Users/kody/Code/patina-merged/apps/mobile/Patina/.build/archives/Patina.xcarchive
plutil -p "$A/Products/Applications/Patina.app/Info.plist" | grep -E \
  'CFBundleVersion|CFBundleShortVersionString|MinimumOSVersion|UIDeviceFamily|ITSAppUsesNonExemptEncryption'
ls "$A/Products/Applications/Patina.app/PlugIns/"                    # PatinaWidget.appex
plutil -p "$A/Products/Applications/Patina.app/PlugIns/PatinaWidget.appex/Info.plist" | grep CFBundleVersion
find "$A/Products/Applications/Patina.app" -name 'PrivacyInfo.xcprivacy'
# want BOTH of these paths, not just the first — ITMS-91053 is evaluated per binary:
#   …/Patina.app/PrivacyInfo.xcprivacy
#   …/Patina.app/PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy
ls "$A/dSYMs/"                                                        # Patina.app.dSYM + the widget's
```

Expect `CFBundleVersion 3` on **both** plists, `MinimumOSVersion 26.0` (D6), `UIDeviceFamily [1]` (D4),
`ITSAppUsesNonExemptEncryption false`, the appex present, and a `PrivacyInfo.xcprivacy` at **the app
root and inside the appex**.

### Step 3 — Export

Write `apps/mobile/Patina/scripts/ExportOptions.plist` (L0.1 owns this file) exactly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>                          <string>app-store-connect</string>
  <key>destination</key>                     <string>export</string>
  <key>teamID</key>                          <string>VP22LXHT7L</string>
  <key>signingStyle</key>                    <string>automatic</string>
  <key>uploadSymbols</key>                   <true/>
  <key>stripSwiftSymbols</key>               <true/>
  <key>manageAppVersionAndBuildNumber</key>  <false/>
  <key>generateAppStoreInformation</key>     <false/>
</dict>
</plist>
```

`manageAppVersionAndBuildNumber` is **false** on purpose: the build number comes from
`Config/Version.xcconfig` and nothing else is allowed to move it.

```bash
xcodebuild -exportArchive \
  -archivePath /Users/kody/Code/patina-merged/apps/mobile/Patina/.build/archives/Patina.xcarchive \
  -exportOptionsPlist /Users/kody/Code/patina-merged/apps/mobile/Patina/scripts/ExportOptions.plist \
  -exportPath /Users/kody/Code/patina-merged/apps/mobile/Patina/.build/export \
  -allowProvisioningUpdates
```

**The check that only exists here** (G-12, A2-24): the archive was signed with a *development* profile,
so it carries `aps-environment: development` and `get-task-allow = 1`. The export must have re-signed
with an App Store profile and rewritten both.

```bash
E=/Users/kody/Code/patina-merged/apps/mobile/Patina/.build/export
unzip -o -q "$E/Patina.ipa" -d "$E/unzipped"
codesign -d --entitlements :- "$E/unzipped/Payload/Patina.app" 2>/dev/null | \
  grep -E 'aps-environment|get-task-allow|application-identifier|application-groups'
# want: aps-environment = production · NO get-task-allow · VP22LXHT7L.cloud.patina.app
#       · group.cloud.patina.app
codesign -d --entitlements :- "$E/unzipped/Payload/Patina.app/PlugIns/PatinaWidget.appex" 2>/dev/null | \
  grep -E 'application-identifier|application-groups'
# want: VP22LXHT7L.cloud.patina.app.widget · group.cloud.patina.app · no aps-environment
```

If `aps-environment` is still `development`, **stop**: push will register sandbox tokens and the R1
push round trip will silently never arrive. That is the moment to split the Debug/Release entitlements
files (`C9-20`) and re-archive.

### Step 4 — Upload and processing

```bash
~/.blitz/bin/asc publish testflight \
  --app 6762007888 \
  --ipa /Users/kody/Code/patina-merged/apps/mobile/Patina/.build/export/Patina.ipa \
  --wait
```

Then confirm from ASC, not from the CLI's own exit code:

```bash
~/.blitz/bin/asc builds list --app 6762007888 --paginate
# want a NEW row: version "3", processingState VALID, expired false, minOsVersion 26.0,
#                 usesNonExemptEncryption false
```

`processingState` moving to `INVALID` here is where ITMS-91053 (missing privacy manifest, `A2-02`) and
ITMS-90474 (iPad multitasking, `A2-03`) would land. Both are closed in L0.1; if one appears anyway, the
email names the exact code.

### Step 5 — What to Test, and the internal group

Every command here was checked against `asc <cmd> --help` on the installed binary. **There is no
`asc testflight groups add-build` and no `asc testflight submit`** — the first draft of this runbook
invented both, and it carried an angle-bracket placeholder inside a command line, which is the exact
2026-08-26 incident this section warns about. Resolve the build id programmatically; never by hand.

```bash
ASC=~/.blitz/bin/asc
APP=6762007888

# the build id, with no placeholder and no eyeballing
BUILD=$($ASC builds info --app $APP --latest --platform IOS --version 1.0 \
          --exclude-expired --output json | jq -r '.data.id')
echo "$BUILD"    # print it, and sanity-check it against `builds list` before using it

# the group ids, from L0.5's recorded build/waves/r1/asc-ids.md
INTERNAL=$($ASC testflight groups list --app $APP --internal --output json \
            | jq -r '.data[] | select(.attributes.name=="Internal Patina") | .id')

# What to Test — the selector flag is --build-id (or --app + --build-number)
$ASC builds test-notes create --build-id "$BUILD" --locale en-US \
  --whats-new "$(cat artifacts/ios-testflight-polish-2026-09-01/build/waves/r1/what-to-test-build1.md)"

# add the build to a group — this lives under `builds`, not `testflight groups`
$ASC builds add-groups --build-id "$BUILD" --group "$INTERNAL"
```

`Internal Patina` skips Beta App Review entirely, which is the point: the whole chain — install,
sign-in, push, links — is proved on an internal build before Apple ever sees it (`A2-18`). Note that
`builds add-groups` takes `--submit --confirm` to submit for beta review in the same call; **do not**
pass them here. The external submission is Step 7, after the device pass.

### Step 6 — The device pass

**Device:** Kody's iPhone 17 Pro Max. **Toolchain:** `DEVELOPER_DIR=/Applications/Xcode-beta.app`
(the phone is on an iOS 27 seed; the release Xcode cannot drive it). If automation is used, the
WebDriverAgent target must be **15.0**. The iPhone 13 Pro on the network is the alternative LiDAR device
on a release iOS if the beta toolchain fights back. Airplane Mode via automation is **one-way** — turn
it on last, or turn it off by hand.

Install from **TestFlight**, not from Xcode: the point is to test the artifact Apple processed.

Each row below states the claim it proves and the evidence to capture. Evidence goes to
`artifacts/ios-testflight-polish-2026-09-01/shots/r1/` and the ledger to
`build/waves/r1/device-pass.md`.

- [ ] **D-01 Cold launch time.** *Claim:* the app is interactive quickly on real hardware.
      *Evidence:* three cold launches, wall-clock to the first interactive frame, from screen recording
      or timestamped screenshots at 0.5 s intervals. The only figure any gate has ever produced is
      **2.131 s** on a Debug simulator build with no launch arguments — not a Release device number.
      Record the real one.
- [ ] **D-02 Sign in with Apple.** *Claim:* the Apple path works end-to-end and produces a *homeowner*.
      *Evidence:* screenshot of the completed sign-in, plus a read-only SQL check that the new
      `profiles.role` is `'homeowner'` and not `'designer'` (`A3-07`).
- [ ] **D-03 Email code from a real inbox.** *Claim:* the six-digit code arrives and verifies.
      *Evidence:* screenshot of the received mail (redact nothing but the code's neighbours) and of the
      signed-in Today. This also re-verifies the Strata magic-link template's `{{ .Token }}` patch,
      which A3 records as asserted-from-memory and **unverified**.
- [ ] **D-04 The tester/demo credential.** *Claim:* the credential in the beta review notes actually
      works in the app. *Evidence:* `tester@patina.cloud` + `000000` → signed in, screenshot (D7).
- [ ] **D-05 LiDAR scan → upload → server row.** *Claim:* a real room capture reaches the server.
      *Evidence:* screenshots of the walk and the floor plan, **plus** a read-only query showing the
      `room_scans`/`room_scan_*` rows and the artifacts in Storage. A green scan UI with no server row
      is the failure this row exists to catch.
- [ ] **D-06 Camera QR approval with Face ID.** *Claim:* web sign-in approval works on glass.
      *Evidence:* screenshots of the scanner, the Face ID prompt (a system dialog — capture by
      screenshot, it is invisible to the automation tools) and the approved web session.
      `Features/QRAuth/**` carries 2 findings in the whole 629-row set and owned no lane until this
      revision; it is **L1-A**'s now, and a W1 walker opens the scanner on the simulator first, so the
      device pass is not the first time anyone looks at it. QR login is the only route from this app to
      Patina Field, which is why it stays in the R1 gate rather than moving to W2.
- [ ] **D-07 Push round trip.** *Claim:* a push sent by `apns-send` arrives on a TestFlight build.
      *Evidence:* the `device_push_tokens` row with `environment = 'production'`, the `apns-send`
      invocation, the notification on the Lock Screen, and the app landing on the right screen when
      tapped. **Blocked on D9** — `APNS_AUTH_KEY` / `KEY_ID` / `TEAM_ID` / `TOPIC` are edge-function
      env, not Vault, and A3 could not read them; Kody confirms their presence before this row runs.
- [ ] **D-08 Universal link from Mail, signed in.** *Claim:* AASA + `DeepLinkHandler` work on device.
      *Evidence:* tap `https://client.patina.cloud/invoices/<real id>` from Mail; screenshot of the
      invoice. Repeat for `/proposals/`, `/decisions/`, `/piece/`.
- [ ] **D-09 Universal link from Mail, signed out.** *Claim:* the queue survives the sign-in seam.
      *Evidence:* sign out, tap the same link, sign in, and screenshot the destination arriving. This is
      `GAP7B-09`'s device proof; the simulator proof is L1-F's 8-of-8 run.
- [ ] **D-10 The widget on the Home Screen.** *Claim:* the widget renders real rows on glass — the one
      claim the Daily Return's W6 could never make (simulator long-presses die before the gallery
      opens). *Evidence:* the gallery card, the placed widget showing real MOVED rows, and a tap landing
      on the right destination. With `house-widget` OFF, which is the TestFlight first-launch state
      (`GAP7B-02`, D5).
- [ ] **D-11 App Group on device.** *Claim:* app and widget share the container.
      *Evidence:* the placed widget updating after a foreground refresh of the app.
- [ ] **D-12 Apple Pay / invoice payment.** *Claim:* either the payment works, or the failure is the
      world-class one. *Evidence:* if a live Stripe key is on Strata (**D10**), a test payment through
      to a settled invoice; if not, a screenshot of `MoneyFailureCopy` — "We couldn't start this
      payment. Nothing has been charged." — **above the fold** and not under the Companion dock.
      Both rows this claim rests on are **W1**: `B-28` (T0, L1-C) and `GAP2-24` (⇧D12, L1-C).
- [ ] **D-13 Dark mode.** *Claim:* the app is legible in dark on real hardware.
      *Evidence:* Today, a decision (including the consent sheet), and an invoice, in dark.
      The orb must be visible (`C-01`).
- [ ] **D-14 Largest Dynamic Type.** *Claim:* the app is usable at accessibility sizes.
      *Evidence:* the same three screens at the largest accessibility size, with Approve/Cancel and
      Send/Cancel reachable (`GAP1B-01`, `GAP1B-02`) and no headline broken mid-word (`C-06`).
- [ ] **D-15 VoiceOver on the first screen and the decision sheet.** *Claim:* the two surfaces that
      carry consent are navigable. *Evidence:* a recording or a described pass; every control has a name
      and the sheet's buttons are separately focusable.
- [ ] **D-16 Airplane mode.** *Claim:* offline is a designed state, not a lie.
      *Evidence:* every root and Studio detail with the radio off — an error state with a retry, never
      an empty state (`R-01`, `R-02`, `C4-02`). Turn it on **last**.
- [ ] **D-17 Second launch, second account.** *Claim:* nothing of account A survives into account B.
      *Evidence:* sign out, sign in as the other account, and confirm rooms, the taste portrait, the
      navigation stack and the widget snapshot are all account B's. All four sub-claims are **W1** work:
      `B-16` (widget snapshot, L1-F) plus `B-15`, `C2-06`, `GAP3-18` (portrait, navigation stack, room
      list — L1-B, ⇧D12). Before D12 they sat in W2 and this row was scheduled to fail on three of four.
- [ ] **D-18 Delete account.** *Claim:* App Review 5.1.1(v) is genuinely satisfied.
      *Evidence:* run it on a throwaway account; screenshot the confirm and the result; a read-only
      query showing the row is gone or anonymised as `purge_client_account` intends.

Every row is reported at **device-verified**. A row that cannot run (D-07 without D9, D-12 without D10)
is reported as **blocked**, with the decision it waits on — never as passed.

### Step 7 — Beta App Review, then the external group

```bash
EXTERNAL=$($ASC testflight groups list --app $APP --output json \
            | jq -r '.data[] | select(.attributes.name=="MiddleWest Client") | .id')

# submit for beta app review — the subcommand is `testflight review submit`,
# it takes --build-id, and --confirm is required
$ASC testflight review submit --build-id "$BUILD" --confirm

# on approval, add the external group (again: `builds add-groups`)
$ASC builds add-groups --build-id "$BUILD" --group "$EXTERNAL"
```

(The one-call equivalent is `asc builds add-groups --build-id "$BUILD" --group "$EXTERNAL" --submit
--confirm`, which adds and submits together. Two calls are used here so the submission is a deliberate
step after the device pass, not a side effect of adding a group.)

`MiddleWest Client` stays empty until the review passes (`A2-18`). Leah's clients are invited only after
the internal chain is proved and the device pass is clean.

**R1 exits when:** a build with `processingState VALID` is installable from TestFlight, the device-pass
ledger has a line for all eighteen rows, and every row is either passed at device level or explicitly
blocked on a named decision.

---

## 5. W2 and W3

### W2 — Build 2, the first tester week (T1 less the 12 D12 promotions; **349 findings**; days 10–17)

**W2 has a stated capacity, and it is not 349.** Seven days, seven lanes, while R1's device pass, the
beta review and the daily TestFlight/PostHog intake are also running, and any tester-reported blocker
can jump the queue and force a build 3. Per-lane load after D12: **L1-C 114** (83 S · 26 M · 5 L),
L1-B 52, L1-D 51, L1-E 46, L1-A 41, L1-F 24, L2-G 6, L0.1 9, L0.2 3, L0.3 2, L0.4 1. A hundred and
fourteen findings in one lane in one week, with its own tests, review, fix rounds and walk, is not a
plan.

So W2 is scoped, in this order, and the wave does **not** extend to finish the list:

1. **Every major.** All **121** of them. A major is a thing a tester will notice and mention.
2. **Minors that sit in a file a major already touches.** Free, once the file is open, and they are the
   bulk of the small stuff.
3. **Everything else — the remaining minors and all 40 polish rows — rolls into W3's backlog** at the
   end of day 17, unextended. W3 is already the standing backlog; it absorbs this without a decision.
4. **Tester-reported defects outrank all three.** A `TF-NN` blocker forces a build 3 and displaces
   whatever it displaces.

**L1-C splits into two sub-lanes with separate clones and separate worktrees**, because 114 in one lane
is the whole problem in miniature:

- **L1-C1 — Companion, inset and chrome.** The `CompanionHearthMetrics` family, sheets, coach marks,
  navigation chrome, `Features/Companion/**`, `Features/Help/**`, `Features/Navigation/**`,
  `Features/ProductDetail/**`.
- **L1-C2 — Dynamic Type, tap targets and accessibility layout.** `Features/Decisions/**`,
  `Features/Home/**`, `Features/Settings/**`, `Features/Profile/Views/**`, `Design/**`.

The two split the file set, not the concern; `build/waves/w2/lane-split.md` records which id went where
and is written before either starts. C1 merges before C2.

Same in-app lanes otherwise, same owned file sets, same workflow. Three things change.

1. **A seventh lane opens: L2-G Tests & gates.** The UI tier is dead — seven of eleven `PatinaUITests`
   fail against a first-run spec (`docs/specs/_active/mobile-first-launch.md`: Threshold → Walk
   Invitation → Camera Permission → Walk → Emergence) that the app left behind, waiting on
   `otherElements["threshold.enterButton"]`, an identifier with **zero hits** in 92k LOC. The four that
   pass are unmodified Xcode template stubs. `git log` on the suite returns exactly one commit — the
   initial monorepo import. L2-G rewrites `PatinaUITests` against the **real** first-run path so the UI
   tier asserts the product; tunes or fixes `identifier_name` (396 of the 421 lint errors, all
   snake_case DTO properties mirroring Postgres column names, which is what makes `swiftlint lint`
   structurally unable to exit 0 — G-11); triages the **1330** Swift 6 language-mode warnings into a
   backlog with an owner per cluster (explicitly *not* a round-one fix); and **measures** the whole-module
   Release compile, then folds `release` into `ios-gate.sh all` if the number justifies it. L0.1 adds
   `release` as its own tier and wires it into every gate block explicitly (§2, and L0.1's section);
   it does **not** put it in `all`, because `all` runs on every fix round in six concurrent lanes and the
   cost of a 92k-LOC whole-module optimised compile on this project has never been measured. L2-G
   measures it and rules. (`G-02` is satisfied either way: a gate that builds Release exists, and the
   integration gate runs it.)
2. **A tester-feedback intake runs daily.** TestFlight feedback and PostHog error tracking are read
   every morning; every tester-reported defect becomes a W2 finding with its own id (`TF-NN`), placed
   into a lane by the same rule the collator used (assignment note 5: *the concern decides the lane, the
   folder is the tiebreaker*). A tester-reported blocker jumps the queue and can force a build 3.
3. **D4 re-scopes the GAP5 set before scheduling.** Thirteen GAP5 findings are iPad/landscape geometry.
   If D4 lands (drop the iPad family), eleven of them are moot — they carry `alsoTouches: L0.1` for
   exactly this reason. `GAP5-05` is a reconciliation, not a defect: it **refutes** `A2-11`'s premise
   (`UIStatusBarHidden` is inert on both idioms), and is filed to L0.1 alongside `C9-07`, which says the
   same thing. `GAP5-17` is a room-count mismatch, not geometry, and stays.

**W2 totals: 349 — 0 blockers, 121 majors, 188 minors, 40 polish.** T1's four blockers are no longer
here: `GAP4-02`, `GAP4-03`, `GAP4-25` (the scan fallback's dead end, its developer default dimensions,
and the "Rescan" that strands until force-quit) and `GAP4-16` (the Reveal's only CTA invisible in light
mode) are all **W1** under **D12**, marked ⇧D12 in L1-B's and L1-C's tables and **struck from the tables
below rather than scheduled twice**. Eight T1 majors moved with them for the same reason —
`GAP1B-03/07/08`, `C-23`, `GAP2-24` to L1-C and `B-15`, `C2-06`, `GAP3-18` to L1-B. W2 opens with no
blocker of its own; the first one it gets will come from a tester.

#### W2 · L0.1 Build & configuration — 9

_count: 9 · blocker 0 · major 0 · minor 9 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-01` | T1/minor | S | The launch screen is plain white with the status bar hidden; the app is cream with one | Patina.xcodeproj/project.pbxproj:690-691; shots/A/01-cold-t1.png | Ship a LaunchScreen storyboard using the brand background colour (and, ideally, the wordmark) so the launch image and the splash… |
| `A-102` | T1/minor | S | Settings shows no app version or build number, and no feedback entry | Settings, end of list; shots/A/55-settings-scroll.png | Add a footer with CFBundleShortVersionString (CFBundleVersion) and the GitCommit sha, plus a "Send feedback" row that prefills th… |
| `A2-08` | T1/minor | S | GitCommit.swift is gitignored but compiled, and its directory is not a sandbox-declared output — clean-checko… | project.pbxproj "Stamp Git SHA" phase CBE19A312F1D5E34007686CD (:411-429); .gitignore:57; Pati… | Either commit a GitCommit.swift with sha = "" (remove .gitignore:57) and let the Debug-only phase overwrite it, or emit into $(DE… |
| `A2-09` | T1/minor | S | Secrets.swift is gitignored and its example twin is excluded from the target — a clean checkout does not comp… | .gitignore:53; project.pbxproj membershipExceptions = (App/Configuration/Secrets.example.swift… | Keep the key out of git but make the symbol always exist: include a fallback Secrets declaration in the target, or generate Secre… |
| `C7-33` | T1/minor | S | DeploymentTarget is read from the whole UserDefaults search list, not just the argument domain | apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift:25-33 | Read the argument domain explicitly and compile the .local branch out of Release. |
| `C9-07` | T1/minor | S | INFOPLIST_KEY_UIStatusBarHidden = YES is inert; one screen hides the bar anyway | project.pbxproj:691,739; Features/Home/Views/DailyStoryDetailView.swift:51 | Drop INFOPLIST_KEY_UIStatusBarHidden (the app clearly wants the status bar) and decide whether the story-detail hide is intention… |
| `C9-20` | T1/minor | S | aps-environment is `development` in the single shared entitlements file used for Release | apps/mobile/Patina/Patina/Patina.entitlements:6-7 | Confirm what Xcode's distribution export actually writes; if it does not rewrite the value, split Debug/Release entitlements file… |
| `G-07` | T1/minor | S | Permission strings are split-brained: build settings silently override the tracked Info.plist, and the shippe… | apps/mobile/Patina/Patina/Info.plist vs the INFOPLIST_KEY_NS*UsageDescription build settings (… | Pick one source of truth — the build settings already win — delete the shadowed keys from Patina/Info.plist, and rewrite the came… |
| `GAP5-05` | T1/minor | S | RECONCILIATION: UIStatusBarHidden = true is inert on BOTH idioms — A2-11's premise is wrong | shots/GAP5/07-ipad-statusbar-crop.png (iPad) vs 06-phone-statusbar-crop.png (top 160 px of the… | Delete INFOPLIST_KEY_UIStatusBarHidden from both targets; keep the one per-view call. It redirects A2-11: there is nothing to un-… |

#### W2 · L0.2 Production backend — 3

_count: 3 · blocker 0 · major 1 · minor 2 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-14` ⇢L1-B | T1/major | S | fulfillment_orders / _order_items / _shipments have no client SELECT policy — a tester's real order shows not… | pg_policies for the three fulfillment_* tables | Ships with A3-03 (apply 00540). Until then order tracking silently renders empty for a real order — worse than an error. |
| `A3-10` ⇢L1-B | T1/minor | S | client_designer_roster view does not exist on Strata — the app's designer-of-record read 404s | Core/Network/RosterAPIClient.swift:40; GET /rest/v1/client_designer_roster | Ships with A3-03 (apply 00536). Until then the roster call should read as 'no designer yet' rather than an error. |
| `A3-19` | T1/minor | S | vendors is anon-readable including internal trade notes | GET /rest/v1/vendors?select=* with the shipped anon key | Narrow the anon SELECT policy to the three columns the embed needs, or move the embed behind a SECURITY DEFINER view that project… |

#### W2 · L0.3 The room is not empty — 2

_count: 2 · blocker 0 · major 0 · minor 1 · polish 1_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A3-25` | T1/minor | M | The 14 non-catalog products are dev captures with placeholder names, hot-linked to third-party retail CDNs | public.products where layer='personal' | Clean or delete before promoting anything to catalog. Mirror images into the product-images bucket (public, already provisioned)… |
| `GAP8-12` ⇢L1-E | T1/polish | S | "4 MIN READ" over a 489-character story | Core/Models/DailyStory.swift:30; supabase/migrations/00143_editorial_stories.sql:151 | Derive read_minutes from the body, or drop the claim until the stories are real. |

#### W2 · L0.4 Help & tour content — 1

_count: 1 · blocker 0 · major 1 · minor 0 · polish 0_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `GAP8-05` ⇢L1-C | T1/major | S | The first sentence the app says on production is false, and it comes from Sanity | Sanity kv3qrinl/production helpContent _id cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54 (surfaceKey io… | Publish artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md to Sanity before the TestFlight round; it is written and… |

#### W2 · L1-A Welcome, sign-in, onboarding — 41

_count: 41 · blocker 0 · major 18 · minor 21 · polish 2_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-14` | T1/major | S | The quiz uses two different advance models across five questions | Style quiz Q1–Q3; shots/A/05,06,07,08,09 | Pick one model (select → Continue) for every question, and show the selection before advancing. |
| `A-25` | T1/major | S | The style-quiz result is a name that was never offered and collides with two of the options | Style reveal; shots/A/05-quiz-q1.png, 13-quiz-result-t1.png | Either name the portraits from a vocabulary disjoint from the option labels, or echo the chosen option in the reveal ("Warm Minim… |
| `A-58` | T1/major | M | A guest has no settings, no help centre, no notifications and no home until the second launch | Whole guest walk; shots/A/02–24 vs 25–29 | Land the guest on the home after the reveal, with the recommendations as one module on it; run the tour on that first arrival. |
| `C1-08` | T1/major | S | Auth fields declare no textContentType: no Passwords autofill, no keychain save, no keyboard flow | Features/Authentication/Views/AuthenticationView.swift:654-707 (AuthTextField), call sites :18… | Add .textContentType per field, a @FocusState chain and .submitLabel(.next/.go). |
| `C1-10` | T1/major | M | The guest→account claim sheet can be requested while another sheet owns the screen, then never presents — and… | Features/Companion/Views/CompanionOverlay.swift:557-563,565-597; Services/Auth/AuthService.swi… | Add `initial: true` to the onChange and hoist the claim onto ContentView so it does not depend on which sheet is mid-animation. |
| `C1-11` | T1/major | S | The emailed link and the typed code give two different first runs — the link skips onboarding entirely | App/DeepLinking/DeepLinkHandler.swift:131-150 (AppSettings.shared.hasCompletedOnboarding = tru… | Set the flag only when the account is not new (gate on an existing StylePreferenceModel / profiles.created_at), or drop it. |
| `C1-12` | T1/major | M | Nothing in the app can set or edit your name, and the one writer writes where the app does not read | Services/Auth/AuthService.swift:388-396; Services/Auth/ProfileService.swift:189-191; Features/… | An editable name row in Account writing both profiles.display_name and user metadata; ask for a name once in onboarding. |
| `C1-15` | T1/major | S | Delete account runs a 30-second network call with no in-flight state | Features/Account/AccountView.swift:86-105,188-204; Features/Settings/Views/SettingsView.swift:… | Read isDeletingAccount — disable the row and swap the label for a ProgressView. |
| `C4-22` | T1/major | S | Magic-link failures land as GoTrue's own sentence on the welcome screen, with no "send me a new code" | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:131-149; Services/Auth/AuthSer… | Detect the failure, route into AuthenticationView(initialMode: .magicLink) pre-filled, and say "That link has expired — we'll sen… |
| `C6-04` | T1/major | S | Auth error and success banners are never announced and use raw system red/green | Features/Authentication/Views/AuthScreenView.swift:65-72; AuthenticationView.swift:147-170 and… | Post an announcement (or move AX focus) when the banner appears, and swap to PatinaColors.error / a darkened success token. |
| `GAP1-10` | T1/major | M | OAuth consent alert exposes the raw Supabase project ref to the user | 'Continue with Google' on the auth home; shots/GAP1/28-oauth-supabase-host.png | Configure a Supabase custom auth domain (e.g. auth.patina.cloud) and point the OAuth callback at it, so ASWebAuthenticationSessio… |
| `GAP1-11` | T1/major | S | Three different icon systems in three adjacent auth buttons, one a colour emoji | Auth home; shots/GAP1/16-decision-rug-overdue.png, 20-coldlink-decision.png, 29-home-ready.png… | SF Symbol 'envelope' tinted to the palette for email; the official Google G asset (or a neutral text-only treatment) for Google. |
| `GAP1B-09` ⇢L1-C | T1/major | S | The Sign In email and password fields have no accessibility label | Sign In sheet (Features/Authentication) — idb ui describe-all returns two TextField nodes (y=3… | Add .accessibilityLabel("Email") / "Password" (or a real label: on PatinaTextField). |
| `GAP3-15` | T1/major | S | The mid-flow sign-in wall's body is the app's first-launch marketing hero | AuthSheet presented from DesignRequestFlowView.swift:92-97 · shots/GAP3/26-auth-wall.png | Give AuthSheet a compact in-context variant: drop the wordmark hero and the "Welcome home / Start with a piece you love" pair whe… |
| `GAP3-17` | T1/major | S | Signing out lands the user in a modal Sign In sheet | SettingsView.SignOutButton flow · shots/GAP3/20-after-signout.png, 21-signed-out.png | Return to the Welcome screen (or the guest home) after a deliberate sign-out; keep the sign-in sheet for session-expiry. |
| `GAP4-09` | T1/major | M | The second style quiz has NO progress indicator, and its whispers misstate the progress | StyleConversationContainerView.swift:47-52 + ConversationHeaderView whisperTop; shots/GAP4/16,… | Reuse the onboarding quiz's footer component verbatim so both quizzes share one progress vocabulary; rewrite the three inaccurate… |
| `GAP4-31` | T1/major | L | The two quizzes produce two different names for the same person's taste, and the second silently overwrites t… | grep -rn "StyleProfileStore.shared" — the only writers are StyleConversationViewModel.swift:22… | One taste model, one name for it, one quiz — have the scan flow reuse the onboarding portrait instead of running a second questio… |
| `GAP8-07` | T1/major | S | The Studio header greets a production tester by their email local part; Apple's captured name is never read | Features/Profile/ViewModels/ProfileViewModel.swift:16-47; Services/Auth/ProfileService.swift:1… | Pass display_name in the OTP/sign-up metadata; in captureAppleName write to profiles (or re-fetch the profile) rather than only t… |
| `A-26` | T1/minor | S | An unlabelled 55 %-filled meter sits in the style reveal and is invisible to VoiceOver | Style reveal; shots/A/13-quiz-result-t1.png | Either label it ("Confidence: 55%") with an accessibilityValue, or remove it. |
| `C1-09` | T1/minor | S | 85 lines of the email flow — including the only 'Enter code instead' button — are unreachable | Features/Authentication/Views/AuthenticationView.swift:176-181 (branch), :222-300 (magicLinkSe… | Delete the branch, the view and the view-model method. |
| `C1-40` | T1/minor | S | The sign-up confirmation link opens the website; the resend's opens the app | Services/Auth/AuthService.swift:441-445 (no redirectTo) vs :514-518 (emailRedirectTo: patina:/… | Pass redirectTo on signUp too and make the panel copy match. |
| `C3-23` | T1/minor | S | presentationCornerRadius(24) is set on 2 of 18 sheets, under a comment claiming it is on all of them | ContentView.swift:124-131 (the two that set it, with `// PT-5-11: every detent sheet sets the… | One patinaSheet() modifier carrying detents, corner radius, grabber policy and background. |
| `C3-26` | T1/minor | S | The auth flow uses vivid system .green/.red where the palette ships designed success/error tokens | Features/Authentication/Views/AuthenticationView.swift:150,153,157 (success banner), :165,167… | Swap to PatinaColors.success / PatinaColors.error and their washes; replace .tint(.white) with a token. |
| `C5-07` | T1/minor | S | Email sign-in promises a 'code', delivers a 'magic link', and tells an iPhone user to 'Click' it | apps/mobile/Patina/Patina/Features/Authentication/Views/AuthenticationView.swift:136 vs :230-2… | One noun ('sign-in code', what verifyOTP consumes), one verb ('Tap'), and a sent-state that describes what GoTrue actually delive… |
| `C5-13` ⇢L1-E | T1/minor | S | The shipped camera permission string never mentions QR sign-in, though the QR scanner triggers it | Patina.xcodeproj/project.pbxproj:683 (Debug) / :731 (Release) INFOPLIST_KEY_NSCameraUsageDescr… | One voice: 'Patina uses your camera to scan a QR code when you sign in on the web, and to capture the shape of your rooms.' Drop… |
| `C5-18` | T1/minor | S | 'Welcome home' greets a first-ever install; the subtitle promises what the primary buttons don't do | apps/mobile/Patina/Patina/Features/Authentication/Views/AuthScreenView.swift:53,58 (and :112 f… | A first-visit line, and either promote 'Look around first' or change the subtitle to describe signing in. |
| `C5-19` | T1/minor | S | Onboarding page 2's title promises AR ('See it in your space') while its body describes a scan — and AR never… | apps/mobile/Patina/Patina/Features/Onboarding/Views/OnboardingFlowView.swift:35-38 | Retitle to what the page is about ('Capture the room' / 'Two ways to add a room'). |
| `C6-02` | T1/minor | M | Authentication — the first screen — has zero accessibility labels, traits or hidden marks | Features/Authentication/Views/{AuthenticationView.swift (713 lines), AuthScreenView.swift (185… | Label the welcome and form controls, tag the h3 headings .isHeader, hide the decorative leading icons, and group the magic-link/O… |
| `C6-32` | T1/minor | S | Onboarding hides real copy along with the illustration | Features/Onboarding/Views/OnboardingFlowView.swift:121-137 | Move the two captions out of the hidden illustration, or expose them via the page's accessibility label. |
| `C9-12` | T1/minor | S | Onboarding page 2's illustration is 280 pt tall inside a 190 pt band at accessibility sizes | Features/Onboarding/Views/OnboardingFlowView.swift:255-265 vs :129-135 | Scale the illustration to its band (.scaledToFit() inside the framed ZStack, or make the shapes relative to the passed viewportHe… |
| `GAP1-15` | T1/minor | S | 'Sign in with Apple' label does not scale with Dynamic Type | Sign In sheet at content_size accessibility-extra-large; shots/GAP1/33-axxl-state.png | Let the Apple button's label participate in Dynamic Type, or size the button from the same scaled metric as its neighbours. |
| `GAP3-25` | T1/minor | S | A guest has no in-app door to email/password sign-in | StudioHub guest card ("Open settings"), SettingsView ACCOUNT section, AccountView · shots/GAP3… | Add a "Sign in" row to Settings ACCOUNT (and to the guest AccountView) that presents AuthSheet; make DailyRoomView.SignInLine a b… |
| `GAP3-28` | T1/minor | S | A new account's display name is its raw email local-part | ProfileView header, from the auth profile · shots/GAP3/44-new-user-studio.png | Ask for a first name during onboarding, or fall back to "You" rather than the email local-part. |
| `GAP4-11` | T1/minor | S | The taxonomy and typography differ between the two quizzes that ask the same question | StyleConversationContainerView.swift:96-104 (headers) vs OnboardingFlowView quiz; shots/GAP4/0… | One option vocabulary and one range glyph across every style surface. |
| `GAP4-14` | T1/minor | S | The "choose up to three" cap is enforced silently; the fourth tap does nothing at all | MaterialConnectionView selection cap; shots/GAP4/21-conv-q3-fourth-tap.png | Dim the remaining tiles once the cap is reached, or show "3 of 3 chosen" beside "Choose up to three". |
| `GAP4-17` | T1/minor | S | The Reveal's designed secondary action is dead code; the CTA's own override never existed | RevealView.swift:14, 57, 69-75; QuietConversationFlowHost.swift:259-264 | Either render the secondary action or delete the parameter, the event and the misleading comment. |
| `GAP4-33` | T1/minor | M | "Retake Style Quiz" opens a THIRD style-question surface, with the onboarding taxonomy | ProfileView.swift:154-156 (navigate to .styleQuiz) → ContentView.swift:324 (StyleQuizView); sh… | Collapse the three surfaces into one quiz component with one taxonomy and one result store. |
| `P-03` | T1/minor | S | Terms and Privacy leave the app into full Safari and land on a cookie-consent banner | auth.welcome.termsLink; shots/P/02-terms-link.png, 03-terms-safari-cookiebanner.png | SFSafariViewController (or a native reader) plus an app-scoped legal route with no site chrome and no cookie banner. |
| `P-27` | T1/minor | S | "Sign in with Apple" is offered three times across the auth surface and outweighs each sheet's own primary ac… | shots/P/01-welcome-cold.png, 19-email-form.png, 31-password-sheet.png | Drop the Apple button from the sub-sheets, or demote it. |
| `C1-29` | T1/polish | S | Features/FirstLaunch's coordinator, state machine and metrics are dead code | Features/FirstLaunch/Coordinators/FirstLaunchCoordinator.swift; Models/FirstLaunchState.swift;… | Delete the three files; keep CameraPermissionView and OnboardingFunnel, which the host does use. |
| `GAP3-26` | T1/polish | S | The style quiz states progress three ways in one card | style-quiz progress card · shots/GAP3/37-after-skip.png, 38-quiz-done.png, 39-quiz-q3.png | Keep the bar plus one label; drop the other two. |

#### W2 · L1-B Data, persistence, resilience — 52

_count: 52 · blocker 0 · major 23 · minor 24 · polish 5_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-65` | T1/major | M | Nothing the guest just did appears on the home | Guest Daily Room home; shots/A/27-guest-home.png | Add a "Your portrait" module and a "Picked for you" rail to the home, seeded from the quiz. |
| `B-11` | T1/major | S | The first-launch tour re-runs on every auth transition, and its step count changes | Today after sign-in / account switch / sign-out — shots/B/14 ('Step 1 of 2'), 66 ('Step 1 of 3… | Persist tour completion per install (not per session/auth state) and make the step count deterministic. |
| `C1-13` | T1/major | L | A guest's saves, rooms and quiz never reach the account, by construction | Core/Models/SavedItem.swift:125-139; Features/Rooms/RoomSyncCoordinator.swift:54-66; Core/Pers… | On the claim's 'Keep them', enqueue: POST each local TableItemModel to saved_items, POST each remoteId==nil room, and re-POST the… |
| `C4-02` | T1/major | M | No app-wide connectivity awareness — only the scan lane knows the network is gone | apps/mobile/Patina/Patina/Services/Sync/ScanSyncQueue.swift:25,78 | One @Observable Connectivity over NWPathMonitor in Core/State; an offline variant of PatinaErrorState ("You're offline. We'll try… |
| `C7-04` | T1/major | L | ARSession didUpdate retains the ARFrame in an escaping Task and runs the whole capture pipeline on the main a… | apps/mobile/Patina/Patina/Features/Walk/Services/RoomCaptureService.swift:868-901 | Extract pose/timestamp synchronously inside the delegate, hand Sendable values to a dedicated actor, never let the ARFrame escape. |
| `C7-06` | T1/major | M | Launch housekeeping does recursive disk enumeration and multi-hundred-MB directory deletes on the main actor | PatinaApp.swift:112-123; Core/Persistence/ScanDiskBudget.swift:19,110-183; Core/Persistence/Sc… | Make the file passes nonisolated/actor-isolated, return plain values, and touch the ModelContext on the main actor only for mutat… |
| `C7-08` | T1/major | M | Every PostgREST client silently downgrades to anon when the token is missing; RLS then returns [] and the scr… | RoomsAPIClient.swift:211-220 and 204-209; NotificationsAPIClient.swift:43-54; DecisionsAPIClie… | Make the token non-optional for owner-scoped reads: throw .notAuthenticated when absent so the UI can say 'we couldn't reach your… |
| `C7-10` | T1/major | S | Non-LiDAR iPhone: 'Scan with camera' is offered unconditionally and silently becomes a typing form; the unsup… | Features/Rooms/Views/NewRoomSheet.swift:28-37; Features/RoomScan/Views/QuietConversationFlowHo… | Gate the tile on RoomCaptureService.isSupported, or relabel it and explain the device limit when false. |
| `C7-14` | T1/major | S | Launch resume fans out up to 10 unstructured upload tasks (20 concurrent artifact uploads); the in-flight gua… | apps/mobile/Patina/Patina/Services/Sync/RoomScanSyncService+AdvancedBundle.swift:334-340 (the… | Add the Set<UUID> in-flight guard the comment promises and serialise the resume loop. |
| `C7-28` | T1/major | M | The persistent scan queue gives up after three tries, with no backoff and no way for the tester to know or re… | Services/Sync/SyncQueueItem.swift:103-105; Services/Sync/RoomScanSyncService.swift:362-378 | Exponential backoff, a higher cap, and a surfaced 'this scan hasn't been sent' state with a retry. |
| `C9-06` | T1/major | M | Scan and AR are gated to LiDAR-only iPhones; AR is gated more strictly than ARKit needs | Features/RoomScan/Views/QuietConversationFlowHost.swift:151-158; Features/Walk/Services/RoomCa… | Relax supportsAR to ARWorldTrackingConfiguration.isSupported and keep .mesh as the optional upgrade the manager already treats it… |
| `GAP4-01` | T1/major | S | "Scan it" silently becomes a typing form, with no word of explanation | QuietConversationFlowHost.swift:145-152 (bootstrap: RoomCaptureService.isSupported → .fallback… | Tell the truth before the fallback: relabel/disable "Scan it" when isSupported is false, or open the fallback with an honest open… |
| `GAP4-26` | T1/major | M | The second room silently skips the whole "Style Discovery" the button just promised | QuietConversationFlowHost.swift:255-262 (ProfileSkipBridge); shots/GAP4/34-fallback-pass2.png,… | Label the button by what will happen (currentProfile == nil ? "Continue to Style Discovery" : "See your floor plan") and surface… |
| `GAP6-11` | T1/major | M | One piece carries three different match scores on three screens | shots/GAP6/26-browse-pieces.png (73%), 31-product-detail.png (50%), 50-browse-axxl.png (76%) | One resolver for the score, computed once per (piece, room-context) and passed down. |
| `GAP6-15` | T1/major | S | The product bar's 'Saved ✓' button silently un-saves on the next tap | shots/GAP6/31-product-detail.png, 32-detail-saved-tapped.png · Purchase/PurchaseActionBar.swif… | Label the act, not the state ('Add to room' / 'Remove from room'), and confirm or offer undo on removal. |
| `GAP6-21` | T1/major | M | The same piece shows a different maker on the room screen than on Browse and its detail | shots/GAP6/37-room-with-item.png, 38-item-action-menu.png vs 26-browse-pieces.png, 31-product-… | Carry the maker from the product record into SavedItem instead of re-deriving it. |
| `GAP6-28` | T1/major | S | Moving a piece to another room is silent and irreversible | shots/GAP6/39-move-to-another-room.png, 40-after-move.png | Confirmation line naming the destination with an Undo, or animate the row out and show the destination. |
| `GAP6-29` | T1/major | M | The Saved list keeps the old room after a piece is moved | shots/GAP6/41-saved-list.png vs 40-after-move.png | Update the saved_items room mirror inside the move, or derive the Saved footer's room from the item's current room. |
| `GAP8-02` ⇢L0.2 | T1/major | M | The Record — Today's headline block — never mounts for any first-round tester | Features/Home/Models/HouseRecord.swift:271-284,535-548,186; Features/Home/Models/TodayExperien… | Design what the Record says at discovering with an empty house — today it says nothing at all, which is the one option the compos… |
| `GAP8-03` ⇢L0.2 | T1/major | M | NEW THIS WEEK can never render on production — published_at is not on the wire | Features/Home/Views/NewThisWeekRail.swift:24-37; Core/Models/ProductModel.swift:41,68,108; sup… | Apply 00533–00540 to Strata; they are the iOS server contract. Until then no catalogue content can revive the rail. |
| `GAP8-04` ⇢L0.2 | T1/major | M | Even with a catalogue, every product surface stays empty until 00533 or vendor rows land | Core/Network/ProductAPIClient.swift:75-92; Core/Models/ProductModel.swift:222-233; 00246:278 | Ship 00533 so brand reaches the client, or make vendor attachment a publish gate; and move the withheld-count log out of #if DEBU… |
| `R-04` | T1/major | M | After the backend returns, Today settles into a self-contradictory state and stays there | Today; shots/R/19b-unpause-t45-notouch.png + describe_screen | Do not stamp the visit / rebuild the record from a partially failed refresh; treat a refresh with any failed leg as aborted and k… |
| `R-09` | T1/major | M | Four failure surfaces disagree on how long to wait, what to draw and what to say | Today / Browse / Studio / Proposal; §1l of research/R.md | One shared network policy: a single timeout (≈10-12 s) applied to every client including the Supabase paths, and one PatinaErrorS… |
| `A-02` | T1/minor | S | The splash wordmark never reaches full opacity before the splash is dismissed | SplashView.swift:44 vs AppCoordinator.swift:81; shots/A/01-cold-t2.png vs 01-cold-t12.png | Shorten the wordmark fade to ~0.8 s (or raise the gate) so the mark is fully drawn before the cross-fade begins. |
| `A1-07` | T1/minor | S | A whole navigation-intent layer has no call sites (handleIntent / IntentDetector / startRoomScanFlow) | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:578, :663, :679, :691; Feature… | Delete it, or wire the Companion chat rail it was written for. Worth doing early: it makes route-door greps lie — .yourSpaces and… |
| `A2-17` ⇢L0.6 | T1/minor | S | AppTrackingTransparency is linked but never requested; the opt-out branch is unreachable | Patina/Services/Analytics/PostHogService.swift:11, 70-76 | Delete the import and the block. Declare NSPrivacyTracking=false in the new privacy manifest (A2-02) and answer the ASC nutrition… |
| `A2-25` ⇢L0.6 | T1/minor | S | Supabase SDK diagnostics are Debug-only, so the most likely TestFlight failure is invisible in Release | Patina/Core/Network/SupabaseClient.swift:48-52 | Keep the logger in Release but route it through PatinaLog at .error only (no session or request bodies), or capture failures as P… |
| `A4-10` | T1/minor | S | A4-10: "Start fresh" leaves the guest's taste portrait behind | apps/mobile/Patina/Patina/Core/Persistence/LocalStoreReset.swift:83-105 (vs :52) | Call StyleProfileStore.shared.reset() from wipeGuestWork as well. |
| `C-51` | T1/minor | S | Two empty states stacked on the room detail | shots/C/10-dark-room.png | Suppress the stat card when the count is zero, and align the "saved" / "chosen" vocabulary. |
| `C1-23` | T1/minor | S | Session expiry ejects to the welcome screen with no explanation | supabase-swift Sources/Auth/Internal/APIClient.swift:117-123 (sessionCleanupErrorCodes → remov… | Set a one-line notice ('You were signed out — sign in to pick up where you left off') when the .auth arrival carries a pendingRet… |
| `C1-27` | T1/minor | S | The quiz RPC's HTTP status is ignored, so a rejection is parsed as a profile | Core/Network/ProductAPIClient.swift:214-215 vs fetchRecommendations at :60-66 | The same status guard fetchRecommendations already has. |
| `C4-11` | T1/minor | S | Scan review save banner interpolates the thrown error into Patina copy | apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanReviewView.swift:702 | Drop the interpolation; log the raw error. |
| `C4-18` | T1/minor | S | Dead state code: three loading/error states are written and never rendered (one of them costs a network round… | apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:87,92,277-315; Fea… | Either wire feedError to a retry row on Today or drop the feed fetch; delete the unreachable ProgressView; surface or delete the… |
| `C7-19` | T1/minor | S | The .launching phase has no watchdog — if the auth stream never emits, the splash plays forever | AppCoordinator.swift:254-266 (derivePhase), :146-165 (one-shot deadline tick); AuthService.swi… | After N seconds without readiness, fall through to .auth with a 'couldn't reach your account' affordance. |
| `C7-25` | T1/minor | S | Force-unwrapped string-interpolated URL with an interpolated piece id, plus a request built and never sent | apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:125-135 | Delete the dead request; build the second with URLComponents/URLQueryItem as fetchProducts(ids:) already does on the next functio… |
| `C7-34` | T1/minor | S | The scan flow identifies its session by identifierForVendor or the literal string 'anonymous', not the signed… | Features/RoomScan/Views/QuietConversationFlowHost.swift:161-166; consumed at Features/RoomScan… | Read AuthService.shared.currentUserId here. |
| `GAP1B-19` | T1/minor | S | Raw PostgREST error text is logged from SettingsService on every launch | SettingsService (Services/Settings) — research/GAP1-crash-02.log | Use .maybeSingle() and treat the empty row as the expected first-run state. |
| `GAP2-14` | T1/minor | M | "ACROSS YOUR PROJECTS" shows one of the tester's three projects with no line for the other two | Budget — shots/GAP2/48-budget.png vs 42-projects-list.png; BudgetViewModel.swift:63-66 | Retitle the header ("Projects with billing") or render a "Nothing billed yet" row for every project. |
| `GAP3-29` | T1/minor | S | Studio group header counts disagree with their own empty copy | StudioHub group rows · shots/GAP3/45-new-user-studio-scrolled.png | Derive the group count from the same source as the body copy, or hide the count when the group is empty. |
| `GAP4-24` | T1/minor | S | The new room is named "Living Room" with no disambiguation from the "Living Room" already in the house | FallbackRoomDraft naming via QuietConversationFlowHost.swift:395-420 (persistFallbackRoom); sh… | Offer a name field (pre-filled with the type), or auto-suffix on collision. |
| `GAP4-32` | T1/minor | S | After the taste reset the profile still shows a portrait-shaped badge, "✦ Style Explorer" | ProfileView / StudioHubView taste pill; shots/GAP4/54-after-exit-quiz.png vs 48-studio.png | Make the empty state invite the quiz ("Take the style quiz →") instead of inventing a name. |
| `GAP5-17` | T1/minor | M | Today shows three rooms; Your Spaces, the profile stat and the Companion all say two | shots/GAP5/17-today-clean.png vs 20-your-spaces.png vs 21-profile.png vs 19b-companion-crop.png | Decide whether Today's YOUR HOUSE includes designer-project rooms that Your Spaces excludes and label the difference, else use on… |
| `GAP6-24` | T1/minor | S | The item menu offers 'View in AR' on every piece; the detail screen gates the same act | shots/GAP6/38-item-action-menu.png · Features/Rooms/Views/ItemActionMenu.swift:30 · Features/P… | Gate the row on the same predicate, and say why when AR is unavailable rather than dead-ending. |
| `GAP6-26` | T1/minor | S | Move/Copy re-asks the question the previous sheet already answered | shots/GAP6/38-item-action-menu.png, 39-move-to-another-room.png | Carry the chosen verb through and title the sheet 'Move to…' / 'Copy to…', or collapse the two menu rows into one that opens this… |
| `R-19` | T1/minor | S | Two E-level SettingsService errors are logged on every launch against a healthy backend | App log 2026-09-01 17:21:38.901 and .907 | Use `.maybeSingle()` (or treat zero rows as a normal empty result) and log at debug, not error, when the row legitimately does no… |
| `R-20` | T1/minor | S | Today's error line is laid out as two loose links rather than a message with an action | Today foot; shots/R/17b-cold-t22.png, 18-cold-today-bottom.png | Reuse PatinaErrorState (or a compact inline variant of it) so all four error surfaces share one composition. |
| `R-22` | T1/minor | S | No way to cancel a long wait, and each filter chip restarts one | Browse; shots/R/07a-browse-t1.png, 08a-retry-t20-spinner.png | Disable or visually quiet the chips while a fetch is in flight, cancel the in-flight task when a new filter is chosen, and shorte… |
| `A1-09` | T1/polish | S | AppCoordinator.hasExistingRooms() is a self-described placeholder | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:282-286 | Delete it, or point it at RoomStore. |
| `C1-33` | T1/polish | S | The phase change is animated twice, with two different curves | ContentView.swift:81; App/Coordinators/AppCoordinator.swift:227-229 | Keep the coordinator's withAnimation and drop the view modifier (or the reverse), once. |
| `GAP2-07` | T1/polish | M | No tracking number, carrier or link on a Shipped order, though the row promises "Where your pieces are" | shots/GAP2/38-order-detail.png; OrderDetailAction.track(label:url:) exists in OrderDetailView.… | When no tracking URL exists, say so in one line rather than leaving the promise unanswered. |
| `GAP2-17` | T1/polish | S | One slow download disables every row in the documents list | DocumentListView.swift:112-119 | Disable only the downloading row and give it a visible "Preparing…" label. |
| `GAP4-27` | T1/polish | S | The fallback form resets to the developer defaults on every visit, making duplicate rooms the default outcome | ScanFallbackEntryView.swift:27-31 (@State seeds); shots/GAP4/34-fallback-pass2.png | Keep the unit reset; drop the fabricated dimensions and the pre-selected room type. |

#### W2 · L1-C Layout, Companion, Dynamic Type — 114

_count: 114 · blocker 0 · major 50 · minor 55 · polish 9_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `B-01` | T1/major | M | Companion panel overflows its container and runs through the tab bar at accessibility text sizes | Companion panel, content_size accessibility-extra-large — shots/B/72-axxl-companion.png | Put the panel's rows in a ScrollView, cap the panel height to the safe area minus the tab bar, and let it grow with a max-height… |
| `B-26` | T1/major | S | Four help glyphs crowd the Spaces header, three sharing the accessibility identifier 'questionmark.circle' | Spaces — shots/B/18-guest-spaces.png, 38-signedin-spaces.png | Keep one help entry per screen; give the remaining buttons real identifiers and specific labels. |
| `B-32` | T1/major | S | The tour popover is one AXHeading — Skip and Next are not focusable by VoiceOver | Today first-launch tour — describe_screen, research/B.md §Step 5 | Remove the .accessibilityElement(children:.combine) so the buttons stay separate elements, and post a screen-changed notification… |
| `C2-03` | T1/major | M | Settings "Notifications" toggle is inert on every side (defaults ON, never asks, never honoured) | apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift:110-119; Patina/Services/… | Drive the row from notificationSettings().authorizationStatus: .notDetermined -> present the primer; .denied -> one sentence + op… |
| `C3-10` | T1/major | M | The Help panel and first-launch tour are un-branded stock SwiftUI — the only system nav bar and system fonts… | Features/Help/Views/HelpPanelSheet.swift:103-120,161-167,177-181,188-196,248-266; Features/Hel… | Re-skin both with Patina tokens and typography; drop or brand the nav bar; replace .borderedProminent with PatinaButton. |
| `C3-16` | T1/major | L | Status bar hidden app-wide, nav bar hidden everywhere, tab bar hand-rolled opaque — the app opts out of every… | Patina.xcodeproj/project.pbxproj:691,739 (INFOPLIST_KEY_UIStatusBarHidden = YES, Debug+Release… | Drop INFOPLIST_KEY_UIStatusBarHidden and DailyStoryDetailView.swift:51, keeping .statusBar(hidden:) only on the immersive scan/AR… |
| `C4-05` | T1/major | M | Project detail: six of seven reads are try?, so a half-failed load renders as an empty project | apps/mobile/Patina/Patina/Features/Projects/ViewModels/ProjectsViewModel.swift:53-77 | Track which sub-reads returned nil; draw a per-section "couldn't load" row with retry, or a whole-screen partial-load notice on t… |
| `C4-06` | T1/major | S | Decision detail: a failed options fetch shows a question with no answers, no error and no retry | apps/mobile/Patina/Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift:162-180 + Fea… | Distinguish "no options came back" from "options came back blank"; use PatinaErrorState + retry for the first. |
| `C4-17` | T1/major | L | No skeletons anywhere — every loading state is a spinner, and Today has no loading affordance at all | apps/mobile/Patina/Patina/Design/Components/PatinaLoadingState.swift:14-24; Features/Home/View… | A PatinaSkeleton built on redacted(reason: .placeholder), and content-shaped placeholders for the Record, house rail and story on… |
| `C4-19` | T1/major | S | Design-request status shows the "no requests yet" landing while loading, and keeps showing it if the load fai… | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestStatusView.swift:51-66; fetch a… | Add a loading branch gated on service.hasLoaded, and an error+retry branch; Core/State/DesignHelpDestination.swift:36-46 already… |
| `C6-17` | T1/major | M | The purchase bar cannot survive Dynamic Type | Features/Purchase/PurchaseActionBar.swift:39-89 | Wrap the pair in ViewThatFits with a stacked VStack fallback and drop minimumScaleFactor. |
| `C6-23` | T1/major | M | Undersized tap targets, including the app-wide back control | Design/Animations/PatinaTransitions.swift:34-41 (BackChevronButton is 36×36, and it is the bac… | Apply the existing 36-visual/44-thumb pattern from QRScannerView.swift:67-73 (or accessibleHitTarget) to each site, starting with… |
| `C6-27` | T1/major | S | ProductCard's tile variant announces only a price | Features/Shared/Views/ProductCard.swift:150-167 (tile) and :111-146 (list) | Give both variants an explicit combined label of maker + name + price. |
| `C6-28` | T1/major | S | RoomGalleryCard — the Your Spaces card — has no accessibility treatment | Features/Rooms/Components/RoomGalleryCard.swift:18-27 (the Button) and :90-141 (stats) | Combine the card into one element labelled "<room>, <n> items, budget <x>, match <y>%". |
| `C6-29` | T1/major | S | AddToRoomSheet has no accessibility treatment at all | Features/Home/Views/AddToRoomSheet.swift (103 lines, 0 accessibility modifiers) | Label and combine each room row, add .isSelected, tag the heading, and use presentationDragIndicator. |
| `C6-35` | T1/major | S | Companion action rows read a stray chevron and are not combined | Features/Companion/Views/CompanionOverlay.swift:796-834 | Combine the row and label it "<label>. <hint>"; hide the icon and the chevron. |
| `C7-07` | T1/major | S | The scan-recovery disk pass runs twice on every cold launch (app root and Today), with no coalescing | PatinaApp.swift:123 and Features/Home/Views/DailyRoomView.swift:130-134 | One owner (the root); publish the count on ScanEventChannel, which already carries pendingRecoveryCandidateCount, and let Today r… |
| `C9-10` | T1/major | S | LocalStoreClaimSheet is pinned to a single .height(320) detent its content overflows | Features/Collections/Views/LocalStoreClaimSheet.swift:59 | .presentationDetents([.medium, .large]) (or .height(320) plus .large) and wrap the column in a ScrollView. |
| `GAP1-01` ⇢L1-D | T1/major | M | Companion orb overprints live content on both screens the 'N things need your eye' badge leads to | Today home (shots/GAP1/01-today-home.png, 05-relaunch-home.png) and Studio hub (02-companion-o… | Reserve the orb's footprint with a bottom safeAreaInset / content inset (>= orb height + caption + 16) on DailyRoomView and the S… |
| `GAP1-02` | T1/major | S | Consent sheet never shows the price the client is approving | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:368-448 (DecisionC… | Pass the resolved price and the decision title into DecisionConsentSheet and print them under the option name; keep the existing… |
| `GAP1-03` | T1/major | S | Consent and defer sheets pinned to .medium detent, ~40% dead space below the last control | DecisionDetailView.swift:88 (.presentationDetents([.medium, .large])) and :70 for the defer sh… | Use .presentationDetents([.height(<measured>), .large]) sized to the two states (toggle off / signature on), or drive the detent… |
| `GAP1B-05` | T1/major | S | The "Add my signature" toggle did not respond to three synthetic taps | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDetailView.swift:399-408 (Toggle(is… | If confirmed by a human tap: give the row .contentShape(Rectangle()) + onTapGesture, or replace the compound label with a plain T… |
| `GAP2-02` | T1/major | S | Every Studio hub row is an AXGenericElement, not a button | Studio hub describe_screen; StudioQueueBuilder.swift row cell | .accessibilityAddTraits(.isButton) on the StudioHub row cell (or make it a Button). |
| `GAP2-25` | T1/major | S | "Remind me the day before it's due" is a 17 pt-tall tap target | Invoice detail — shots/GAP2/51-invoice-detail.png; AX frame {y:387.33, x:24, width:228.33, hei… | .frame(minHeight: 44) + .contentShape(Rectangle()), as OrderDetailView.rowButton already does. |
| `GAP3-01` | T1/major | M | "No scans on this phone yet" contradicts the app's own YOUR ROOMS list one screen earlier | apps/mobile/Patina/Patina/Features/DesignServices/ScanPickerView.swift:116-131 · shots/GAP3/07… | Query the server rooms too: when rooms exist but no local bundle does, say so — "Your rooms are already with Patina; nothing extr… |
| `GAP3-02` | T1/major | S | The scan-picker empty state instructs an action the screen does not offer | apps/mobile/Patina/Patina/Features/DesignServices/ScanPickerView.swift:124 · shots/GAP3/08-des… | Add a secondary "Scan a room" button that pushes the scan flow, or drop the first clause. |
| `GAP3-04` | T1/major | S | Four-step request flow has no step affordance of any kind | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:186 · shots/GAP3… | Add a light "Step n of 3" line (or a hairline progress rule) under the nav title for the three composing steps; leave sending/suc… |
| `GAP3-09` | T1/major | M | No way back from the Review step — the only exit discards the whole request | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift:74-79 · shots/GA… | Add a leading Back button (or wrap the steps in real NavigationStack pushes) so `step` can walk backwards; keep Close as the dest… |
| `GAP3-14` | T1/major | L | A sent design request can never be withdrawn or edited | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestStatusView.swift:13-14 (comment… | Ship a client-side withdraw for non-terminal, unclaimed leads (RLS policy + a "Withdraw request" destructive row under the timeli… |
| `GAP3-20` | T1/major | M | The Companion bubble and floating back chevron are drawn over content with no scrim or inset | companion.bubble overlay + patinaScreen back chevron · shots/GAP3/01, 05, 06, 07, 22, 23, 43,… | Add a bottom content inset equal to the bubble's height on every scroll container it floats over, and give the chevron pill an op… |
| `GAP3-21` | T1/major | S | "Matched Designer" placeholder card is shown to a tester with no designer (A1-14 CONFIRMED on screen) | apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:55-77 · shots… | Delete the card (hero + "Start a request" stand alone), or replace it with an honest promise card: no avatar shape, title "You'll… |
| `GAP3-24` | T1/major | S | The first-run tour popover uses iOS system blue — the only blue in the app | TipKit-style tour popover on DailyRoomView · shots/GAP3/29-guest-relaunch.png, 43-new-user-hom… | Set the tour's tint/button styling to PatinaColors.clay (or restyle with PatinaButton) so the first modal a tester sees is not st… |
| `GAP4-04` | T1/major | S | The two dimension fields have no accessibility label at all | ScanFallbackEntryView.swift:181 (TextField("", text: text)); AX tree on shots/GAP4/13-fallback… | Add .accessibilityLabel("\(title) in \(unit.label)") to each field, or give the TextField its real title and hide it visually. |
| `GAP4-18` ⇢L1-A | T1/major | M | C1-32 CONFIRMED: at accessibility text sizes the aesthetic name renders as unreadable overlapping glyphs | RevealView.swift:79-92 (aestheticName HStack); shots/GAP4/27-reveal-axXL.png, 62-pause-f24.png | Render the name as ONE Text with .minimumScaleFactor and multiline wrapping; drive the letter-by-letter reveal with a per-charact… |
| `GAP4-19` | T1/major | S | VoiceOver reads the aesthetic name thirteen times on the Reveal | RevealView.swift:80-89 (accessibilityLabel applied to the HStack, not merged); AX tree on shot… | Add .accessibilityElement(children: .ignore) — or collapse to one Text, which also fixes GAP4-18. |
| `GAP4-20` | T1/major | S | At accessibility sizes both floor-plan buttons truncate: "Resc…" and "This Loo…" | ScanFloorPlanPreviewView.swift:48-70 (both buttons pinned to .frame(height: 52)); shots/GAP4/2… | Let the buttons grow vertically (.frame(minHeight: 52)), stack them at accessibility sizes, and give the stat labels .minimumScal… |
| `GAP4-23` | T1/major | S | The companion FAB sits on top of the room page's controls (and Today's, and Browse's) | CompanionOverlay FAB resting position; shots/GAP4/32-landing.png, 10-home-scrolled.png, 07-tod… | Give scroll content a bottom inset equal to the FAB height + margin, and keep the FAB clear of any control row. |
| `GAP4-28` | T1/major | M | At accessibility text sizes the five conversation questions overflow the screen — labels run off the right ed… | StyleConversationContainerView.swift:45-75 (fixed VStack, no ScrollView); shots/GAP4/57-conv-q… | Wrap the container body in a ScrollView; give pills lineLimit(2) + fixedSize(horizontal:false, vertical:true) inside a width-cons… |
| `GAP4-29` | T1/major | M | The fallback form degrades at accessibility sizes: mid-word break, ragged tile heights, truncated CTA, non-sc… | ScanFallbackEntryView.swift:88-95 (emoji .system(size:20)), :169 (.frame(width: 104)), :240-26… | Scale the icons with the text, let the grid rows share a height, allow the CTA to grow or shrink its label, and give the tile tit… |
| `GAP6-08` | T1/major | S | Three different help '?' glyphs, at three sizes, crowd the 'Your Spaces' title row | shots/GAP6/24-your-spaces.png, 46-your-spaces-axxl.png | One help affordance per screen at one size, in the standard position. |
| `GAP6-13` | T1/major | S | AddToRoomSheet and ItemActionMenu do not paint their own sheets — translucent bands show the screen behind | shots/GAP6/28-add-to-room-sheet.png, 33-detail-add-to-room-picker.png, 38-item-action-menu.png… | Move the background onto a '.frame(maxWidth:.infinity, maxHeight:.infinity)' container, or use '.presentationBackground'. |
| `GAP6-19` | T1/major | M | The Companion orb and its caption print over live content on every screen | shots/GAP6/00-preflight-before-home.png, 04-studio-hub-settled.png, 24-your-spaces.png, 26-bro… | Reserve a safe-area inset for the orb on every scrolling root and give the caption an opaque plate. |
| `GAP6-20` | T1/major | S | 'OVERDUE' breaks mid-word on the Today home at DEFAULT Dynamic Type | shots/GAP6/36-today-overdue-wrap.png (full-res crop) | Give the meta column a fixed minimum width or allow the row title to compress; never let the status word wrap. |
| `GAP6-33` | T1/major | S | The Today greeting breaks mid-word across five lines at accessibility sizes | shots/GAP6/44-today-axxl.png | Give the greeting a minimumScaleFactor and allow the header to reflow to a column at accessibility sizes; cap the greeting's Dyna… |
| `GAP6-34` | T1/major | S | At accessibility sizes the room screen's three controls all truncate | shots/GAP6/47-room-axxl.png | Let the acts row stack vertically past a size threshold; wrap the CTA to two lines rather than truncating. |
| `GAP6-35` | T1/major | S | ItemActionMenu clips its fixed .medium detent at large text and nothing scrolls — the destructive row is cut… | shots/GAP6/53-item-action-menu-axxl.png, 54-item-menu-axxl-after-swipe-up.png · Features/Rooms… | '.presentationDetents([.medium, .large])' plus a ScrollView around the column; let the header wrap instead of clip. |
| `GAP6-37` | T1/major | S | The match pill collides with the heart and ⋯ controls on every Browse card at large text | shots/GAP6/50-browse-axxl.png, 52-add-to-room-axxl.png | Put the pill and the controls in one HStack with a Spacer instead of two independent overlay alignments. |
| `GAP8-01` ⇢L0.3 | T1/major | S | Today's only content block is a 57-day-old story, and it prints the date | supabase/migrations/00143_editorial_stories.sql:138-175; Features/Home/Views/DailyStoryCard.sw… | Put real dated rows in editorial_stories on Strata (or refresh published_at on a schedule); add the year to the chip when the dat… |
| `GAP8-08` ⇢L0.3 | T1/major | L | Signed-in Today on production is the guest home minus one line | Features/Home/Models/TodayExperience.swift:273-297; Features/Home/Views/DailyRoomView.swift:24… | Design the discovering + empty-house + empty-catalogue home as a first-class state rather than the residue of four if statements;… |
| `GAP8-09` ⇢L0.2 | T1/major | M | Studio on production is five empty boxes, and the one non-zero number on it is wrong | Features/Profile/Views/StudioHubView.swift:32,225-246; Features/Profile/ViewModels/StudioQueue… | Collapse the empty sections into one honest invitation until the client has a designer; make the Conversation badge count threads… |
| `A-38` | T1/minor | S | The "why this piece" line truncates mid-word and repeats verbatim across cards | Browse pieces; shots/A/14-home-t1.png | Shorten the template to two lines, make it card-specific, and reserve the same height on every card. |
| `A-92` ⇢L1-E | T1/minor | S | "Remind me the day before it's due" has no visible control | Invoice detail; shots/A/49-invoice-detail.png | Make it a labelled Toggle with the explanatory line as its footer. |
| `A1-02` | T1/minor | S | On the flags-off root (the TestFlight default) Your Spaces has no home door | apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:247-370; doors are Companion… | Give YourHouseRail a 'See all spaces' tail on the flags-off root (or ship round 1 with house-first on). Same one row also un-buri… |
| `A1-10` | T1/minor | M | The full navigation-destination dispatcher is duplicated verbatim across the two roots | apps/mobile/Patina/Patina/ContentView.swift:228-425 vs Features/Navigation/HouseFirstRoot.swif… | For the fix program: every navigation-shaped change must be applied twice until the flag-off root is retired, and only the flag-o… |
| `B-47` | T1/minor | S | An empty section heading leaves a ~140 px void under 'YOUR HOUSE' on the signed-in Today | Today signed in — shots/B/35-signedin-today-top.png, 36 | Render a heading for the populated state, or collapse the slot when the string is empty. |
| `C-45` ⇢L1-E | T1/minor | S | The invoice "Pay" button is below the fold with no pinned bar, unlike the product page which pins one | shots/C/22-dark-invoice-detail.png vs 23-dark-invoice-bottom.png; product 12/13 | Pin the pay action; keep one reassurance line. |
| `C-46` | T1/minor | S | On the signature screen the only action is "Sign proposal" — no decline, no way to ask a question | shots/C/20-dark-proposal-scrolled.png | Add "Ask a question" / "Request changes" beside Sign, and hide empty sections. |
| `C1-32` ⇢L1-A | T1/minor | M | The Reveal spells the aesthetic name one letter per view, at a fixed 42pt, in a stack that cannot wrap | Features/StyleReveal/Views/RevealView.swift:80-93,97-119 | One Text with a per-character opacity mask, relativeTo: .largeTitle, and .accessibilityElement(children: .ignore). |
| `C3-27` | T1/minor | M | Scheme-adaptive tokens painted on statically-dark surfaces resolve to their LIGHT values — 3.8:1 on the Compa… | Features/Companion/Views/CompanionOverlay.swift:819,825; QRScannerView.swift (15 dynamic-token… | On statically-dark surfaces use the static light-palette tokens (offWhite, pearl, clay) rather than the adaptive Text.* ones. |
| `C4-13` | T1/minor | M | A refresh that fails while rows are on screen is invisible on all nine list screens | apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceListView.swift:60 (and ProposalListVi… | An inline "Couldn't refresh — showing what we had" chip above the rows when error != nil && !rows.isEmpty. |
| `C4-14` | T1/minor | S | Settings toggles are fire-and-forget: a failed write looks saved, and the reads default to ON | apps/mobile/Patina/Patina/Services/Settings/SettingsService.swift:122-127 (setter), :139-156 a… | Await the write, revert the toggle and show an inline failure on error; render toggles disabled/placeholder until isLoaded. |
| `C5-17` | T1/minor | S | 'You can follow its progress from your home screen' points at iOS, not at Patina | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift:260 (appen… | 'You can follow it on Today.' — and give Today a printed name so the sentence has a referent. |
| `C5-22` | T1/minor | S | The Companion has three self-introductions and one of them is dead code shipping in Release | CompanionIntroBubble.swift:66 ("I'm your Companion."); Services/Companion/CompanionService.swi… | One introduction, one casing; delete CompanionVoice.swift. |
| `C6-08` | T1/minor | S | First-launch tour's Skip / Next / Done are collapsed into rotor custom actions | Features/Help/FirstLaunchTour.swift:874 | Drop children: .combine, or use children: .contain so both buttons stay focusable. |
| `C6-34` | T1/minor | S | Canonical loading and error states are unlabelled and unannounced | Design/Components/PatinaErrorState.swift:19-37 and Design/Components/PatinaLoadingState.swift:… | Hide the icon, combine the block, and announce the message on appear. |
| `C6-36` | T1/minor | S | The Companion first-launch coach mark buries its "Got it" | Features/Companion/Views/CompanionOverlay.swift:705-733 | Drop children: .combine so "Got it" stays focusable. |
| `C6-45` | T1/minor | S | HomeStoryRetryRow puts the 44pt minimum on the row, not the button | Features/Home/Views/HomeStoryRetryRow.swift:30-38 | Move the minHeight inside the Button label, before contentShape. |
| `C9-03` | T1/minor | S | Today's scroll ends in 240 pt of dead canvas (root reservation + a second local 120) | Features/Home/Views/DailyRoomView.swift:371 + ContentView.swift:185 | Delete the local Spacer().frame(height: 120) from DailyRoomView; the root reservation already owns this edge. |
| `C9-09` | T1/minor | S | RoomBudgetSheet: a number pad inside a single fixed .medium detent with no ScrollView | Features/Rooms/Views/RoomBudgetSheet.swift:38-107, presented at Features/Rooms/Views/RoomProje… | .presentationDetents([.medium, .large]), wrap the column in a ScrollView, add the Done toolbar. |
| `C9-11` | T1/minor | S | NewThisWeekRail: 160 pt fixed cards with no accessibility wrap — the only rail without one | Features/Home/Views/NewThisWeekRail.swift:96,116 | Give it the same Layout switch YourHouseRail has, or adopt containerRelativeFrame with the same 200-280 clamp. |
| `C9-15` | T1/minor | S | 78 pt fixed label columns truncate at large text (product spec rows, proposal sign sheet) | Features/ProductDetail/Views/ProductDetailBlocks.swift:123; Features/Proposals/Views/ProposalS… | Replace the fixed width with a Grid/ViewThatFits that stacks label over value once the label no longer fits. |
| `GAP1-05` | T1/minor | S | Deferral acts and the submit-failure recovery acts are un-wrapping HStacks that cannot fit at accessibility s… | DecisionDetailView.swift:306-317 (HStack over DecisionDeferral.allCases) and :147-167 (HStack… | Wrap both in ViewThatFits { HStack{…}; VStack(alignment: .leading){…} }. |
| `GAP1-06` | T1/minor | S | 'Not yet' / 'Neither of these' are naked text links with no affordance | DecisionDetailView.swift:296-322; shots/GAP1/10-decision-detail.png | Give them the secondary/ghost pill treatment already in the kit, or set them on a hairline-topped row. |
| `GAP1-07` | T1/minor | S | 'Choose this' is an oversized slab that unbalances the option card | DecisionDetailView.swift:237-245 (HStack { price; Spacer(); optionAction } with PatinaButton s… | Use a content-sized (secondary/ghost) button on the non-recommended option, or move the CTA to its own full-width row beneath a p… |
| `GAP1-08` | T1/minor | S | Companion promotes 'Your recommendations' while five things need the client's eye | Companion panel on Today; shots/GAP1/06-companion-panel.png; CompanionAreaBuilders.swift studi… | When decisionsRow's count > 0 make it the suggested row on Today too (the builder already has the row); demote or hide a destinat… |
| `GAP1-09` | T1/minor | S | Companion's dimmed backdrop runs under the status bar and collides with the clock | Companion panel over Today; shots/GAP1/06-companion-panel.png | Apply the same top band (or a top scrim gradient) to the Companion's dimming layer. |
| `GAP1-14` | T1/minor | S | Coach tour uses stock-blue system buttons against a clay/sage palette | Welcome tour popover on Today; shots/GAP1/12-consent-signature-on.png | Restyle to the ghost + clay button pair used everywhere else. |
| `GAP1B-04` | T1/minor | S | The "?" help glyph beside the greeting does not scale with Dynamic Type | Today home header | Size the glyph with @ScaledMetric, or use a Label whose symbol inherits the text style. |
| `GAP1B-10` | T1/minor | S | The defer sheet’s note editor has no accessibility label | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionDeferSheet.swift:40-48 — TextEditor… | .accessibilityLabel("Your message to your designer"). |
| `GAP2-05` | T1/minor | M | "Report a problem" is a dead tap: no navigation, no sheet, no feedback | Order detail — shots/GAP2/38-order-detail.png → 39-report-a-problem.png (identical); OrderDeta… | Use openURL(url) { accepted in … } and fall back to an in-app contact sheet or clipboard copy with confirmation. |
| `GAP2-08` | T1/minor | M | Project's empty sections render as two orphan negations inside the screen's only outlined box | Project detail — shots/GAP2/44-project-detail.png, 45-project-detail-bottom.png; ProjectDetail… | Fold each missing section into its own titled section using PatinaEmptyState, or omit the section; never stack bare negations in… |
| `GAP2-20` | T1/minor | S | The floating back chevron has no material and clips whatever scrolls under it | shots/GAP2/50-hub-scrolled-to-bottom.png (clearest), 52-invoice-detail-bottom.png, 45-project-… | .regularMaterial circle or a scroll-edge background, or a reserved safe-area inset. |
| `GAP3-03` | T1/minor | S | An internal hard-disk icon is the empty-state symbol for "no room scans" | apps/mobile/Patina/Patina/Features/DesignServices/ScanPickerView.swift:118 · shots/GAP3/08-des… | Use a room/scan symbol (e.g. "viewfinder" or the app's own scan mark) instead. |
| `GAP3-07` | T1/minor | S | Two visually identical chip groups behave differently on re-tap | DesignRequestFlowView+Steps.swift:334-372 (pickerSection vs optionalPickerSection) · shots/GAP… | Either allow deselect in both (and disable "Review" when nothing is chosen — it is already gated on projectType != nil), or diffe… |
| `GAP3-10` | T1/minor | S | The Review step has no heading and roughly 1000 px of dead space | DesignRequestFlowView+Steps.swift:91-134 · shots/GAP3/13-review-step.png | Add a short lead-in ("Here's what your designer will see") and let the summary block centre in the available space rather than pi… |
| `GAP3-12` | T1/minor | S | The success screen offers three exits, two of which do the same thing | DesignRequestFlowView+Steps.swift:246-255 + the toolbar Close · shots/GAP3/17-send-result.png | Hide the toolbar Close on the success step — the two footer buttons are the whole choice. |
| `GAP3-22` | T1/minor | S | The dark editorial hero band stops below the status bar, leaving a cream strip | apps/mobile/Patina/Patina/Features/DesignServices/DesignerConsultationView.swift:30-33, 49 · s… | Move the dark fill to a background that ignores the top safe area (or paint the whole ScrollView), and lift the band's value in d… |
| `GAP3-23` | T1/minor | S | At accessibility-extra-large the consultation card's avatar detaches from the name and the bubble covers text | DesignerConsultationView.swift:56-73 (HStack, .center alignment) · shots/GAP3/49-consultation-… | Use .top alignment for the card HStack and add the bubble's bottom inset (GAP3-20). |
| `GAP4-13` ⇢L1-A | T1/minor | S | Q3's swatch grid has a 3 pt gutter and its CTA sits 0.3 pt off the swatches | MaterialConnectionView grid + StyleConversationContainerView.swift:66-71 (StyleContinueButton… | Use one gutter token across the conversation and give the CTA a real top margin above the answer area. |
| `GAP4-34` | T1/minor | S | At accessibility sizes the auth root truncates its own Terms and Privacy links | Auth welcome screen legal footer; shots/GAP4/49-retake-quiz-axXL.png | Let the consent line wrap to as many lines as it needs and give the two links minimumScaleFactor. |
| `GAP5-01` ⇢L0.1 | T1/minor | S | Rotation is NOT refused: on a landscape iPad the app is pillarboxed in black over half the screen with the st… | iPad landscape · shots/GAP5/03-rotate-right.png, 04-landscape-settled.png, 26-landscape-signed… | TARGETED_DEVICE_FAMILY = 1 (A2-03's own fix) removes the whole class — iPhone-compatibility mode letterboxes deliberately and con… |
| `GAP5-03` ⇢L0.1 | T1/minor | L | Every primary control is a 779 pt-wide slab — the phone layout is stretched, not adapted | Welcome home + onboarding · shots/GAP5/01-welcome-portrait.png, 02-preflight-after.png; measur… | One .frame(maxWidth: ~420) on the shared auth/onboarding stack would make it defensible at any width; for round one the real answ… |
| `GAP5-07` ⇢L0.1 | T1/minor | M | One screen, two width systems: 786 pt option rows above a 340 pt primary button | taste quiz Q2-Q5 · shots/GAP5/12-after-skip.png and scan_ui measurements | One deliberate content-width rule on the shared container resolves both halves — and fixes GAP5-03 at the same time. Cheapest glo… |
| `GAP5-10` ⇢L0.1 | T1/minor | S | The Companion dock's label sits on raw product photography with no scrim | Browse pieces, bottom of screen · shots/GAP5/15c-bottom-dock.png | A material/scrim behind the dock label, or move the count into the button's own surface. |
| `GAP5-24` ⇢L0.1 | T1/minor | M | Stretched list rows put a label and its value ~900 pt apart | Today home NEEDS YOU / MOVED · shots/GAP5/17-today-clean.png | Cap the row content width (the same maxWidth that fixes GAP5-03/07), or stack value under label above a width threshold. |
| `GAP6-01` | T1/minor | S | No visible way out of the number pad on the budget sheet — but the predicted blocker does NOT reproduce | shots/GAP6/17-budget-numberpad-visible.png, 19-dismiss-attempt-tap-inside-sheet.png, 20-dismis… | One shared keyboard Done toolbar on every numeric field; add '.presentationDragIndicator(.visible)'. |
| `GAP6-02` | T1/minor | S | RoomBudgetSheet draws no drag indicator while its sibling sheet hand-draws one | shots/GAP6/15-budget-sheet-no-keyboard.png · Features/Rooms/Views/RoomProjectView.swift:132-13… | Use '.presentationDragIndicator(.visible)' on both and delete the hand-drawn capsules. |
| `GAP6-06` | T1/minor | S | A backdrop tap silently discards a typed budget | shots/GAP6/18-budget-typed-400.png, 22-dismiss-tap-backdrop.png | Add Cancel/Save chrome, and either keep the draft or confirm before discarding. |
| `GAP6-10` | T1/minor | S | 'All Items' is the only right-aligned screen title in the app | shots/GAP6/25-cross-room-all-items.png | Left-align to match every other pushed screen. |
| `GAP6-14` | T1/minor | M | 'Add to room' from the Browse card menu gives no confirmation at all | shots/GAP6/29-after-add-to-room.png (1.5 s), 30-after-add-banner-check.png (0.7 s) · Features/… | Find why addToRoomMessage never renders (state/ownership), and make the card's heart reflect the save immediately. |
| `GAP6-16` | T1/minor | M | The Companion contradicts the screen it is drawn over | shots/GAP6/35-companion-on-detail.png | Feed the Companion the screen's saved state; make the row read Unsave/Saved when it is saved. |
| `GAP6-38` | T1/minor | M | Browse cards lose their content to truncation at accessibility sizes | shots/GAP6/50-browse-axxl.png | One column of full-width cards past a size threshold instead of a two-column grid. |
| `GAP6-40` | T1/minor | S | AddToRoomSheet has one detent and no ScrollView — rooms past the third are unreachable at large text | shots/GAP6/52-add-to-room-axxl.png · Features/Home/Views/AddToRoomSheet.swift:38-58 | '.presentationDetents([.medium, .large])' plus a ScrollView. |
| `GAP6-41` | T1/minor | S | The help '?' glyphs do not scale with Dynamic Type | shots/GAP6/24-your-spaces.png vs 46-your-spaces-axxl.png | Drive the glyph from a relativeTo font so it scales, and enforce a 44 pt hit target. |
| `GAP6-45` | T1/minor | S | The Companion offers 'Rescan room' on a room that was never scanned | shots/GAP6/GAP6.md step (b) — Companion in room context (capture in research/GAP6.md) | Say 'Scan this room' when there is no scan, and gate the saved-pieces row on a non-zero count. |
| `A-48` | T1/polish | S | A grey band sits under the product action bar in the home-indicator safe area | Product detail; shots/A/18-product-detail.png, 19 | Extend the bar's background with .ignoresSafeArea(edges: .bottom) and keep its content inside the safe area. |
| `C5-35` | T1/polish | S | Tour step 3's fallback repeats its own heading in different casing and drops the terminal period | apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift:293-296 | body: 'Projects, proposals, invoices and files, in one place.' |
| `GAP2-11` | T1/polish | S | A search field sits above three project rows, and the cards carry nothing that distinguishes them | shots/GAP2/42-projects-list.png | Hide search below a threshold (>=8 projects); put current phase and next date on the card. |
| `GAP3-08` | T1/polish | S | The "Your vision" text field does not read as editable | DesignRequestFlowView+Steps.swift:67-73 · shots/GAP3/09-details-step.png | Darken the field's border a step (or add a focus ring) so the one free-text input in the flow announces itself. |
| `GAP3-16` | T1/polish | S | The Review step's most consequential line is its faintest text | DesignRequestFlowView+Steps.swift:118-122, DesignRequestAuthCopy.reviewHint · shots/GAP3/25-gu… | Promote it to the infoCard treatment already used for the cellular-consent and offline notices (icon + title + body), or at minim… |
| `GAP5-15` ⇢L0.1 | T1/polish | S | Two room cards in the same list have structurally different footers | Your Spaces · shots/GAP5/20-your-spaces.png | Keep the two-column frame and render the missing budget as a designed empty value ('—' or 'No budget set'). |
| `GAP6-04` | T1/polish | S | The raised budget sheet leaves a 236 pt dead band above the keyboard | shots/GAP6/17-budget-numberpad-visible.png | Size the sheet to its content ('.presentationDetents([.height(...)])') so it never carries a third of a screen of nothing. |
| `GAP6-32` | T1/polish | S | The note editor is a ~430 pt box for one sentence, and its placeholder misses the caret baseline | shots/GAP6/42-saved-note-sheet.png, 43-note-sheet-keyboard.png · Features/Collections/Views/Sa… | Cap the editor height and align the overlay to the editor's real text insets. |
| `GAP6-44` | T1/polish | S | Segmented tabs are drawn over an empty state | shots/GAP6/25-cross-room-all-items.png | Hide the segmentation until there is something to segment; settle on one '+' treatment. |

#### W2 · L1-D Tokens, dark mode, contrast, iconography — 51

_count: 51 · blocker 0 · major 19 · minor 25 · polish 7_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A-96` ⇢L0.3 | T1/major | L | Photography is absent app-wide — rooms, editorial and some products render as flat gradients | Studio, home, browse; shots/A/47,53,27,15,16 | Ship real imagery for seeded rooms/editorial, and a designed fallback for the genuinely image-less case. |
| `B-38` | T1/major | M | Room cards have no imagery and use arbitrary, partly off-palette gradients | Spaces and Today — shots/B/38, 42, 43, 57, 36 | Use the room's scan keyframe/photo where one exists and a single palette-consistent placeholder pattern where it does not. |
| `B-39` | T1/major | S | Room-card captions are mid-brown mono on a mid-brown gradient — very low contrast | Spaces cards — shots/B/38-signedin-spaces.png, 42-room-saved.png | Add a scrim behind the caption block or move the metadata onto the card's cream footer. |
| `C-24` | T1/major | S | "Delete account" has no destructive treatment, and both it and "Sign Out" carry a navigation chevron | shots/C/29-dark-settings.png | Tint destructive rows, drop the chevron on action rows, and move Delete account into its own footer group. |
| `C3-04` | T1/major | M | The Companion orb and panel are charcoal-on-graphite in dark mode (1.15:1) with a light-mode-brown shadow tha… | Features/Companion/Components/CompanionMarkView.swift:163-168; Features/Companion/Components/C… | Make the Companion surface dynamic (charcoal in light, a lighter graphite or glassEffect shell in dark) and pair the shadow with… |
| `C3-08` | T1/major | M | Three icon languages side by side: SF Symbols (mixed fill/outline), Unicode glyphs, and the letter "G" standi… | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:152-162; Features/Authen… | Replace glyph icons with SF Symbols, ship the official Google mark as an asset (their branding guidelines require it), and pick o… |
| `C3-13` | T1/major | M | PatinaButton and 37 hand-rolled buttons use a FIXED height — labels clip at accessibility Dynamic Type | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:70 (.frame(height: 52))… | Change to .frame(minHeight: 52) in PatinaButton and AuthButton, and at the 37 hand-rolled sites. |
| `C3-14` | T1/major | S | PatinaStatusBadge: all four states are 1.9-2.6:1 — a tint label on a 14% wash of the same tint | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaStatusBadge.swift:41-45; used at Matc… | Darken the label tint (or use Text.primary) over the wash, or invert to a filled badge with Text.inverse. |
| `C6-12` | T1/major | M | Text.interactive — the app's link colour — fails WCAG AA in light mode across 111 call sites | PatinaColors.swift:124-126 — clayDeep #9F7E48 | Darken clayDeep for light mode until it clears 4.5:1 against both offWhite and softCream. |
| `C6-13` | T1/major | M | clay state indicators fail the 3:1 non-text contrast floor | PatinaColors.swift:20 — clay #C4A57B, 2.18:1 on the canvas; used as the sole non-textual state… | Use clayDeep (or charcoal) for state indicators and keep clay for decorative fills. |
| `C6-21` | T1/major | S | 8pt and 9pt type still in production | PatinaTypography.monoTiny (8pt, marked @available(*, deprecated) at PatinaTypography.swift:74)… | Retire monoTiny to monoLabel per its own deprecation message and lift the 9pt sites to 10pt. |
| `C6-24` | T1/major | M | Colour-only selection state — .isSelected is used at 6 sites and missing everywhere else | Missing at Features/Collections/Views/CollectionsView.swift:89-107 (Saved/Boards tabs), Rooms/… | Add .accessibilityAddTraits(isSelected ? [.isSelected] : []) at each site. |
| `C7-12` | T1/major | M | Everything expensive at launch is synchronous inside PatinaApp.init(), before the first frame — 18 TTFs, Post… | apps/mobile/Patina/Patina/PatinaApp.swift:63-89; PatinaDesignKit/Sources/PatinaDesignKit/Suppo… | Move font registration and PostHog off the launch path (background task with a main-actor handoff); build the container lazily so… |
| `GAP1-04` | T1/major | M | PatinaButton hard-pins .frame(height: 52) while its label scales with Dynamic Type | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:71-72 (secon… | Replace the fixed height with .frame(minHeight: 52) plus symmetric vertical padding so the capsule can grow; keep 52 as the floor. |
| `GAP4-10` ⇢L1-A | T1/major | M | Q1's four "room photographs" are placeholder gradients, and the VoiceOver label calls them photographs | VisualResonanceView.swift:16 ("Replace these gradients with real photographs when assets land.… | Ship the photography, or ask about palettes here too and drop "photograph" from the accessibility label. |
| `GAP4-12` ⇢L1-A | T1/major | M | Five questions, five different option components | VisualResonanceView / LifestyleRealityView / MaterialConnectionView / InvestmentPerspectiveVie… | Pick one option-row component and one grid metric for the whole conversation; vary only the media inside it. |
| `GAP4-15` ⇢L1-A | T1/major | S | The Reveal's aesthetic name renders in the system font — PlayfairDisplay-Light is not in the bundle | RevealView.swift:83 (.font(.custom("PlayfairDisplay-Light", size: 42))); shots/GAP4/24-pause-t… | Use PlayfairDisplay-Regular at 42 pt, or add the Light .ttf to PatinaDesignKit's resources. |
| `GAP5-18` ⇢L0.1 | T1/major | S | Measured: the story card's MAKER SPOTLIGHT eyebrow is at 1.36:1 contrast — effectively invisible | Today home story card · shots/GAP5/17-today-clean.png, crop 17b-story-eyebrow.png | Move the eyebrow onto the dark end of the gradient, add a scrim, or use the headline's near-white. |
| `GAP7B-11` ⇢L0.3 | T1/major | M | With no photograph, a piece’s hero is a flat brown gradient occupying the top third of the screen | Product detail (Features/ProductDetail) reached by universal link — "Oak Reading Chair", catal… | Seed images before the round (L0.3 / P-36) or give the empty hero a composed treatment: the mark, the maker, and a line that admi… |
| `A-97` | T1/minor | S | Settings icon tiles use five unrelated colours and mark Notifications with the destructive red | Settings; shots/A/54-settings.png, 57 | Pick one neutral tile treatment for all rows and reserve red for destructive actions only; make the palette identical in both app… |
| `B-41` | T1/minor | S | Settings row icon tiles are tinted off-palette — pink, blue, green, orange among tans | Settings sheet — shots/B/21-guest-settings.png, 22, 58 | Tint all tiles from the warm palette; use tone, not hue, to differentiate sections. |
| `C-32` | T1/minor | M | Tab bar is text-only with no icons, colour-only selection, uneven widths and an unlabeled fifth item | shots/C/50-flagson-dark-tabroot.png, 51, 52, 53 | Add icons, an explicit selected indicator, equal widths, and either label the fifth item or move it out of the tab bar. |
| `C-49` | T1/minor | S | The two cards stacked on Your Spaces have different widths, so their right edges do not align | shots/C/09-dark-spaces.png, 51-flagson-spaces.png | Move the "?" inside the card (or delete it, see C-05) and set both cards to the same width. |
| `C-50` | T1/minor | S | The bottom action bar has no material in dark — 1.06:1 against the page | Product detail; shots/C/13-dark-product-scrolled.png | Use a proper bar material with a scroll-edge effect. |
| `C3-18` | T1/minor | M | Haptics: two competing mechanisms, ten feature areas (65 files) with none at all, and the Companion's signatu… | PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift:17-18,28-34,80-82; zero ha… | Add impactSoft.prepare() and impactRigid.prepare(); standardise on .sensoryFeedback; cover the primary act on each money/decision… |
| `C3-24` | T1/minor | M | Missing product photos fall back to a decorative brown gradient with no "no image" signal — a second, unrelat… | Core/Models/ProductModel.swift:236-245 and Core/Models/SavedItem.swift:92-100; rendered at Rec… | Route no-URL products through PatinaAsyncImage's designed placeholder, or overlay the strata mark on the gradient; give the gradi… |
| `C3-29` | T1/minor | S | PatinaTextField's resting border is a 1.05:1 whisper — the field has no visible boundary until focused | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaTextField.swift:38-42; hand-rolled al… | Raise the resting border to a visible dynamic token and adopt the component at the hand-rolled sites. |
| `C3-30` | T1/minor | S | PatinaAsyncImage has no crossfade and no cache — browse-grid photos pop in and re-flash the placeholder on sc… | PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:28-57 | Add `.transition(.opacity.animation(.easeOut(duration: 0.2)))` on the success arm (skipped under reduce motion) and a small in-me… |
| `C3-31` | T1/minor | S | Shadow tokens are all light-mode brown with no dark variant, and are outnumbered by raw .shadow() calls | PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaShadows.swift:14,21,28,35,51; 8 raw sites… | Make the shadow colours dynamic (a deeper, higher-opacity value in dark) and route the 8 raw sites through patinaShadow. |
| `C6-11` | T1/minor | M | Text.muted fails WCAG AA in light mode across 265 call sites | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:116-118 — agedOa… | Darken the light-mode agedOak value (roughly #7A6449 clears 4.5:1) and leave the dark palette alone. |
| `C6-33` | T1/minor | S | PatinaButton loses its title while loading | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:57-68 | Keep .accessibilityLabel(title) on the Button and add .accessibilityValue("Loading") while isLoading. |
| `C7-21` | T1/minor | M | Remote images decode at full resolution with no downsampling and no configured URLCache | apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:28-56; u… | Configure a shared URLCache at launch and downsample with ImageIO (kCGImageSourceThumbnailMaxPixelSize) to the card size. |
| `GAP2-13` | T1/minor | S | The same two amounts are typeset in two typefaces and two number formats, 300 pt apart, on the Budget screen | Budget — shots/GAP2/48-budget.png, 49-hub-bottom-inset.png | One currency formatter and one numeral face for money app-wide. |
| `GAP3-27` ⇢L1-A | T1/minor | M | Emoji stand in for iconography in the style quiz | style-quiz option rows · shots/GAP3/38-quiz-done.png plus the Q4/Q5 AX trees | Replace with SF Symbols or the design kit's own marks; never mix emoji and glyphs in one list. |
| `GAP4-06` ⇢L1-A | T1/minor | S | Full-colour emoji as the room-type iconography inside a monochrome editorial system | ScanFallbackEntryView.swift:88-95; shots/GAP4/13-fallback-entry.png, 45-fallback-axXL.png | SF Symbols (sofa, bed.double, fork.knife, laptopcomputer, frying.pan, sparkles) tinted with the semantic tokens. |
| `GAP5-02` ⇢L0.1 | T1/minor | M | In landscape the next onboarding page bleeds permanently into the right edge of the column | guest onboarding page 1, landscape · shots/GAP5/04-landscape-settled.png right edge | Derive the page width from the live container width rather than a captured/hard-coded value. |
| `GAP5-04` ⇢L0.1 | T1/minor | M | On the 1210 pt canvas the vertical rhythm collapses into dead space | Welcome home + guest onboarding · shots/GAP5/01-welcome-portrait.png, 02-preflight-after.png | Centre the auth stack vertically and cap the hero band as a proportion of height; or A2-03 for round one. |
| `GAP5-08` ⇢L0.1 | T1/minor | S | Palette swatches lose their meaning at 387 pt: a palette becomes a 3:1 letterbox band | taste quiz Q1 'Which palette feels like home?' · shots/GAP5/12-after-skip.png | Cap the grid's content width, or make the swatch aspect-ratio-locked rather than fixed-height-and-fill-width. |
| `GAP6-03` | T1/minor | S | The disabled Save capsule is the only cold grey in the app | shots/GAP6/15-budget-sheet-no-keyboard.png, 16, 48 · Features/Rooms/Views/RoomBudgetSheet.swif… | Give the disabled state its own palette token (a pale clay fill with muted text). |
| `GAP6-09` | T1/minor | S | The Your Spaces card subtitle is the lowest-contrast text in the app | shots/GAP6/24-your-spaces.png, 46-your-spaces-axxl.png | A scrim behind the card's text block, or move the metadata onto the cream footer. |
| `GAP6-17` | T1/minor | S | A Browse card shipped with no image and no placeholder treatment | shots/GAP6/26-browse-pieces.png, 27-browse-card-menu.png, 29-after-add-to-room.png | A branded placeholder plus a retry for image loads; never leave a bare grey rectangle. |
| `GAP6-22` | T1/minor | S | The room item row and item menu throw away the piece's photograph | shots/GAP6/37-room-with-item.png, 38-item-action-menu.png | Use the product image in SavedItem rows; keep the gradient only as the loading placeholder. |
| `GAP6-27` | T1/minor | S | The 'current room' row in Move/Copy reads as a rendering failure | shots/GAP6/39-move-to-another-room.png | Keep the card background and mark the state with the CURRENT chip alone. |
| `P-24` | T1/minor | S | A giant "#" character is the illustration for the sign-in-code screen | shots/P/23-code-requested-t0.png | A drawn mark, or drop the hero and lead with the heading. |
| `C9-19` | T1/polish | S | Stale deployment-floor comments contradict the project (iOS 18 / 26.2 / 17.6 vs 26.5) | Features/ProductDetail/Views/ProductDetailBlocks.swift:209-210; Features/ARPlacement/Views/ARP… | One true floor, restated nowhere; delete the per-file claims. |
| `GAP2-06` | T1/polish | S | Order-stage ladder: "IN PRODUCTION" and "SHIPPED" labels nearly touch and read as one word | shots/GAP2/37-ordered-list.png, 38-order-detail.png | Centre each label on its segment, shorten to "PRODUCTION", or tighten tracking at this width. |
| `GAP2-26` | T1/polish | S | "Subtotal" and "Total" stacked with the identical amount, and the lesser row gets the accent colour | shots/GAP2/51-invoice-detail.png, 52-invoice-detail-bottom.png | Collapse to a single Total when subtotal == total; give Total the accent when both are shown. |
| `GAP4-07` | T1/polish | S | The units control is the one stock UIKit segmented control in a bespoke screen | ScanFallbackEntryView.swift:164-173 (.pickerStyle(.segmented)); shots/GAP4/13-fallback-entry.p… | Restyle as a two-segment pill in the app's own idiom, or accept the system control everywhere rather than only here. |
| `GAP5-22` ⇢L0.1 | T1/polish | S | house-first tab bar: the 402 pt arithmetic scales to 192 pt cells per word — a web nav bar, not a tab bar | PatinaTabBar under -PatinaFlags house-first,direct-orders,house-widget · shots/GAP5/25-tabbar-… | Derive the trailing slot and inter-item spacing from the container width (which also fixes C9-16's narrow case); make the AX labe… |
| `GAP6-18` | T1/polish | M | Product photography does not match the product | shots/GAP6/26-browse-pieces.png, 41-saved-list.png | Product-on-ground hero per piece; keep the room scene as a secondary image. |
| `GAP6-31` | T1/polish | S | 'Add a note' is styled exactly like the metadata beside it | shots/GAP6/41-saved-list.png · Features/Collections/Views/CollectionsView.swift savedRowFooter | Give it a control treatment (chip or leading glyph) and attach it to the card. |

#### W2 · L1-E Copy — 46

_count: 46 · blocker 0 · major 5 · minor 30 · polish 11_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C5-08` | T1/major | M | 'Room' and 'Space' are used interchangeably — sometimes as label and hint on the same row | apps/mobile/Patina/Patina/Features/Companion/Services/CompanionAreaBuilders.swift:115-116,151,… | Pick one noun and sweep; the label/hint pairs above are where the collision is most visible. |
| `GAP2-04` | T1/major | S | Order detail says "Write to the address below" and there is no address below | Order detail — shots/GAP2/38-order-detail.png; copy from service.terms?.paragraph rendered by… | Render the contact under the paragraph in the .contact shape, or change the copy to name the row above it. |
| `GAP4-08` | T1/major | S | The conversation opens by telling the user "YOUR ROOM IS CAPTURED" when nothing was captured | ConversationHeaderView whisperTop on the manual path, from QuietConversationFlowHost.swift:195… | Branch the whisper on session.scanMethod == .manual ("YOUR ROOM, NOTED · LET'S DISCOVER YOUR STYLE"). |
| `GAP4-21` | T1/major | S | The floor plan says "Here's what I see." and reports "0 ITEMS DETECTED" for a room nobody looked at | ScanFloorPlanPreviewView.swift:31-34 (header), :124-131 (statsRow), :48-56 ("Rescan"); shots/G… | Branch header, stat set and button label on session.scanMethod == .manual — "Here's what you told me", drop the detected-items co… |
| `GAP8-10` ⇢L0.3 | T1/major | S | The marketplace's empty state offers the one action that cannot help | Features/Recommendations/Views/RecommendationsView.swift:254-265,69-76 | An empty catalogue is an us-state, not a you-state: say so and drop the CTA. R-06 (the state does not fill the screen) escalates… |
| `A-43` | T1/minor | S | "Designers Pick" is missing its apostrophe and a raw slug is shown as a tag | Product detail PROVENANCE; shots/A/19-product-detail-scrolled.png | "Designer's Pick"; map category keys to display names in one place. |
| `A-56` | T1/minor | S | "Ask about this piece" opens a modal whose title and headline disagree | Product detail → Ask about this piece (guest); shots/A/22-guest-ask.png | Give the sheet a contextual headline ("Sign in to ask about the Velvet Club Chair") and a standard nav-bar Cancel. |
| `A-83` | T1/minor | S | "MOVED" is an opaque section header on the home | Daily Room home; shots/A/44-home-signedin.png | Rename to something a homeowner reads ("Recently" / "What's happened") and either explain or remove the grey treatment. |
| `B-40` | T1/minor | S | System language 'TYPED, NOT SCANNED' is shown to homeowners | Spaces cards and room detail — shots/B/38, 42, 43 | Say what it means to the reader: 'Measurements you entered' with a 'Scan this room' action. |
| `B-48` | T1/minor | S | 'MOVED' section header is jargon, and its two rows use different text colours with no legend | Today NEEDS YOU card — shots/B/35-signedin-today-top.png | Rename the section ('Since you were last here'), and either drop the two-tone treatment or label it (read/unread). |
| `B-58` | T1/minor | S | The Companion speaks in first person and exposes internal jargon | Companion panel — shots/B/68-companion-open.png, 69-companion-panel.png | Settle on one voice; replace 'PORTAL' with 'the web'; shorten captions so they fit one line; extend the panel to cover the action… |
| `C-42` | T1/minor | S | Three money formats for the same figure across adjacent screens | shots/C/01 ("budget $9,000"), 09 ("$9.0K", "$0 total"), 22 ("$4,250.00") | One currency formatter with an explicit abbreviation rule. |
| `C-54` | T1/minor | S | The Companion identifies itself two different ways on the same identifier, and its subtitle is squeezed to an… | Product detail vs everywhere else; shots/C/12-dark-product.png, 03-light-companion.png | One Companion component with one label; widen the subtitle measure to the panel. |
| `C3-25` | T1/minor | S | Four different empty-state languages — a tester with no data sees three of them in three taps | PatinaEmptyState (12 uses); ContentUnavailableView at HelpPanelSheet.swift:161; Unicode-glyph… | Route all six hand-rolled empty states through PatinaEmptyState. |
| `C4-24` | T1/minor | S | Pieces' empty-state copy doesn't name the filter that emptied it — and the right copy already exists, unused | apps/mobile/Patina/Patina/Features/Recommendations/Views/RecommendationsView.swift:257-266 | Branch on activeFilter != all: name the filter and offer "Show all" as the CTA. |
| `C5-12` | T1/minor | S | DesignServicesError's ten sentences use two punctuation conventions in one enum | apps/mobile/Patina/Patina/Services/DesignServices/DesignServicesService.swift:182-208 | Terminal periods on all of them — they are sentences. |
| `C5-15` | T1/minor | S | Money ranges are written four different ways, so the quiz reflects a budget back in a format the user never s… | DesignServicesService.swift:90-92; QuizModels.swift:104-106; StyleQuizViewModel.swift:241-245;… | One range format, echoed verbatim. |
| `C5-21` | T1/minor | S | One destination, three names: the pill says 'Studio', VoiceOver says 'Your Studio', the tour says 'Your profi… | DailyGreetingHeader.swift:13-14; Coordinator.swift:146,149; PatinaTab.swift:30,42; FirstLaunch… | 'Your Studio' everywhere the user can read it, including the Sanity doc; keep 'Profile' as the analytics name only. Overlaps A1-1… |
| `C5-23` | T1/minor | M | 259 straight apostrophes vs 10 curly — and the split runs between adjacent Studio screens | census over research/C5-strings.txt. The 10 curly: CameraPermissionService.swift:19, CameraPer… | Sweep to ’. (The ellipsis is already almost entirely the correct … character — do the same for apostrophes.) |
| `GAP1-12` | T1/minor | S | 'Browse pieces for the {room.name}' prepends a definite article to a user-named room | apps/mobile/Patina/Patina/Features/Rooms/Views/RoomProjectView.swift:254 — cta(primary: "Brows… | Drop the article: "Browse pieces for \(room.name)". |
| `GAP1-17` ⇢L0.3 | T1/minor | S | Raw seed token 'Aesthete-Dev-Seed' printed under PROVENANCE on a client-facing product screen | Product detail (Oak Reading Chair); shots/GAP1/19-decision-rug.png | Filter internal pipeline tags out of the provenance chip, or whitelist the values that may be shown to a client. |
| `GAP1B-14` | T1/minor | S | Raw decision_type enum values are shown to the client as pills | apps/mobile/Patina/Patina/Features/Decisions/Views/DecisionListView.swift:78-86 — Text(type.ca… | Map the enum to client-facing labels, or drop the pill where it restates the title. |
| `GAP2-03` | T1/minor | S | Accessibility label says "1 categories" — broken pluralisation plus a schema word | Studio hub section headings, describe_screen | ^[\(n) item](inflect: true) and a client-facing noun ("1 thing in progress"). |
| `GAP2-10` | T1/minor | S | Projects list title is a bare count where every sibling screen has a sentence | shots/GAP2/42-projects-list.png | "Your projects" as the title; keep the count as a mono sub-line if it earns its place. |
| `GAP2-12` | T1/minor | S | The same class of figure is "TOTAL" on the projects card and "BUDGET" on the project detail | shots/GAP2/42-projects-list.png vs 44-project-detail.png | Use BUDGET in both places. |
| `GAP2-15` | T1/minor | S | Budget invoice rows lead with the accession number and drop the due date the home screen shows | shots/GAP2/48-budget.png | Lead with "Due Sep 6 · Awaiting payment"; demote INV-2026-0142 to the caption. |
| `GAP3-05` | T1/minor | S | Title Case chips sit beside sentence-case chips in one screenful | DesignServiceType.displayName vs DesignTimeline.displayName, rendered in DesignRequestFlowView… | Pick one case convention for chip labels — sentence case matches the rest of the app's voice — and apply it to DesignServiceType.… |
| `GAP3-11` | T1/minor | S | The success message is three unrelated sentences concatenated at runtime, with a dangling "its" | apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift:259-272 ·… | Write two whole sentences per branch instead of concatenating three fragments; replace "its" with "your request". |
| `GAP3-13` | T1/minor | S | The status screen renames the fields the compose flow just collected | DesignRequestStatusView.swift:265,272 vs DesignRequestFlowView+Steps.swift:94-96 · shots/GAP3/… | Use "Help" on both and render the roomless case as "No scan attached" rather than "0 scans". |
| `GAP3-19` | T1/minor | S | The guest Studio card asks for a sign-in and offers "Open settings" | StudioHub.GuestSettingsButton · shots/GAP3/22-guest-entry.png, 23 | Relabel the action "Sign in" and present AuthSheet directly. |
| `GAP4-05` | T1/minor | S | Stepper VoiceOver labels are ungrammatical and the two rows share duplicate AX ids | ScanFallbackEntryView.swift:249,262; AX tree on shots/GAP4/13-fallback-entry.png | Singularise the labels ("Add a window", "Remove a door") and give real ids (scan.fallback.windows.increment, …). |
| `GAP6-07` | T1/minor | S | Room copy leaks capture-pipeline vocabulary to a homeowner | shots/GAP6/14-room-screen.png, 24-your-spaces.png, 47-room-axxl.png | Say it in the person's words ('measurements you typed') or drop the provenance from the subtitle. |
| `GAP6-12` | T1/minor | S | '1 ITEMS' / '1 SAVED PIECES' — the same count is pluralised three ways | shots/GAP6/33-detail-add-to-room-picker.png, 37-room-with-item.png · Features/Home/Views/AddTo… | One pluralised count helper used by all three surfaces. |
| `GAP6-25` | T1/minor | S | Capitalisation flips between Title Case and sentence case inside one flow | shots/GAP6/27-browse-card-menu.png vs 38-item-action-menu.png | Sentence case everywhere; one pass over ItemActionMenu and AddToRoomSheet. |
| `R-18` | T1/minor | S | Three of the four error messages cannot tell the tester whether the fault is theirs or ours | Browse / Proposal / Today error surfaces; §1l of research/R.md | Branch on URLError.notConnectedToInternet / timedOut and use the Studio's connection wording for those cases; keep the neutral wo… |
| `C1-39` | T1/polish | S | The email-code sheet's header contradicts the panel under it | Features/Authentication/Views/AuthenticationView.swift:116-140 vs :304-323 | Switch the header to 'Check your email' once magicLinkSent is true. |
| `GAP2-19` | T1/polish | S | The hub section titled "Money & documents" contains no documents | Studio hub — shots/GAP2/46-hub-budget-row.png; AX heading "Money & documents, 4 categories" | Title the section for what it holds, or let the documents row render with its empty state. |
| `GAP2-21` | T1/polish | S | Archive says "empty" three ways and its count glyph reads as Ø | Studio hub bottom — shots/GAP2/50-hub-scrolled-to-bottom.png | Hide the count when it is zero (every other section's count is >=1) and keep the sentence. |
| `GAP2-22` | T1/polish | S | Capitalisation flips inside one list: "Retake Style Quiz" beside "Get design help" | Studio hub YOUR PROFILE section — shots/GAP2/50-hub-scrolled-to-bottom.png | "Retake your style quiz". |
| `GAP2-28` | T1/polish | S | Mixed straight and curly apostrophes across adjacent mono eyebrows | AX tree — invoice detail and order detail; shots/GAP2/51-invoice-detail.png, 38-order-detail.p… | Curly everywhere; add a lint rule for ' in user-facing strings. |
| `GAP2-29` | T1/polish | S | Two stacked caption lines under the pay CTA both say "securely" | shots/GAP2/52-invoice-detail-bottom.png | One line: "Opens securely in Safari · card or bank transfer". |
| `GAP3-06` | T1/polish | S | Hyphen-minus used as the range dash in every price and timeline range | DesignBudget.displayName / DesignTimeline.displayName · shots/GAP3/09-details-step.png | Replace "-" with "–" in those display strings. |
| `GAP4-30` | T1/polish | S | ContemplativePauseView is a well-made waiting state, but its "me" is never attributed and it crossfades throu… | ContemplativePauseView.swift:26-45 (copy + dots), :66-100 (runScoring); shots/GAP4/62-pause-f2… | Attribute the voice (companion mark or name), and match the pause's ground to the Reveal's so the dissolve is a fade, not a wash. |
| `GAP6-05` | T1/polish | S | The budget field's placeholder promises a format the field never produces | shots/GAP6/15-budget-sheet-no-keyboard.png, 18-budget-typed-400.png · Features/Rooms/Views/Roo… | Group as the person types, and mute/lighten the placeholder so it cannot pass for a value. |
| `GAP6-43` | T1/polish | S | 'You added the Heirloom Oak Dining Table on Tuesday' for something added fifteen seconds ago | shots/GAP6/37-room-with-item.png | Relative phrasing inside the last day ('just now', 'today'), weekday only beyond it. |
| `R-21` | T1/polish | S | "5 things need your eye" is printed twice on the same Studio screen | Studio; shots/R/11a-studio-t2.png | Suppress the companion caption on any screen whose own header already carries the same count. |

#### W2 · L1-F Notifications, messaging, widget, deep links — 24

_count: 24 · blocker 0 · major 4 · minor 16 · polish 4_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `C2-04` | T1/major | M | A first-round tester can never be asked for notification permission | apps/mobile/Patina/Patina/Features/Notifications/Views/PushPrimerView.swift:84-101; Patina/Fea… | Keep Q7's earned ask, but add a second explicit door: a Settings row that presents the same primer, sharing the once-per-install… |
| `C4-15` | T1/major | S | "Message your designer" is a silent no-op on failure in three places — twice on a failure banner where it's t… | apps/mobile/Patina/Patina/Features/Home/ViewModels/DailyRoomViewModel.swift:445-455 + Features… | Reuse the openThreadFailed state at all three call sites; flip the button label instead of doing nothing. |
| `GAP7-02` +GAP7B-10 | T1/major | M | A universal link tapped while the app is not running is silently dropped about a third of the time | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift:62-69; shots/GAP7/32-launchque… | Give the universal-link branch the same pendingRoute stash and replay it from configure(coordinator:). |
| `GAP8-06` ⇢L0.2 | T1/major | S | tester@patina.cloud's bell shows "New pieces for you" with an empty body and a dead tap | Core/Network/NotificationsAPIClient.swift:127-161,224-233; App/DeepLinking/NotificationRouter.… | Read metadata.headline/message alongside title/body; give welcome_series its own bucket instead of falling through to .newRecomme… |
| `A-105` | T1/minor | M | patina:// deep links do nothing — no navigation, no error | xcrun simctl openurl; shots/A/61,62,66,67 | Wire onOpenURL to the router, dismiss any presented sheet before routing, and show a designed "we couldn't find that" state for u… |
| `A-86` | T1/minor | S | Notification rows have inconsistent anatomy and the unread tint does not share a margin | Notifications; shots/A/45-bell-signedin.png | Give every row the same timestamp slot, and inset the tint to the same margin as the separators (or bleed both). |
| `C-15` | T1/minor | S | The message composer has no accessibility label and exposes its placeholder as the field's value | Messages; AX frame {{30,799.7},{288,17}} | .accessibilityLabel("Message") and use a real placeholder rather than a value; raise the tap target to 44 pt. |
| `C-35` | T1/minor | S | The notification badge grows over its bell and, at accessibility sizes, replaces it entirely | shots/C/30-xxxl-today.png, 35-ax3xl-today.png, 54-flagson-ax3xl-tabbar.png | Cap the badge's scaling relative to its anchor, or move the count into the accessibility label only. |
| `C-53` | T1/minor | S | Notification rows read as run-on sentences and announce a timestamp that is not on screen | Notifications AX tree; shots/C/00-preflight-after.png | Split title/description into label and value, drop the phantom timestamp, add the header trait. |
| `C2-01` | T1/minor | S | A cold-launch notification tap is handled twice (route pushed twice, markOpened twice) | apps/mobile/Patina/Patina/App/AppDelegate.swift:44-46 and :141-155 | Dedupe on notification_log_id, or drop the launchOptions branch entirely — the UNUserNotificationCenterDelegate covers the tap ca… |
| `C2-12` | T1/minor | S | The widget gallery preview shows only the empty state | apps/mobile/Patina/PatinaWidget/HouseWidgetProvider.swift:38-45; PatinaWidget/HouseWidget.swif… | Return a fixed sample payload when context.isPreview; the Home Screen path is unchanged, so C5's no-fabricated-rows ruling still… |
| `C2-15` | T1/minor | S | A notification row with no resolvable route draws a chevron and dead-ends on tap | apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift:222-227 and… | Draw the chevron only when notification.route != nil and suppress the button highlight for routeless rows. |
| `C2-17` | T1/minor | S | "Mark all read" also flips queued push envelopes to opened | apps/mobile/Patina/Patina/Services/API/NotificationsAPIClient.swift:101-117 | Add status=in.(delivered,unconfirmed,sending) (or exclude queued) to the PATCH filter. |
| `C2-22` | T1/minor | S | A widget tap wipes an in-progress flow on the flag-off root | apps/mobile/Patina/Patina/App/Coordinators/AppCoordinator.swift:326-331; Patina/App/DeepLinkin… | Treat .heroFrame from an external entry as select/pop-the-home-stack rather than a hard reset, or confirm when the stack top is .… |
| `C4-20` | T1/minor | S | Piece detail paints the error state on the first frame of a deep-linked piece | apps/mobile/Patina/Patina/Features/ProductDetail/Views/ProductDetailView.swift:111-119; Featur… | Initialise isLoading = true when a productId is supplied, or hoist to `if productId != nil && product == nil { loadingView }`. |
| `GAP7-01` +GAP7B-01 | T1/minor | S | The widget gallery card advertises the widget with its empty state | shots/GAP7/41-gallery-preview.png; apps/mobile/Patina/PatinaWidget/HouseWidgetProvider.swift:3… | Return a fixed, clearly-sample payload when context.isPreview; WidgetKit redacts the Home-Screen placeholder anyway, so only the… |
| `GAP7B-06` ⇢L1-E | T1/minor | S | The widget’s eyebrow reads "SINCE TUE" on a Tuesday, for a window that opened the PREVIOUS Tuesday | PatinaWidgetShared/HouseWidgetPayload.swift (eyebrow date logic); sinceDate = 2026-08-25T05:00… | Use a date once the window is older than ~5 days ("SINCE AUG 25"), as the rows already do. |
| `GAP7B-12` ⇢L1-B | T1/minor | S | The widget’s house line changes between launches for no reason the tester can see | widget-snapshot.json houseLine, written from the house rail’s first room (Core/Persistence/Wid… | Order the rail deterministically and pick the house line by a stable rule, not by array order. |
| `GAP7B-15` ⇢L1-C | T1/minor | S | A decision on Today reads "ASKED SEP 1 · OVERDUE" on Sep 1, because its due date precedes the day it was asked | Today NEEDS YOU row (Features/Home) — local row public.client_decisions "Rug color - Natural v… | Clamp/validate due_date >= asked_at where the row is built (and fix the seed), or suppress the OVERDUE stamp when the due date pr… |
| `GAP8-11` ⇢L1-B | T1/minor | S | client_designer_roster 404s on every foreground; profile_presence 404s on every visit | Core/Network/RosterAPIClient.swift:40-61; Services/Auth/ProfileService.swift:150-172; Services… | Apply 00536 and 00538/00539 as part of the 00533–00540 block. Until then the attribution roster is permanently empty and last_see… |
| `B-59` | T1/polish | S | The notification pre-permission sheet has excellent copy in a badly composed layout | After the taste portrait — shots/B/33-signedin-today.png | Centre the block vertically (or top-align it with the buttons pinned to the bottom) and align the buttons to the text. |
| `C5-28` | T1/polish | S | MockNotifications ships outside #if DEBUG with real third-party brand names and a coastal provenance claim | apps/mobile/Patina/Patina/Features/Companion/Services/NotificationManager.swift:137-175 | Delete it, or gate #if DEBUG and reword to Midwest makers. |
| `GAP1-16` | T1/polish | S | Notification rows mix '12h ago' with rows carrying no timestamp at all | Notifications sheet; shots/GAP1/04-decision-list.png | Give every row the same time treatment, or drop it from all of them and lean on the section header. |
| `GAP7-05` | T1/polish | S | A widget row whose subject has since been resolved lands on Today with no explanation | apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift route(forWidgetLink:in:); shot… | Carry the row's route token in the widget payload rather than only its id, or say one line when the fallback fires. |

#### W2 · L2-G Tests & gates — 6

_count: 6 · blocker 0 · major 0 · minor 5 · polish 1_

| id | tier/sev | eff | title | where | fix |
|---|---|---|---|---|---|
| `A4-15` | T1/minor | M | A4-15: the in-process account-switch seam is unit-verified only, never walked | artifacts/ios-daily-return-2026-08-26/waves/w6/integration.md §9.7 item 1; waves/w5/walk.md:34… | One scripted account-switch walk (sign out, sign in as the second account, send from a piece) on a simulator with healthy HID del… |
| `C7-16` | T1/minor | L | 236 unique compiler warnings in the app target, 112 of them 'error in the Swift 6 language mode' | artifacts/ios-testflight-polish-2026-09-01/.build/xcodebuild.log (BUILD SUCCEEDED, 0 errors) | Triage the 112 Swift-6 errors before the language-mode bump; fix the five real concurrency ones now; restore .swiftlint.yml reada… |
| `G-03` | T1/minor | M | XCUITest suite is dead: 7/11 fail against a first-run flow that no longer exists; the 4 passes are Xcode temp… | apps/mobile/Patina/PatinaUITests/FirstLaunchUITests.swift; PatinaUITests/Helpers/FirstLaunchTe… | Either rewrite the suite against the live first-run identifiers (auth.welcome.guestButton, auth.form.emailField, companion.intro.… |
| `G-04` | T1/minor | S | SwiftLint build phase is `\|\| true` — 421 error-severity violations never fail anything | apps/mobile/Patina/Patina.xcodeproj/project.pbxproj:408 | Drop the `\|\| true` once the identifier_name bucket is resolved (G-11), and give the phase an output path so it stops re-running… |
| `G-11` | T1/minor | M | `swiftlint lint` can never exit 0: 421 error-severity violations, 396 of them snake_case DTO keys | research/G-lint.json; heaviest in Patina/Core/Network/*APIClient.swift and Patina/Services/Syn… | Add identifier_name `allowed_symbols` or an excluded path glob for the DTO / API-client files (or move wire shapes behind explici… |
| `GAP1-18` | T1/polish | S | Universal link cold-start relaunches the app without launch arguments (tooling caveat for other lanes) | xcrun simctl openurl https://client.patina.cloud/decisions/<id>; shots/GAP1/20-coldlink-decisi… | Any lane using openurl must relaunch with -DeploymentTarget local afterwards; note this in the steward doc. |

---

### W3 — After round one (T2 and cut; 101 findings)

W3 is not scheduled as a wave. It is the standing backlog that round one deliberately did not spend time
on, plus the three `cut` rows that are recorded as decisions rather than omissions (`C6-22` adaptive
layout used in one feature only, `C7-22` the app's two remaining `print()` call sites, `G-14` no App
Intents / App Shortcuts). Nothing here is tester-blocking; five rows are majors and they are all
programs in their own right.

Summarised by area, because that is how it will be picked up — the per-lane tables live in
`build/findings-by-lane.md` §W3, and `build/findings.json` is the machine-readable source:

| area | total | major | minor | polish | lanes that own them |
|---|---:|---:|---:|---:|---|
| accessibility | 20 | 1 | 13 | 6 | L1-C (14), L1-D (3), L1-E (1), L1-F (1), L1-A (1) |
| copy | 8 | 0 | 3 | 5 | L1-E (7), L1-C (1) |
| auth | 7 | 1 | 4 | 2 | L1-A (5), L1-B (1), L1-F (1) |
| visual-system | 7 | 1 | 1 | 5 | L1-D (4), L1-C (3) |
| performance-resilience | 6 | 0 | 2 | 4 | L1-B (4), L0.2 (1), L1-F (1) |
| rooms-scan | 6 | 1 | 3 | 2 | L1-B (4), L0.2 (1), L1-E (1) |
| notifications | 5 | 0 | 4 | 1 | L1-F (5) |
| settings-account | 5 | 0 | 3 | 2 | L1-A (2), L1-C (2), L1-E (1) |
| testflight-config | 5 | 0 | 0 | 5 | L0.1 (4), L0.5 (1) |
| money | 4 | 0 | 1 | 3 | L1-C (2), L0.3 (1), L1-D (1) |
| other | 4 | 0 | 0 | 4 | L1-C (2), L1-B (1), L1-D (1) |
| prod-readiness | 4 | 0 | 2 | 2 | L0.2 (2), L1-F (1), L1-B (1) |
| today-home | 4 | 0 | 1 | 3 | L1-C (4) |
| help-tour | 3 | 0 | 1 | 2 | L1-C (2), L0.4 (1) |
| onboarding | 3 | 1 | 2 | 0 | L1-A (3) |
| widget-deeplinks | 3 | 0 | 1 | 2 | L1-F (3) |
| browse-saved | 2 | 0 | 1 | 1 | L1-C (2) |
| studio-designer | 2 | 0 | 2 | 0 | L1-C (2) |
| companion | 1 | 0 | 0 | 1 | L1-C (1) |
| messaging | 1 | 0 | 0 | 1 | L1-F (1) |
| tests-gates | 1 | 0 | 1 | 0 | L2-G (1) |
| **all areas** | **101** | **5** | **45** | **51** | 12 lanes |

The five T2 majors, each a program rather than a task:

| id | lane | what it really is |
|---|---|---|
| `C6-10` | L1-C | 61 of the 125 files containing an interactive control carry no accessibility label at all. Treat as a labelled work item per feature — Authentication, Rooms, ARPlacement, Account and Settings first — not one sweep. |
| `C3-11` | L1-D | The design system is largely unadopted: 4 of 13 published components have zero call sites while 111 card surfaces are hand-rolled. This is the **root cause** of `C3-01`, `C3-05`, `C3-09`, `C3-12`, `C3-22`; round one fixes the tester-visible symptoms and this is the follow-on program. |
| `B-30` | L1-B | Three unrelated UIs exist for creating a room. Collapse to one room-attributes component reused by create, edit and the scan fallback. |
| `A-71` | L1-A | Google sign-in asks the user to trust a raw backend hostname. Fixed by a Supabase custom auth domain (`auth.patina.cloud`) — which also closes `GAP1-10`. Only matters if D3 says "enable Google" rather than "drop the button". |
| `C3-07` | L1-A | The three onboarding illustrations are self-declared placeholders (`// MARK: - Illustrations (placeholder…`). Nothing here is salvageable by tokens; it needs real illustration, photography, or a deliberately typographic treatment. |

Also in W3, and worth naming so they are not lost: `A3-26` (21 SECURITY DEFINER views, one RLS-disabled
public table `_comms_backfill_legacy_map`, leaked-password protection off — 1,207 security lints),
`A3-27` (441 `auth_rls_initplan` + 1,147 `multiple_permissive_policies` — wrap every policy's
`auth.uid()` as `(select auth.uid())`; one migration, after the catalogue seed), `A3-24` (guest browsing
writes a `match_events` row per anon `get_recommendations` call — needs a rate limit or a sampling gate
before any wider TestFlight), and `A3-12` (`increment_scan_upload_attempt`), which W0's L0.2 pulls
**forward** because it is the only object still genuinely missing from production.

---

## 6. Decisions for Kody

**Fifteen rulings.** Each has a default so no lane stalls on silence — but a default taken is recorded
in the lane's report as *taken by default*, not as agreed. **D1, D8, D11 and D12 are the four that
change the shape of the program;** D2, D7 and D11 are the three that block other people's work.

| # | Question | Recommendation | What it blocks | Default if unanswered |
|---|---|---|---|---|
| **D1** | **Cohort and flags.** Is round one Leah's active clients, with `house-first`, `direct-orders` and `house-widget` all off? | **Yes.** VISION §1 puts the iOS app second, as the studio's front door; §2 names the first homeowner cohort as Middle West's active design clients; §6 refuses tab-bar UI. The Record and the Studio surfaces are the product. ⚠ **Two open VISION inputs feed this:** §7 **V3** (*"pause the consumer Founding Circle (0/200) until at least one studio beyond Leah's is live?"* — *"the marketing engine has been pointed at the wrong door for ten weeks"*) and §2's own parenthetical on the beta cohort (*"read as the studio's current clients; **confirm**"*). This program is explicitly **not** the consumer Founding Circle. If V3 rules the other way, D1 re-opens before any invite. | L0.6 (flag targets), L0.5's What-to-Test wording, the whole W1 walk posture | Proceed as recommended; the Release first-launch state is flags-off anyway. **V3 unanswered does not stall the build — it stalls the invite.** |
| **D2** | **Catalogue.** Who supplies ≥ 30 Patina-grade pieces with images, and by when? | **Leah's library first.** The 14 `layer='personal'` rows are Kody's Chrome captures with placeholder names hot-linked to third-party CDNs (`A3-25`) and stay invisible. If the pieces are not in hand by **end of day 6**, build 1 ships the honest "still curating" state. | L0.3 entirely; the second half of `A4-02`; L1-D's placeholder work; the first "already known" bullet in What to Test | Call the fallback on day 6 and centre round one on the Studio surfaces |
| **D3** | **Google sign-in.** Enable the provider on Strata, or drop the button? | **Drop it for round one, and render providers from `/auth/v1/settings`.** `google: false` is live; GoTrue answers `400 validation_failed — "Unsupported provider"`, and `AuthService.signInWithGoogle` puts that raw string on the Welcome screen. Enabling it needs a Google OAuth client **and** a Supabase custom auth domain, or the consent sheet names a raw backend host (`A-71`, `GAP1-10`). | `A3-06` (a T0 blocker), L1-A's first task | Drop the button; the settings-driven rendering ships either way |
| **D4** | **iPad.** Drop `TARGETED_DEVICE_FAMILY` to `1`? | **Yes.** iPad is a device family with no iPad design and zero size-class handling across 435 files. `1,2` + portrait-only + no `UIRequiresFullScreen` is the classic ITMS-90474 upload rejection, and it moots eleven of the thirteen GAP5 geometry findings. | `A2-03`, `C7-11`; W2's GAP5 scheduling | Set `1`; iPad support is a design program, not a build setting |
| **D5** | **Widget.** Ship it in build 1 with the flag-off rendering fixed, or hold the extension? | **Ship, fixed.** The widget renders its snapshot; the flag gates in-app promotion only. Holding it costs the one device claim the Daily Return could never make. | `GAP7B-02`; L1-F's `WidgetFlagOffRenderingTests`; device row D-10 | Ship with the fix |
| **D6** | **Deployment target.** 26.0 instead of 26.5? | **26.0.** There is no `@available(iOS 26.5)` anywhere; the only version gates in the code are four `#available(iOS 26.0, *)` sites. 26.5 excludes any tester not yet on that point release, and they meet the exclusion at the invite, not in the app. | `A2-13`; the archived `MinimumOSVersion` check in R1 step 2 | Set 26.0 |
| **D7** | **Demo account, the mechanism.** Wire the `test-account-login` fallback into `AuthService.verifyOtp` so a fixed six-digit code works in the app? | **Yes — it is small and it unblocks three things at once.** Today the app has no reference to `test-account-login` at all; `verifyOtp` calls GoTrue directly, which has no such OTP on file. Without it the beta review notes promise a credential that fails, and no agent or walker can sign in on production. **Which address the fallback allowlists is D11, not this.** | `A3-16`; L0.5's beta review notes; the W1 production walk; device row D-04 | Build it — treat "no answer" as yes, because the beta review notes cannot be written without it |
| **D8** | **Security migration sequencing.** When does 00555 go to Strata? | **As soon as L0.2b's three code follow-ups are merged and the designer portal is redeployed — day 2, not day 1.** The exposure is live right now (24 `profiles` rows with emails, Stripe customer ids, phones and addresses; full read/write on `notification_preferences`; and a third, `app.patina.cloud/api/catalog/vendors` returning all 13 trade columns unauthenticated). But the migration's own head-of-file block names **three required code follow-ups**, and two are in the live designer portal: after 00555, `api/catalog/vendors/{route,[id]/route}.ts` return **500** and `use-comms.ts:1060` **throws 42501** onto every screen that lists vendors. Applying first takes VISION's surface #1 down to unblock surface #2 (§0). The route guard in follow-up (2) closes the third exposure *today*, independent of the migration — so the fastest safe order is also the fastest order. | L0.2's whole lane; G3; W1's local walk | **Not "today" unqualified.** Ship L0.2b, redeploy, verify the two probes, then apply — and if L0.2b is not done by end of day 2, apply the **route guard alone** (it needs no migration) and hold 00555 one more day |
| **D9** | **Push credentials.** Are `APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_TOPIC` present on the edge runtime? | **Confirm before the device pass.** They are edge-function env, not Vault — A3 could not read them, and memory records the `.p8` as owed since arrival-arc. `apns-send` is ACTIVE v20 and picks the APNs host per token, so the plumbing is right; the credentials are the unknown. | Device row **D-07**; the value of `C2-09`, `C2-10`, `GAP7B-*` push work | D-07 is reported **blocked**, not failed, and push claims stay at compile-green |
| **D10** | **Stripe on production.** Live key plus the Tax/shipping ruling, so an invoice can actually be paid in round one? | **Either is acceptable — say which.** If not ready, the invoice Pay path shows the world-class failure state and What to Test says so plainly. What is not acceptable is a Pay button that fails without saying why. | Device row **D-12**; What-to-Test wording; `B-28`/`GAP2-24` (the Pay button below the fold behind the tab bar) | Ship with the failure state and name it in What to Test |

| **D11** | **Which account is the demo account?** A clean, purpose-built round-one client account, or `tester@patina.cloud`? | **A clean, purpose-built client account, minted by L0.2 before L0.5 writes the notes.** `A3-15` records that `tester@patina.cloud`'s notification feed is **four designer-portal messages, one deep-linking to `https://app.patina.cloud/help`** — a host this app does not claim. An Apple reviewer following the beta review notes signs in and lands on internal designer mail with a dead link, on the screen this program exists to make world-class. The charter as first drafted both replaced this account (L0.2's exit) and hard-wired it (L0.5's notes, D7, device row D-04). | L0.5's `beta-review-notes.md` **and** its `review edit` command; D7's fallback allowlist; `A3-15`; device row D-04 | Mint the clean account. **If `tester@patina.cloud` is kept instead, `A3-15` becomes a W1 · L1-F row** (filter the iOS feed to client entity types) and L1-F's W1 count goes to 17 |
| **D12** | **Promote twelve T1 rows into W1?** The three scan-fallback blockers, the Reveal CTA, the four Dynamic-Type / tap-target / sheet rows L1-C's own tests already assert, the Pay-button clearance, and the three account-isolation rows. | **Yes.** Build 1's What to Test sends a tester to add a room (`GAP4-02`/`03`/`25`) and into the accessibility sizes (`GAP1B-03`/`07`/`08`); L1-C's W1 test list already names `GAP1B-07`, `GAP1B-08`, `GAP1B-03` and `C-23`, so without the promotion the lane either writes tests that must fail or does W2 work on a W1 budget; device row **D-17** claims account isolation and cites `B-15`, `C2-06`, `GAP3-18`. Effort: eleven S, one M. | The whole of §3's W1 tables, §5's W2 tables, What to Test items 6–7, device rows D-12 and D-17, L1-C's exit criteria | **Promote** (already applied throughout this charter, marked ⇧D12). The alternative is deleting What-to-Test item 6, softening L1-C's exit to "visible" from "visible and tappable", and recording D-17 as failing three of four sub-claims on build 1 |
| **D13** | **`increment_scan_upload_attempt`:** write it (00556) or delete the call? | **Write it.** It is the one object `A3-12` named that is genuinely still missing from production. Mirror `mark_scan_upload_complete`'s shape and grants (non-DEFINER, anon + authenticated EXECUTE). Deleting the call at `RoomScanSyncService+AdvancedBundle.swift:649` is a behaviour change in a lane (L1-B) that is not otherwise touching the upload path, made under time pressure, to save one small migration. | L0.2's exit criterion; whether L1-B carries an extra integration note | Write 00556 |
| **D14** | **W1 merge order** after L1-C. | **L1-C → L1-D → L1-B → L1-F → L1-A → L1-E**, with `ios-gate.sh build + release` on the integration tip between each. L1-D second because tokens are the other whole-app sweep; L1-E last because its deliverable is a copy deck other lanes apply and it rebases onto everything. | The steward's integration step; every lane's rebase | Take the order as written |
| **D15** | **Does the widget ship its own `PrivacyInfo.xcprivacy`?** | **Yes.** `A2-02`'s own fix line says the widget needs one because it touches `UserDefaults` via the App Group, and ITMS-91053 is evaluated **per binary** — an app-only manifest still parks processing on the appex, which is exactly the state R1 Step 4 identifies as where ITMS-91053 lands. Cost: one plist. | L0.1's owned files; `PrivacyManifestTests`; the archive `find` in R1 Step 2 | Ship both manifests |

Two standing items from the Daily Return's OWED list are folded in and need no new decision: the Sanity
tour copy (**L0.4**) and the PostHog flags (**L0.6**).

**One VISION ruling is an input, not a decision this program can take.** §7 **V3** (the consumer
Founding Circle) and §2's "confirm" on the beta cohort both feed **D1**. They are logged in
`VISION-DECISIONS.md`, not here; this charter only records that D1 is downstream of them, and that the
build proceeds while they are open — the *invite* does not.

---

## 7. Team model, the wave workflow, and the hard rules

### Team model (per wave)

| Role | Model | Owns |
|---|---|---|
| **Steward** | Opus | Worktrees + bootstrap + `Secrets.swift` copied into each; one simulator clone per lane (shut the review device down for a minute to clone it); the migration-number check; the integration branch; merge order; conflict resolution; `ios-gate.sh all` + `release` + `archive` + `lint-delta` on integration; worktree and clone retirement |
| **Lane implementer** | **Opus** for L0.1, L0.2b, L1-A, L1-B, L1-C, L1-F (build config, portal read paths, auth, persistence, layout, routing) · **Sonnet** for L0.7, L1-E and L2-G | Its task list (written first), code + tests, its own gate on its own clone, pathspec commits, an evidence-grounded report |
| **Lane reviewer** | **Opus** for L0.2, L1-B, L1-F (backend, data, routing) · **Sonnet** elsewhere | Adversarial review of the lane branch against this charter and the finding ids it claims. **Always a separate context — the implementer never reviews its own work.** Fix rounds return to the same implementer |
| **Backend / prod-prep** | Opus | 00555 and any sibling migration, the SQL tests, the seeding and image pipeline, every read-only probe script; hands Kody a runbook, never runs the mutation |
| **Copy** | Sonnet, Opus review | L1-E; the L0.5 texts; the Sanity bodies staged for L0.4 |
| **Walker** | Sonnet | The review simulator (or its own clone), the wave's acceptance script, shots under `shots/w<n>-*`, the ledger, `build/waves/<wave>/walk.md` |
| **Mechanical** | Haiku | Bulk renames, literal sweeps (the 89 `pearl` sites, the 46 inline fonts), file searches, evidence indexing |
| **Orchestrator (Fable)** | — | Reads every report, filters review findings at synthesis, merges to `main` with `--no-ff`, pushes, updates memory, opens the next wave |

Reviewer briefs say **"report every finding with confidence + severity"** — never "only report
high-severity issues". A severity filter depresses recall on Claude 5 models; Fable filters at
synthesis.

Opus 5 briefs say: deliver exactly what is asked, no unrequested features or refactors; name the exact
gate command; comments only for constraints the code cannot show; concise, evidence-grounded report.
They do **not** say "verify your work" — Opus 5 self-verifies and the padding causes over-verification.
Sonnet 5 briefs state scope and coverage explicitly ("all 28 findings in your table", "only these
globs") — it follows briefs literally and will not generalise intent.

### How a wave runs

1. **Steward bootstraps.** `git worktree add .codex/worktrees/agent-ff-<wave>-<lane>` on
   `first-flight/<wave>-<lane>` from the wave base (unsandboxed — the sandbox denies the `.env*` files a
   checkout writes). Copy `Patina/App/Configuration/Secrets.swift` into each worktree; never commit it.
   `mkdir .writer.lock.d` at start, `rmdir` at report — one writer per worktree, and a replacement only
   after the lock owner is proven dead. Clone the review simulator once per lane
   (`xcrun simctl clone 973D1724-90BF-4A0A-B02D-481D561547B3 "ff-<wave>-<lane>"`), erase it, reset its
   keychain, apply the status-bar override, and record the udid in the wave's clone table. Note: the
   first `xcodebuild` in a fresh worktree fails on `GitCommit.swift` — run it twice (until L0.1 fixes
   `A2-08`).
2. **Lanes work.** Task list first, at `build/waves/<wave>/<lane>-tasks.md`, in the superpowers
   `writing-plans` format. Every task list carries four standing lines before its first task:
   - `IOS_GATE_UDID=<this lane's clone>` — exported for the session, and the gate refuses without it.
   - **The VISION check:** *name any finding in my table whose fix would add or entrench something
     VISION §6 refuses (tab / zone / dashboard UI, shadows, red/green status, badges, engagement
     optimisation, the "AI" label) and say why it survives.*
   - **The notes I must apply:** every integration note addressed to this lane, as numbered tasks —
     including its rows from L1-E's copy deck.
   - **The notes I will send:** every change this lane wants in another lane's file, with the exact
     final text.

   Then tests first. The whole `PatinaTests` tier on the lane's own clone. Pathspec commits. Notes at
   `build/waves/<wave>/<lane>-notes.md`.
3. **Reviews.** Separate contexts, one reviewer per lane, every finding with confidence and severity.
4. **Fix rounds** return to the same implementer until zero blocking findings.
5. **Steward integrates** on `first-flight/integration` in the **full W1 order — L1-C → L1-D → L1-B →
   L1-F → L1-A → L1-E** (**D14**) — running `ios-gate.sh build` + `release` between each merge, then
   `ios-gate.sh all` + `release` + `lint-delta` on the final tip, and `pnpm supabase:reset` +
   `bash scripts/run-sql-tests.sh` (vs `KNOWN_FAILURES.md`) when the wave carries a migration.
   **`archive` is not a steward command** — it is R1 Step 2, on Kody's machine.
6. **One walker per clone** on the review simulator, flags off, on the steward's **signed** build.
7. **Fable merges to `main`** (`--no-ff`, reads the merge log, not `tail -1`; clears untracked shot
   duplicates first), pushes unsandboxed, retires worktrees, branches and clones
   (`scripts/repo-gc.sh` sweeps stragglers), and commits `build/waves/<wave>/`.

If an agent dies mid-lane — API errors happen — resume the run, or re-dispatch the lane rebased onto the
integration tip. The Daily Return's `w2-r2-resume.js` is the template.

### The hard rules, learned the expensive way

1. **One simulator clone per lane. Never shared.** Tonight GAP1 and GAP7 drove clone C at the same
   time; GAP1 recorded "the app is crashing" and "cold launch shows a sign-in wall to a signed-in user",
   and had to withdraw both after re-running clean. The system log gave the real cause:
   `RBSProcessExitStatus | domain:frontboard(10) code:force-quit(0xfbfbfbfb)`, `"isUserKill":0`,
   `explanation: Termination requested by simulator host` — another lane's `simctl terminate`. Two
   agents on one clone manufacture defects.
2. **`describe_screen` over `scan_ui`.** An unqueried `scan_ui {region:"full"}` returned `[]` on the
   Welcome screen while `describe_screen` returned the full 14-node tree with every `AXUniqueId`. On two
   other clones even a *queried* `scan_ui` returned `[]` for a control `describe_screen` showed as
   present and enabled at `{{27.25, 552.25}, {347.5, 51.5}}`. **Never conclude a control is missing from
   an empty `scan_ui`** — confirm with `describe_screen` first.
3. **Never desktop capture.** Screenshots come only from `xcrun simctl io <udid> screenshot` or the
   blitz screenshot tool. A W4 agent's `screencapture -R` once caught an unrelated personal window. The
   desktop is Kody's.
4. **Repeat the launch arguments on every launch.** `NSArgumentDomain` is volatile:
   `-DeploymentTarget local` and `-PatinaFlags …` must be on the relaunch too, or the app silently talks
   to **Strata production**. Persisting `DeploymentTarget` into the app container's plist does **not**
   work (cfprefsd cache). An argument-less launch is a production launch.
5. **Keychain reset for fresh state.** The simulator keychain survives an app uninstall.
   Fresh-install state is `terminate` → `uninstall` → `xcrun simctl keychain <udid> reset` → `install`
   → re-apply the status-bar override. `--resetonboarding` resets onboarding flags only.
6. **Never `CODE_SIGNING_ALLOWED=NO` for a walk.** It strips entitlements, the keychain rejects every
   call, sessions never persist and writes silently no-op. It is correct for `ios-gate.sh build` and
   `release`; it is never correct for something a human or an agent will drive.
7. **Never `--uitesting` for a walk.** It resets auth on every launch and disables PostHog.
8. **Explicit udid on every call — including inside `ios-gate.sh`.** Never `booted`. The gate's
   `sim_destination()` scrapes `xcrun simctl list devices available | grep -iE 'iPhone (17|16|Air)' |
   grep -oE '[0-9A-F-]{36}' | head -1` with no override, so with six lane clones plus the protected
   review device `973D1724-90BF-4A0A-B02D-481D561547B3` present, `ios-gate.sh unit` and `all` will run
   one lane's tests on another lane's clone — Hard Rule 1, broken by the script that enforces it.
   **L0.1's first-day change makes `IOS_GATE_UDID` required** for the unit and ui tiers, and gives every
   xcodebuild invocation a per-worktree `-derivedDataPath`. Until that lands, no lane runs `unit` or
   `all` — only `build`, which takes a generic destination. HID preflight before trusting any input:
   `describe_screen`, tap a known control, screenshot, confirm the screen changed — headless-booted
   simulators swallow synthetic input while screenshots look healthy.
9. **iOS system dialogs are invisible to the automation tools.** "Save Password?", permission prompts
   and Face ID live in another process. Tap them by screenshot coordinates: logical points = pixel ÷ 3
   (screenshots are 1206×2622 px = 402×874 pt).
10. **Wait after a layout change.** ≥ 250 ms after any layout-changing action, 1 s after navigation, and
    never batch taps across a layout change. If a tap does not land after three attempts with settle,
    record it as a finding or a coverage gap and move on. Never loop.
11. **`git add -A` is banned.** Stage explicit pathspecs. Untracked landmines are real in this repo —
    `git status` at charter time lists thirty-odd untracked directories.
12. **`swiftlint lint` cannot pass.** Use `lint-delta` only, until L2-G resolves the 396
    `identifier_name` errors in W2.
13. **A green simulator run is not a device claim.** Universal links from Mail, App Groups on glass,
    APNs delivery, Apple Pay, LiDAR/AR and the widget on a Home Screen are device-verified or they are
    not claimed.

---

## 8. Risks, and the slip rule

| # | Risk | Shape | Mitigation |
|---|---|---|---|
| R1 | **Content is the long pole and is not an engineering task.** Thirty Patina-grade pieces with photography, provenance and prices is Leah's week, not an agent's. | L0.3 slips; every product surface stays empty; the quiz → recommendations → save loop terminates on nothing | The honest "still curating" state is the hedge, and it must be **built in W1 regardless** so calling the fallback on day 6 costs nothing. D2 forces the call. |
| R2 | **Six W0 items are Kody-run and hook-blocked for agents.** | W0 stalls on availability, not on work | Sequence: security (00555) first, because it is independent of TestFlight; then ASC, PostHog, Sanity; content runs in parallel from day 1. Every Kody-run step in this charter ships with the exact command and a read-only probe an agent runs afterwards. |
| R3 | **The Companion inset change touches every screen.** | L1-C's merge conflicts with all five other lanes | L1-C merges **first** and gets its own walk before the others rebase onto it. |
| R4 | **The first archive is the riskiest step in the program and it has never been run.** No `Release*` directory exists in any of the ~40 `Patina-*` DerivedData trees; `~/Library/Developer/Xcode/Archives` does not exist. Whole-module optimisation over 92k LOC, the Stamp-Git-SHA phase under `CONFIGURATION != Debug`, distribution signing with an embedded appex, `ENABLE_NS_ASSERTIONS=NO`, dSYM emission — all unproven at once. | L0.1 finishes, and the archive fails on something no gate could have seen | `A2-07`'s throwaway dry run is L0.1's **first** task, not its last: archive + export purely to see what breaks, before any other W0 work is scheduled against it. |
| R5 | **A clean checkout does not compile.** `Secrets.swift` (gitignored, and its example twin excluded from the target) and `GitCommit.swift` (gitignored, compiled, directory not a sandbox-declared output under `ENABLE_USER_SCRIPT_SANDBOXING = YES`) mean the release is reproducible on exactly one Mac. | Any CI archive, any fresh worktree, any second machine dies at the mkdir or the compile | `A2-08` / `A2-09` are in L0.1's W2 table; for W0 the steward copies `Secrets.swift` into every worktree and runs the first `xcodebuild` twice. Promote both to W0 if a second machine is ever needed. |
| R6 | **The device pass depends on Xcode-beta** for Kody's iOS 27 phone. | The beta toolchain fights the automation; WDA must target 15.0; Airplane Mode is one-way | The iPhone 13 Pro on the network is the alternative LiDAR device on a release iOS. D-05 and D-07 can move there. |
| R7 | **Push and payment credentials are outside the audit's reach.** APNs env is edge-function env, not Vault; the Stripe key is Kody's. | D-07 and D-12 cannot run | D9 and D10 force the call before the device pass is scheduled; the rows report **blocked**, never passed. |
| R8 | **00555 breaks The Document.** Not "a real feature" — VISION's **surface #1**. Two of the migration's own three required code follow-ups are in the live designer portal: `api/catalog/vendors/{route,[id]/route}.ts` return **500** afterwards, and `use-comms.ts:1060` **throws 42501** onto every screen that lists vendors. `ScanSharingService.searchDesigners()` returns `[]` and the share picker goes empty. | A security fix that takes the studio's working surface down on day one, to unblock the app the vision ranks second | **Sequencing, and it is a decision (D8), not a note.** L0.2b ships the three follow-ups and the designer portal is redeployed **before** the migration is applied; L0.2's apply runbook opens with a Step 0 that checks the deploy and stops if it is not there. The `search_shareable_designers` and `list_vendor_profiles` RPCs are inside 00555 itself. The regression walk (vendors catalogue, comms vendor picker, people directory, roster avatars) is half of G3. |
| R11 | **A third exposure is live right now and is not the app's.** `https://app.patina.cloud/api/catalog/vendors` returns all 13 internal trade columns to an unauthenticated `curl` — no `getUser()` guard, and the portal middleware passes `/api/*` through. | It has been open for as long as the route has existed, it is unrelated to TestFlight, and 00555 does not fix it — it converts it to a 500 | The `getUser()` guard is **L0.2b's first task and needs no migration**, so it can ship on day 1 independent of everything else. G3 probes the HTTP route as well as PostgREST, because they are different principals and a PostgREST-only probe passes while the route is open. |
| R12 | **W2 is 349 findings called "a week".** L1-C alone would carry 114. | The wave overruns, W3 never opens, and the tester-feedback intake — the only thing in the program that hears from a real client — competes with a backlog | W2 has a stated capacity (§5): all 121 majors, minors only where a major already opens the file, everything else rolls to W3 unextended. L1-C splits into two sub-lanes with separate clones. Tester-reported defects outrank all of it. |
| R9 | **The UI tier proves nothing.** Zero passing assertions about the product on exactly the first-run path this round exercises. | A regression on the first five minutes lands on `main` unnoticed | Every W1 lane's new suites are `PatinaTests`, which is healthy; L2-G rebuilds `PatinaUITests` in W2. Until then the walk **is** the UI gate, which is why one walker per surface is not optional. |
| R10 | **Two agents, one clone.** | Fabricated defects, withdrawn a day later | Rule 1 in §7, enforced by the steward's clone table. |

### The slip rule

VISION §6: *"Launching to an empty room — slip rather than demo something broken."*

Concretely, **build 1 does not go to Leah's clients** if any of these is true on the morning of the
invite:

- the archive has not produced a `processingState VALID` build;
- 00555 is not applied, or a probe still returns 200 for anon on `profiles` or
  `notification_preferences`, or `curl https://app.patina.cloud/api/catalog/vendors` still answers 200
  with trade columns to an unauthenticated caller (the third exposure — it is not the app's, and it is
  still a reason not to invite anyone);
- the designer portal has regressed on any of the four surfaces 00555 touches (vendors catalogue, comms
  vendor picker, people directory, roster avatars). **The Document takes precedence over the invite.**
  A round-one invite that ships while Leah cannot work is not a slip, it is a trade against the surface
  VISION ranks first;
- **L0.7's coverage walk has not run**, or ran and produced a blocker on proposals, invoices, documents,
  projects or message send that is neither fixed nor named in What to Test. G5b is not a formality: those
  surfaces were never walked, and "we did not look" is not "it works";
- the marketplace shows neither real pieces nor the honest "still curating" state;
- the first screen still offers a provider that cannot succeed, or a failed sign-in still puts a server
  string on the root;
- a decision cannot be approved at the tester's own text size;
- the device pass has an unexplained failure — as distinct from a row **blocked** on D9 or D10, which is
  a known, named, communicated gap.

Slipping is a day. An invited client who opens an empty room is a relationship, and VISION §2 says the
whole acquisition model is 1:1 through Leah's network. There is no second first impression to spend.

---

## 9. Appendix

### File index — the program folder

```
artifacts/ios-testflight-polish-2026-09-01/
├── source/
│   └── brief.md                     the audit brief: the bar, the standing facts, the simulator rules
├── research/                        the lane ledgers — every finding's evidence lives here
│   ├── 00-steward.md                clone table, the one signed build, launch commands, reset recipe,
│   │                                and §8 "what a walker must know that differs from the brief"
│   ├── 40-workflow-result.json      607 confirmed / 28 refuted / 189 duplicate, with judge notes
│   ├── 40-result-summary.md         the same, rendered
│   ├── A.md · A1-anatomy.md · A1-screens.json      screen inventory and route graph
│   ├── A2-config.md                 TestFlight / App Store readiness — pbxproj, plists, entitlements, ASC
│   ├── A3-prod.md                   production readiness (Strata) — the exposures, the empty catalogue,
│   │                                auth settings, Sanity state, advisors ⚠ its migration-gap premise
│   │                                is superseded; see §1 "Production reconciliation"
│   ├── A4-reconciliation.md         prior-review carry-over (U-numbers, Daily Return F-numbers)
│   ├── B.md · C.md · C1–C9 · C4-matrix.md · C5-strings.txt (303 KB string inventory)
│   ├── G-gate.md + G-*.log/json     the gate runner: unit, UI, Release, archive, lint, Assets.car
│   ├── P.md + P-log-*.txt           the production-parity walk (clone P, no launch arguments)
│   ├── R.md                         resilience: outage, recovery, timeouts, false empties
│   ├── GAP1.md … GAP8.md            the eight gap-fill lanes; GAP1 and GAP7 are the two resumed ones
│   │                                whose GAP1B-/GAP7B- rows are ledger-only
│   └── gap7-probe.sh · gap7-signedout.sh    the deep-link protocols L1-F re-runs
├── shots/                           45 of 100 screens, by lane
├── build/
│   ├── PLAN-SKELETON.md             Fable's architecture as FIRST DRAFTED — superseded in detail by
│   │                                PROGRAM.md §3 and findings.json; read its head-of-file delta note
│   ├── findings-by-lane.md          629 findings placed in exactly one lane, plus the assignment notes
│   │                                ⚠ its wave column predates D12 and the four reconciliation
│   │                                closures; findings.json and PROGRAM.md carry the current schedule
│   ├── findings.json                the machine-readable set (id, lane, wave, tier, severity, where,
│   │                                evidence, fix, alsoTouches, mergedIds, ledgerId, shots, and —
│   │                                added this revision — promotedBy / closedBy)
│   ├── findings.json.bak            the pre-revision set, for diffing the 16 rows that moved
│   ├── migrations-draft/
│   │   ├── 00555_ios_round_one_security.sql       drafted in full, never applied
│   │   ├── 00555_ios_round_one_security.test.sql  psql, not pgTAP — supabase/tests house style
│   │   └── 00555_probes.md                        the ten probe sets and the Kody-run apply step
│   ├── PROGRAM.md                   ← this charter
│   ├── PROGRAM.md.bak               the pre-critique draft
│   └── waves/<wave>/                task lists, notes, reviews, walks — created as the program runs
│       ├── w0/l0.2b-tasks.md            the three portal follow-ups (FF-01a/b/c)
│       ├── w0/l0.7-coverage-walk.md     the surfaces the audit never reached
│       ├── w0/beta-description.md · beta-review-notes.md   L0.5's texts, drafted before D11 lands
│       ├── w1/l1-e-copy-deck.md         id · file:line · today · final · owning lane
│       ├── w2/lane-split.md             which L1-C id went to C1 and which to C2
│       ├── w3/00555-degradations.md     the nine silent degradations, with a verdict each
│       └── r1/asc-ids.md · what-to-test-build1.md · device-pass.md
```

### Related files outside the program folder

| Path | Why |
|---|---|
| `docs/vision/VISION.md` | Authority over every other document. Re-read before any scope call. |
| `artifacts/ios-daily-return-2026-08-26/source/build-plan.md` · `RESUME.md` | The wave pattern this charter mirrors, and the OWED list two of these lanes inherit |
| `artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md` | The tour bodies L0.4 publishes |
| `apps/mobile/Patina/scripts/ios-gate.sh` | The gate. L0.1 adds `release` and `archive`. |
| `apps/mobile/Patina/.claude/skills/asc-*` | 25 scoped App Store Connect skills; `asc-cli-usage` documents the CLI, `asc-build-lifecycle` and `asc-testflight-orchestration` cover R1 |
| `.claude/skills/patina-brand-voice/SKILL.md` | The voice L1-E and L0.5 write in |
| `.claude/skills/patina-ios-verification/` | Claim levels; Simulator vs device |
| `.claude/skills/patina-db-migrations/` · `patina-deploy/` · `patina-prod-ops/` | L0.2's procedures and footguns |
| `.claude/skills/patina-parallel-work/` | Worktrees, clones, migration-number collisions |

### How to resume

> Read `artifacts/ios-testflight-polish-2026-09-01/build/PROGRAM.md` and the memory file. The audit is
> complete and read-only; 629 findings are in `build/findings.json`, of which **625 are scheduled and 4
> are closed by the §1 reconciliation**. Nothing has been built yet.
>
> Start by getting Kody's answers to **D1–D15** (§6). **D2, D7 and D11 block other people's work**
> (the catalogue, the demo-account mechanism, the demo-account identity); **D8 and D12 change the shape
> of the program** (00555's sequencing behind L0.2b, and the twelve T1 rows promoted into W1).
>
> Then open **W0** as one Workflow, in the order §3 gives: L0.3's content request to Leah goes out the
> first morning because it is the long pole; **L0.2b** starts the same morning because it gates 00555;
> L0.1 starts with the throwaway archive dry run (`A2-07`) before any other W0 work is scheduled against
> it; L0.7 walks the surfaces nobody walked. **00555 does not go to Strata until L0.2b's follow-ups are
> merged and the designer portal is redeployed** — applying it first returns 500s on
> `app.patina.cloud/api/catalog/vendors` and a 42501 error state on every comms screen that lists
> vendors. That is §0's guard rail: The Document never breaks to unblock the app.
>
> Re-probe production before trusting `A3-03`'s premise: 00533–00540 **are** applied and
> `delete-account` **is** deployed (verified 2026-09-01, §1) — those four rows carry no work. The two
> anon-key exposures, **the third exposure on the portal's own HTTP route**, and the empty catalogue are
> still open.

**State at charter time:** `main` at `d7287c3f8`. Nothing from this program is on a branch. No
worktrees, no clones — the audit's four clones were deleted at teardown; the review simulator
`973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, iOS 26.5, 402×874 pt) was shut down and never
erased, and is the clone source. Strata migration head is **00554**; 00555 is drafted and unapplied.
ASC app **6762007888** holds one expired build, `1.0 (2)` from 2026-05-12, and two empty beta groups
created 2026-09-01.

---

## 10. Critique dispositions

The plan critic's verdict on the first draft — *"the coverage arithmetic is clean and the charter is the
best-evidenced build plan this repo has produced… the failures are not in the bookkeeping; they are at
the seams"* — is taken as written. Thirty findings, four of them release-stopping. Every one is
answered below with **fixed** or **declined (with the reason)**. Nothing is deferred silently.

### Blockers

| id | Disposition | What changed |
|---|---|---|
| **FF-01** — 00555's own follow-ups break the live designer portal, and no lane owns them | **Fixed** | New lane **L0.2b — The Document's read paths** (§3), owning `apps/designer-portal/src/app/api/catalog/vendors/{route,[id]/route}.ts` and `packages/supabase/src/hooks/use-comms.ts`. **D8 is rewritten**: 00555 applies only after those merge *and the designer portal is redeployed*, and L0.2's apply runbook now opens with a Step 0 that checks the deploy and stops. The single-file SQL gate is replaced by `bash scripts/run-sql-tests.sh` vs `supabase/tests/KNOWN_FAILURES.md`, as the migration's own AFTER-APPLY block instructs. A designer/admin-portal regression walk (vendors catalogue, comms vendor picker, `people_directory`, roster avatars) is now half of **G3** and an L0.2 exit criterion. The migration draft's head block is retitled *"SHIP AND DEPLOY THESE FIRST"* and gains the `list_vendor_profiles()` RPC the hook needs. §0 states the rule this all encodes: The Document never breaks to unblock the app. |
| **FF-02** — G5 covers surfaces with no findings, no owner, no coverage | **Fixed** | **G5 splits.** G5a is what W1 owns and can prove (Today, decisions, the designer seat, the Record). **G5b** is new lane **L0.7 — the daily-surfaces coverage walk** (§3): a seven-step signed-in walk of proposal detail + signing, decision detail, message send, documents, projects, orders and invoices on the local stack, which *files* findings rather than closing them; its first task is fixing the seed gap `GAP2.md` records ("documents NOT REACHABLE with the seeded client"). The four unowned `Features/` directories are assigned in §3's residue table. The gate now says in its own words that it cannot be claimed on findings nobody looked for. |
| **FF-03** — build-1 What to Test walks the tester into three W2 blockers | **Fixed** | **Ruling D12** promotes `GAP4-02`, `GAP4-03`, `GAP4-25` and `GAP4-16` into W1 (plus eight more; see FF-13/FF-14), struck from the W2 tables and marked ⇧D12 in L1-B's and L1-C's. What to Test items 6 and 7 are re-written and now carry a note naming exactly which findings make them safe and what they become if D12 is refused. A **standing rule** heads the What-to-Test draft: *it may not send a tester at a surface carrying an open blocker.* |
| **FF-04** — the A3-07 fix rides on a role self-elevation vector 00555 grants into | **Fixed** | 00555 gains section **(a2)**: `"Users can update own profile"` is re-created `FOR UPDATE TO authenticated` with a `WITH CHECK` that pins `role` to its current value, and `handle_new_user` gets the homeowner default the skeleton had and the first draft dropped. Two `ASSERT`s in the migration's DO-block and three cases in `00555_…test.sql` (case 7, replacing the cut `profile_cards` case) are the regression guard. `A3-07`'s client fix is re-scoped to display-name metadata; `AppleSignInRoleTests` now asserts the resulting `profiles.role`, not the client-side write. |

### Majors

| id | Disposition | What changed |
|---|---|---|
| **FF-05** — five R1 `asc` commands do not exist; one carries a literal placeholder | **Fixed** | Every command re-written against `asc <cmd> --help` on the installed binary: `testflight review edit --id "$DETAIL_ID"` (resolved from `review view`), `builds add-groups --build-id --group`, `testflight review submit --build-id --confirm`, `builds test-notes create --build-id`, `profiles list --profile-type`. The `BUILD=` line is now `asc builds info --app … --latest --platform IOS --version 1.0 --exclude-expired --output json \| jq -r '.data.id'` — no angle bracket anywhere. L0.5's three unknown values become shell variables assigned at the top, and L0.5 records the group IDs for R1 Step 5. |
| **FF-06** — the owned-file model does not hold | **Fixed** | §3 opens with an ownership model rebuilt from `findings.json`: a contested-file table giving `DailyRoomView.swift`, `AppCoordinator.swift`, `APIConfiguration.swift` and `RecommendationsView.swift` exactly one owner each, and a **residue table** assigning `Features/{Splash,Walk,QRAuth,Proposals,Invoices,Money,Documents,Projects}`, `Core/Models/**` and `ProfileView.swift` — and naming what has *no lane and no W1 work*. `Patina/Design/Tokens/**` is deleted (it does not exist; the tokens are in `PatinaDesignKit/…/Tokens/`). `SignInWithAppleButton.swift` and `RevealView.swift` are carved out of L1-A by name and given to L1-D, with L1-A told so in its own section. Every lane's glob block now carries an explicit `EXCEPT` list and a "not this lane, despite appearances" note. |
| **FF-07** — L1-E's "strings, not files" rule contradicts the model it sits in | **Fixed** | Inverted, as the critique's second option: **L1-E's deliverable is a reviewed copy deck** (`build/waves/w1/l1-e-copy-deck.md` — id · file:line · today · final · owning lane), signed off before day 5; **each owning lane applies its own rows as numbered tasks in its own list**, and the task-list template in §7 makes "the notes I must apply" a standing line. L1-E owns outright only three files plus three directories no other W1 lane touches. The **full merge order** is stated (**D14**): L1-C → L1-D → L1-B → L1-F → L1-A → L1-E, with a gate run between each merge. |
| **FF-08** — `ios-gate.sh` scrapes a simulator with `head -1` | **Fixed** | L0.1's scope gains `IOS_GATE_UDID` (required for the unit/ui tiers, with the error text written out verbatim) and a per-worktree `-derivedDataPath`. Hard Rule 8 is restated as *"including inside `ios-gate.sh`"* and adds: until that change lands, no lane runs `unit` or `all`. Every gate block in the charter now begins `export IOS_GATE_UDID=…`. |
| **FF-09** — `archive` is both a steward gate and a Kody-run step | **Fixed** | `archive` is removed from the integration gate and from W1's exit, which now reads *"`ios-gate.sh all` **and** `release` are green — **not** `archive`"*. It becomes **R1 Step 2** with its own checkbox and a paragraph saying why a steward subagent cannot satisfy `-allowProvisioningUpdates`. L0.1's exit criteria splits: `release` green is the agent's; the archive is Kody's, reported to the agent as evidence. |
| **FF-10** — four "blockers" were closed by the charter's own reconciliation | **Fixed** | `A3-03`, `A4-03`, `A4-04` and `A3-02` are `tier: "closed"` / `wave: "closed"` in `findings.json` with `closedBy`, removed from L0.2's and L1-A's tables, and given their own table in §1 (*"The four rows this closes — they are NOT in any lane table"*) naming what remains for each. Every count in the charter is recomputed: T0 163, W0 34, W1 141, scheduled 625 + 4 closed = 629. L0.2's W0 work is now stated as "00555 plus one re-probe". `A-101` is explicitly **not** closed. |
| **FF-11** — the demo account is both replaced and hard-wired | **Fixed** | **D11** added: *which account is the demo account*, recommendation "a clean, purpose-built client account minted by L0.2 before L0.5 writes the notes", with the `tester@patina.cloud` branch spelled out (`A3-15` becomes a W1 · L1-F row and L1-F goes to 17). L0.5's notes and `review edit` now use `$DEMO_ACCOUNT_EMAIL` / `$DEMO_ACCOUNT_CODE`; D7 is re-scoped to *the mechanism*, not the address; L0.2's exit defers to D11 rather than ruling. |
| **FF-12** — PLAN-SKELETON's `GAP1-xx` ids point at different findings | **Fixed** | A boxed **⚠ SUPERSEDED** header at the top of `PLAN-SKELETON.md` resolves every colliding id by name (`GAP1-01/02` → `GAP1B-01/02`; `GAP1-03` → `GAP1B-03`; `GAP1-07/08` → `GAP1B-07/08`; the L1-C orb citation "GAP1-15" → `GAP1-01`, since `GAP1B-15` does not exist; L1-E's "GAP1-18" → `GAP1-12`) and instructs the reader to resolve every id against PROGRAM.md §3's tables, never by grepping the number. Renumbering the series itself is **declined** — `findings.json`, `findings-by-lane.md`, both ledgers and this charter all carry the current ids, and a rename would invalidate every citation in the audit's own evidence for a cosmetic gain. |
| **FF-13** — L1-C's W1 tests require findings scheduled in W2 | **Fixed** | `GAP1B-03`, `GAP1B-07`, `GAP1B-08`, `C-23` and `GAP4-16` are promoted into W1/L1-C by **D12**, so `TapTargetTests`, `DynamicTypeLayoutTests`, `SheetChromeTests` and the exit criterion *"visible **and tappable**"* all rest on rows the lane actually carries. The exit criterion now names `GAP1B-07`'s 17.6 pt measurement as the thing "tappable" means. |
| **FF-14** — device row D-17 is scheduled to fail | **Fixed** | `B-15`, `C2-06` and `GAP3-18` are promoted into W1/L1-B by **D12** — account isolation is a round-one property, not polish — and L1-B gains `PatinaTests/AccountIsolationTests.swift`. D-17's text now names all four sub-claims and their lanes. `GAP2-24` is promoted too, so D-12's evidence line is also honest. |
| **FF-15** — W2 is 361 findings called "the first tester week" | **Fixed** | W2 gets a day range (10–17), a **stated capacity** (all 121 majors; minors only where a major already opens the file; the rest roll to W3 unextended; tester-reported defects outrank all of it), the per-lane load printed, and **L1-C split into L1-C1 (Companion/inset/chrome) and L1-C2 (Dynamic Type/tap targets/accessibility layout)** with separate clones, separate worktrees and a written `lane-split.md`. |
| **FF-16** — L0.3's critical-path dependency is named but never owned | **Fixed** | A new subsection, *"The decisive column, and who produces it — a day 2 task"*: hand-authored spectrum rows from a documented mapping via `scripts/first-flight/build-spectrums.py` (added to the owned files), owned by the lane's agent, with the reason `services/aesthete-inference` is not chosen written out. A local proof (`_aesthete_product_spectrum` non-null for every publishable row) runs before any prod write, and the seeding script refuses to emit a row without one. |
| **FF-17** — L0.3's acceptance probe is invalid SQL and is a production write | **Fixed** | `select count(*) > 0 from get_recommendations(null, null, 20, 0);`. The probe moves under a **KODY-RUN** heading with the write called out (`match_events`, `client_style_profiles` — `A3-24`) and a row-id accounting query. The agent gets a genuinely read-only pre-check instead: the five honesty counts plus the spectrum count. |
| **FF-18** — W1's production walk has no write boundary | **Fixed** | W1's exit (5) makes the production walk **Kody-supervised**, with an explicit four-table write allowlist (`profile_presence`, `match_events`, `client_style_profiles`, `notification_read_state`), an explicit list of what it does **not** do (save, quiz, add a room, sign, send, pay — all proved locally instead), and before/after row counts whose delta goes in the report. |
| **FF-19** — the widget's privacy manifest is absent from L0.1 | **Fixed** | `apps/mobile/Patina/PatinaWidget/PrivacyInfo.xcprivacy` added to L0.1's owned files; `PrivacyManifestTests` asserts **both** manifests; the archive exit criterion and R1 Step 2's `find` both require the `PlugIns/PatinaWidget.appex/` path. Ruling **D15** records it, with `A2-02`'s own words as the evidence. |
| **FF-20** — `Config/Version.xcconfig` will not move the build number alone | **Fixed** | A new subsection in L0.1, *"Two mechanics this lane gets wrong if it is not told"*, spells out all three steps: delete `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` from all eight configurations, set `baseConfigurationReference` on **every** configuration of **both** targets, and assert the **resolved** value in `ReleaseConfigurationTests` on a Debug run so a mis-wire fails in seconds rather than after an archive. |
| **FF-21** — a third live exposure is absent from the count and from G3 | **Fixed** | §1's verdict now says **three** exposures and describes the HTTP route in full, including that it is on VISION's surface #1 and is made *worse* by 00555. **G3** gains the `curl https://app.patina.cloud/api/catalog/vendors` probe and the note that PostgREST and the route are different principals. L0.2's probe set gains it as probe 5; the slip rule gains it; risk **R11** is new; the `getUser()` guard is L0.2b's first task and needs no migration. |
| **FF-22** — the program never runs VISION §8's test on itself | **Fixed** | New **§0**: the four-question feature test answered in a table (surface #2, §2's studio's clients, the upside stream, §4's homeowner promise), what The Document gives up for eight days stated as a real cost, and two guard rails — The Document never breaks to unblock the app, and **V3** plus §2's "confirm" are named as blocking inputs to **D1** (with the distinction that they stall the *invite*, not the build). |

### Minors

| id | Disposition | What changed |
|---|---|---|
| **FF-23** — four W1 rows rest on flags-on evidence | **Fixed** | L1-C's exit criteria gains a paragraph re-framing `B-28`, `C-05`, `C-27` and `C-11` against the flags-off route (Companion dock clearance; Companion → Spaces; Companion → Browse; one score by two flags-off routes), and the standing line *"every W1 fix in this lane is demonstrated with the flags OFF"*. |
| **FF-24** — five decisions have no id, no recommendation, no default | **Fixed** | **D11** (demo account), **D12** (the promotions), **D13** (`increment_scan_upload_attempt`: write 00556), **D14** (merge order), **D15** (widget privacy manifest) — all five in §6's table with a recommendation, what they block, and a default. The section header now reads *fifteen rulings*. |
| **FF-25** — the charter contradicts itself on who enables `release` in `all` | **Fixed** | Picked, with the cost stated: **L0.1 adds `release` as its own tier only; `all` stays `build + unit + lint-delta`**; the integration gate and every lane gate run `release` explicitly; **L2-G measures the whole-module Release compile in W2 and folds it in then**. Both the L0.1 and L2-G paragraphs now say the same thing, and note that `G-02` is satisfied either way. |
| **FF-26** — PLAN-SKELETON is declared authoritative while superseded | **Fixed** | The Spec paragraph demotes it to *"the architecture as first drafted, superseded in detail by this file"* with the precedence rule stated; the skeleton itself carries a six-point delta list at its head; `findings-by-lane.md` gains a boxed note that its **wave** column predates D12 and the four closures (its **lane** column is unchanged and still authoritative) and that its globs are superseded by §3's. |
| **FF-27** — L1-F repairs a badge without asking whether VISION permits one | **Fixed** | A standing VISION-check line is added to the global constraints and to §7's task-list template. `C2-07` is **ruled explicitly** in L1-F: the badge stays in exactly one form — the single derived *"needs you"* count `A-81` mandates, on the bell and the app icon, nothing else, no red-as-meaning — with `BadgeFreshnessTests` and `AttentionCountTests` together as the rule. |
| **FF-28** — 00555 creates `profile_cards` and nothing consumes it | **Fixed** | **Cut from the migration**, with a comment block where it stood explaining why (no reader in the program; a view with no reader reads as though the counterparty paths are covered when nine silent degradations are not). Its five assertions and the test's case 7 are replaced by the role self-elevation cases from FF-04. The **nine silent degradations** become a tracked list with an owner — `build/waves/w3/00555-degradations.md`, opened at apply time, with `project_unbilled_time` (INNER JOIN: it *loses rows*) and `use-commercial-documents.ts:1290` (an audit field) flagged to Kody rather than left in a list. |
| **FF-29** — D-06 is a device claim on a surface no lane owns | **Fixed** | `Features/QRAuth/**` is assigned to **L1-A** in §3's residue table (it is the auth seam, and `C1-14` already reaches into it), with a W1 walker step opening the scanner on the simulator. D-06 stays in the R1 gate, and its text now says why: QR login is the only route from this app to Patina Field. |
| **FF-30** — ledger row GAP7-06 was dropped with no note | **Fixed, and the record corrected** | `GAP7-06` was **not** an unaccounted third drop: the workflow folded it as `dupOf: A-108`, so it is inside the 189 duplicates already in the arithmetic. But the fold landed badly — **`A-108` appears in none of the workflow's three dispositions** and is therefore not in the 629 either. §1 now carries a paragraph naming both, mapping their two halves onto `A-88`/`C-03`/`C9-04` and `C9-05` (all W1), and adding Room Settings, the Today designer-seat card and the message-thread composer to the W1 walker's script by name — so the coverage is proved rather than assumed. The numbers table is unchanged, because the arithmetic was already right. |

### What the critique asked for and did not get

One item is **partially declined**, and it is named here rather than buried:

- **FF-12's renumbering.** The critique's first-listed fix is *"renumber one series (`GAP1W-*` for the
  workflow lane, or keep `GAP1B-*` and rename the workflow rows)"*. **Declined.** The colliding ids are
  cited in `findings.json`, `findings-by-lane.md`, `research/GAP1.md`, `research/GAP7.md`,
  `research/40-workflow-result.json`, the shot ledgers and this charter; renaming one series invalidates
  every citation in the audit's own evidence chain to remove an ambiguity that a resolver note removes
  just as well. The critique's second-listed fix — the collision warning at the head of the skeleton,
  pointing every reference at PROGRAM.md's tables — is what shipped, expanded to name every affected id
  individually rather than as a class.

**Coverage after the revision, re-run.** `findings.json` now holds **524** T0/T1 ids (528 before the
four reconciliation closures re-tiered `A3-03`, `A4-03`, `A4-04` and `A3-02` to `closed`). All 524
appear in exactly **one** lane table; **none is missing and none is double-placed**. The four closed
rows appear only in §1's reconciliation table. The five T2 majors (`C6-10`, `C3-11`, `B-30`, `A-71`,
`C3-07`) appear only in §5's W3 table. Per-table `_count:` lines and per-lane header counts were
regenerated from `findings.json`, not edited by hand. Wave totals reconcile:
**34 + 141 + 349 + 101 = 625 scheduled, + 4 closed = 629.**

---

## 11. W0 rulings, re-tier and closure (2026-09-02)

Written by the **W0 closer** at wave close. Nothing in this section authorises a production write —
every Kody-run step W0 produced is collected, in one order, in
[`build/waves/w0/KODY-RUNBOOK.md`](waves/w0/KODY-RUNBOOK.md).

### 11.1 Kody's rulings — the summary; `rulings-2026-09-02.md` is authoritative

The full text, with the consequence spelled out per ruling, is
[`build/rulings-2026-09-02.md`](rulings-2026-09-02.md). **Where a ruling differs from §6's
recommendation the difference is stated there, and the ruling wins.** Sixteen rulings landed:

| # | Ruling, in one line | Where it lands |
|---|---|---|
| **D1** | Round one = Leah's active design clients, and **`house-first` is ON for every tester**. `direct-orders` and `house-widget` stay off. | **Differs from §2's bar**, which says the four-tab bar stays off. The four-tab root is the shipped product; §11.2's re-tier is the consequence |
| **D1a** | The bar is on at **first** launch: `house-first` resolves **true when PostHog has no answer**; an explicit `false` payload still wins (kill switch). | W0 · L0.1 — shipped (`88c148b3f`), with `FeatureFlagsDefaultTests` |
| **D2** | Leah supplies ≥ 30 pieces this week; agent builds the pipeline and proves it locally; Kody runs the prod seed. Not in hand by end of day 6 → the honest "still curating" state. | W0 · L0.3 — pipeline shipped; the seed is runbook §J |
| **D3** | Drop Google for round one. | W1 · L1-A |
| **D4** | iPhone-only. | W0 · L0.1 — shipped; `UIDeviceFamily [1]` on app and appex |
| **D5** | Ship the widget in build 1, fixed; it renders regardless of `house-widget`. | W1 · L1-F |
| **D6** | Deployment target 26.0. | W0 · L0.1 — shipped; `MinimumOSVersion 26.0` |
| **D7 + D11** | Wire the `test-account-login` fallback into the app **and** mint a clean demo account, `firstflight@patina.cloud`. | App half W1 · L1-A; the mint is runbook §D |
| **D8** | 00555 goes to Strata **after** L0.2b merges and the designer portal is redeployed — day 2. | Runbook §A gates §B |
| **DM-1** | Close the anon read now; accept counterparty column visibility for round one; the `profile_private` PII split is W2. | 00555 ships as drafted; W2 · L0.2 gains the split |
| **D9** | APNs credentials are set on Strata. | Device row **D-07** is live, not blocked; runbook §E2 confirms read-only |
| **D10** | A live Stripe key lands on Strata before build 1. | Device row **D-12** is live; runbook §E1 |
| **D12** | The twelve promoted T1 rows stay in W1. | As already applied throughout §3 and §5 (⇧D12) |
| **D13** | Write `increment_scan_upload_attempt` rather than delete the call. | W0 · L0.2 — written, and **renumbered 00556 → 00557** (see §11.4) |
| **D14** | W1 merge order L1-C → L1-D → L1-B → L1-F → L1-A → L1-E. | §7 already carries it |
| **D15** | The widget ships its own `PrivacyInfo.xcprivacy`. | W0 · L0.1 — shipped; both manifests are in the product |
| **V7** | Log the D1 exception in `docs/vision/VISION-DECISIONS.md`: the iOS app (surface #2) **may** use a tab bar; The Document (surface #1) still may not. | Written by this closer, committed on `first-flight/integration` |

**One standing assumption, restated because it constrains W1:** with `direct-orders` off and a live
Stripe key on Strata, money moves in round one **only through invoices**.

### 11.2 The D1 re-tier — twelve rows moved, nothing was re-scored

Full pass, with the per-row reasoning and the two mechanisms it rests on:
[`build/waves/w0/retier-D1.md`](waves/w0/retier-D1.md). Every one of the then-629 findings was given a
`rootScope` read from its own evidence — **`both` 520 · `n/a` 81 · `flags-off-only` 17 ·
`flags-on-only` 11** — against two facts in the source: the root is chosen once at launch
(`ContentView.swift:149`), and on the four-tab root the floating Companion **retires entirely**
(`CompanionOverlay.swift`), so every "the orb overprints content" finding is flags-off-only.

**Eight flags-off-only rows leave W1 for W2 with their tier held** — `A1-03`, `A1-04`, `A4-07`, `A-88`,
`A-64`, `C-03`, `C-28`, `C9-05`. **Four flags-on-only minors rise from T2/W3 to T1/W2** — `A1-13`,
`B-52`, `C-34`, `C2-11`. All twelve carry `retieredBy: "D1 2026-09-02"` and a `retierNote`. **Lane is
unchanged on every row**, and no severity was re-scored.

By wave, before → after (D1 alone; L0.7's eleven are §11.3):

| Wave | before | after D1 | Δ |
|---|---:|---:|---:|
| W0 | 34 | 34 | — |
| W1 | 141 | 133 | −8 |
| W2 | 349 | 361 | +12 |
| W3 | 101 | 97 | −4 |
| closed | 4 | 4 | — |
| **Total** | **629** | **629** | — |

By lane — **no lane's overall total changed**; only two lanes move rows at all:

| Lane · wave | before | after D1 |
|---|---:|---:|
| W1 · L1-C | 35 | 28 |
| W1 · L1-F | 16 | 15 |
| W2 · L1-C | 114 | 123 |
| W2 · L1-F | 24 | 27 |
| W3 · L1-C | 35 | 33 |
| W3 · L1-F | 13 | 11 |

**Three things the pass deliberately did not change, and they are still Fable's call:** (1) severity —
`C-33` was demoted *because the flag was off*, a reason D1 makes false, and `C-32` is a *minor*
describing the app's primary navigation on day one; (2) `testerVisible: false` on six flags-on-only
rows (`A1-13`, `B-52`, `C-32`, `C2-11`, `C6-39`, `C9-16`) set by judges whose stated reason was the flag
being off — all six are tester-visible on the shipped root; (3) `A4-12`'s `fix` text ("target the
round-one testers in PostHog") is now only half the story, because D1a moved the mechanism into the
app's default table.

**The evidence note the wave must carry:** the corpus barely observed the root it now ships. Verbatim
launch lines in the ledgers show `GAP1`/`GAP2`/`GAP3`/`GAP6` launched with **no** flags argument,
`GAP7` with `house-widget` only, and `C`/`A`/`P`/`R` flags-off. **`B` is the only walk of the four-tab
root**, plus a handful of `GAP5` rows on iPad. W1's walkers launch without `-PatinaFlags` per D1a and
will be the first real look at it — **treat a thin four-tab section in the ledgers as a coverage gap,
not a clean bill.**

### 11.3 L0.7's findings, placed

The walk ran 13:26–14:28 UTC on 2026-09-02 against the local stack, on the **four-tab root** (D1), as a
signed-in `activeProject` client, and closed the seed gap that made documents and message threads
unreachable (`supabase/seed/first-flight-client-fixture.sql`, now in both `sql_paths` arrays). Findings:
[`build/waves/w0/l0.7-coverage-walk.md`](waves/w0/l0.7-coverage-walk.md) §3; shot ledger
`shots/w0-l0.7/ledger.md`.

Eleven rows are now in `findings.json`, each with `sourceLane: "L0.7"`, a `ledger` pointing at the walk,
and the placement reason in its `judgeNote`. **Lane follows the collator's rule** (the concern decides
the lane, the folder is the tiebreaker); **tier is the walker's proposed tier**, with one recorded
exception; wave is T0 → W1, T1 → W2, T2 → W3.

| id | sev | tier | wave | lane | what it is |
|---|---|---|---|---|---|
| `L07-01` | blocker | T0 | **W1** | **L0.2** ⇢L1-E | Signing a proposal fails `studio_id_not_designer_studio` when the designer belongs to two active studios. Counterfactual proven in both directions. **The only backend row in W1** — the fix is a migration |
| `L07-02` | blocker | T0 | **W1** | L1-F ⇢L1-C | On the four-tab root the message composer is drawn under the tab bar and **cannot be tapped**; a tap at the field's centre selects the Pieces tab |
| `L07-03` | major | T0 | **W1** | L1-F ⇢L1-B | A failed send says nothing for ≥ 60 s, then the draft silently reappears. Sharpens `C4-04` |
| `L07-05` | major | **T0** | **W1** | L1-B ⇢L1-C | The Studio hub renders stale counts as current with the backend down. **Tier promoted from the walker's T1** — see below |
| `L07-04` | major | T1 | W2 | L1-E ⇢L1-C | An order's responsibility paragraph promises an address the screen never prints |
| `L07-06` | minor | T1 | W2 | L1-C | Floating chrome painted over live content on four Studio screens, one of them a money figure |
| `L07-07` | minor | T1 | W2 | L1-E ⇢L1-C | A `milestone`-tier proposal shows five line items and no money, with no word saying why |
| `L07-09` | minor | T1 | W2 | L1-C | At `accessibility-extra-large` the sign sheet's labels break mid-word; at `large` **Cancel** is clipped |
| `L07-08` | minor | T2 | W3 | L1-F | A responded decision stays in the feed as "A decision needs you" |
| `L07-10` | polish | T2 | W3 | L1-D | Decision state uses red and green — filed **as a VISION §6 question**, not asserted as a defect |
| `L07-11` | polish | T2 | W3 | L1-D | The tour's Skip / Next are system blue. **No retained shot** — written observation only |

**The one tier change, and why.** `L07-05` moves from the walker's proposed T1 to **T0/W1**: the
finding's own fix line says to apply it *"in the same wave"* as `R-03`, and `R-03` is T0/W1/L1-B; and
under D1 the Studio hub is one of four day-one tab roots, which is exactly the surface class **G5a** is
written about. Effort stays **S** because it is R-03's pattern applied a second time. One word from
Fable reverses it.

**Two placements worth a second look, recorded rather than settled.** `L07-06` covers `TOTAL $4,250.00`
with a chrome chip — the class `C-46` / `GAP2-05` treat as *major*, scored *minor* here because that is
what the walker who saw all four cases called it. `L07-09` was considered for promotion to T0 beside
`GAP1B-01`/`GAP1B-02` and left at T1: those two are T0 because the controls are **unreachable**, and
`01g`/`01h` prove these are reachable after a drag.

**G5b, answered.** The walk ran; it produced **two blockers**. Per §2's G5b wording and §8's slip rule
they are scheduled into W1 before build 1 (`L07-02` into L1-F, `L07-01` into L0.2 as a migration) —
**or** named in What to Test. `L07-01`'s liveness for round one is a **read-only production probe that
has not been run** (runbook §J1): if Leah belongs to one active studio it is latent; if two or more it
blocks build 1 for her studio.

**What the walk did not reach, in its own words:** project detail was never opened, so `C4-05` is
unwalked; decision detail was not re-run at `accessibility-extra-large`; whether `.refreshable`
actually fired on the failed refresh is `PLAUSIBLE`, not `CONFIRMED`; the software keyboard never
appeared, so keyboard avoidance is untested at every size. One observation was **withdrawn** — a foreign
`supabase db reset` deleted the threads fifteen seconds before the empty state was photographed.

### 11.4 W0 exit state, per lane

Read against §3's "W0 exits when" line. **Nothing here is a production claim** — no agent made a
production write in this wave.

| Lane | State | Evidence / what is left |
|---|---|---|
| **L0.1** Build & configuration | **Agent work DONE** · Kody-run pending | 12 commits, tip `299d2a73b`, merged `acef37f56`. `ios-gate.sh release` **exit 65 → exit 0** — the criterion W1's exit depends on. `unit` refuses without `IOS_GATE_UDID` (rc 2). Product-inspected on the merged tip: `CFBundleVersion 3` on app **and** appex, `MinimumOSVersion 26.0`, `UIDeviceFamily [1]`, `ITSAppUsesNonExemptEncryption false`, both privacy manifests present. **Open: `A2-07` (the archive itself), `A2-23`'s export half, `A2-24`/`G-12` (`aps-environment` on the exported `.app`) — all three are runbook §I, and none is closed by `release` being green. `A2-21` (the ASC rename) sits with L0.5.** So 14 of L0.1's 18 rows are closed in-branch, not 18 |
| **L0.2** Production backend | **Draft DONE** · **Kody-run pending, and one ruling BLOCKS it** | 00555 and 00557 replay clean from the tree on `pnpm supabase:reset`; the whole SQL suite is `147/147 effective-green` with `KNOWN_FAILURES.md` matching exactly. `00556` is a **deliberate gap** — `increment_scan_upload_attempt` was renumbered off 00556 (taken by `admin-studios/build`) onto **00557**. **Blocked:** runbook §B2 needs Kody's ruling on `handle_new_user`'s `homeowner` fallback for **designer-portal self-signups** before the apply; the apply cannot be undone for that behaviour. Gains one W1 row (`L07-01`) |
| **L0.2b** The Document's read paths | **Code DONE** · **NOT merged** · Kody-run pending | 3 commits on `first-flight/w0-l02b` (`ffdee7273`, `57f9e1ce8`, `fc82db841`). Deliberately **not** in the integration branch — it merges to `main` on its own (D8) and gates 00555. Four gates green including the full designer-portal jest tier (498 suites / 5948 tests). Runbook §A merges and deploys it |
| **L0.3** Content pipeline | **Pipeline DONE** · **BLOCKED on Leah (D2)** | Merged `a2d364500`; the catalogue checker, the image uploader, the SQL emitter and 11 SQL test cases all green on the fixture. The release profile's ≥ 30-row gate **cannot pass on the fixture and is not meant to** — it becomes the real gate the day the manifest lands. Runbook §J carries the prod seed; **D2's fallback is called by this lane at end of day 6** |
| **L0.4** Sanity help & tour | **Drafts DONE** · Kody-run pending | Four documents, exact ids and revisions, both routes (desk and MCP) and five probes in `sanity-publish-steps.md`. **No Sanity write was made.** Runbook §F. The six `?` doors are W1 code, not this lane |
| **L0.5** App Store Connect | **Drafts DONE** · Kody-run pending · one dependency | `asc-runbook.md` + `asc-state-before.md` + the two texts. Four traps found by re-checking every command against the installed binary — chief among them that `--flag value` **silently drops the rest of the line** and every boolean must be `=`-joined. Runbook §G. **§G3 cannot run until the demo account exists (§D)** |
| **L0.6** PostHog | **Kody-run pending** · **carries a live contradiction** | See §11.5. §3's L0.6 step 2 ("all three flags at 0%") and **D1a** cannot both be right |
| **L0.7** Coverage walk | **DONE** | Merged `0ef84ae17`; eleven findings filed and placed (§11.3); the seed fixture closes the documents/threads gap. Kody-run: the one read-only probe at runbook §J1 |

**Integration.** `first-flight/integration` tip **`0ef84ae1732393894e50f43dfc32e4ada6c87ef9`**, base
`main` = `a4d665ad7`, four lanes merged `--no-ff` in the order L0.2 → L0.3 → L0.1 → L0.7, one conflict
(`supabase/config.toml` `sql_paths`, resolved as the union and **proven at runtime** by a reset that
loaded both seeds). Gate results on that tip: `pnpm install` 0 · `ios-gate.sh build` 0 (second attempt —
the `GitCommit.swift` cost) · `release` 0 · `unit` **1552 tests / 170 suites passed** · `lint-delta` 0 ·
`supabase:reset` 0 · SQL suite 147/147 · `type-check` 30/30. **`archive` was not run and is not a
steward command** — it is R1 Step 2, on Kody's machine.

⚠ **The draft under `build/migrations-draft/` is now STALE.** §"Global constraints" points at
`build/migrations-draft/00555_ios_round_one_security.sql` as this program's migration. L0.2 moved the
real file to **`supabase/migrations/00555_ios_round_one_security.sql`** and then changed it there (the
`RL02-18` fix rounds, `c66206523` and `8a519f271`); the two files differ, and the tree copy is the one
that applies. The stale draft was deliberately **not** committed with the wave record so there is only
one candidate on the branch. `KODY-RUNBOOK.md` names the `supabase/migrations/` path throughout.

### 11.5 Two contradictions this wave surfaced, both still open

1. **PostHog's 0% rollout undoes D1.** §3 · L0.6 step 2 says all three flags go to **0% rollout**. D1a
   makes a `false` payload the kill switch. PostHog does not omit a flag that evaluates false — it
   returns it **with the value false** — so a 0% `house-first` arrives as an *answer*, the kill-switch
   clause fires, and every tester loses the four-tab root on their **second** launch (launch 1 = no
   payload = default true; launch 2 = cached false = off). Verified on the SDK side
   (`PostHogRemoteConfig.getFeatureFlagResult`, posthog-ios 3.48.0, returns nil **only** when the key is
   absent); **not** observed against the live project. **The resolution the runbook takes: `house-first`
   at 100% / everyone / active, `direct-orders` and `house-widget` at 0% / active.** §3 · L0.6 step 2 is
   superseded on this point and is left in place so the change is visible.
2. **The demo proposal is priceless, permanently, unless one line changes first.**
   `build/waves/w0/demo-account.sql:187` inserts the demo proposal with
   `client_visibility_tier = 'milestone'`, and `get_client_proposal_bundle` nulls every per-line price
   on that tier (`L07-07`). L0.7's note **N5 asked L0.2 to set it to `'full'` and it was not applied.**
   This is one-way: `guard_proposal_copy_immutability` (00390:1178-1250) lists `client_visibility_tier`
   among the columns a **non-draft** proposal may never change, and the row is inserted as `sent`.
   **Runbook §D3 puts the decision in front of Kody before the seed runs**, because after it there is no
   route back that does not mean a second proposal.

### 11.6 Amended lane counts

`build/findings.json` and `build/findings-by-lane.md` carry these as their live values; §1's tables are
amended to match. **§3's and §5's per-lane tables were deliberately NOT rewritten** — the list of lines
now stale is below, and `build/assemble.py` regenerates them from `findings.json` once the prose parts
are updated.

**W1 — 137 findings** *(was 141 at charter time; 133 after D1; 137 after L0.7)*:

| W1 lane | charter | after D1 | after L0.7 | what changed |
|---|---:|---:|---:|---|
| **L0.2** | — | — | **1** | `L07-01` — the only backend row in W1 |
| L1-A | 27 | 27 | 27 | — |
| L1-B | 27 | 27 | **28** | `L07-05` |
| L1-C | 35 | **28** | 28 | D1 struck `A1-03`, `A1-04`, `A4-07`, `A-88`, `A-64`, `C-03`, `C-28` |
| L1-D | 18 | 18 | 18 | — |
| L1-E | 18 | 18 | 18 | — |
| L1-F | 16 | **15** | **17** | D1 struck `C9-05`; L0.7 added `L07-02`, `L07-03` |
| **Total** | **141** | **133** | **137** | blocker **14** · major **119** · minor 4 · polish 0 |

**W2 — 365** *(349 → 361 after D1 → 365)*: L0.1 9 · L0.2 3 · L0.3 2 · L0.4 1 · L1-A 41 · L1-B 52 ·
**L1-C 125** · L1-D 51 · **L1-E 48** · **L1-F 27** · L2-G 6.
**W3 — 100** *(101 → 97 → 100)*: L0.1 4 · L0.2 4 · L0.3 1 · L0.4 1 · L0.5 1 · L1-A 11 · L1-B 11 ·
**L1-C 33** · **L1-D 11** · L1-E 10 · **L1-F 12** · L2-G 1.

**The lines in §3 and §5 that are now stale** (`retier-D1.md` §8 gives line numbers; they were taken
**before** §1's amendment added lines, so search by content, not by number):

- §3 · W1 heading — "141 findings" → **137**; the sentence under it, "129 T0 rows plus the 12 T1 rows
  D12 promotes", becomes **125 T0 rows plus the 12**.
- §3 · W1 · L1-C — "(W1 · 35 — 29 T0 + 6 promoted …)" → **(W1 · 28 — 22 T0 + 6 promoted …)** and
  `_count: 35 · blocker 3 · major 32 …_` → `_count: 28 · blocker 3 · major 25 …_`; strike `A1-03`,
  `A1-04`, `A4-07`, `A-88`, `A-64`, `C-03`, `C-28`.
- §3 · W1 · L1-B — count 27 → **28**, `_count: 28 · blocker 5 · major 22 · minor 1 · polish 0_`; add
  `L07-05`.
- §3 · W1 · L1-F — "(T0 · W1 · 16)" → **(T0 · W1 · 17)** and `_count: 16 …_` → `_count: 17 · blocker 1 ·
  major 16 · minor 0 · polish 0_`; strike `C9-05`, add `L07-02` (blocker) and `L07-03`.
- §3 · W1 — **a new L0.2 sub-section is owed** for `L07-01`, or it must be routed into an existing lane.
  It is the only W1 row whose fix is SQL, and its apply is a Kody-run migration step.
- §5 · W2 heading — "349 findings" → **365**; the capacity paragraph's "not 349" → **365**; its per-lane
  load line "L1-C 114 … L1-F 24" → **L1-C 125 … L1-F 27**, and L1-E 46 → **48**.
- §5 · W2 lane tables — L1-C `_count: 114 · blocker 0 · major 50 · minor 55 · polish 9_` →
  `_count: 125 · blocker 0 · major 57 · minor 59 · polish 9_`; L1-F `_count: 24 …_` →
  `_count: 27 · blocker 0 · major 5 · minor 18 · polish 4_`; L1-E `_count: 46 …_` →
  `_count: 48 · blocker 0 · major 6 · minor 31 · polish 11_`.
- §5 · W3 heading — "101 findings" → **100**. W3 is a by-area rollup `assemble.py` generates from
  `findings.json`; re-running the script picks up the departures and the three arrivals.
- §10's closing line — "34 + 141 + 349 + 101 = 625 scheduled, + 4 closed = 629" → **34 + 137 + 365 +
  100 = 636 scheduled, + 4 closed = 640**.

### 11.7 What W0 owes R1, in one list

Every item is in [`build/waves/w0/KODY-RUNBOOK.md`](waves/w0/KODY-RUNBOOK.md) in the order it must run:
**A** merge and deploy L0.2b · **B** apply 00555 (+ the ruling that gates it), regenerate, probe, walk
The Document · **C** apply 00557 and probe · **D** mint the demo account and append the Vault
allow-list · **E** confirm the Stripe key (D10) and the APNs env (D9), read-only · **F** publish the
three tour bodies in Sanity · **G** the two ASC writes, the testers, the age rating, the name ·
**H** the three PostHog flags and error tracking · **I** the archive dry run, the export and the
entitlement check · **J** the two conditional steps — L0.7's studio probe, and the catalogue seed the
day Leah's manifest lands.
