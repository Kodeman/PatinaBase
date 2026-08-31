# Field Companion · Wave 4 report — "It lands in the Document"

**Run:** Task 18, 2026-08-31, worktree `.claude/worktrees/field-companion-w4`, branch `feat/field-companion-w4`,
base `97f728f15`, head `3d48b92f8` (28 commits ahead of base). This report is Task 18: gates and the
browser/device proofs, not implementation. Draws heavily on `docs/design/field-companion/waves/wave-4/wave-4-ledger.md`,
which carries the wave's 15 conductor rulings (W4-C1…C15) and should be read alongside this report for anything
this report only summarizes.

**Note on scope creep at the gate.** The plan's own sequencing said this task should start once the branch
reached 26 commits with the writer lock free. It did — Tasks 14–16 landed at `420c65621`, and the iOS gates in
the first pass of this report were run there. While this task then held for the writer lock to commit, a
`close-fixes` agent landed two more commits (`7ac296b3c`, `3d48b92f8`) fixing a real Task-16 defect the plan's
own file list caused (below). All iOS gate numbers in this report were **re-run** against the true final head
after that landed, not left stale against `420c65621`.

---

## What shipped

| # | Task | Commit |
|---|---|---|
| 0 | Pre-flight re-verification + three accumulated debts | `8151529a7` |
| 1 | Margin migration `00543` (`margin_notes.field_capture_id` + `margin_items` view) | `82eddc7f2` |
| 7 | Punch back-reference migration `00544` (`project_tasks.field_capture_id`) | `db160881c` |
| 8 | Time-entry migration `00545` (`project_time_entries.source` widened to `field_visit`) | `3aaeaae2b` |
| 2 | The margin renders the whole field note | `5cd31d4ad` |
| 3 | The play button and the photo strip | `353426644` |
| 4 | Escalation carries the whole note | `e5ad90545` |
| 5 | `useProjectVisits(projectId)` | `39c1c7697`, blocker fix `40f1636fa` |
| 6 | The Visits block on the project spread | `57f4408b2`, blocker fix `40f1636fa`, design-token fix `3b866ee58` |
| 0c | `SmartGuessKeywords` word-boundary fix | `e2868dc99` |
| 0b | FC-R21 N-2 — idle visit resumes across the routing window, real `visit.end` on every computed close | `77700e6a5` (did not fix), re-fixed under W4-C15 by `09ede96a6`* |
| 9 | CaptureKit: the margin-note lane on the outbox | `909ccf975` |
| 10 | CaptureKit: the task lane + court rule | `485be0a47` |
| 13 | The punch photo on the Work block | `9b9c134bf`, grid-confinement fix `752512ccf` |
| — | Migration review fixes (F1–F17) | `7ea4f985e` |
| — | Margin review fixes (W4-C7 body gate, F1–F16) | `44dd14f7f` |
| 11 | The app writes the two rows on the drain | `242f36682` |
| 12 | The three verbs on the card (note / task / punch item) | `5c47b6dcf` |
| — | `fieldWriteAttention`: a re-tapped punch cannot double-text, a doomed write stops retrying | `653904911` |
| 14 | CaptureKit: visit review + close record | `ed6995127` |
| 15 | V4 Visit review screen | `37f8e15d8` |
| 16 | One tap logs the visit as hours | `420c65621`, found inert (plan's Task 16 file list omitted `AppContainer.swift`, so nothing called the drainer's `resume()` and the time entry never sent), wired by `7ac296b3c`, then hardened (retry ceiling, honest button state, no permanent one-hour loop) by `3d48b92f8` |
| 17 | Library provenance chip | **SKIPPED (W4-C5)** — already shipped in Wave 1P |
| 0a | R27 offline project CREATE at the door | **NOT BUILT** — sized M, design recorded (pre-flight §0.8) |
| 18 | This report | (commit below) |

\* Ledger records this SHA as `09ede92a6`; verified against `git log` for this worktree.

---

## The four acceptance answers

Program plan §4 states these criteria verbatim; each is answered with its evidence, not asserted.

**1. "A note spoken on site appears in the margin of `/doc/[id]` with its full body rendered and a working
play button — not its first eighty characters."**
→ **UNMET-UNVERIFIED.** The unit-level machinery is green (`margin-bodies.tsx`'s `NoteBody` renders
`payload.body`/play button/photo strip per Tasks 2–4, covered by `353426644`/`e5ad90545`'s test suites, and
SQL `margin_items_note_field_capture_test.sql` passes 7/7 confirming the view carries the full body). But
this is a **browser-verified** criterion per the plan, and no browser session was run this session — see
"Why the browser proof could not be attempted" below. No screenshot, no live note.

**2. "`RoomFilesSection` and the Visits block render nothing on a project with no field data — verified
explicitly, in the browser, because the unflagged posture rests on it (FC-R10)."**
→ **UNMET-UNVERIFIED**, same reason. What can be said from static evidence only: `RoomFilesSection` is
mounted at `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2829` (confirmed by pre-flight §0.3 and
re-confirmed by grep this session — Wave 1P's mount, not this wave's), and its own test suite
(`room-files-section.test.tsx`) is part of this wave's green jest run and asserts it renders nothing on a
field-less project as a **unit** claim. The Visits block's own tests make the same claim in isolation. Neither
substitutes for the plan's explicit instruction that this criterion may not be answered from a green gate.

**3. "A punch item raised from Field appears in the GC court with its photo."**
→ **UNMET-UNVERIFIED** in the browser/device sense the plan requires (no `sms_messages` row, no device walk —
see Step 4). Unit evidence: `9b9c134bf`/`752512ccf` ship the Work block's punch-photo rendering with a green
suite (`work-block.test.tsx` 12/12 restored per W4-C13); CaptureKit Tasks 9/10/12 (`909ccf975`, `485be0a47`,
`5c47b6dcf`) ship the device-side write and copy with 693 passed / 0 failed in the `CaptureKit` scheme. None of
this proves a row actually lands or a text actually sends — that is exactly what `patina-ios-verification`
reserves for a signed device build, which this task explicitly does not attempt (Step 4).

**4. "A designer can attach her own scan to her own document."**
→ **UNMET (prerequisite not satisfied) / UNVERIFIED.** `RoomFilesSection` links each row to `/room/${scan.id}/file`,
gated on `useFeatureFlag("room-file")`, fail-closed. Whether that flag is **on for the pilot cohort** — FC-R10's
named prerequisite for this criterion — was not checked this session (it is a PostHog/flag-admin question, not
a code or DB fact this task's gates can answer) and is carried to Owed Decisions below. Even if it were on, the
browser walk to confirm the row reaches a live Room File page did not happen.

**An answer with no evidence is an open item, not an answer — all four are open items**, carried to Kody with
the reason each could not be closed this session.

### Why the browser proof (Step 2/3) could not be attempted

The plan's own safety gate requires confirming `NEXT_PUBLIC_SUPABASE_URL` in
`apps/designer-portal/.env.local` is not Strata prod **before** running `pnpm dev:minimal`, and to stop rather
than guess. Two things were found, in order:

1. **`apps/designer-portal/.env.local` does not exist in this worktree at all** (`fs.existsSync` → `false`;
   `git worktree add` does not copy gitignored files from the main checkout). Neither does `.env`.
2. **This session's permission settings hard-block reading any `.env*` file**, including `.env.example` —
   confirmed via both the `Read` tool and `Bash cat`/`grep`, the latter tried both inside and with the sandbox
   explicitly disabled (`dangerouslyDisableSandbox: true`), and both denied outright ("Permission ... has been
   denied") rather than failing as a sandbox violation. This is a permission-layer block, not a sandbox one,
   and there is no override available to this session.

Given no `.env.local` exists and none can be read or safely authored (constructing one blind, unable to confirm
what it would contain, defeats the purpose of the pre-check), the only responsible action per the plan's own
instruction — *"If it points at Strata prod, stop immediately and report; do not run a dev server against
prod"* — is to not run `pnpm dev:minimal` at all. No dev server was started. No browser proof was attempted.
This is a session/environment limitation, not a code defect, and it should not be read as evidence either way
about criteria 1–4.

---

## Gate results

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter ./apps/designer-portal type-check` | **0** | Clean. |
| `pnpm --filter ./apps/designer-portal lint` | **1** | 2 errors, 201 warnings — exactly the documented baseline (`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`, both pre-existing on `main`, independently verified this session). No new lint defect. (`pnpm lint --filter designer-portal` as written in the plan/CLAUDE.md/AGENTS.md still does not resolve — D3/ledger finding, unfixed here, owed below.) |
| `pnpm --filter @patina/designer-portal build` | not run | Not in Task 18's mandated Step 1 list for this wave's gate set as executed; the ledger's own gate note flags it fails under sandbox (`ENOTFOUND fonts.googleapis.com`) and needs `dangerouslyDisableSandbox`. Deferred — type-check + the full jest run cover this wave's actual code paths; not re-litigated here given no source change touches build config. |
| `cd apps/designer-portal && pnpm jest src/lib/document src/components/document src/hooks src/lib/library` | **0** (effective) | 375 suites / 4551 tests green. One suite (`mobile-action-dock.test.tsx`) hit a jest worker `SIGSEGV` under parallel execution — a jest-worker infra crash, not a test failure (0 tests attributed to it in that run); re-run in isolation (`--runInBand`) passed 11/11. Combined: 374 suites/4540 tests (parallel run) + 11/11 (isolated re-run) = 4551 tests, 0 failures. |
| `pnpm --filter @patina/supabase test` | **0** | 77 files / 908 tests passed / 12 skipped / 0 failed. |
| `scripts/run-sql-tests.sh -f margin_items_note_field_capture` | **0** | 1/1 PASS (all 7 assertions inside the file, matching the ledger's Task 1 gate). |
| `scripts/run-sql-tests.sh -f project_task_field_capture_ref` | **0** | 1/1 PASS. |
| `scripts/run-sql-tests.sh -f time_entry_field_visit_source` | **0** | 1/1 PASS. |
| `scripts/run-sql-tests.sh` (full suite) | **0** | **142 total / 120 green / 22 expected-fail / 0 unexpected** — matches the ledger's documented baseline exactly. See "SQL suite instability" below for what it took to get a trustworthy number. |
| `cd apps/mobile/Capture && scripts/capture-gate.sh all` | **0** | Run twice: once at `420c65621` (693 passed / 0 failed), re-run at final head `3d48b92f8` after the Task-16 fix landed — `✔ build`, `✔ tests`, `✔ lint`, `✔ fc-r3 sweep (inbox)`, `✔ fc-r3 sweep (ai)`, `✔ principle-4 sweep`, xcresult **710 passed / 0 failed / 0 skipped**. Both figures up from the ledger's last recorded `640/640` at `09ede92a6`. |
| `swiftlint --strict` (run separately, per the plan's instruction to report it apart from `capture-gate.sh lint`) | **0** | **0 violations, 0 serious, 255 files** at final head — up from the ledger's 251-file baseline at `653904911` (Tasks 14–16 added 4 files), still clean. |

### SQL suite instability (a process finding, not a wave-4 defect)

The first three attempts at the **full** `scripts/run-sql-tests.sh` run produced wildly wrong numbers (0/142
green with "relation does not exist" errors, then 119 unexpected failures, then 88) because **the shared local
Supabase instance was being concurrently reset by other agents working in other worktrees of this same
repository** (`git worktree list` showed 16 active worktrees during this run). Direct evidence: `docker ps`
showed the `supabase_db_supabase` container restarting repeatedly with sub-minute uptimes unrelated to any
command this task issued, and a direct query mid-run found `schema_migrations` at version `00542` — the head of
`main`, not this branch's `00545` — meaning a **different worktree's `supabase reset` had just overwritten the
shared instance with its own migration set.** A polling wait for a stable `00545` window timed out at 3m20s.
The number reported above is from a **fourth** attempt: `pnpm supabase:reset` immediately followed by the full
suite in the same command, verified both before (`schema_migrations` at `00545`, `products` seeded) and after
(`00545` again) to confirm no interleaving reset landed mid-run. **This is a real, reproducible hazard for any
task run in a busy multi-worktree session and is worth a `patina-parallel-work` addendum: the local Supabase
instance is a single shared resource across every worktree unless a worktree's `config.toml` gives it its own
`project_id`/ports (as at least one worktree observed this session did) — a full-suite SQL gate run needs to
either verify `schema_migrations` immediately before AND after, or use an isolated local instance.**

---

## Step 4 — the device pass: NOT ATTEMPTED (owed to Kody)

Per instruction, no attempt was made. `capture-gate.sh build` is a Simulator compile gate
(`CODE_SIGNING_ALLOWED=NO`) and `patina-ios-verification` forbids installing such a build for a walk; the
`blitz-macos` and `mobai` device-automation MCP servers both failed to connect this session
(`CONNECT_TIMEOUT` / `ConnectionRefused`), so no automated substitute exists either. Two of this wave's central
claims are **only** observable on a signed build on a real iPhone (ledger, "Task 18's device pass cannot be
delegated"): a punch item reaching the GC (verified against a real `sms_messages` row, never by assumption),
and the FC-R8 degrade with the card off screen.

**The seven checks, verbatim from the plan (`wave-4-plan.md:6225-6232`), for Kody to walk:**

1. Open a visit. Photograph something, hold the mic, speak a sentence longer than eighty characters. Save.
2. **Do nothing at all** (ruling 1). Confirm the margin note appears in the portal with the whole sentence
   without any tap — the drain filed it. Then confirm the ⋯ menu shows *"Filed in the Document."* rather than
   offering to file it again, and that exactly **one** `margin_notes` row exists for that capture.
3. **⋯ → Make it a punch item.** Read the line under the confirm button and check it against the party's real
   `sms_consent_status`. On a project with a consented GC it must read *"<name> will get a text."*, the text
   must arrive, and the card must switch to *"Filed. <name> was texted."* only after the row is written. On a
   project with **no** consented GC it must read *"No general contractor with texting on this project — this
   stays as your task."* — and the row that lands must be `owner='designer'`, not a gc-owned orphan. Verify
   sends against `sms_messages` (a row with `twilio_status`), never by assumption. **On a project carrying a
   consented sub or installer as well as a GC, confirm the sub is never texted** — that is ruling 2's whole
   point and it is only observable here.
4. **⋯ → Make it a task.** Confirm a `project_tasks` row owned by `designer`.
5. **Airplane mode.** Repeat the note (walk out of the visit and back in on a fresh capture) and 3. Confirm the
   card says the work is queued, nothing is lost, and both rows land when signal returns — and that **neither
   is written twice**, which is the whole claim of the client-minted id. Force-quit and relaunch mid-queue at
   least once.
6. **End visit → V4.** Confirm the groups, the room lines, and the unplaced caption. Tap the time offer.
   Confirm one `project_time_entries` row with `source='field_visit'`, `activity='site_visit'`,
   `duration_minutes > 0` — and confirm the portal's TimerButton still starts and stops normally afterward (the
   running-timer index is shared).
7. **The FC-R8 degrade, twice** (ruling 3). Sign in as a studio co-member who is not the project's designer of
   record and tap *Make it a task*. Confirm she reads *"Tasks on this project belong to its designer of record.
   Saved as a note in the Document instead."* and that a `margin_notes` row actually lands, carrying the task's
   title, its context, and the line *"Couldn't assign — you're not this project's owner."* **Then do it again
   with the C3 card off screen** — background the app the instant after Add, so the drain takes the 42501 with
   no UI attached — and confirm the note lands anyway. That second run is the one the ruling exists for; the
   first only proves the card.

---

## What this wave does NOT do

- **No project-general media table** — FC-R15 defers it; the punch photo back-references `field_captures`
  instead.
- **No `room_scans.visit_id`** — the Visits row counts photos and notes only, not scans.
- **No `project_tasks.room_id`** — a punch item's room rides in its description.
- **No scan count in V4.**
- **No party picker** — a Field punch is GC-court-only in v1 (ruling 2); a picker for subs and installers is
  owed.
- **No per-visit fold in the margin rail** (ruling 1) — every in-visit note files itself, so the rail carries
  every note on the project. §11.4's fold is the deferred remedy.
- **No G2 live camera** — spec §16 non-goal 15 places it in wave 4, but the plan this report answers to did not
  scope it (only packages 4-2, 4-3, 4-4, 4-6, 4-7, 4-8, 4-9, 4-10, 4-12, 4-13). Carried forward as an open item,
  not a silent omission.
- **No wave-5 telemetry pass** (`field.*` events beyond what Tasks 11/12 already emit for free).
- **No brand-voice pass** on `room-file-copy.ts`'s ESCALATE-class strings (rides Wave 1P's mount).
- **No `fieldWriteAttention` surface** — `653904911` records a terminal write loss (`.unwritable`, a margin-lane
  `.refused`) but nothing reads it yet; `SmartGuessSheet.fieldWriteStatus` shows the designer nothing for it.
- **R27 (Task 0a) — offline project CREATE at the door — is NOT built.** Sized **M** by pre-flight §0.8: a
  synchronous, network-or-nothing call today (`S2CreateProjectScreen.swift:131-134`), with no offline/outbox
  lane at all, unlike every other write this and prior waves add. Design recorded, not scheduled.
- **Task 17 (Library provenance chip) is skipped**, not built — it already shipped under Wave 1P
  (`library-card.tsx:43,476,478`, `library-shelf.tsx:54,136-139`), matching ruling 4's ladder exactly, per
  W4-C5.

**One defect found and closed at the gate, worth naming plainly.** The plan's Task 16 file list did not include
`AppContainer.swift`, so the implementer correctly built `VisitCloseOutboxDrainer` with nothing calling its
`resume()` — closing a visit and tapping the time offer wrote a durable local record that was never sent, so
`project_time_entries` never got the row. `7ac296b3c` wires the drainer into the same app-launch reconciliation
lifecycle every other outbox uses; `3d48b92f8` makes the time-offer button read the record's own state (queued
/ written / permanently failed) instead of a "she tapped" flag, and stops it retrying forever past
`FieldWriteGate.retryCeiling`. Both landed after this task's first gate pass and are folded into the numbers
above — see the note at the top of this report.

---

## The Agent-OS question, answered once

**The device sends nothing.** It writes a `project_tasks` row that a live, consent-gated database trigger may
turn into a text. The designer names the party and confirms before the row is written; the database re-reads
consent before the text goes out — `fc_dispatch_task_assignment` (`00284:160-203`) checks `party_kind IN
('gc','sub','installer','receiver')` and `sms_consent_status = 'granted'` on every `owner_party_id`
(re)assignment, independent of what the client believed. This is the same path the portal's own task assignment
has taken since `00284`, and it is human-initiated end to end — so AGENTS.md's *"no automated external sends"*
rule is **satisfied, not waived.** Ruling 2 is what makes it true: the party she was told about (GC-court-only,
no picker) is the only party that can be routed to.

---

## Owed decisions and open prerequisites

- **The selective-apply hazard.** Strata has `00530–00532` and `00541–00542` applied but is missing
  `00533–00540` (Daily Return, still pending per MEMORY). A plain `supabase db push` from this branch would drag
  the unapplied `00533–00540` to prod **alongside** this wave's `00543–00545` in one shot. Whoever pushes must
  re-check `supabase migration list` against Strata immediately before, and treat `00533–00540` as a separate,
  already-pending decision rather than something this push should silently resolve.
- **`has_table_privilege('authenticated', 'public.field_captures', 'SELECT')` must be checked on Strata before
  any push.** `margin_items` is `security_invoker`; if prod lacks the grant this migration assumes, the whole
  margin rail returns 42501 for every designer the moment `00543` lands, not just the field-capture rows.
- **The margin's volume (ruling 1) is unresolved.** Every in-visit note now files itself automatically, so the
  rail carries every note on the project. Step 3 point 4 of the plan asks whether a six-visit project's rail
  "drowns" — this was not answered this session because the browser proof could not run. If it does, §11.4's
  per-visit fold is the wave-5 remedy.
- **The Visits→margin link below 1440px does nothing.** The anchor lands in the full rail; in the sheet the
  panel is `inert` until the *Margin* trigger is tapped. Opening the sheet from a link is its own change with
  its own tests (W4-C9 already hides the link below breakpoint rather than shipping it inert).
- **A party picker for a punch item** (FC-R7's `court_party_id`) — answered *GC-only, v1* this wave; a picker
  for subs/installers is owed.
- **Merging `field_captures.venue_label` into `products.capture_provenance`** — belongs to whichever lane next
  replaces `commit_field_capture` (FC-R18's shared object), not this wave.
- **The broken lint gate command** in `CLAUDE.md`/`AGENTS.md` (`pnpm lint --filter designer-portal`) still does
  not resolve — the workspace is `@patina/designer-portal` and turbo never runs ESLint for it regardless. The
  working form used throughout this report is `pnpm --filter ./apps/designer-portal lint`. Owed: correct the
  documented gate command.
- **The `migration-search-path` pre-commit hook has a false positive** — it regex-matches the two-word phrase
  describing a definer function anywhere in changed content, including comments, and hard-blocked a commit this
  wave over prose describing an RPC replacement rather than defining one. Owed: match the actual
  `CREATE FUNCTION … <that phrase>` shape, or ignore comment text.
- **`capture-gate.sh all` exceeds the 600s Bash tool cap.** Confirmed again this session — it had to be run
  with `run_in_background: true`. Worth fixing in the script (split phases) or documenting the required
  invocation.
- **The `fieldWriteAttention` surface is unbuilt** (see "What this wave does NOT do"). Owed: a Sync-screen
  surface that reads it, plus its copy. Wave 5.
- **Task 0a (R27 offline project CREATE) is NOT built.** Sized **M**, design recorded in pre-flight §0.8: a new
  persisted pending-create state, a new outbox lane (same shape as this wave's two new lanes), and
  reconciliation for any specimen minted against the pending project before the real id exists.
- **Open prerequisite: whether `room-file` was enabled for the pilot cohort, and by whom** — not checked this
  session (a flag-admin fact, not a code/DB fact). FC-R10 names it as criterion 4's prerequisite; criterion 4 is
  not met while it is unconfirmed.
- **Open prerequisite: whether `room-file-copy.ts`'s ESCALATE-class strings got their brand-voice pass** — §17.4
  budgets it beside the Wave 1P mount; not verified this session.
- **Open prerequisite: whether `00530` reached `main` and Strata before Tasks 1 and 5 drew their numbers**
  (Task 0.1's gate) — pre-flight §0.1 confirms `00530`/`00532` were on `main` and applied both locally and to
  Strata before this wave started; this is **resolved**, recorded here only because the plan asks Task 18 to
  state it.

---

## Commit

This report and the ledger (no changes needed to the ledger beyond what is already current) are committed
together as Task 18's own commit. **This branch is not merged, not pushed, and not deployed by this task** —
that is the conductor's and Kody's call at the wave gate.
