# Field Companion · Wave 4 ledger — "It lands in the Document"

Branch `feat/field-companion-w4` · worktree `.claude/worktrees/field-companion-w4` · base `97f728f15` (main, W3 merged).

Conductor-maintained. One writer at a time, serialized on `writer.lock.d` at the worktree root.

## Conductor rulings (W4)

| # | Ruling | Rationale |
|---|---|---|
| W4-C1 | **Migration numbers draw from `00543`, not the 00530–00535 band.** The plan's band is exhausted and mis-stated: `00533_piece_detail_contract`, `00534_client_attention_notifications`, `00535_saved_items_price_snapshot` are on `main` and were drawn by other lanes. `main` head is `00542_product_images_owner_folder_insert`. | Filesystem census on `main@97f728f15` + local applied ledger (`schema_migrations` max `00542`). |
| W4-C2 | **Task 0.1's gate 2 ("`00530` applied to Strata") is RELAXED to a recorded owed item, not a blocker.** W4 proceeds on: `00530` + `00532` on `main` AND applied to the local DB. Prod apply of `00530`/`00532` (and of `00533–00542`) is Kody's GO, outside this wave. | Kody's standing instruction for this wave; prod mutation needs an explicit in-session request. The wave report carries the prod-apply debt. |
| W4-C3 | **W4 migrations must not depend on schema objects introduced by `00533–00542`.** Dependencies on `00530`/`00532` (the W1 routing + W3 visit columns) are unavoidable and are declared in each migration header and in the wave report. | Conductor brief; `00533–00542` are unapplied on prod. **Task 0 discharged this: none of the three authored files touches any object created by `00533–00542`, and `00530–00532` are already applied to Strata.** |
| W4-C4 | **Tasks 1, 7 and 8 run as ONE implementer**, three tests red → three numbers drawn → **one** `pnpm supabase:reset` → three tests green → three separate commits. | The plan declares them independent and parallel; each carries its own `supabase:reset`. Three resets of a shared local DB is waste, and serialising them behind the single writer lock costs nothing extra. Scope is unchanged. |
| W4-C5 | **Task 17 (the Library provenance chip) is SKIPPED.** Task 0.3 measured it already shipped — `library-card.tsx:43,476,478` (`fieldProvenanceLabel`, gated on `capture_source === 'field_capture'`, reading `captured_at` not `created_at`) fed by `library-shelf.tsx:54,136-139`'s `field_capture_id` embed for `venue_label`, with two existing test files. That is ruling 4's exact ladder and both of its named defects are already absent. | The plan's own Task 17 contingency: *"Task 17 is skipped entirely if the provenance chip already shipped in Wave 1P — doing it twice is worse than either."* |
| W4-C7 | **The margin's body paragraph is gated on `field.fieldCaptureId`.** Task 2 shipped it ungated (the plan's own Step 4 JSX dictates that), so on a field-less project every typed note began rendering its text twice — once in `MarginItem`'s always-visible title header, once again in `NoteBody`. A field-less note must render byte-identically to how it rendered before this wave. | Spec §11.4 (*"renders, **when `payload.field_capture_id` is present**"*), §11.6 (*"the margin payload only lights when `field_capture_id` is set"*), and FC-R10, which makes field-less render-nothing an explicit acceptance criterion. Found by adversarial review; a plan bug faithfully executed, not an implementer error. |
| W4-C8 | **Whether a long *typed* note should also get a full body is NOT taken in this wave.** It is a real improvement with a different acceptance criterion; it would change the field-less render that FC-R10 pins. Recorded as an owed decision. | Consequence of W4-C7 — stated so it is not re-discovered as an omission. |
| W4-C9 | **Do not ship a dead link.** *Read it in the margin* is hidden below the full-rail breakpoint rather than rendered inert. Wiring `OPEN_MARGIN_EVENT` is NOT taken — the plan defers opening the sheet from a link as a margin-rail change with its own tests, and that deferral stands. | Below 1180px the rail `<aside>` is `hidden`; from 1180–1439px it is `inert`/`pointer-events-none` unless the sheet is open. A visible, clickable link that does nothing is the failure §3.3 forbids. Removing the lie is in scope; building the handler is not. |
| W4-C10 | **The Visits tally counts photographs, not photo-bearing captures.** | The copy says `12 photos`. The reducer counted captures, so a capture holding three photographs reported as one — and the plan's own fixture (3 files across 2 captures asserting `photoCount === 2`) encoded the mismatch, so no test could ever catch it. |
| W4-C11 | **A visit's day is rendered in the visit's own timezone** (`field_captures.captured_timezone`), falling back to the reader's when null. | `toLocaleDateString` off a UTC instant with no `timeZone` renders a 19:30 CDT visit as **tomorrow** for a UTC reader. The column exists and was unused. |
| W4-C12 | **The FC-R8 co-member exposure is recorded as an owed ruling for Kody, not changed under deadline.** A studio co-member sees another designer's in-flight visits on the project spread, via the pre-existing `field_captures_org_inbox_select` policy. | It follows an existing grant rather than creating one. Narrowing it is an RLS-shaped decision, and FC-R8 says per-designer in v1 — so it deserves a ruling, not a deadline patch. |
| W4-C13 | **The punch photo's grid change is confined to punch rows** (per-row conditional template + wrapper), not applied to the shared row template. | `9b9c134bf` widened the shared template to a 4th track with `gap-2.5` unchanged. CSS Grid `gap` applies between **every** declared track regardless of content, so every task row in every section — including every row on a field-less project — gained an unconditional 10px. The commit's justification was also overstated: auto-placement tracing shows the plan's literal version would have broken **punch rows only**. |
| W4-C14 | **The punch thumbnail keeps `primary_photo_path`-first ordering; the margin's strip is NOT changed to match.** Aligning the view's `photo_paths` ordering is recorded as owed. | Two of the three field-capture surfaces already lead with the designer's chosen primary; the margin (`00543:377-385`, `order by ph_ord`) is the odd one out. Changing the view under a deadline to settle a cosmetic divergence is the wrong trade. |
| W4-C15 | **N-2's fix is RESUME, not a politer close.** The 4-hour `inactivityWindow` is a **routing** window, not a visit lifetime. A visit that `CaptureVisitPolicy.visitState` still calls live (idle 4–12h, same calendar day) must **resume** across it with `visitID`/`kind`/`kit`/`label` intact. Separately, every computed close that `expiry()` **does** name — `auto` (12h / backwards clock) and `rollover` (calendar day) — must emit a real `visit.end` through `FieldVisitEndEmitter`, including the rollover-under-4h branch that closes silently today. **No fifth reason is invented.** | FC-R21 part 3 enumerates exactly four reasons and **none** covers "the routing window lapsed" — a close whose reason the ruling cannot express is not a close the ruling models. `CaptureVisitPolicy.visitState` declares itself (`:71-73`) "the authority on whether a visit is still live" and at 5h same-day idle says `.stale`, i.e. alive — while the UI is literally offering *"Resume"*. The pre-flight's "reap inside `current()`" recommendation rested on a premise the review disproved: `expiry()` returns `nil` in this window, so there was never a reason for it to supply. The shipped fix took Reading A's cost (the visit dies) without its benefit (a recorded, reasoned close). |
| W4-C6 | **The three accumulated debts are scheduled as Tasks 0a/0b/0c in this wave**, not recorded forward again. Task 0 measured and sized all three; the conductor brief asks for the `SmartGuessKeywords` matcher to be fixed with tests, and promotes R27 from W3. | Conductor brief's Task 0 add-ons. |

## Task status

| # | Task | Model | Status | Commit | Gate |
|---|---|---|---|---|---|
| 0 | Pre-flight re-verification + three accumulated debts | Sonnet | **done** | `8151529a7` | n/a (research) |
| 1 | The margin migration (`00543`) | Sonnet | **done**, in review | `82eddc7f2` | `run-sql-tests.sh -f margin_items_note_field_capture` → `all 7 cases passed` |
| 7 | The punch back-reference migration (`00544`) | Sonnet | **done**, in review | `db160881c` | `-f project_task_field_capture_ref` → `all 6 cases passed` |
| 8 | The time-entry migration (`00545`) | Sonnet | **done**, in review | `3aaeaae2b` | `-f time_entry_field_visit_source` → `all 5 cases passed`; full suite exit 0, 142 total / 120 green / 22 expected-fail / **0 unexpected** |
| 2 | The margin renders the whole note | Sonnet | **done + reviewed + fixed** | `5cd31d4ad` | — |
| 3 | The play button and the photo strip | Sonnet | **done + reviewed + fixed** | `353426644` | — |
| 4 | Escalation carries the whole note | Sonnet | **done + reviewed + fixed** | `e5ad90545` | — |
| 5 | `useProjectVisits` | Sonnet | **done**, reviewed — **BLOCKER found**, fix in flight | `39c1c7697` | — |
| 6 | The Visits block on the project spread | Sonnet | **done**, reviewed — **BLOCKER found**, fix in flight | `57f4408b2` | — |
| — | Migration review fixes (F1–F17) | Sonnet | **done** | `7ea4f985e` | full SQL suite exit 0: 142 total / 120 green / 22 expected-fail / **0 unexpected** |
| — | Margin review fixes (W4-C7, F1–F16) | Sonnet | **done** | `44dd14f7f` | 4 suites / 30 tests green; type-check clean; lint 2 errors (baseline) / 199 warnings (−2) |
| — | Visits review fixes (W4-C9…C12) | Sonnet | in flight | — | — |
| 13 | The punch photo on the Work block | Sonnet | in flight | — | — |
| 9 | CaptureKit: the margin-note lane | Opus | queued | — | — |
| 10 | CaptureKit: the task lane + court rule | Opus | queued | — | — |
| 0c | `SmartGuessKeywords.category(forVisionLabel:)` ordered-substring bug | Sonnet | done, reviewed — **regressions found**, re-fix in flight | `e2868dc99` | — |
| 0b | N-2 `resolve` 4-hour window ends an idle live visit | Sonnet | done, reviewed — **did NOT fix the bug**, re-fix in flight under W4-C15 | `77700e6a5` | — |
| 9 | CaptureKit: the margin-note lane | Opus | **done**, in review | `909ccf975` | 20/20 new; suite 620/620; swiftlint 0/250 |
| 10 | CaptureKit: the task lane + court rule | Opus | **done**, in review | `485be0a47` | 19/19 new; suite 620/620 |
| 13 | The punch photo on the Work block | Sonnet | **done + reviewed + fixed** | `9b9c134bf` → `752512ccf` | — |
| 11 | The app writes the two rows on the drain | Opus | **done** | `242f36682` | — |
| 12 | The three verbs on the card | Opus | **done** | `5c47b6dcf` | — |
| 14 | CaptureKit: visit review + close record | Opus | **done** | `ed6995127` | — |
| 15 | V4 Visit review screen | Opus | **done** | `37f8e15d8` | — |
| 16 | One tap logs the visit as hours | Opus | **done, reviewed — found inert (plan omitted `AppContainer.swift` wiring), fixed** | `420c65621` → `7ac296b3c` → `3d48b92f8` | `capture-gate.sh all` + `swiftlint --strict` green (Task 18, see wave-4-report.md) |
| 0a | R27 offline project CREATE at the door | Sonnet | pending (sized **M** by Task 0.8) | — | — |
| 9 | CaptureKit: the margin-note lane | Opus | pending | — | — |
| 10 | CaptureKit: the task lane + court rule | Opus | pending | — | — |
| 11 | The app writes the two rows on the drain | Opus | pending | — | — |
| 12 | The three verbs on the card | Opus | pending | — | — |
| 13 | The punch photo | Sonnet | pending | — | — |
| 14 | CaptureKit: visit review + close record | Sonnet | pending | — | — |
| 15 | V4 Visit review screen | Opus | pending | — | — |
| 16 | One tap logs the visit as hours | Sonnet | pending | — | — |
| 17 | The Library provenance chip | — | **SKIPPED (W4-C5)** — already shipped | n/a | n/a |
| 18 | Wave gate: browser proof, device pass, report | Sonnet | pending | — | — |

## Cross-cutting fix commits

| Commit | What |
|---|---|
| `7ea4f985e` | Migration review fixes — F1 jsonb hardening, F3/F4 constraint resolver + behavioural postcondition, F6/F7/F8 header + ledger truth, F10–F17 |
| `44dd14f7f` | Margin review fixes — W4-C7 body gate, unsignable-audio statement, duration placement, coverage |
| `40f1636fa` | Visits **blocker** — `PGRST201` embed disambiguation, W4-C9…C11 |
| `752512ccf` | Task 13 **blocker** — `work-block.test.tsx` 12/12 restored, W4-C13 grid confinement |
| `3b866ee58` | F56 contrast guard — `--color-clay` → `--color-clay-ink` in the Visits deep-link hover, matching `margin-bodies.tsx:970` |
| `09ede92a6` | 0b/0c re-fix under **W4-C15** — the idle visit resumes across the routing window; every computed close emits a real `visit.end`. Suite **640/640 in 64 suites**. |
| `653904911` | CaptureKit lane review fixes — **the re-tapped-punch blocker** plus 14 more. Suite **667/667 in 65 suites**, `swiftlint --strict` 0/251, `GATE_EXIT=0`. |

### The CaptureKit blocker, and two places the wave's own inputs were wrong (`653904911`)

**The blocker.** `requestPunchTask` assigned `punchTaskId` unconditionally while `requestMarginNote` guarded it — so a re-tapped punch verb minted a **second** `project_tasks` id, lookup-before-write checked an id that did not exist yet, and `fc_dispatch_task_assignment` (AFTER INSERT) fired again. Consequence: **a second SMS to the general contractor** — the one external send this design exists to keep honest. The plan's own interface spec omits the guard, so this was faithful-to-plan.

**Two inputs that were themselves wrong, both caught by the implementer rather than obeyed:**
- The plan specifies the id guard for the margin lane and omits it for the punch lane, where the stakes are strictly higher.
- `MarginNoteWriteTests` **pinned `23503 == .failed`** — encoding the retry-forever bug as correct behaviour, so no test could ever have caught F3.
- And one correction to the *review*: its citation fix `00196:51-54 → 50-53` was wrong; the policy really does span 51–54. Verified against the migration and left as written. (The two `00284` citations were genuinely drifted and were fixed.)

**Also fixed:** the FC-R8 degrade got its own `degradeNote*` lane, so it can no longer be silently dropped when the auto-filed transcript note is still in flight (the common case under ruling 1); a new terminal `.unwritable` state plus a retry ceiling of 5 stops permanently-doomed writes — notably `PGRST204`, reachable today because `00543–00545` are not on Strata — from looping forever on every device; a bare `permission denied` no longer reads as a refusal, since that is what a **missing GRANT** produces on every device rather than a fact about one designer; and a consented GC with no `phone_e164` now resolves `.noCourt` rather than being promised a text that can reach him through neither the dispatch trigger nor the daily digest.

### W4-C15, evidenced rather than asserted (`09ede92a6`)

- **The 14:00 Resume tap.** Visit opens 08:00, capture 09:00, phone picked up 14:00. `visitState` reads `.stale` (not `.none`), so `resolve`'s first guard no longer replaces the context: she gets back the **same `visitID`, kind, kit, label and routing**, `lastActivityAt` refreshed. Events fired: `visit.stale_prompt{answer:resume}` **only** — zero `visitDidChange`, zero `visit.end`, empty pending-end queue. All four pinned by test.
- **A real `visit.end` now fires for both named reasons**, including `resolve`'s **under-4h rollover branch** (23:40 → 00:10, 30 min idle — inside `inactivityWindow`, so it is the second branch), which previously dropped the visit with no `endedAt` and no event and is reachable from S1×2/S2/S3, none of which hold an emitter. That branch still carries her routing forward. Exactly-once holds in both orderings.
- **No fifth FC-R21 reason was needed** — the ruling's four-value vocabulary was sufficient once the eventless close was removed rather than renamed.
- Implemented via FC-R21's own named N-2 remedy (a persisted pending-end slot in its own key, drained by `FieldVisitEndEmitter`), so `CaptureSessionContext`'s hand-written absent-tolerant `init(from:)` is untouched and previously-persisted contexts decode unchanged.
- **Vision labels:** `bookshelf` → `.storage` and `spotlight` → `.lighting` restored by table row (with a test — nothing previously pinned a compound word that *should* match, which is why `bookshelf` slipped). `printed_page` and `fishbowl` deliberately **not** restored: the first is the same false-positive family as `printer`, and the `bowl` row already covers a decor bowl. **Conductor accepts both calls.**
- A test-authoring trap worth carrying forward: the agent's first two fixtures were offsets from a shared `now` of 02:00 Chicago, so `now − 5h` crossed the *previous* Chicago day and the calendar-day rule — not the routing window — was what ended the visit. The tests would have passed while pinning the wrong mechanism. Fixtures now build the literal 08:00/09:00/14:00 clock from `DateComponents`.

## Deviations from the plan's literal text, taken deliberately

| # | Deviation | Where | Why |
|---|---|---|---|
| D1 | The margin test's case-0 guard was changed from `ASSERT v_field IS NOT NULL` to `ASSERT v_field.item_id IS NOT NULL`. | `supabase/tests/document/margin_items_note_field_capture_test.sql` | Postgres row-value `IS NOT NULL` on a composite RECORD is field-wise — true only when *every* column is non-null — and a letterhead-anchored note legitimately has `anchor_id`/`proposal_id` NULL, so the authored guard failed against a **correct** migration. A defect in the plan's test-authoring, not in `00543`. Cases 1–7 untouched. **Adversarial review CONFIRMED this deviation is correct**, by probing the live DB: after a zero-row `SELECT … INTO`, `r IS NULL` is true and `r.item_id IS NOT NULL` is false without raising; with a row found, `r IS NOT NULL` is *also* false. The authored guard was a genuine false-FAIL. |
| D2 | `formatNoteDuration` uses `Math.floor`, not the plan's `Math.round`. | `apps/designer-portal/src/lib/document/field-note-payload.ts` | The plan's own implementation contradicted the plan's own test: JS `Math.round(64.5)` is `65`, so `Math.round` renders `1:05` against an assertion demanding `1:04`. `Math.floor` satisfies all three of the plan's assertions without touching the test. A defect in the plan, caught by following its TDD order. |
| D3 | `pnpm lint --filter designer-portal` errors "No package found"; the workspace is named `@patina/designer-portal`. | — | Repo fact the plan's Global Constraints get wrong. All later tasks use `--filter @patina/designer-portal`. |
| D4 | The worktree had **no** `node_modules` at all; a `pnpm install --frozen-lockfile` was needed before any portal gate could run, with the sandbox disabled (pnpm's store hardlink is blocked). | — | Worktree creation does not install deps. Recorded so later tasks do not re-diagnose it. |

| D5 | The Visits block was mounted after `RoomFilesSection` and before `FFESection`, not after `ScheduleSpine` as the plan says; `margin-rail.tsx`'s `targetId` line is `:563`, not the plan's `:443`; `page.tsx`'s seams are at `2818`/`2830`, not `1354`/`1360`. | `doc/[id]/page.tsx`, `margin-rail.tsx` | The plan's line numbers predate Wave 1P mounting `RoomFilesSection`. Grouping the two Field Companion blocks together is the natural placement. **Under adversarial review.** |
| D6 | `fmtDay` strips a comma from `toLocaleDateString`. | `visits-block.tsx` | This runtime's ICU renders `"Tue, Aug 25"`, not the plan's assumed `"Tue Aug 25"`. **Under adversarial review for locale-safety and SSR/CSR hydration risk** — a `toLocaleDateString` in a React component is a classic hydration hazard. |

## ⚠ Task 18's device pass cannot be delegated

Two claims in this wave are **only** observable on a signed build on a real iPhone, and the plan says so itself (`:6168`): *"Nothing in this task may be answered from a green gate."*

1. **A punch item reaches the GC** — verified against a real `sms_messages` row, never by assumption. Ruling 2's central guarantee (a consented **sub** or installer on a project that also has a GC is **never** texted) is observable nowhere else.
2. **FC-R8's degrade with the C3 card off screen** — background the app the instant after Add so the drain takes the 42501 with no UI attached, and confirm the `margin_notes` row lands anyway. The plan is explicit that the on-screen run "only proves the card."

`capture-gate.sh build` is a Simulator compile gate (`CODE_SIGNING_ALLOWED=NO`) and `patina-ios-verification` forbids installing such a build for a walk. The `blitz-macos` and `mobai` device-automation MCP servers also failed to connect this session (`CONNECT_TIMEOUT` / `ConnectionRefused`), so no simulator-assisted substitute exists either. **Owed to Kody.**

## ⚠ A latent bug Tasks 9/10 introduced and Task 11 would have made reachable

`LocalCaptureSyncService` had three transfer-phase branches keyed on `hasConfirmedCaptureReceipt && needsProjectPlacement`, falling through to `applyTransferState` for everything else. Tasks 9/10 added `needsMarginNote`/`needsPunchTask` to `CaptureStore.outbox()`, so a **committed** row returning to the drain for a margin-note or punch lane alone would have been painted `.uploading` and then `.queued`/`.retryableFailure` — **a failure badge on a capture the server had already accepted.** Task 11's `isFieldWriteLaneOnly` guard closes it.

The hazard was introduced by `909ccf975`/`485be0a47` and became reachable only at `242f36682`. It was found by the implementer, not by a gate — no test covered a committed row with only a field-write lane open.

## ⚠ What the green iOS gates do NOT prove (C1)

**Both Supabase inserts are app-target code with no test target.** `capture-gate.sh test` runs `-scheme CaptureKit` only, so of this wave's iOS work only the pure types are covered — `FieldWriteGate`, `PunchCourtCopy`, `MarginNoteComposer`, `PunchTaskComposer`, `PunchCourtResolver`, `FieldWriteClassifier`, `VisitReviewComposer`. `SupabaseFieldWriteGateway`'s two inserts, the drain wiring, the overflow menu and V4 are proven by **nothing but the device pass**. A 646/646 suite is not evidence that a row lands.

**Unchanged by FC-R23's mount (2026-09-01).** The verb *decisions* — which rows show, which are
disabled, when the confirm is required, what each line says — moved into CaptureKit and are covered
by `FieldVerbMenuTests` (suite **755 in 72**, from 732 in 70).

⚠ **`CaptureCardConfirmUnchangedTests` does NOT pin the overlay** — nothing can, from this target.
It exercises the CaptureKit accessors the card reads (`setValue`/`provenance`, `FieldPlacementLine`)
and proves the *verb lanes* leave them alone. That is worth having — it is the falsifier for "the
verbs moved what C3 was already for" — but it is a statement about `Specimen`, not about
`CaptureCardOverlay`, and the name should not be read as more.

What is still app-target and therefore **compile-gated only**: `CaptureCardOverlay`'s rendering of
the menu and the notice, `ViewfinderScreen`'s per-card reset, and `ViewfinderModel`'s `cardParties`
load and `performVerb`. The device pass remains the only evidence that a tap on the card puts a row
in the database.

## Notable plan-vs-repo corrections in Tasks 11/12

- **There is no `Specimen.visitID`.** Wave 3 spells a declared visit as `visitKind`, which is what `FieldCapturePayload` itself gates on. `captureSessionID` rides every draft and does **not** mean a visit was declared.
- **The field-write call must sit OUTSIDE the `if let productID` branch.** The plan put it inside — but a spoken note commits with no Product, and that is exactly the capture the margin lane exists for. Inside the branch, ruling 1's automatic margin note would never file.
- `owner.userID` is non-optional, so the plan's `.flatMap(UUID.init)` does not compile.
- Plan line numbers `:288`/`:487`/`:509` were stale; the real sites are `:297` and `:598`.

## ⚠ A plan omission that made Task 16 inert

The plan's Task 16 file list does **not** include `AppContainer.swift`, so `VisitCloseOutboxDrainer` was created, tested and left with **nothing calling `resume()`**. The implementer was right not to add it unrequested. Consequence: closing a visit and tapping the time offer wrote the `FieldVisitCloseRecord` durably to the local store and **never sent it** — the `project_time_entries` row never landed, so Task 16's headline (*"one tap logs the visit as the hours it took"*) did not work end to end. Wired in a follow-up commit.

Two more capacity notes from the same batch, for whoever plans Wave 5:
- **`RouteSessionScreens.register` is at exactly SwiftLint's 60-line `function_body_length` limit.** V4's builder could not go there (the first attempt failed `--strict` at 66), so it registers through `ScreenRegistry`'s own documented one-line-per-feature seam instead. The implementer declined to suppress a real guard on pre-existing code — correct. **The next task that wants to add a builder there will fail.**
- **`FieldWriteOutcome` gained `.unsatisfiable(String)` in Task 12**, after the plan was written. Any task switching over that enum from the plan's literal code will not compile. Task 16 handles it as terminal beside `.refused` — `23514` (`CHECK (duration_minutes > 0)`) is exactly the code that reaches that lane, and no retry can satisfy it.

## What the visit-close review CONFIRMED correct (recorded so a clean check is not mistaken for an unrun one)

- **The running-timer invariant holds, traced end to end.** `TimeEntryWriteRequest.durationMinutes` is a non-optional `Int` — **nil is not expressible anywhere in the wave**. The floor lands at the point of *insert* (`FieldVisitCloseRecord.init`'s `max(1,·)`), not merely at display. Sub-minute → 1; zero-length → 1; backwards clock → 1; DST unaffected (`timeIntervalSince` is absolute time, no `Calendar` arithmetic in the path); `.rounded()` is away-from-zero so nothing rounds to 0. Verified against the live catalog that `project_time_entries_duration_minutes_check` and `uniq_project_time_entries_running_timer` are both **unreachable** from this wave — V4 cannot take the portal TimerButton's slot.
- **Close idempotency is terminal.** Client-minted `timeEntryID` becomes the row's PK; lookup-before-write closes the lost-response gap a round-trip early, and `23505` → `.alreadyWritten` → `markDelivered()`. **This lane did not repeat the never-closing-lane bug.**
- **The frozen enum took exactly one case.** `CaptureNavigation.swift` is `+6/−0`; the two conductor-authorized companions are one line each and carry no behaviour.
- **`endVisit` genuinely ends something** — stamps `endedAt`, preserves `visitID`, guards a second tap; V4 reads the §14 counts *before* the close, which is the correct order.
- **Both declared §7.9 deviations were kept** — groups are `Captures · Notes · Unplaced` with no *Scans* arm anywhere; `elapsedMinutes` is `startedAt→now` and `visit_ended_at` appears nowhere in the wave's Swift.
- **Copy is verbatim and on-brand** — both `doneCaption` strings byte-exact including the em dash and the 1-vs-N split; no "Inbox" in any user-facing string (its only occurrence is a code comment naming the `field_captures_org_inbox_select` policy); no "AI", no mechanism talk; plurals covered at 0, 1 and N.
- **The SwiftData schema addition is safe** — every stored property has a declaration default, which is what lightweight migration requires to add an entity to an existing store.

## Owed, recorded, deliberately not fixed

- **F11/F8 — the Hours entry and the Visits row disagree about when the visit ended.** `closedAt` is snapshotted on appear (so the receipt does not tick while she reads it) while `endVisit` stamps its own `now` at Done. A designer who reads V4 for twenty minutes gets a Visits row twenty minutes longer than its billing shadow. Deliberate, but a real divergence from FC-R3's "one event" and previously undeclared.
- **A V4 opened with no live context reports a one-minute visit** (`startedAt` defaults to `Date()` and is only overwritten `if let context`). If an auto-close raced the tap the receipt is wrong — but `projectID` stays nil so the offer is hidden and nothing reaches the database.
- **`.written` close records are never deleted** and accumulate for the life of the install.
- The "byte-for-byte" backoff tests hardcode expected delays rather than asserting against `SiteRequestOutboxRecord.retryDelay`. The formulas are currently character-identical (verified by hand); an edit to either would not be caught.

## ✅ I-4 — RESOLVED 2026-09-01 by **FC-R23**: the verbs mount on the C3 card

**Kody ruled candidate 1.** The three verbs mount on `CaptureCardOverlay` — the real §7.5 C3
quick-confirm card, the one every capture shows after the shutter — on an overflow control beside
*Add detail* / *Save*. The gap and its evidence are preserved below, unedited, because the reasoning
is what the ruling answers.

**What landed** (branch `feat/field-verb-mount-c3`):

- The menu, the punch confirm, the two filed rows and the status line moved out of `SmartGuessSheet`
  into CaptureKit — `FieldVerbMenu.swift` (the state machine + copy) and `FieldVerbControls.swift`
  (`FieldVerbOverflowMenu`, `FieldVerbNotice`). **Both surfaces render the same component**, so the
  menu cannot say one thing on the card and another on N5.
- `SmartGuessSheet` keeps working for the screenshot harness. Its deep-link presenter is untouched;
  it lost its private copy of the verbs and reuses the extracted one.
- **Everything the sheet's verbs did carried over**: FC-R7's punch-court confirm before any punch
  write, ruling 2's no-court fallback to her own task, I-5's *"Punch item filed — file another?"* row
  above a still-live punch verb, ruling 1's *"Filed in the Document."* statement in place of a second
  note verb, the `refused` / `filed` status lines, and FC-R16 (no action on this menu can reach a
  measurement — pinned by a falsifier that runs the whole flow over a transcript carrying a number).
- **Disable-during-write is now shown rather than merely enforced.** `requestPunchTask` was already a
  no-op while the lane is open; the card renders that as a disabled row, so a tap the model would
  swallow is never offered. `.refused` / `.unwritable` / `.failed` close the lane the same way and are
  disabled with it.
- **The write lanes were not touched.** `MarginNoteWrite`, `PunchTaskWrite` and
  `Specimen+Accessors`'s request methods are byte-unchanged; the menu returns a `FieldVerbAction` and
  its host calls the same accessors N5 called.

**One deliberate difference from N5, forced by where the card sits.** N5 runs after a capture has
committed; C3 runs *before* it. Both rows carry `field_capture_id`, an FK to a `field_captures` row
that does not exist until Save commits it, so the card **mints the lane and saves, and does not
enqueue** unless the capture already holds a receipt. An enqueue there would stamp `.queued` on a
capture she has not saved and upload it behind her back — for nothing, since
`FieldWriteGate.fieldCaptureID` would return nil and the lane would wait anyway. The lane instead
rides the capture's own commit (`saveFromCard` → `route` → drain → `performFieldWritesIfNeeded`).
**Consequence, recorded rather than hidden:** a verb tapped and then swiped away without saving
leaves the draft with a pending lane, which lands when she files that capture from the tray. Nothing
is lost and nothing is written early.

**Also:** `ViewfinderModel` gained `cardParties` — the unfiltered `project_parties` list
`PunchCourtResolver` needs (ruling 2) — loaded when the card appears and again when the visit door
closes, because that is where the card gains a project and therefore a court. Empty while the fetch
is in flight, which the resolver reads as *no court*: the same window N5's own `.task` load has.

**Out of scope by the brief, and stated so it is not re-discovered:** no other navigation surface was
wired. **Captures with no card moment — the tray's rows, V4's rows — still have no verbs, and the
spec does not grant them any**; §7.8 and §7.9 list their acts and the three verbs are not among them.
**Tray-side access rides with Wave 5.**

**Two carried items this unblocks**: R-17 (I-5's menu row shipped on the unreachable sheet) is now
visible and tested, and W4-01's harness `withSample` cleanup is no longer contingent — the harness is
no longer the *only* presenter, though `CaptureDeepLink.swift:102` is deliberately left as it is.

<details>
<summary>The gap as recorded on 2026-08-31, preserved</summary>

### 🔴 I-4 — the three verbs ship on a screen no shipping build can open. **GAP RECORDED, needs a Kody ruling.**

Task 12's three verbs (*Make it a note in the Document* · *Make it a task* · *Make it a punch item*) and Task 10's whole punch lane live in `SmartGuessSheet.swift`'s `verbMenu`. **`SmartGuessSheet` has no production presenter.**

Evidenced, not asserted:

- `CaptureSheet.smartGuessCard` is presented from exactly **one** call site in the whole app: `Capture/App/DeepLinking/CaptureDeepLink.swift:102`, inside `withSample { … }`.
- That whole `route(for:)` switch sits behind `guard verificationHarnessAllowed` (`:64`), which is `#if DEBUG true #else !AppConfiguration.runsRealServices #endif` (`:224-230`). **In a Release build against real services it is `false`.** So the screenshot harness is not merely the *only* way in — in a shipping build there is no way in at all.
- The sheet's only other reference is its registration, `RecognitionScreens.swift:89-101`.

**Consequence:** acceptance criterion 3 of the wave is unwalkable (the device pass's step 3, plan `:6228`, and the FC-R8 degrade at `:6232`, cannot be performed), and Tasks 10 and 12 ship unreachable. `LocalCaptureSyncService`'s I-14 demotion bug is latent for the same reason — it goes live the moment a production entry point exists. (I-14 is fixed anyway in this fix wave, so the mount, whenever it lands, is not landing on top of it.)

**Why this was not wired here.** The spec is genuinely silent on mounting N5, and the plan's file list conflates two different screens:

- **The plan's Task 12 calls `SmartGuessSheet` "the C3 card"** (`:4605`, `:4623-4624`, `:4781`) and puts the overflow *"beside the existing `RecognitionActionBar` (`SmartGuessSheet.swift:50-55`)"*.
- **But §7.5's "C3 Quick-confirm card" is `CaptureCardOverlay.swift`** — its diagram (thumb · category/material · placement line · inline mic · *Save* / *Add detail* / swipe) is that file line for line, it is what `ViewfinderScreen.swift:81` actually mounts after the shutter, and its own header comment at `:10` says so in as many words: *"a transient overlay INSIDE the viewfinder, not a registered sheet (Team C owns `CaptureSheet.smartGuessCard`)."*
- `SmartGuessSheet` is **N5 · "Review guesses"**, a different screen. The package names it exactly once, at `:531`, and names it as a screen nothing opens: *"already built, reachable today only behind the N5 sheet the photo path never opens."* No wave in the package is given the job of opening it.

So there is no spec line to obey, and inventing a mount would be inventing UX on the app's hottest surface under a fix brief. **Recorded, not invented.**

**The ruling Kody owes — two candidates, materially different:**

1. **Move the verbs to the real C3 card** (`CaptureCardOverlay`), which is what the plan's *prose* intended and its *file list* got wrong. Cheapest path to a walkable criterion 3; but it puts the app's first overflow menu on the post-shutter card, which §7.5 has already loaded with a placement line and an inline mic across three waves.
2. **Give N5 a production entry point** (e.g. from C5 *Add detail*, or a row on the C3 card), which also un-strands `HeuristicSmartGuessService`'s confirm-or-correct screen. Larger, and it is a new screen in the flow rather than a menu on an existing one.

Either way it is a wave of its own, with the device pass attached. **Wave 5.**

</details>

**Ruled: candidate 1.** §6 Flow 5 step 3 — *"Tap **⋯ → Make it a punch item**"*, reached from step 1's
shutter → C3 — turns out to put the overflow on C3 in the spec's own prose, so the mount is the
package's flow rather than an invention. FC-R23 records it.

## ⚠ Owed decision created by the CaptureKit fixes (`653904911`)

The fixes added a durable `fieldWriteAttention` record so a lane that closes terminally — a new `.unwritable` state after the retry ceiling, or a margin-lane `.refused` — **leaves the loss on record instead of vanishing**. But **nothing reads it yet.** `SmartGuessSheet.fieldWriteStatus` switches on `punchTaskState` with a `default:`, so `.unwritable` compiles and shows the designer nothing, and the Sync-screen surface is unbuilt. The implementer deliberately did not invent user-facing copy for it.

So the data loss is now *recorded* rather than *silent*, which is the right first move — but it is not yet *visible*. **Owed: a surface that reads `fieldWriteAttention`, plus its copy.** Wave 5.

## Carried to Wave 5, deliberately not taken in the fix wave

Recorded here so none of them is re-discovered as an omission.

- **I-9 — only one of the four `endVisit` sites routes through V4.** The call sites are `V0VisitSheet.swift:362` (the visit sheet's own *End visit*), `V4VisitReviewScreen.swift:357` (reached only from the tray), `WorkDashboardScreen.swift:71` (the stale prompt's *End visit*), and `RootView.swift:264` (the Today band's `FieldCompanionActionID.endVisit`). Only `V1SessionTrayScreen.swift:403-408` opens V4 first. So a visit closed from the sheet, the Today band or the stale prompt produces **no receipt and no Hours offer** — the two things Task 15/16 exist for. This is FC-R3 breadth, not a defect in the shipped code: making the other three route through V4 changes what those three controls *do*, and the stale-prompt one in particular is a close the designer did not initiate. **Needs a ruling.**
- **I-6 — nothing reads `fieldWriteAttention`.** Already recorded above under *Owed decision created by the CaptureKit fixes*; carried unchanged. Wave 5 owes the surface and its copy. **⚠ FC-R23 raised its priority (2026-09-01).** A lane that closes `.unwritable` at the retry ceiling now leaves the punch verb correctly disabled and says *nothing at all* — `.refused` at least has a status line. On N5 that silence sat on a screen no build could open; it now sits on the surface every capture passes through. Same fix, higher stakes.
- **The punch-row visual residual** — the 10px / 32px / baseline relationship on the punch row after W4-C13 confined the grid change. A browser-walk item, not a test item; it needs Kody's eye on the running page, not another jest assertion.
- **W4-01's harness `withSample` cleanup** — contingent on I-4 landing a production mount. ~~I-4 did not land~~ **I-4 landed on 2026-09-01 (FC-R23)**, so the contingency is discharged; `CaptureDeepLink.swift:102` is deliberately left as it is (N5 still needs its harness presenter) and the cleanup is now a Wave 5 choice rather than a blocked one.
- **Tray-side verb access.** The C3 mount covers every capture with a card moment. A capture with none — a tray row, a V4 row — still has no verbs, and §7.8/§7.9 grant it none, so nothing was invented for them. **Wave 5.**

## Process finding — sandboxed `sleep` does not wait

Reported by the CaptureKit-fixes agent and consistent with the lock-contention behaviour seen all wave: under the sandbox, `sleep` returns immediately, so a `until mkdir …; do sleep 15; done` waiter **spins instantly** instead of backing off. That is very likely the real mechanism behind the starvation in finding 2 below — agents were not polling at the intervals their code specified. Waiter loops need `dangerouslyDisableSandbox: true` to actually back off.

## ⚠ Process findings — the `mkdir` mutex is not sufficient, and the iOS gate exceeds the tool cap

Three operational defects surfaced while running this wave with concurrent agents. All three are **Wave 5 planning inputs**, not code defects.

1. **The `mkdir` mutex was bypassed once by an owner-file overwrite.** The protocol writes `writer.lock.d/owner` only after a successful `mkdir`, so an owner file that changes while the directory persists means the gate was skipped. A bypass does not surface as an error — it surfaces as two agents building over each other's half-written files.
2. **It starves queued holders under unequal poll intervals.** The Tasks 11/12 agent acquired at 14:18, lost the lock at 14:21, and then lost three consecutive races while polling at 15s against agents polling faster — going ~90 minutes without writing a line despite being first in line and having finished work in hand. It had to be arbitrated by hand.
3. **A background `mkdir` loop can outlive its agent and orphan the lock.** At 15:01:26 the lock was re-created naming `contrast-fix` — an agent that had committed (`3b866ee58`), reported its `rm -rf`, and finished long before. Its stray background acquisition loop won the race afterwards and left a lock nobody was holding: clean tree, no build running, two agents queued behind it indefinitely. Cleared by the conductor after verifying all three. **Any lock protocol needs a liveness check (an owner heartbeat or a pid) — an owner name alone cannot distinguish a working holder from a dead one.**
4. **A held lock does not imply a committed result.** The protocol as written said "acquire before your first write, release before you end your turn" — with no requirement that a commit happen in between. An agent legitimately followed it and left five modified/new Swift files loose in the shared tree. **Tightened mid-wave to: acquire before the first edit, hold through gates AND commit, release only after committing.**

**Recommended for Wave 5: a ticket lock** — each agent writes a numbered file into a queue directory and waits its turn. It fixes bypass (there is no single file to overwrite) and starvation (order is FIFO, not race-determined) together. Proposed by the Tasks 11/12 agent; not adopted mid-wave because the changeover is itself a race with four agents already queued against the old mutex.

**Also: `capture-gate.sh all` now exceeds the 600s Bash tool cap.** One agent lost a full lock-holding cycle to a `SIGTERM` at 600s with the testing phase finished at 592s and the summary unprinted. Run it with `run_in_background: true` and read the log, or split `build` and `test` into separate calls. Worth fixing in the script or the plan.

## ⚠ A gate hole this wave found the hard way, twice

**The plan's per-task gates run only the task's OWN new test files.** Task 13's gate list (plan `:5136-5157`) is the two new suites plus `type-check` and `lint` — never the pre-existing suite for the file it modifies. So `9b9c134bf` shipped with green gates while breaking `work-block.test.tsx` **12/12**: `WorkBlock` gained its first-ever `useQuery` calls, and that suite's harness renders it with no `QueryClientProvider` (correct until this wave — the file's own D-B49 comment records that the block deliberately took all data as props). `enabled: false` does not save it; `useQuery` throws at call time regardless.

The same shape produced the Task 5 blocker: the only real risk (a PostgREST select string) had no coverage because every test mocked the client.

**Rule for the rest of this wave and for Wave 5: a task that modifies an existing component runs that component's existing suite, not just its own new one.** Applied to every task brief from Task 13's fix onward.

**⚠ The `migration-search-path` pre-commit hook has a false positive.** It regex-matches the literal string `SECURITY DEFINER` anywhere in changed file **content, including comments**, and hard-blocks the commit. It fired on `00544`'s header prose, which was *describing an RPC replacement FC-R7 removed* — not defining a function. The line was reworded to get past it. **Owed to Kody: the hook should ignore comment text, or match a `CREATE FUNCTION … SECURITY DEFINER` shape rather than the bare phrase.**

**⚠ The named lint gate does not resolve, and this is a repo-wide finding, not a wave-4 one.** `pnpm lint --filter designer-portal` — the form written in the wave-4 plan's Global Constraints **and in `CLAUDE.md`/`AGENTS.md`'s "Portal gates"** — exits 1 with `No package found with name 'designer-portal' in workspace`. The package is `@patina/designer-portal`, and turbo never runs ESLint for it in any case. Run literally, the house lint gate reports a failure that is not a lint failure and can never report a pass that is a lint pass. The working form is `pnpm --filter ./apps/designer-portal lint` (baseline: **2 errors**, 201 warnings). **Owed to Kody: correct the gate command in `CLAUDE.md`/`AGENTS.md`.**

**⚠ Gate note for Task 18:** `pnpm build --filter @patina/designer-portal` fails under the sandbox with `getaddrinfo ENOTFOUND fonts.googleapis.com`. It is in Task 18's mandated gate list, so it must be run with the sandbox disabled — a sandbox artefact, not a code defect.

**Known-baseline lint failures** (present on `main`, NOT introduced by this wave, do not fix here): `apps/designer-portal/src/.../piece-room-save-gate.test.tsx:159` ("Definition for rule 'import/first' was not found") and `use-commercial-documents.test.ts:930` (a `react-hooks/rules-of-hooks` violation). Under independent verification by the portal reviewer.

## Migration numbers drawn

`00543` margin · `00544` punch back-reference · `00545` time-entry. Census at landing: filesystem head `00542`; `git log --all -- 'supabase/migrations/0054*.sql'` showed only `00540/00541/00542`; local applied ledger head `00542`. `docs/engineering/migration-number-reservations.md` repaired in `82eddc7f2` — the `00530–00535` row is now marked CLOSED/EXHAUSTED (with `00533–00535` credited to the lanes that actually drew them), and a `00543–00545` band plus one row per file was added.

## Environment facts (recorded 2026-08-31)

- Local Supabase is up on `127.0.0.1:54322`; `schema_migrations` max = `00542`.
- `field_captures` carries `capture_kind`, `voice_audio_segments`, `transcript_source`, `note_setting`, `visit_id`, `visit_kind`, `visit_kit`, `visit_label`, `visit_started_at`, `visit_ended_at`, `suggested_project_id`, `suggested_project_room_id`, `suggestion_basis`, `suggestion_confidence` — W1 (`00530`) and W3 (`00532`) columns are present locally.
- Bash runs sandboxed: the Docker socket is denied and `**/.env*` is unreadable/unwritable. Any command needing Docker (`pnpm supabase:reset`, `supabase start`) must run with the sandbox disabled.
