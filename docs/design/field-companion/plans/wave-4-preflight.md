# Field Companion · Wave 4 pre-flight re-verification

**Run:** 2026-08-31, in worktree `.claude/worktrees/field-companion-w4` (branch `feat/field-companion-w4`,
base `97f728f15`). Every command below was actually executed against this checkout, the local Supabase
instance at `127.0.0.1:54322`, and (where noted) Strata over the network. Nothing here is copied from the
plan's predictions — the plan's own predictions are quoted only where they turned out to be stale.

**Conductor overrides in force for this run** (stated in the task brief, not derived here):
W4-C1 (migration band exhausted, 00543–00545 draw at landing), W4-C2 (Task 0.1's Strata gate relaxed to an
owed item), W4-C3 (record dependencies of the three authored SQL files on 00533–00542, flag loudly if any).

---

## 0.1 — Census the migration band and the three columns wave 4 reads

**Filesystem tail:**
```
$ ls supabase/migrations/*.sql | tail -8
00535_saved_items_price_snapshot.sql
00536_client_side_server_gaps.sql
00537_house_on_today.sql
00538_client_account_anonymize.sql
00539_saved_item_note_and_presence.sql
00540_direct_orders_attribution.sql
00541_close_extension_releases_bucket.sql
00542_product_images_owner_folder_insert.sql
```
`main` head is **`00542`**, not `00535`. The plan's "expected after waves 1-3" band table is stale.

**`git ls-tree main supabase/migrations/` for `0053[0-9]`:**
```
00530_field_capture_notes_and_routing.sql
00531_restore_extension_execute_authenticated.sql
00532_field_capture_visit_and_suggestion.sql
00533_piece_detail_contract.sql
00534_client_attention_notifications.sql
00535_saved_items_price_snapshot.sql
00536_client_side_server_gaps.sql
00537_house_on_today.sql
00538_client_account_anonymize.sql
00539_saved_item_note_and_presence.sql
```
Confirms **W4-C1 verbatim**: `00530` (W1 routing) and `00532` (W3 visit/suggestion) are Field Companion's;
`00531` is the unrelated `uuid_generate_v5` grant hotfix; `00533`, `00534`, `00535` were drawn by other
lanes — `piece_detail_contract`, `client_attention_notifications`, `saved_items_price_snapshot` — exactly as
the override states. **The 00530–00535 band is not available to Wave 4 at landing; the reservations doc's
row needs repair, which is Task 1's job, not this one's.**

**`git worktree list`:** confirms this worktree at `97f728f15` on `feat/field-companion-w4`, plus 13 other
active worktrees (none contending for the `0053*` band on inspection of their listed heads).

**`migration-number-reservations.md` grep for `0053`:** the doc **already** reflects the true state —
`00530` MINTED, `00531` DRAWN (hotfix), `00532` DRAWN (wave 3), `00533–00535` "remain a symbolic reservation
until Kody approves the rest of the build." This is **more current than the plan text**, which claims (line
270) the doc "still records the wave-1 migration as NOT YET DRAWN" — that claim is now false; the doc was
updated after the plan was written. ⚠ The doc's own row is still wrong in a different way: 00533–00535 are
described as "symbolic reservation" for Field Companion, but the filesystem shows those three numbers were
actually consumed by other lanes. **This is the repair Task 1 owes**, per W4-C1.

**Local applied migrations ≥ 00520** (`psql` against `127.0.0.1:54322`):
```
00521 svc_media_shape_reconciliation
00530 field_capture_notes_and_routing
00531 restore_extension_execute_authenticated
00532 field_capture_visit_and_suggestion
00533 piece_detail_contract
00534 client_attention_notifications
00535 saved_items_price_snapshot
00536 client_side_server_gaps
00537 house_on_today
00538 client_account_anonymize
00539 saved_item_note_and_presence
00540 direct_orders_attribution
00541 close_extension_releases_bucket
00542 product_images_owner_folder_insert
```
`00530` and `00532` are applied locally. **W4-C2's real gate is satisfied: both are on `main` AND applied to
the local database.**

**Strata (prod) state** — `supabase migration list --project-ref bkvcixdmuyejfzcijpdg` (network call
succeeded; required `dangerouslyDisableSandbox` once for the sandbox's telemetry-file write, not for the
network hop itself). Trimmed to the relevant tail (`local`/`remote` pairs; an empty `remote` means NOT
applied to Strata):
```
00516 → 00516  (applied)
00521 → 00521  (applied)
00530 → 00530  (applied)
00531 → 00531  (applied)
00532 → 00532  (applied)
00533 → ""     (NOT applied)
00534 → ""     (NOT applied)
00535 → ""     (NOT applied)
00536 → ""     (NOT applied)
00537 → ""     (NOT applied)
00538 → ""     (NOT applied)
00539 → ""     (NOT applied)
00540 → ""     (NOT applied)
00541 → 00541  (applied)
00542 → 00542  (applied)
```
**Owed item (W4-C2, not a blocker):** contrary to the plan's belief that `00530` is "not yet applied to
prod," **`00530`, `00531` and `00532` ARE applied to Strata today.** `00533–00540` are on `main` but not on
Strata; `00541–00542` are back to applied. This is measured fact, recorded as owed context for whoever next
runs `supabase db push` — it is not this task's job to explain the gap in 00533–00540, only to record it.

**`field_captures` columns** (`\d field_captures`, local):
```
capture_kind              text                      not null default 'specimen'
voice_audio_segments      jsonb                     not null default '[]'
transcript_source         text
visit_id                  uuid
visit_kind                text
visit_kit                 text
visit_label               text
visit_started_at          timestamptz
visit_ended_at            timestamptz
idx_field_captures_visit  btree (project_id, visit_id, created_at DESC) WHERE project_id IS NOT NULL
trg_field_captures_visit_projection  BEFORE INSERT OR UPDATE … field_captures_project_visit_columns()
```
All nine columns present. **`voice_audio_segments` and `visit_id` are both present — the plan's stop
condition does not trigger.**

**`margin_items` view grep** (lowercase, unqualified — the plan's own correction that a qualified grep finds
nothing):
```
00194_margin_items_view.sql:24
00197_margin_items_note_branch.sql:26
00200_document_state_send_and_money.sql:307
00202_section_work_and_gates.sql:393
00206_margin_own_voice_and_milestone_cron.sql:24
00219_coordination_read_models.sql:92
00282_sms_core.sql:606
```
Latest definition is `00282_sms_core.sql:606`, matching Global Constraints' citation exactly.

**Verdict: confirmed as planned**, with two corrections to the plan's own stale text: (1) Strata already
carries `00530–00532` (W4-C2's owed item is smaller than the plan assumed — record it, don't stop); (2) the
reservations doc has already been partially updated since the plan was written, but its 00530–00535 row
still misdescribes 00533–00535 as symbolically reserved when they were actually drawn by other lanes
(W4-C1's repair, owed to Task 1).

---

## 0.2 — Confirm the Wave 1P hook's exact signature

```ts
export function useCaptureMediaUrls(
  paths: readonly (string | null | undefined)[] | null | undefined,
  ttlSeconds: number = CAPTURE_MEDIA_TTL_SECONDS,
): UseQueryResult<Record<string, string>>
```
File: `packages/supabase/src/hooks/use-capture-media.ts`. `CAPTURE_MEDIA_BUCKET = 'capture-media'`,
`CAPTURE_MEDIA_TTL_SECONDS = 3600`. Returns a `path → signedUrl` map; an unsignable path is absent from the
map, never present-and-broken. Exported at `packages/supabase/src/hooks/index.ts:1859`
(`useCaptureMediaUrls,`), which is re-exported by the package barrel, so
`import { useCaptureMediaUrls } from '@patina/supabase'` resolves.

**Verdict: confirmed as planned** — the signature matches the plan's "expected" block exactly, including
the wider-than-package-doc shape. Tasks 3, 6, 13 read it as `data?.[path] ?? null`.

---

## 0.3 — Confirm what Wave 1P already mounted

```
$ grep -n 'RoomFilesSection\|VisitsBlock' 'apps/designer-portal/src/app/(document)/doc/[id]/page.tsx'
92:import { RoomFilesSection } from '@/components/room-file/room-files-section';
2829:                  <RoomFilesSection projectId={row.project_id} />
```
**Drifted.** `RoomFilesSection` IS imported and mounted in `page.tsx` — the plan's expectation ("NONE of
them are... imported nowhere") is now false. `VisitsBlock` does not appear anywhere, as expected (Wave 4
builds it).

```
$ grep -rn 'capture_source' apps/designer-portal/src --include='*.tsx' --include='*.ts'
```
**Drifted.** `capture_source` now has real portal readers:
- `apps/designer-portal/src/components/document/rooms/library/library-card.tsx:43,476,478` — a
  `fieldProvenanceLabel()` function reads `capture_source`, `captured_at`, `venue_label` and returns
  `"Field · <venue>, <Mon YYYY>"` / `"Field · <Mon YYYY>"` / `"Field"`, gated on
  `capture_source === 'field_capture'` — **this is ruling 4's Library provenance chip, already built,
  matching the ruling's exact fallback ladder.**
- `apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx:54,136-139` feeds
  `venue_label` from a PostgREST embed keyed off `field_capture_id` (`venueByCapture?.[it.field_capture_id]`)
  — exactly the "one FK hop away via `products_field_capture_id_fkey`" mechanism ruling 4 specifies, not an
  invented `venueLabel` column.
- Two test files (`library-card-provenance.test.tsx`, `library-shelf-provenance.test.tsx`) already cover it.

```
$ grep -n 'photoAssetIds' apps/designer-portal/src/components/portal/procurement/log-inspection-drawer.tsx
151:      const photoAssetIds: string[] = [];
```
**Confirmed as planned.** Still exactly `const photoAssetIds: string[] = [];` — untouched.

**Verdict: drifted to a more-built state on 2 of 3 sub-checks.** The Library provenance chip (Task 17,
ruling 4's spec) **has already shipped**, apparently as part of Wave 1P's `capture-context-section.tsx` work
or an adjacent unlogged commit — it is not credited to any Field Companion wave doc found in this
worktree. **Per the plan's own instruction at line 298: Task 17 is skipped entirely.** This is not a
blocker for Tasks 1/3/5/15, so it does not appear on the Blocking list, but it is load-bearing for whoever
scopes Task 17 and is flagged here loudly so it is not re-built.

---

## 0.4 — Confirm the wave-1/2/3 Swift names this plan leans on

```
$ grep -n 'case visit\|case c6Voice\|case v4VisitReview\|case v0Visit' \
    CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift CaptureKit/CaptureKit/Support/CaptureScreenID.swift
CaptureNavigation.swift:62:    case visit                              // V0 — the door (wave 3 builds it)
CaptureScreenID.swift:82:    case v0Visit              = "screen.V0.visit"
CaptureScreenID.swift:83:    case c6Voice              = "screen.C6.voice"
CaptureScreenID.swift:84:    case v4VisitReview        = "screen.V4.visit-review"
```
`case visit` (line 62) is a case of **`CaptureSheet`**, not `CaptureRoute` — `CaptureSheet.visit` is the real
spelling (confirmed by reading `CaptureNavigation.swift:46-62`, the `public enum CaptureSheet` block).

```
$ grep -n 'kind\|kit\|label\|endedAt\|projectsInMind' CaptureKit/CaptureKit/Session/CaptureSessionContext.swift
```
`CaptureSessionContext` carries `public var kind: FieldVisitKind?`, `kit: FieldVisitKit?`,
`label: String?`, `projectsInMind: [String]`, `endedAt: Date?` — all five present as the plan expects.
`isVisit: Bool { kind != nil && endedAt == nil }` also present.

```
$ grep -n 'captureKind\|audioSegments' CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift
42:    public var captureKind: String?
95:        public var audioSegments: [String]?
```
`captureKind` is a top-level field; `audioSegments` is nested inside a `Voice` sub-struct — real spelling is
`FieldCapturePayload.Voice.audioSegments`, not a flat `voice.audioSegments` string but the same shape the
plan's dotted notation implies.

```
$ grep -n 'placementProjectId\|needsProjectPlacement' \
    CaptureKit/CaptureKit/Domain/Specimen.swift CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift
Specimen.swift:138:    public var placementProjectId: String?
Specimen+Accessors.swift:201:    var needsProjectPlacement: Bool {
```
Both present as named.

```
$ grep -n 'visitReview' CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift
(no output)
```
**`CaptureRoute.visitReview` is confirmed ABSENT.** `CaptureNavigation.swift:1-6` marks the file "FROZEN
navigation surface... one case per screen across the 8 flows... Changing a case is a foundation-owner-only
edit" — matching the plan's note that Task 15 adds it under that constraint.

**Verdict: confirmed as planned**, with one precision correction: `case visit` belongs to `CaptureSheet`
(not `CaptureRoute`), and `audioSegments` is nested under `FieldCapturePayload.Voice`, not a bare top-level
property. Every later Swift task should use `CaptureSheet.visit` and
`FieldCapturePayload.Voice.audioSegments` verbatim.

---

## 0.5 — Re-read the two portal seams this wave edits

**`margin-bodies.tsx:814-900`** — `NoteBody` renders `row.payload.author_name` (when present), two
escalation actions (`→ Client decision`, `→ Amendment` via `DocumentAction`/`AmendmentSheet`), an
`escalated` early-return state, and **no note body anywhere in the JSX**. Matches the plan's expectation
exactly.

**`margin-derivation.ts:11-33`** — `MarginItemRow` is a flat interface: `kind: MarginKind`, `item_id`,
`project_id`, `proposal_id`, `anchor_kind: MarginAnchorKind`, `anchor_id`, `state`, `title`, `detail`, `ts`,
`payload: Record<string, unknown>`. Matches exactly. `MarginKind` union is
`'decision' | 'message' | 'invoice' | 'pulse' | 'time' | 'note' | 'field_sms'` — no `field_capture`/`punch`
kind added yet, confirming Task 1's view-only change is still pending.

**`use-section-work.ts:83-132`** — `useSectionTasks(projectId)` already selects
`id, project_id, section_key, title, status, due_date, starts_on, completed_at, estimate_minutes,
sort_order, owner, owner_party_id, blocked_by_item_id, seq_after_task_id` — `owner, owner_party_id` present
as expected.

**Verdict: confirmed as planned.** No drift in either file; Tasks 2, 4, 13 can edit these exact ranges as
written.

---

## 0.6 — This document

Written and committed per Task 0.6's instruction (see the commit at the end of this run).

---

## 0.7 — FC-R21 known gap (N-2)

Read `docs/design/field-companion/plans/wave-3-fix-rereview.md` (finding N-2, lines 272, 316-335, 344) and
`docs/design/field-companion/field-companion-rulings.md:840-842` (FC-R21's own recorded gap, scheduled
"Wave 4 Task 0"). Then read the actual code.

**`CaptureSessionContextPolicy.resolve`** — `apps/mobile/Capture/CaptureKit/CaptureKit/Session/CaptureSessionContext.swift:140-176`:
```swift
public static func resolve(
    existing: CaptureSessionContext?,
    identity: CaptureSessionIdentity,
    now: Date,
    calendar: Calendar = .current
) -> CaptureSessionContext {
    guard let existing,
          existing.identity == identity,
          existing.endedAt == nil,
          now.timeIntervalSince(existing.lastActivityAt) < inactivityWindow,   // :149, 4h
          now >= existing.lastActivityAt else {
        return CaptureSessionContext(identity: identity, startedAt: now, lastActivityAt: now)  // :151-156
    }
    if existing.kind != nil,
       visitState(for: existing, now: now, calendar: calendar) == .none {     // :164-172, the visit-aware branch
        return CaptureSessionContext(identity: identity, startedAt: now, lastActivityAt: now, routing: existing.routing)
    }
    var resumed = existing
    resumed.lastActivityAt = now
    return resumed
}
```
**The gap still exists, byte-for-byte as the review found it.** The guard at `:146-150` fires on elapsed
time alone (`< inactivityWindow`, 4 hours) and returns a **fresh, kindless context** the moment it fails —
*before* the visit-aware branch at `:164-172` ever runs. For a visit idle 4-12 hours on the same calendar
day (still "live" by `CaptureVisitPolicy`'s own 12-hour/same-day rules), `resolve` destroys it silently: no
`endVisit`, no `reapExpiredVisit`, no `visit.end` notice — `visitID`, `kind`, `kit`, `label` and routing are
all dropped in one return, and `expiry()` can never name a reason because the visit was live at the moment
`resolve` killed it.

**Reachable instance, confirmed still wired:**
`apps/mobile/Capture/Capture/Features/Work/WorkDashboardScreen.swift:50` —
`CaptureSessionContextStore.shared.remember(…)` inside the `onResume:` closure of the W1 stale-prompt
("Still at Maple St?" → Resume) still calls `remember`, which calls `current()`, which calls `resolve`. A
visit started 08:00, last capture 09:00, phone picked back up at 14:00 (5h idle, well under the 12h rule):
the prompt reads correctly as "Still at Maple St?" but **tapping Resume silently ends the visit** with no
`visit.end` event.

**Fix sizing — which of the two named fixes is smaller against the code as it stands:**
`reapExpiredVisit(identity:now:calendar:)` (`CaptureSessionContext.swift:319-334`) already exists and does
exactly the right thing for a genuinely expired visit: it resolves `CaptureSessionContextPolicy.expiry`,
stamps `endedAt`, persists, and posts `visitDidChange` — all inside `CaptureSessionContextStore`, no
persisted-format change. **Reaping inside `current()` is the smaller fix**: before calling
`CaptureSessionContextPolicy.resolve`, `current()` would call `expiry(for: existing, now:, calendar:)` and,
if non-nil, persist the `ended()` context and post the notification — same call already used by
`reapExpiredVisit` — before handing the (now `endedAt`-stamped) `existing` into `resolve`. `resolve`'s own
guard at `:148` (`existing.endedAt == nil`) then does the right thing automatically: it fails, and a fresh
context is minted, exactly as today, but now with a proper `visit.end` fired first. **No new persisted
field, no Codable/decoder changes** (the file's own comments at `:100-113` show how expensive tolerant
decoding is for this type — a persisted pending-end slot would need the same treatment). The
"persisted pending-end slot" alternative would add a new `CaptureSessionContext` property, which is
persisted via a hand-written `Decodable` initializer specifically because every new non-Optional field needs
an absent-tolerant `decodeIfPresent` arm (documented at `:100-113`) — strictly more surface than reusing the
reap call that already exists.

**Verdict: confirmed — gap still exists, not scheduled as a fix in this wave (matches the wave-3 review's
"named rather than fixed" disposition for Wave 4).** Recorded forward again per the task's "either schedule
the fix... or record it forward again" instruction; the sizing above (reap-inside-`current()`, smaller than
a persisted slot) is left for whoever schedules it. Not on the Blocking list — it does not stop Tasks 1, 3,
5 or 15.

---

## 0.8 — R27: offline project CREATE at the door

**File:** `apps/mobile/Capture/Capture/Features/Route/S2CreateProjectScreen.swift` — the S2 "create a
project" screen reached from the door/S1 flow (`CaptureSheet.createProject`, registered in
`RouteSessionScreens.swift:52-56` with `projectCreator: container.projectCreator`).

**Real-mode wiring is present, not absent:** `AppContainer.swift:132` sets
`self.projectCreator = SupabaseProjectCreator(client: client, session: session)` when
`AppConfiguration.runsRealServices` is true (`:94`), and `:153` sets it to `nil` in mock mode. So real mode
does call through to `SupabaseProjectCreator.createProject(name:)`
(`apps/mobile/Capture/Capture/Services/Projects/SupabaseProjectCreator.swift:43-69`), which inserts a row
into `public.projects` via PostgREST and returns the server id — this part of R27 is already built and is
not the gap.

**The exact catch that drops the create — `S2CreateProjectScreen.swift:131-134`:**
```swift
            } catch {
                guard session.ownerIdentity == owner else { return }
                createError = "Couldn't create it just now — check your connection and try again."
            }
```
On any throw from `projectCreator.createProject(name:)` — the offline case chief among them — this catch
sets a UI-only error string and returns. **Nothing is persisted**: no local `CaptureProjectRef` is inserted
(`store.context.insert(project)` only happens in the success path, `persistAndAdvance` at `:141-176`), no
outbox row is written, and no retry is scheduled. Unlike every other write this wave and the prior waves add
(the margin-note and punch-task lanes described in this plan, and `ProjectPlacementOrchestrator` for
specimen placement), **project creation has no offline/outbox lane at all** — it is a synchronous
network-or-nothing call, and a designer who tries to create a project at a job site with no signal gets an
error toast and has to retry once she has signal, re-typing nothing (the form state survives, at least,
since the sheet stays open) but with no queued attempt working in the background.

**What the real-mode path would need to not drop the create:**
1. A locally-persisted "pending" `CaptureProjectRef` (or a new pending-project record) written on the catch
   path, with `remoteId: nil` and a flag distinguishing "pending create" from the existing "local-only mock"
   shape (today's `CaptureProjectRef(remoteId: nil, ...)` already means "mock mode," so pending-real needs
   its own marker to avoid being confused with a mock row on inspection).
2. An outbox lane (mirroring `MarginNoteWrite`/`PunchTaskWrite`'s shape from this same wave, or
   `ProjectPlacementOrchestrator`) that retries `SupabaseProjectCreator.createProject(name:)` on the next
   drain and, on success, back-fills the local ref's `remoteId` and reconciles it into
   `CaptureRoutingMemory.projectID` if that routing memory still points at the local placeholder id.
3. Reconciliation for any specimen already routed against the local placeholder project id between the
   failed create and the eventual successful drain (`persistAndAdvance` stamps
   `projectID: remoteId ?? project.id.uuidString` today, i.e. it already tolerates a local-only id in the
   success path — the gap is that a *failed* create never reaches that stamp at all).

**Sizing: M.** Not S — it needs a new persisted pending state, a new outbox lane with its own drain call
site (same shape as this wave's two new lanes, so the pattern exists to copy), and a reconciliation step for
any specimen minted against the pending project before the real id exists. Not L — it does not need a new
service, a new table, or new RLS; it reuses `SupabaseProjectCreator` verbatim and rides the same
`CaptureStore` outbox schema list the two new W4 lanes already extend. A reasonable single task in a future
wave, sized similarly to this wave's `MarginNoteWrite`/`PunchTaskWrite` tasks.

**Verdict: confirmed — the gap is real and present at `S2CreateProjectScreen.swift:131-134`.** Not fixed
here per instruction. Not on the Blocking list — it does not stop Tasks 1, 3, 5 or 15 (S2 is untouched by
this wave's task list).

---

## 0.9 — N-2 cross-reference

Folded into §0.7 above per the task's numbering (FC-R21/N-2 is one finding, cited from both the rulings doc
and the wave-3 fix re-review). No additional file:line beyond what §0.7 already records. Repeating the
verdict here for the doc's own numbering: **confirmed — gap still exists, recorded forward, not scheduled
as a fix in Wave 4.**

---

## 0.10 — `SmartGuessKeywords.category(forVisionLabel:)` ordered-substring bug

**File:** `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/SmartGuessKeywords.swift`.

**The exact function (lines 32-38):**
```swift
public static func category(forVisionLabel label: String) -> SpecimenCategory? {
    let id = label.lowercased()
    for entry in table where id.contains(entry.keyword) {
        return entry.category
    }
    return nil
}
```

**The exact mechanism producing the mis-map:** `table` (lines 13-28) is one flat, ORDER-SIGNIFICANT array of
`(keyword, category)` tuples. The loop (`for entry in table where id.contains(entry.keyword)`) returns the
**first table entry, in declaration order, whose `keyword` is a plain substring of the lowercased label** —
`String.contains`, not a word-boundary or whole-word test. A keyword that happens to be a substring of an
unrelated compound word or a longer word wins if no earlier-declared keyword also matches.

**Three concrete mis-mappings, confirmed against the real table (lines 14-27) by tracing the loop:**
1. **`"tap"` → `.plumbing` (line 25: `("tap", .plumbing)`).** Vision label `"tapestry"` (a textile):
   `"tapestry".contains("tap")` is true, and no earlier table entry (lines 14-24: seating, table/desk/
   nightstand, lighting, storage, rug/carpet, curtain/fabric/textile/pillow/cushion/drapery) matches
   `"tapestry"` as a substring first, so the loop falls through to `"tap"` at line 25 and returns
   `.plumbing` for what should be `.textile`.
2. **`"light"` → `.lighting` (line 17: `("light", .lighting)`).** Vision label `"skylight"` (an
   architectural opening, not a purchasable fixture): `"skylight".contains("light")` is true and no earlier
   entry matches, so it lands on `.lighting` — a lamp/chandelier/sconce category applied to a roof feature.
3. **`"print"` → `.art` (line 24: `("print", .art)`).** Vision label `"printer"` (office equipment):
   `"printer".contains("print")` is true and no earlier entry matches, so it lands on `.art` instead of
   `.hardware`/unmatched.

**Which fix is right given how the tables are structured:** **word-boundary matching**, not longest-match.
The table is a flat list of single-word keywords with no length ordering and no competing longer keyword for
any of the three cases above (`"textile"` never appears as a substring of `"tapestry"`; nothing in the table
is a longer match for `"skylight"` or `"printer"` than the accidental short one). Longest-match would leave
all three mis-mappings exactly as they are today, because there is no second, longer candidate match to
prefer — the failure is that a short keyword matches *inside* an unrelated word, not that a shorter keyword
won over a longer one. Splitting `label` on word boundaries (or using a regex with `\b` anchors, or
tokenizing on non-alphanumeric characters and comparing whole tokens) before the substring test would fix
all three without reordering the table.

**Verdict: confirmed — bug is real, reproduced by tracing the actual table against the three labels.** Not
fixed here per instruction. Not on the Blocking list — `SmartGuessKeywords` is untouched by this wave's task
list (Tasks 1, 3, 5, 15 do not read it).

---

## Blocking list

**Nothing blocks Tasks 1, 3, 5 or 15.**

- `voice_audio_segments`, `transcript_source`, and all six `visit_*` columns Task 1 and Task 5 read are
  present locally (§0.1). `00530` and `00532` are on `main` and applied locally, satisfying the relaxed
  W4-C2 gate.
- `useCaptureMediaUrls` (Task 3) exists with the exact signature the plan predicted (§0.2).
- `CaptureRoute.visitReview` (Task 15) is confirmed absent and the enum is still marked foundation-owner-only
  (§0.4), so Task 15's addition is a clean edit to a known-frozen file, not a conflict.
- None of the three W4-authored SQL files under `docs/design/field-companion/plans/sql/` read or alter any
  object created by `00533–00542` (checked file-by-file in §0.1's dependency pass: the margin migration
  touches `margin_notes`, `field_captures`, `client_decisions`, `comms_threads/messages`, `invoices`,
  `weekly_pulses`, `project_time_entries`, `po_payments`, `purchase_orders`, `vendors`, `sms_messages`,
  `project_parties`, `profiles`, `organizations`; the punch migration touches `project_tasks` and
  `field_captures`; the time-entry migration touches only `project_time_entries` — none of the eight
  `00533–00540` migrations create or alter any of those tables/views, confirmed by grepping each for its
  `ALTER TABLE`/`CREATE TABLE`/`CREATE VIEW` targets). **W4-C3's loud-flag condition does not trigger.**

**Owed, not blocking** (carried forward for the tasks or waves that own them):
- `docs/engineering/migration-number-reservations.md`'s `00530–00535` row misdescribes `00533–00535` as a
  live symbolic reservation for Field Companion; it needs repair when Task 1 draws `00543`. (W4-C1)
- Strata already has `00530–00532` applied (better than the plan believed) but `00533–00540` are not; that
  gap is not this wave's to close. (W4-C2)
- Task 17 (Library provenance chip) has already shipped under `library-card.tsx`/`library-shelf.tsx` and
  should be skipped per the plan's own contingency (§0.3).
- FC-R21's N-2 gap in `CaptureSessionContextPolicy.resolve` is real and unfixed; smaller fix is reaping
  inside `current()` (§0.7/0.9).
- R27's offline project-create gap at `S2CreateProjectScreen.swift:131-134` is real and unfixed; sized M
  (§0.8).
- `SmartGuessKeywords.category(forVisionLabel:)`'s ordered-substring bug is real and unfixed; word-boundary
  matching is the right fix (§0.10).
