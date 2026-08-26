# Field Companion · Open rulings for Kody

Issued 2026-08-24 · Companion to `field-companion-package.md` (the spec) and
`field-companion-plan.md` (the build order).

**Nothing has been appended to `docs/design/the-document/DECISIONS.md`.** Kody rules first; the
append-ready block is drafted after these rulings, resolving `R{next}` from
`scripts/workstream_state.py` and appending via `scripts/append_entry.py` (never by hand), with the
integrity footer re-checked afterward.

**Wave 1 needs FC-R18, FC-R17, FC-R11 and FC-R19** (and FC-R14 if the build must reach Leah, not just
Kody). Everything else can be ruled while wave 1 is in flight. The rulings are grouped by the wave
they block.

⚠ **FC-R18 sequences ahead of everything, including FC-R8.** Two live lanes landed on `main` in the
hour before this package was issued, and one of them is doing the *same*
`CREATE OR REPLACE commit_field_capture` that wave 1's migration does. Until FC-R18 is ruled, wave 1's
migration cannot be authored — see package §9.0.

Each ruling: the question · the options · the recommended default · what it blocks · what it costs
to be wrong.

---

## Ratified by Kody — 2026-08-24

Kody ratified every ruling on 2026-08-24 (multiple-choice session with the orchestrator). Recommended defaults were taken unless noted.

| Ruling | Decision |
|---|---|
| FC-R18 | **Share the ledger.** W1's `commit_field_capture` replacement is authored from the MERGED, post-fix `00516` body (branch `feat/capture-producer-idempotency`, PR #30 — signature unchanged: `(uuid, text, jsonb, uuid, uuid, text, uuid)`) and lands AFTER 00516 merges to main; any enrichment enqueue calls `enqueue_capture_enrichment_for_producer(text, uuid, integer, text, text, jsonb)`, never the primitive. **The migration is HELD until the Phase 3 lane confirms the merge SHA.** |
| FC-R11 | **Kit-defaulted consent** (`solo`/`conversation`), affirmation chip on a conversation note, unmissable recording chrome, never ambient — plus a lawyer's read before any non-Kody designer records a client (Kody's external item; not an engineering gate for Kody's own device use). |
| FC-R14 | **TestFlight alongside Wave 1** (Wave 0.5 stands up archive + TestFlight). |
| FC-R8 | **Per-designer in v1.** |
| FC-R1 | **Today is home**, with the launch table (§5.3). |
| FC-R2 | **Two kinds (Site visit · Sourcing) + three kits (Walk-through · Trade walk · Install)**; no visit = null kind. |
| FC-R5 | **Merge `project_rooms` + `public.rooms` by trimmed name** in the picker; stamp only the legal lane; never cross-assign. |
| FC-R6 | **An unplaced note waits on Today** as a `field_captures` row with a suggestion; nothing is ever lost. |
| FC-R4 | **Direct device writes** to `margin_notes` and `create_client_decision`-style RPCs through the existing outbox. |
| FC-R7 | **A Field punch item is a `project_tasks` row owned by the GC riding the party-anchored SMS rail** — never a `client_decisions` row. (Flow 5, M4, §16, plan 4-8 must be rewritten to this landing.) |
| FC-R10 | **Unflagged portal changes**; "renders nothing on a field-less project" is a browser-verified acceptance criterion; turn the existing `room-file` flag on for the pilot cohort. |
| FC-R15 | **Punch photo back-references the `field_captures` row**; portal signs `capture-media` via `useCaptureMediaUrls`. Project-general media table stays owed. |
| FC-R9 | **No background audio in v1** (foreground-only, honest "recording paused" on lock). |
| FC-R17 | **Band 00530–00535, symbolic**, pre-agreed with both live lanes; repair the reservations doc (record svc-media 00521 + Phase 3's 00516) first; numbers drawn at landing. |
| FC-R3 | Naming adopted: *Today* · *a visit* · *Visits* · *unplaced*. |
| FC-R19 | Phone deletes a segment once its commit receipt lands; delete on Discard; size-capped sweep. |
| FC-R12 | Nothing auto-applies at any confidence. |
| FC-R13 | Audio retention column ships `'keep'` until a purge exists. |
| FC-R16 | A spoken measurement never becomes a measured record. |

**Standing facts ruled the same day:**
- **Patina Field is not live anywhere → no backward compatibility is owed inside the app.** Legacy-decode paths, schema-version compat shims, "old builds keep committing" constraints and `capture.session-context.v1` migration tests are NOT required; a fresh install may reset the local store. The database is live prod, so **migrations stay additive and idempotent and RPC signatures unchanged**.
- **Execution scope:** build straight through Wave 4 (Waves 0.5, 1, 1P, 2, 3, 4), one device pass at the end of each wave.
- **Prod pushes authorized per wave after gates** (`supabase db push` + `infra/deploy-portal.sh`), executed by the orchestrator only — never by lane agents; never MCP `apply_migration`/`merge_branch`; staging only via file-based push.
- **Branching:** worktree + wave branches (`feat/field-companion-<wave>`) under `.claude/worktrees/`, pathspec-only commits, fast-forward merge to main at each wave gate.

---

## Blocks Wave 1

### FC-R18 · Does Field Companion **own** `field_captures` enrichment, share it with Phase 3, or defer to it?

**Question — and it sequences ahead of every other ruling here.** Phase 3 "capture enrichment" is a
live, in-flight lane pointed at the same table this program extends:
- `00514_capture_enrichment_ledger.sql:41-43` — `target_type text NOT NULL CHECK (target_type IN
  ('proposal_capture', 'field_capture'))`. An execution ledger, an atomic claim, a transactional
  outbox, and a Cloudflare-Queue message contract (`packages/types/src/capture-enrichment.ts`).
- `00515_capture_enrichment_rpcs.sql:250, :287` — `record_capture_enrichment_result` writes model
  output **straight into** `field_captures.category / subcategory / finish / vendor_name / sku`,
  service-role only, **no review step**, guarded only by `WHERE %1$I IS NULL OR %1$I = ''`.
- `00516_capture_producer_idempotency.sql` (branch `feat/capture-producer-idempotency`, committed in a
  sibling worktree) does `CREATE OR REPLACE FUNCTION commit_field_capture` **"from its 00235 body
  verbatim"** plus one added `enqueue_capture_enrichment(...)` call, and widens that function's
  EXECUTE to `authenticated` because `commit_field_capture` is `SECURITY INVOKER`.

**Two things follow immediately.** (1) `commit_field_capture` has **two live authors this week**, and
**whichever migration lands second silently reverts the other** — no error, no failed migration:
authoring from 00235 after 00516 deletes the enrichment enqueue; landing 00516 afterward deletes the
inbox-routing fix and the new payload reads. (2) AGENTS.md's standing rule is *"Never a parallel
queue"*, and wave 6 as designed proposes a second dispatch mechanism (`agent_tasks` + two crons + two
edge functions) over rows that already have a ledger, an outbox and a consumer.

**Options.**
- **(a)** **Share.** `commit_field_capture` is a declared shared object with a named owner; the W1
  migration is authored from **00516's** body with 00516 recorded as a hard prerequisite in the
  reservations doc and in the migration header; wave 6A/6B route through `capture_enrichment_runs` —
  one ledger, one queue, one consumer.
- **(b)** **Defer.** The routing fix and the new payload reads fold into 00516 itself, and Field
  Companion's band carries no `commit_field_capture` replacement at all.
- **(c)** **Own a separate voice lane**, and say in package §10 *why* — with the parallel-queue rule
  addressed head-on, not silently.

**Recommended default: (a).** It is the only option that leaves one authority over one function and
one dispatch path over one table. (b) is cheaper and equally safe if 00516's owner will take the
routing fix. (c) needs an argument nobody has made yet.

**Blocks.** **Wave 1's migration** — literally, because it decides whose body the replacement is
authored from — and wave 6's entire shape. **Rule this before FC-R8.**
**Cost of being wrong.** A production regression with no error and no failed migration: either Phase 3
stops enriching field captures, or every note-shaped capture goes back to arriving with no project
column. Both are invisible until someone notices data missing.

**Update 2026-08-24 (Phase 3 lane).** The branch-authored `00516_*` migration's `commit_field_capture`
body is being modified by a fix lane right now: a security re-review of Phase 3 C-A2 found
`GRANT EXECUTE ON enqueue_capture_enrichment TO authenticated` is a cross-tenant over-grant (a
designer could enqueue a high `content_revision` on another designer's capture and get the worker to
cancel the victim's real run as stale). The fix keeps the primitive service_role-only, adds a
`SECURITY DEFINER` wrapper `enqueue_capture_enrichment_for_producer(...)` with an ownership check
(`designer_id = auth.uid()`), and repoints `commit_field_capture` to call that wrapper. The Phase 3
lane endorses (a) with this sequence: (1) their fix lands + re-review passes + C-A2 merges to main —
they will ping with the final `commit_field_capture` body; (2) only then is Field Companion's W1
routing replacement authored from that merged body, layering the inbox `project_id`/`project_room_id`
persistence + voice/segment payload keys on top, and it must land after 00516 (last replace wins). Any
W1-side enrichment enqueue must call `enqueue_capture_enrichment_for_producer(...)`, never the raw
primitive.

**Recommended default (amended): (a)** — share the ledger; author the W1 replacement from the
**merged, post-fix** 00516 body, landing after 00516; enqueue only via the `_for_producer` wrapper.

---

### FC-R19 · What is the **phone's** own retention policy for capture media?

**Question.** FC-R13 rules the server's retention. Nothing rules the phone's, and there is no local
media lifecycle at all today: `grep -rn "removeItem" apps/mobile/Capture --include="*.swift"` finds
deletions only in `SiteScanBundleHome.swift` (scan bundles). `LocalCaptureSyncService.uploadMedia` does
not clear local files after a successful commit; `VoiceNoteSheet.discard()` (`:194-199`) abandons a
recorded segment with no delete. At 240 KB/min a single 30-minute walk-through is ~7 MB, on top of
photos that already accumulate.

**Options.**
- **(a)** Delete a segment once its commit **receipt** lands (the outbox already has receipt-gated
  completion), delete on Discard, plus a size-capped sweep.
- **(b)** Keep everything locally and rely on iOS storage pressure.

**Recommended default: (a)**, in wave 1, alongside the writer that creates the problem.

**Blocks.** Wave 1's recorder and the N4 Discard path.
**Cost of being wrong.** The app quietly becomes the largest thing on her phone, and the first person
to notice is her, in Settings → Storage.

---

### FC-R17 · Which migration band?

**Question.** This package's own headline correction — *"every research doc says mint from 00514 and
is wrong; reserve the six numbers above it"* — **was itself stale**, because the number it started
from had been taken hours earlier:
```
$ ls supabase/migrations/*.sql | tail -3
… 00514_capture_enrichment_ledger.sql  00515_capture_enrichment_rpcs.sql
  00521_svc_media_shape_reconciliation.sql
$ git log -1 --format='%h %ad %s' --date=iso ca2b0641b
ca2b0641b 2026-08-24 15:05:39 -0500 feat(db): author svc_media shape reconciliation (00521) …
$ grep -c '00521' docs/engineering/migration-number-reservations.md
0
```
`00521` is on `main`, pushed to `origin`, and **absent from the reservations doc** — that lane skipped
discipline rule 5. The doc is the repo's declared single source of truth and it is demonstrably
incomplete; the original census checked the doc and `main`'s filesystem but not `git log --all`, which
is the exact check the plan itself prescribes.

**Options.**
- **(a)** **Repair first, then reserve.** Add the missing svc-media `00521` row to the reservations
  doc, re-census across the filesystem **+ `git log --all` + `git worktree list`**, then reserve the
  band below — recording 00516 as taken-on-a-branch at the same time.
- **(b)** Ask Phase 3 to release 00517–00520 and share that band.
- **(c)** Draw ad hoc at landing with no reservation.

**Recommended default: (a).** Repairing the doc is worth more than the reservation, because the next
lane's census will be wrong for the same reason this one was. **And the band is now pre-agreed with
both live lanes**, so (a) is a five-minute doc edit rather than a negotiation.

**The band: `00530–00535`, confirmed 2026-08-24.** The two concurrent lanes — cloudflare-phases
Phase 2/3 and Rendered Room v2 — have both confirmed that `00530–00535` is clear and acceptable as
Field Companion's future band: **Phase 2 stays at or below `00529`, and Phase 3 holds `00514–00520`.**
Three disciplines ride with it:

1. **It is a *symbolic* reservation only.** It is written into
   `docs/engineering/migration-number-reservations.md` as a band row, and **nothing is minted until
   Kody approves the build.**
2. **It is re-confirmed immediately before each push**, against **both** the ledger file **and**
   `supabase migration list` on Strata — the file-based push invariant in
   `docs/ops/strata-staging.md`. An agreement is evidence; the head on the day of the push is
   authority. This week is the proof: a band that was verified free at 14:30 was not free at 15:05.
3. **Where a file name is unavoidable** — a reservations-doc row, a migration header, a `git add`
   pathspec, a commit subject — write **`005NN_<slug>.sql`**, with `NN` **drawn from the reserved
   band `00530–00535` at landing**.

**Also ruled here: numbers live in one place.** The package and the plan refer to migrations
**symbolically** (*the W1 routing migration*, *the visit/suggestion migration*, *the margin
migration*, *the time-entry migration*, *the punch back-reference migration*) and the addresses are
claimed at landing. Twenty hard-coded numbers across a spec, a plan, a PR body and six commit
messages is a merge hazard, not a plan.

The band holds six numbers for six *scheduled* migrations — W1 routing (wave 1), visit/suggestion
(wave 3), margin + time-entry + punch back-reference (wave 4; the third is FC-R15's newly-priced
DDL), and wave 6A's server transcript. **Wave 6B's `field_note_drafts` migration draws its own number
at its own landing, outside the band**, because 6B is unscheduled.

**Blocks.** Every migration in the program.
**Cost of being wrong.** A number collision across branches — which is exactly what the reservations
doc exists to prevent, and exactly what happened this week. This repo also already carries a hole at
00512 (reserved-parked and unapplied on a branch that carries a known live defect, so if it ever lands
it applies out of order).

---

### FC-R14 · Is TestFlight a dependency, or does wave 1 end at Kody's device?

**Question.** There is **no distribution pipeline for Patina Field at all**: no `Fastfile`, no CI
archive step, no `asc-*` skill library scoped to Field, and no confirmed App Store Connect record for
`cloud.patina.field`. Signing is pre-baked (`generate_project.rb` hardcodes
`DEVELOPMENT_TEAM = 'VP22LXHT7L'`, `CODE_SIGN_STYLE = 'Automatic'`), so a device build works out of
any regen — but nothing exists between "builds on Kody's Mac" and "appears on Leah's phone."

**Options.**
- **(a)** Yes — stand up an archive + TestFlight path alongside wave 1 (size **M**).
- **(b)** No — wave 1 ends at Kody's device; TestFlight comes when the wedge is confirmed.

**Recommended default: (a).** Leah Session 05 is unrun, and it is not confirmed she has *ever* held
Patina Field on a real site (M4's device-pilot gate was deferred at R113). **Without distribution the
wedge question cannot be answered and every number in this plan stays unfalsifiable.**

⚠ **Pair (a) with a build-time analytics key or the archive it produces is blind.**
`AppConfiguration.postHogAPIKey` falls back to `ProcessInfo.processInfo.environment["POSTHOG_API_KEY"]`
(`AppConfiguration.swift:130-132`), which on iOS carries only what an Xcode scheme's **Run** action
injects — never a device install, never TestFlight, never CI. `Secrets.swift` is gitignored and a known
worktree trap drops it on a pbxproj regen. So a key set the obvious way makes wave 1's telemetry gate
pass on exactly one Mac, **and fail silently on the very build this ruling exists to produce.** Wave 1
delivers an `.xcconfig` / build-setting → `Info.plist` path (or a CI/archive step writing
`Secrets.swift` from a secret), plus a startup log line and an archive-time assertion.

**Blocks.** Whether wave 1 ends at "Kody's device" or "Leah's device."
**Cost of being wrong.** Choosing (b) means the program's central premise stays untested through four
waves of build.

---

## Blocks Wave 3 (the visit spine)

### FC-R1 · Does Field stop being camera-first?

**Question.** `apps/mobile/Capture/README.md` opens *"Patina Field is a standalone camera-first iOS
app."* The spine makes the **day** the home and the camera the mid-visit landing. Leah's reflex on a
site is phone-out-shoot, and the first launch of the day would now land on a list.

**Options.**
- **(a)** Yes — Today is home, with the launch table (spec §5.3): a visit active within 30 minutes
  still lands straight on the viewfinder.
- **(b)** No — the camera stays home; "Today" becomes a strip reached from the `TODAY` pill, and the
  visit chip is the only new chrome.

**Recommended default: (a), with the launch table.** The camera-first muscle memory survives *inside*
a visit, which is exactly when it is right — **and the concession is smaller than it reads.**
`WorkDashboardScreen` already renders a `cameraRealmButton` in its header — *"Camera"* →
`coordinator.switchRealm(.camera)` — in both the standard and accessibility-size layouts (`:88-101`,
`:119-130`). Even with **no visit open**, the camera is one tap from Today *today*. That is the single
strongest argument for (a), and it was missing from the wireframe.

**Blocks.** Wave 3's shape. **Nothing in waves 1–2.** The plan is deliberately written so a "no"
re-shapes the door without re-planning the wave.
**Cost of being wrong.** A designer who opens the app to shoot and lands on a list will feel it every
single time.

---

### FC-R2 · Two visit kinds and three kits, or something else?

**Question.** Direction A proposed three kinds (site / sourcing / roving); Direction C proposed five
modes. The synthesis proposes **two kinds** — `site` and `sourcing` — with **"roving" modelled as the
absence of a kind**, and Walk-through / Trade walk / Install day as **kits** chosen after the project.

**Options.**
- **(a)** Two kinds + three kits (walk-through · trade walk · install), chosen as a second chip.
- **(b)** Three kinds (add `roving` as a real kind).
- **(c)** Five modes, as Direction C proposed.

**Recommended default: (a).** A null kind removes a third code path from the door, the chip, the card
and the tray; and the kit buys C's best idea — *the mode decides what is one tap away* — without a
five-wide picker in front of every arrival.

⚠ **This overrules the designer judge, and the counter-argument belongs on the table.**
`research/30-judge-designer-workflow.md:437` recommends **three** kinds in C's words — *Site visit ·
Market · Roving* — with walk-through / trade / install as kits, and restates it at `:526` as the
panel's recommendation. The judge's case is that "roving" is the moment Kody's brief names *literally*
(*"whatever a designer needs while on the move"*) and a nameless state is easy to under-serve —
package §4 M6 concedes exactly that, and FC-R6 exists because of it. The case for two is that a null
kind **deletes** a code path rather than adding one. Both are good; the choice is Kody's, not the
synthesis's, and presenting the options as "two / three / five" without naming who recommended three
was an omission.

⚠ **Whichever way it goes, the vocabulary must stop naming one thing twice.** The draft schema had
`visit_kit='site'` duplicating `visit_kind='site'`, and `visit_kit='market'` duplicating
`visit_kind='sourcing'`. Kinds are `site` / `market` (or `site` / `sourcing`); **kits are the three
that are not kinds** — `walk_through`, `trade_walk`, `install`.

⚠ **And the kit chooser ships a wave *after* the verbs it tunes.** In wave 3 a kit changes exactly two
things: the C1 pill layout and the `note_setting` default. The trade-walk kit's whole point — the
shutter makes a punch item — is wave 4; install's live receiving camera is wave 4; the
mode-conditioned extraction framings are wave 6B. **Wave 3 ships only the `solo` / `conversation`
posture** (a consent control, not a convenience — FC-R11); the four-way row lands in wave 4. That also
shortens the door, which is FC-R1's whole expense.

**Blocks.** V0's entire shape, and therefore wave 3's cost. **Settle before the door screen is
designed** — the door is the direction's whole expense.
**Cost of being wrong.** Five modes is five copy surfaces, five extraction framings and five portal
landings for an app that has never emitted an analytics event. Two modes is a nameless state carrying
the brief's own headline moment.

---

### FC-R3 · Naming: *Today* · *a visit* · *Visits* · *unplaced*

**Question.** Four names that will ship into the margin, the project spread and the app's launch
screen — and names are hard to change afterward.

**Checked against the live collisions:** "Capture Inbox" is **doubly taken** (`field_captures` and
`proposal_captures`, flagged by I84) — this package has no inbox to name, and the word leaves Field's
user-facing copy entirely. "Request" has **three** live senses (R98 design requests / Site Requests /
SMS coordination items) and is never used unqualified. "Field kit" is already
`components/document/discovery/field-kit.tsx` — form-field primitives, not on-site tooling. And
*"site visit"* is already the product's own vocabulary (`project_time_entries.activity`, 00198).

**Recommended default: adopt all four.**

⚠ **Name the relationship between *Visits* and *Site visit* while you are here.** One close act writes
a **Visits** row on the project spread *and* a **Site visit** row in the Hours ledger —
`project_time_entries.activity` admits `'site_visit'` (`00198:27-29`) and `time-derivation.ts:16`
labels it *"Site visit"*. Two names for one event, in one page family. Proposed: **the Visits block is
the record; the Hours entry is its billing shadow** — and consider linking the two rows so the
duplication reads as deliberate.

**Blocks.** Wave 3's copy and wave 4's portal block.
**Cost of being wrong.** A renamed surface after it has shipped into the Document.

---

### FC-R5 · Merge `project_rooms` and `public.rooms` by trimmed name?

**Question.** Three room concepts exist and the field↔portal seam crosses all three.
`FieldProjectDetail` already returns **both** lists from one `projectDetail(id:)` call
(`SupabaseProjectsService.swift`: struct `:117-140`, `projectDetail(id:)` `:146`): `specRooms` (`project_rooms`, what `field_captures.project_room_id`
FKs to) and `rooms` (`public.rooms`, what scans attach to and what `siteScanContext.projectRoomId`
carries). May one picker merge them by case-insensitive trimmed name, stamping whichever id is legal
per lane?

**Options.**
- **(a)** Yes — merge by name; each entry carries up to two ids; stamp only the legal lane; **never
  cross-assign**; when a room exists in only one list, that lane is stamped and the other stays null.
- **(b)** No — pick one (`project_rooms`) and leave the scan lane permanently unreconciled.
- **(c)** Build a real server-side link between the two tables first.

**Recommended default: (a).** It is the only proposal in the research set that unblocks a unified
"put this in this room" affordance **without a schema ruling first**.
`ContextCaptureProvenance.swift:21` already refuses to put a `rooms.id` in the `project_room_id`
column, and **that refusal must survive** whatever is ruled here.

⚠ **Price the degradation too, because it is silent and it lands on the same projects FC-R7 is
about.** `FieldProjectDetail.rooms` is fetched by `fetchClientRooms(clientID: row.clientID)`
(`SupabaseProjectsService.swift:102`), whose own comment reads *"no client → no rooms to list —
return [] without a query"* (`:189`). So on any project whose `designer_clients` row has no registered
`client_id`, the merged picker quietly becomes `project_rooms`-only and **a site scan started from V0
has no room to attach to at all**. The honest expansion in Flow 4's `ownableProjects()` tiebreak must
cover *"this project has no client rooms yet"* out loud.

**Blocks.** V0's room step and every placement affordance downstream.
**Cost of being wrong.** Two rooms that are the same room in the world and different rows in the
database, silently diverging — or a name-match that fires on "Living" vs "Living Room" and puts a
capture in the wrong place. Or, most likely of the three: a picker that shows one lane and says
nothing about the other.

---

### FC-R6 · What *is* an unplaced note?

**Question.** `chk_margin_notes_engagement` is an inclusive **OR**, not an XOR — and it has **three**
arms, not two. `00224:100-102` dropped and redefined it as
`check (project_id is not null or proposal_id is not null or designer_client_id is not null)`, where
`margin_notes.designer_client_id` (00224) anchors a note to a pre-project Discovery relationship.
(Three documents in this program asserted an XOR; correct that wording wherever it appears.) The
conclusion survives: a drive-home thought with no project **and no client** still cannot be a margin
note. M6 — *"whatever a designer needs while on the move"* — is the purest companion moment in the
brief and the one this direction is structurally weakest on.

**Options.**
- **(a)** It stays a `field_captures` row with a *suggestion*, and waits on **Today**, in her hand,
  filed in one tap.
- **(b)** Widen `margin_notes` to allow a fully nullable engagement — a schema change to a shipped
  table with a shipped CHECK.
- **(c)** Give unplaced notes their own home in the portal — which is an inbox, which this direction
  refuses.
- **(d)** **NEW, and it costs zero schema:** anchor an unplaced note to `designer_client_id` when she
  knows the *client* but not yet the project. The constraint already admits it, and the note lands in
  Discovery's margin rather than nowhere.

**Recommended default: (a), with (d) available whenever a client is known.** Nothing is ever lost —
the audio, the transcript and the row all commit; only the *filing* waits, on the surface she opens
every morning rather than in a portal she opens on Thursdays.

⚠ **(a) is the right shape and it is missing its mechanism.** Under (a) a roving capture **never
reaches the portal** until she files it, and the only prompt to file is a band she must open the app
to see: a filing queue with no reminder, in a program that says it has no queues. Give it one cheap
mechanism — a local notification when the unplaced count crosses a threshold, or wave 5's Live
Activity carrying the count — and attach a falsifiable kill-criterion to the `capture.unplaced` event
the package already defines. Otherwise name it in the non-goals, in the brief's own words. (Package
§16.16 now does the latter; the mechanism is still owed.)

**Blocks.** Wave 3's tray. **Decide it before wave 3, not during it.**
**Cost of being wrong.** The landfill Direction B named as its own biggest failure mode, arrived at
by accident instead of by design.

---

### FC-R11 · Recording-consent posture

**Question.** A field voice note will routinely record **other people** — the client on a
walk-through, a GC, a homeowner's family. **All-party-consent states** (CA, IL, WA, FL, PA, MA, MD,
MI, MT, NH, CT, DE, NV, OR) make surreptitious recording of a private conversation a **criminal**
matter. Wisconsin is one-party; Leah's clients are not guaranteed to be in Wisconsin.
⚠ **No recording-consent policy exists anywhere under `docs/`** — grep for "consent" hits only SMS
consent and `project_parties.sms_consent_status` (00281).

**Options.**
- **(a)** Kit-defaulted `solo` / `conversation`, an affirmation chip on a conversation note,
  unmissable recording chrome, never ambient — **plus a lawyer's read before any non-Kody designer
  records a client.**
- **(b)** The same controls, shipped without a legal review, on the argument that a designer recording
  her own site visit is her own business.
- **(c)** No voice recording of conversations at all in v1 — solo notes only, with the mic disabled
  when a client is present.

**Recommended default: (a).** The kit doing the consent work is the cheapest substantive answer, and
it is the only place in the whole design where the shape buys an *ethical* improvement rather than
just fewer taps. **But the legal review is not optional and it is not an engineering decision — it is
an engineering blocker.**

⚠ **This ruling is filed under wave 3 and it belongs to wave 1.** Wave 1 is the first time third-party
audio ever leaves a Field device and is retained on Patina infrastructure — tasks 8 and 9 write and
upload the `.m4a` — and **both** wave-1-reachable voice surfaces record other people by construction:
N4 (a rep at a showroom) and the in-scan context capture
(`SiteScanContextCapture.swift:117-142`, used on a walk-through with a client present). Every control
designed in option (a) — the `solo`/`conversation` choice, the affirmation chip, the kit default, the
recording chrome, the purge — is wave 3 or wave 6.

**Three things wave 1 must therefore do, whichever way (a)/(b)/(c) goes:**
1. **Gate the recorder behind the fail-closed `isFeatureEnabled` seam wave 1 already adds.** That
   gives the exposure an off-switch that needs no build and no App Store round-trip — and gives the
   seam its first real consumer instead of a kill switch wired to no circuit.
2. **Ship `audio_retention` defaulted to `'keep'`, not `'90_days'`** (FC-R13) — nothing purges
   anything until wave 6A, and a column asserting a policy nobody implements is the exact class of
   claim the honesty law forbids.
3. **Say plainly in the spec that retention is unenforced until the purge cron exists.**

**Blocks.** **Wave 1's recorder reaching anyone but Kody**, and wave 3's C6 thereafter.
**Cost of being wrong.** Criminal exposure in fourteen states, and a discovery surface nobody
designed.

---

## Blocks Wave 4 (it lands in the Document)

### FC-R4 · May Patina Field write business tables directly from the device?

**Question.** Verified: `margin_notes_designer_all` is `FOR ALL TO authenticated USING (designer_id =
auth.uid())` (`00196:52-55`) and `create_client_decision` is `GRANT EXECUTE … TO authenticated`
(`00413:2603-2609`). **Leah's own phone can already write both.** But the house pattern is that field
signal reaches `client_decisions` / `project_tasks` only through `review_sms_message` →
`apply_field_effect` (SECURITY DEFINER, revoked from `authenticated`).

**Options.**
- **(a)** Yes — the device inserts `margin_notes` and calls `create_client_decision` on the existing
  outbox, with the caller-supplied `p_decision_id` as a free idempotency key.
- **(b)** No — build `[T1]`'s confirm-RPC pair and route every field write through a DEFINER applier.

**Recommended default: (a).** The distinction that matters is *who is speaking*: `apply_field_effect`
exists because a texting GC's parsed claim is a third party asserting a fact about someone else's
project. A field note is **the designer's own authored note**, and
`margin_notes_designer_all` already contemplates exactly this author.

⚠ **(a) is only worth having if the note it writes is readable.** The `margin_items` `note` branch
emits `left(n.body, 80) as title` with `detail` hard-coded to `''` (`00282:829-830`), `NoteBody` never
renders a body at all (`margin-bodies.tsx:814-880`), and `useEscalateNoteToDecision` forwards
`body: row.title` (`:855-859`). So a one-minute transcript appears in the Document as its first eighty
characters, and escalating it produces a decision whose text is those eighty characters. **Wave 4's
view replace must carry the full body and `NoteBody` must render it** (package §9.4) — otherwise the
device writes a `margin_notes` row nobody can read, which is a worse outcome than (b).

**Blocks.** Wave 4's entire landing. **±2 engineer-weeks either way.**
**Cost of being wrong.** Choosing (a) wrongly means the phone can write the Document with no review
seam; choosing (b) wrongly means two edge functions, a table and an RPC trio for a note the designer
wrote herself.

---

### FC-R7 · What status does a Field-raised punch item take?

**Question.** `create_client_decision` has three gates the research set under-reported
(`00413:1829-1861`): `designer_client_id` is **mandatory** and is absent from Field's `FieldProject`
DTO (`ProjectsService.swift:19-38`); authorization runs through `_can_author_proposal(designer_id)`,
not `auth.uid()` directly; and `status='pending'` **raises** — *"pending decisions require a
registered client recipient"* — on any project whose `designer_clients` row has no registered
`client_id`. That has nothing to do with whether a GC punch item is valid.

⚠ **Two facts the first pass missed, and they change the answer.**

**1. A `'draft'` punch item lands nowhere the package claimed.** Flow 5 named the coordination band's
court groups, the `decision` margin branch and the Desk's `overdue_decision` need kind. All three are
false for a draft: `margin_items`' decision branch ends
`where cd.status in ('pending','responded','expired')` (`00282:645`); `isOpen(item)` is
`item.status === 'pending'` and `groupByCourt` skips the rest, its docstring reading *"resolved/draft
items don't sit in anyone's court"* (`coordination-derivation.ts:84-86`, `:103-110`);
`summarizeCourts` does `if (item.status !== 'pending') continue` (`use-coordination.ts:346`). The one
place it **does** appear is a collapsed **"Drafts · N"** disclosure in the margin rail
(`margin-rail.tsx:375-378`, `:519-556`), whose rows open the composer for publishing. So she
photographs a defect, speaks it, taps twice — the GC sees nothing, the court bar counts nothing, the
Desk raises nothing, and a **Drafts · N** counter accrues until she clears it at her desk. **That is
the triage queue §16.1 refuses, relocated to the portal.**

**2. `'draft'` does not avoid the registered-client failure — it defers it, onto a worse surface.**
`publish_client_decision` flips draft → pending and calls
`_enqueue_decision_notification(p_decision_id, 'decision_required')` (`00399:3505-3512`); that function
resolves `v_recipient_id := designer_clients.client_id` and **raises** *"decision % has no notification
recipient"* when it is null (`00466:54-90`). So publish fails on exactly the projects this ruling
worries about — days later, with an error about notification *recipients*, while she is sending a
general contractor a punch item. And where publish **succeeds**, the **homeowner is notified about a
defect in the GC's court** — a client-facing send package §15.7 forbids and AGENTS.md's "no automated
external sends" rule sits beside.

**Options.**
- **(a)** `'draft'`, accepting the Drafts fold as the landing and rewriting Flow 5 / M4 / §16.1 to say
  so honestly (*"it lands in the margin's Drafts fold and you publish it at the desk"* — a defensible
  design, just not the one the package sold), and accepting the deferred publish failure.
- **(b)** `'pending'`, accepting that the verb fails **immediately and visibly** on projects whose
  homeowner has never signed into the client portal.
- **(c)** `'pending'` when `designer_clients.client_id` is registered, `'draft'` otherwise — a branch
  on the device — plus a statement of what the draft case *means* to her.
- **(d)** **NEW: a Field punch is not a `client_decisions` row at all.** If it is genuinely
  trade-facing, the honest landing is `project_tasks` with `owner='gc'` plus the already-live,
  party-anchored SMS rail — the product's only complete field→structure loop. This trades FC-R8's
  `project_tasks` constraint for the notification problem.

**Recommended default: (c) or (d).** (a)'s cost is a queue this program says it does not have, plus a
client notification about a GC's punch item. The earlier "cost of being wrong" was stated backwards:
it warned that `'pending'` *"silently 500s"* — in fact `'pending'` fails **loudly and immediately**,
which is the better failure; `'draft'` succeeds **silently into a fold**, which is the harder one to
notice.

**Regardless of the answer: `designer_client_id` must be added to Field's projects SELECT and DTO.**
⚠ **And decide `court_party_id` here too.** The payload as drafted names a court with **no person**,
while the SMS rail — the working field loop — is party-anchored (`apply_field_effect`, 00282).
`court_party_id` is already allow-listed (`00413:1829-1838`), the portal composer resolves one from
`project_parties`, and Field already queries that table
(`SupabaseSiteRequestService.swift:44`) — so a picker is one tap over an existing query. Carry it, or
state that a Field punch is court-level only and the party is attached at the desk.

**Blocks.** Wave 4's punch verb. **Do not brief that verb without this decided.**
**Cost of being wrong.** Either a verb that fails on exactly the projects most likely to have a trade
walk, or a verb that appears to work and quietly fills a fold nobody opens.

---

### FC-R8 · Per-designer or per-studio — ruled **once**, for the whole family

**Question.** Four surfaces disagree today, and they must stop disagreeing:

| Surface | Today |
|---|---|
| `field_captures` | owner insert/update/delete; org co-members **SELECT only**, and only while `status='inbox'` (`00233:155-188`) |
| `margin_notes` | owner writes; studio co-members **read** only (00205) |
| `project_tasks` | writes are **designer-of-record only** — `projects.designer_id = auth.uid()` (`00169:60-62`) |
| `capture-media` objects | `auth.uid()::text = (storage.foldername(name))[1]` (`00234:39-69`) |

**Three facts the ruling must price.** (1) There is **no org-scoped UPDATE policy** on
`field_captures` at all, so any `SECURITY INVOKER` filing RPC no-ops for an assistant. (2) A
co-member branch on `capture-media` means a `storage.objects` policy owned by
`supabase_storage_admin` — a **platform-admin phase migration**, not an ordinary one. (3) Today a
studio co-member sees a scan's drawings and an **empty** capture list; that documented, unfixed P2
asymmetry becomes load-bearing the moment the Visits block ships.

**Options.**
- **(a)** Per-designer in v1. A studio co-member's *Make it a task* detects the constraint and
  degrades honestly to a margin note with a plain line. No storage migration.
- **(b)** Per-studio. Widen `field_captures` UPDATE, widen the storage policy (platform-admin phase),
  and route `project_tasks` writes through a DEFINER applier — at which point "no new RPC" no longer
  holds and wave 4 grows.

**Recommended default: (a).** Leah is a solo designer; the assistant premise is designed for a studio
she does not yet have. Take (b) only when a second designer actually needs it.

⚠ **A fourth surface joins the family in wave 4: the `margin_items` view.** It is
`with (security_invoker = true)` (`00282:606-607`), so its new `field_captures` join runs under the
*reader's* RLS — a studio co-member sees the note and gets `has_audio = false` with no explanation.
Rule that case here, before the view is written, rather than shipping a silent drop (§3.3).

**Blocks.** **Any schema work in the program — sequence this ruling second, immediately after
FC-R18.** If (b), budget the storage migration as its own item.
**Cost of being wrong.** Choosing (b) early buys a platform-admin migration and a wider blast radius
for a user who does not exist yet. Choosing (a) and later reversing means re-opening every policy.

---

### FC-R10 · Ship the portal changes unflagged?

**Question.** `room-file` and `call-sheet` are already fail-closed and between them make most existing
field surface dark, and MEMORY.md records at least four flags **never seen by a human**. A third dark
flag would make this work unwalkable.

**Options.**
- **(a)** Unflagged, on the argument that every change is a read of data that only exists if a Field
  build wrote it: `RoomFilesSection` returns `null` with no scans, the Visits block renders nothing
  with no visits, the margin payload only lights when `field_capture_id` is set.
- **(b)** Behind a new fail-closed PostHog flag, with the **flag-on walk as a completion criterion,
  not a follow-up**.

**Recommended default: (a).** ⚠ **But one of those three claims is verified in code and two are
asserted.** Confirming the Visits block and the margin payload render nothing on a field-less project
is an explicit wave-4 acceptance criterion, not a footnote.

⚠ **The ruling is right about the *new* flag and silent about the *existing* one — which is the one
that decides whether wave 4 is visible at all.** `RoomFilesSection` links every row to
`/room/${scan.id}/file` (`room-files-section.tsx:65-69`), and that view is
`useFeatureFlag("room-file")`, fail-closed (`room-file-view.tsx:29`, `:63`). The portal's **only**
`field_captures` reader lives inside it. Mounting the section unflagged therefore ships a block of
rows whose every destination is dark. **Add to this ruling: enable `room-file` for the pilot cohort,
with the flag-on walk as a completion criterion rather than a follow-up, and a named owner.** Decide
`call-sheet` at the same time if party/SMS surfaces are in the story.

⚠ **Two more things ride on (a) and should be ruled here rather than discovered in the wave.**
1. **Unioning designer-owned scans into the two client-only attach points changes what a
   client-provenance instrument means.** `useClientScans` (`letterhead-instruments.tsx:84-95`) and
   `useClientRoomScans` (`use-room-scans.ts:185-214`) are both *"what your client sent you"*
   instruments inside the handoff-pipeline narrative. The union is probably right; it is not "two
   one-hook changes". **Keep the provenance visible in the row** — *"yours"* vs *"from your client"*.
2. **Mounting the section unflagged also ships ESCALATE-class placeholder copy onto the project
   spread.** `room-file-copy.ts:1-10` says so in its own header. Add it to the brand-voice budget as a
   wave-4 line item.

**Blocks.** Wave 4's rollout — **and whether wave 4 has a payoff a designer can see.**
**Cost of being wrong.** A field-less designer seeing an empty block appear in her document with no
explanation — or, more likely, a fielded designer seeing a block of rows that all lead to a dark page.

---

### FC-R15 · Where does a punch photo live?

**Question.** There is **no project-general photo table anywhere in the schema**, and coordination
composers have **no attachment affordance at all** (verified by grep across `item-composer.tsx`,
`open-item-sheet.tsx`, `item-resolve/resolve-punch.tsx`). A punch item without a photo is a punch item
nobody can act on.

**Options.**
- **(a)** The punch item **back-references the `field_captures` row**; the portal signs
  `capture-media` via `useCaptureMediaUrls`. Zero new media tables, correct provenance, and the punch
  photo *is* the visit photo.
- **(b)** `client_decision_options.image_url` — exists, zero DDL, and semantically wrong: an option is
  a *choice*, not *evidence*.
- **(c)** Build the project-general media table now.

**Recommended default: (a).** It was the best of six proposals across the three directions and both
judges preferred it. **Say out loud that a project-general media table is still owed** — (a) does not
pay that debt, it defers it.

⚠ **(a) is not zero DDL, and the wave-4 estimate must absorb the difference.**
`create_client_decision` allow-lists its payload keys and raises on anything else
(`00413:1829-1838`): there is no `field_capture_id` key and no such column on `client_decisions`.
Carrying the back-reference costs (i) a column, (ii) a widened allow-list, and (iii) a
`CREATE OR REPLACE` of a `SECURITY DEFINER`, money-adjacent RPC — with its
`REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated` restated
(`00413:2603-2608`). One DEFINER-function replacement, not zero DDL.

**Blocks.** Wave 4's punch verb, and moments M4/M5/M8/M9 generally.
**Cost of being wrong.** Either a schema decision made under deadline, or evidence stored in a column
named for something else.

---

## Blocks Wave 5

### FC-R9 · Background audio (`UIBackgroundModes: [audio]`)?

**Question.** Today recording **stops** when the app backgrounds or the screen locks — there is no
`UIBackgroundModes` key anywhere in `Info.plist` or the `INFOPLIST_KEY_*` build settings. The
realistic site-walk behaviour is phone-into-pocket, designer keeps talking.

**Options.**
- **(a)** Ship without it in v1: foreground-only recording with an honest *"recording paused"* on
  lock; add it in the wave that adds App Intents, once there is a real note to justify it.
- **(b)** Add it now.

**Recommended default: (a).** It is a real App Review conversation plus a battery and privacy surface,
and iOS forbids *starting* a recording from the background regardless — so a Control-Center or
Action-Button entry must foreground the app for a moment either way.

⚠ **Fix the gesture before fixing the background mode.** C6 is specified as **press-and-hold** for
notes targeted at twenty minutes — nobody holds a button that long one-handed while pointing at a
room, and a slipped finger ends the note, so the whole segment/rotation apparatus would exist for
notes the interaction forbids. The right interaction already ships one screen away:
`SiteScanContextCapture.swift:175-177` is a **tap-to-start / tap-to-stop** toggle. Copy it into C6 and
N4; keep press-and-hold only as the C3 card's shortcut for a ten-second remark. That is worth more to
this ruling's stated moment (phone-into-pocket) than `UIBackgroundModes` is.

**Blocks.** Wave 5.
**Cost of being wrong.** A note that dies in her pocket, or an App Review conversation nobody budgeted.

---

## Blocks Wave 6 (evidence-gated)

### FC-R12 · Does anything ever auto-apply?

**Question.** `sms-inbound` auto-applies at confidence ≥ 0.8 (`pipeline.ts:574`). Should field-note
structuring do the same?

**Options.**
- **(a)** No auto-apply at any confidence. Confidence orders the list and pre-selects in the confirm
  sheet; it never commits.
- **(b)** Mirror `sms-inbound`'s ≥0.8 threshold.

**Recommended default: (a).** The divergence is deliberate and defensible: an inbound SMS is a third
party reporting a fact against a **bounded set of open items the model was shown**; a voice note is
open-ended authoring inside the designer's own document. The blast radius of a wrong auto-applied task
in her own document is higher, and the correction cost is hers.

⚠ **This is no longer this program's ruling to make alone.** Phase 3 capture enrichment's
`record_capture_enrichment_result` **already** writes model output straight into
`field_captures.category / subcategory / finish / vendor_name / sku` with no review step
(`00515:250`, `:287`). Confirm-gating a spoken note while silently accepting a model-written
`vendor_name` **on the same row** is not a coherent product posture. **Rule the family** — with
FC-R18's owner in the room — or (a) is a principle this program keeps and the product does not.

**Blocks.** Wave 6B's design (which is written but unscheduled). Sequenced behind **FC-R18**.
**Cost of being wrong.** Either a document that edits itself, or a designer tapping confirm on
ninety obvious items.

---

### FC-R13 · Audio retention default

**Question.** `audio_retention ∈ keep | discard_after_transcript | 90_days` — which default, and is
it per-note, per-studio, or fixed?

**Recommended default: `90_days` as the *policy*,** per-note overridable, purged by a daily cron
mirroring `site-request-media-maintenance`'s shipped 90-day purge (00375) and stamping
`voice_audio_purged_at`. The transcript survives; the audio does not.

⚠ **But the column ships defaulted to `'keep'` until that cron exists.** The purge is wave 6A; the
audio starts arriving in wave 1. A `NOT NULL DEFAULT '90_days'` in the meantime asserts a retention
policy **nothing implements** — the exact class of unverifiable claim the honesty law forbids, written
into the schema. Flip the default in the migration that ships the purge, and say plainly in §15 that
retention is unenforced until then.

⚠ **Retention is two policies, and this ruling only covers one.** Nothing purges the **phone**: see
**FC-R19**.

**Blocks.** A column default (in the W1 migration), a cron in wave 6A, and what a client's lawyer
sees on discovery.
**Cost of being wrong.** `keep` is an indefinite archive of other people's voices; `discard_after_transcript`
throws away the record while keeping only a reading of it, which inverts R114.1.

---

### FC-R16 · Can a spoken measurement ever become a measured record?

**Question.** *"The alcove reads about forty-two and three quarters."* Does that ever reach
`room_file_measurements` or set a `tolerance_class`?

**Options.**
- **(a)** No. It becomes a note that *says* the number, tagged as spoken, `needs_confirmation`.
- **(b)** Yes, at high confidence, badged `estimated`.

**Recommended default: (a).** R108.1 (typed anchors only) and R114.1 (two-tier trust: on-device output
is orientation, never the deliverable) both say a spoken number is not a measured record. The applier
must **refuse** to touch those tables.

⚠ **R108.1's own named re-open trigger is *"field evidence of transcription friction"* — which this
program will generate.** If that evidence arrives, cite R108.1 directly and re-raise the ruling; do
**not** quietly widen the applier.

**Blocks.** Wave 6's applier, and any future DISTO-BLE conversation.
**Cost of being wrong.** The accuracy contract is the product. A spoken number wearing a measured
badge would end it.

---

## Summary sheet

**Ruling order: FC-R18 → FC-R8 → FC-R17 → FC-R11 / FC-R19 → FC-R14 → everything else.**

| # | Ruling | Recommended default | Blocks |
|---|---|---|---|
| **FC-R18** | Own / share / defer `field_captures` enrichment vs Phase 3 | **Share the ledger**; author the W1 replacement from the MERGED, post-fix 00516 body, landing after 00516; enqueue only via the `_for_producer` wrapper | **Wave 1's migration** and wave 6's shape. **First.** |
| **FC-R8** | Per-designer or per-studio, for the whole family (now five surfaces — `margin_items` joined) | Per-designer in v1 | **Any schema work.** Second. |
| **FC-R17** | Which migration band? | **Record the missing svc-media `00521` first**, re-census across `main` + `git log --all` + worktrees, **then reserve `00530–00535`** — pre-agreed with both live lanes, symbolic only, re-confirmed against the ledger + `supabase migration list` before every push | **Wave 1** — every migration |
| **FC-R11** | Recording-consent posture | Kit-defaulted + affirmation + **a lawyer's read**; gate the recorder behind the fail-closed flag seam | ⚠ **Wave 1** — that is when third-party audio first leaves a phone |
| **FC-R19** | The **phone's** own media retention | Delete on commit receipt, delete on Discard, size-capped sweep | **Wave 1**'s recorder |
| **FC-R14** | Is TestFlight a dependency? | **Yes** — with a **build-time** analytics key, or the archive is blind | **Wave 1** — whether it reaches Leah |
| **FC-R1** | Does Field stop being camera-first? | Yes, with the launch table — and the Camera control is already one tap from Today | Wave 3's shape |
| **FC-R2** | Two kinds + kits? | Two kinds + **three** kits — ⚠ overrules the designer judge's three-kind recommendation; kit chooser deferred to wave 4 | Wave 3's door |
| **FC-R3** | Naming: Today / a visit / Visits / unplaced | Adopt — and name the **Visits ↔ Site visit** relationship | Wave 3 copy, wave 4 block |
| **FC-R5** | Merge the two room lists by trimmed name? | Yes, never cross-assigning — and say so when a project has **no client rooms** | Wave 3's room step |
| **FC-R6** | What is an unplaced note? | A `field_captures` row waiting on Today — ⚠ the constraint is an **OR** with a third arm, so **(d)** anchoring to `designer_client_id` is free | Wave 3's tray |
| **FC-R4** | Direct device writes to business tables? | Yes — ⚠ worthless unless the margin carries the **full body** | Wave 4's landing; ±2 weeks |
| **FC-R7** | Punch-item default status | ⚠ **RE-OPEN.** `'draft'` lands in a collapsed *"Drafts · N"* fold and re-raises at publish **while notifying the client**. Prefer (c) or (d) | Wave 4's punch verb |
| **FC-R10** | Unflagged portal changes? | Yes for a *new* flag — **and turn the existing `room-file` on for the pilot cohort**; rule the designer-scan union | Wave 4's rollout, and whether it is visible at all |
| **FC-R15** | Where does a punch photo live? | Back-reference the capture row — ⚠ **costs one DEFINER-RPC replacement**, not zero DDL | Wave 4's punch verb |
| **FC-R9** | Background audio? | No in v1 — ⚠ fix the **gesture** first | Wave 5 |
| **FC-R12** | Does anything auto-apply? | No, at any confidence — ⚠ **rule the family**; Phase 3 already auto-fills five columns on the same table | Wave 6B's design |
| **FC-R13** | Audio retention default | `90_days` as the *policy*; ⚠ the **column ships `'keep'`** until the purge exists | A default, a cron, discovery |
| **FC-R16** | Spoken measurement → measured record? | No | Wave 6B's applier |

**Two rulings this register did not have, and now does:** FC-R18 (whose lane owns `field_captures`)
and FC-R19 (what the phone does with its own media).

---

## One live input this program does not control

**Leah Session 05** (prep doc dated 2026-08-18) **has not been run** — its findings template is still
blank — and its block 2 ranks **"capture/memory"** against three other MVP-wedge candidates. Nor is
there any confirmation that Leah has **ever** held Patina Field on a real site (M4's device-pilot gate
was deferred at R113 and is still listed as owed).

The plan is deliberately shaped so this does not have to be answered first: **waves 1 and 2 are
overwhelmingly bug-fixes and the wiring of parts that already exist**, which makes them a cheap,
reversible bet worth making whatever the session says. **Wave 6 is held for the answer.**
