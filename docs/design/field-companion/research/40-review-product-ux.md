# 40 — Adversarial review: PRODUCT / UX + SCOPE lens

**Package under review:** `field-companion-package.md` (spec) · `field-companion-plan.md` (build order) ·
`field-companion-rulings.md` (FC-R1…FC-R17)
**Date:** 2026-08-24 · **Mode:** read-only; the only file written is this one.
**Lens:** judged as **Leah** (working designer, mobile, one-handed, offline half the time) and as
**Kody** (does this buy felt value fast, is the scope honest, are the rulings the right ones).

Every claim below was verified against this checkout at `main` (`27fdaf130`) during this session.
Findings are **not** filtered by severity — the orchestrator filters.

---

## Verdict

The direction is right and the diagnosis is unusually well-evidenced. Direction A's refusals — no
inbox, no `field_visits` table, no new margin kind, no third dark flag — are the best judgement in
the whole research set, and Wave 1's instinct (repair the honesty violation first, in one file,
device-walkable with no schema and no portal work) is correct.

**Three things are wrong at a level that changes the plan, not the prose.**

1. **Two live lanes landed on `main` in the half hour before this package was issued, and it knows
   about neither correctly.** `00521` is *taken* on disk (§F1) — the package's own headline
   correction about migration numbering is itself stale. And **Phase 3 "capture enrichment"
   (00514/00515) is a second AI pipeline pointed at `field_captures` right now**, with its own
   ledger, its own outbox, its own Cloudflare-Queue consumer, and an RPC that **auto-writes**
   `field_captures.category/subcategory/finish/vendor_name/sku` with no designer confirmation
   (§F2). The package proposes a differently-shaped second pipeline over the same table in Wave 6
   and states a principle ("Nothing auto-applies") the neighbouring lane already contradicts.
2. **Wave 1 does not deliver the second half of its own title.** The placement affordance opens a
   screen whose only primary is *"Choose destination"* → S3 → a terminal — so it costs ~5 taps and
   *commits* the capture, and closing with ✕ throws the placement away (§F3). Nothing in the portal
   changes at all (§F39).
3. **The honesty repair is incomplete in the one place a designer will meet it most.** In N4 —
   the specimen voice sheet — **"Attach note" is disabled when the transcript is empty**
   (`primaryEnabled: !transcript.isEmpty`), so after Wave 1 a note that has audio but no words
   still cannot be kept there; her only option is Discard, and the `.m4a` is orphaned on disk
   forever (§F6, §F28). Wave 1 edits that file and does not touch that gate.

Downstream, two headline landings are falsified by code the package did not check: a Field-raised
punch item at the recommended `'draft'` status is **not** in any court, **not** in the margin
`decision` branch, and **not** in the Desk — it is in a collapsed *"Drafts · N"* fold to be
published later (§F4), and publishing it **raises** on any project without a registered client and
otherwise **notifies the client** about a GC's punch item (§F5). And a voice transcript rendered as
a margin note is **truncated to 80 characters** by `margin_items` itself, including the copy that
`useEscalateNoteToDecision` carries forward (§F12) — so "escalation works on field notes for free"
is false for exactly the field note this program creates.

## The six things I would change before a line is written

1. **Re-draw the band and coordinate with two live lanes** — 00521 is taken; Phase 3 owns
   00514–00520 *and* is actively writing `field_captures` (§F1, §F2). FC-R2 is not the first
   ruling owed; "does Field Companion own `field_captures`, or share it with Phase 3?" is.
2. **Give S1 a persist-and-return primary**, or Wave 1's only designer-visible landing affordance
   costs more taps than today and ends somewhere else (§F3).
3. **Finish the honesty repair in N4 and the tray**, not only in the scan-context screen (§F6,
   §F27), and add a play control so "the audio is here" is checkable (§F16).
4. **Move FC-R11 (consent) to block Wave 1** — Wave 1 is the first time third-party audio leaves a
   phone and is retained for 90 days by a column default nothing enforces (§F9) — and give the
   fail-closed `isFeatureEnabled` seam Wave 1 already builds its first real consumer: the recorder
   (§F35).
5. **Rule FC-R7 with the Drafts fold on the table**, and say plainly which surface a Field punch
   lands on (§F4, §F5).
6. **Run a portal-only "Wave 1P" in parallel with Wave 1** — `useCaptureMediaUrls`, mount
   `RoomFilesSection` (with the `room-file` flag decision, §F10), render
   `receiving_inspections.photo_asset_ids`, Library provenance chip. It needs no Field build, acts
   on data already in production, and is the only thing Leah can see before the distribution
   question is answered (§F11).

---

## Findings

### F1 · CRITICAL · confidence 0.99 — the reserved migration band is already taken

**Where:** package §9.1–§9.5, rulings FC-R17, plan §0.2 fact 4, C6, Task 1 (every sub-step), Task 10,
the SQL-test header, the PR body and six commit messages.

**Claim.** The package's headline correction — *"every research doc says mint from 00514 and is
wrong; reserve **00521–00526**"* — is itself stale. `00521` exists on `main`.

**Evidence.**
```
$ ls supabase/migrations/ | tail -4
00514_capture_enrichment_ledger.sql
00515_capture_enrichment_rpcs.sql
00521_svc_media_shape_reconciliation.sql
$ git log -1 --format='%h %ad %s' --date=iso ca2b0641b
ca2b0641b 2026-08-24 15:05:39 -0500 feat(db): author svc_media shape reconciliation (00521) …
$ grep -c '00521' docs/engineering/migration-number-reservations.md
0
```
It landed **25 minutes before this package was issued** (package mtime 15:30) and the reservations
doc — the repo's declared single source of truth for band ownership — does not record it. Plan Task
1.1's stated expectation (*"the last file is `00515_capture_enrichment_rpcs.sql`; the git log is
empty; the grep returns nothing"*) is false on all three counts today.

**Fix.** (a) Make step 1.0 *"add the missing 00521 row to the reservations doc"* — the doc is
demonstrably incomplete and repairing it is worth more than the reservation. (b) Re-draw the Field
Companion band above the true head after `supabase migration list`. (c) In both documents refer to
migrations **symbolically** ("the W1 migration", "the visit/suggestion migration") and keep numbers
in exactly one place. Right now ~20 hardcoded numbers span two documents, a PR body and six commit
messages — the same class of error the package spent a section correcting.

---

### F2 · CRITICAL · confidence 0.90 — a second AI lane is already pointed at `field_captures`, and it auto-applies

**Where:** package §8.6–§8.9 (wave 6 transcription + structuring), §9.2 (ALTER `field_captures`),
Principle 7 (*"Nothing auto-applies"*), rulings FC-R12; plan 6-1…6-7. The package mentions Phase 3
**only** as a migration-band neighbour (§9.1).

**Claim.** Phase 3 "capture enrichment" is a live, in-flight program that (i) targets
`field_captures` explicitly, (ii) runs its own execution ledger + transactional outbox + Cloudflare
Queue consumer, and (iii) **writes AI output straight into `field_captures` columns with no designer
confirmation**. The package proposes a second, differently-shaped pipeline over the same rows and
asserts a house principle the neighbour already breaks.

**Evidence.**
- `supabase/migrations/00514_capture_enrichment_ledger.sql:41-43` —
  `target_type text NOT NULL CHECK (target_type IN ('proposal_capture', 'field_capture'))`.
- `00515_capture_enrichment_rpcs.sql:250` —
  `v_allowed CONSTANT text[] := ARRAY['category','subcategory','finish','vendor_name','sku'];`
  and `:287` — `EXECUTE format('UPDATE public.field_captures SET %1$I = $1 … WHERE id = $2 AND
  (%1$I IS NULL OR %1$I = '''')')`. Service-role only, no review step: **the model's suggestion
  becomes the row.**
- `packages/types/src/capture-enrichment.ts` — `CaptureEnrichmentMessageV1`, a Cloudflare-Queue
  message contract "shared by the pg_cron dispatcher (producer), the Cloudflare Queue send path,
  and the enrichment consumer".
- Both landed today (`a11268420`, 15:00) and the reservations doc reserves 00516–00520 for the rest
  of that lane ("pg_cron outbox reconciler, any additional RPCs the Cloudflare Queue consumer needs").

**Three concrete consequences the package must price.**
1. **Two dispatch mechanisms for one table.** Wave 6 proposes `agent_tasks` kind
   `field_note.structure` + pg_cron + an edge function. Phase 3 already has run-ledger + outbox +
   Queue + consumer for the same rows. AGENTS.md's standing rule is *"Never a parallel queue."*
2. **FC-R12 is not a fresh question.** The package argues "nothing auto-applies, ever, at any
   confidence" while the neighbouring lane auto-fills five columns. Kody should rule the *family*,
   not this program alone — or the product will confirm-gate a spoken note while silently accepting
   a model-written `vendor_name` on the same row.
3. **Wave 2 collides with Phase 3's fill rule.** Phase 3 only writes when the column is
   `NULL OR ''`. `commit_field_capture` writes `category`/`subcategory`/`finish`/`vendor_name`/`sku`
   straight from the device payload (`00235:107-116`), and `applySmartGuess`
   (`ViewfinderModel.swift:409-419`) stamps a category on **every** photo — so today Phase 3's
   enrichment can never fill `category` for any field capture. Wave 2's real-classifier swap
   narrows but does not remove that: a confident-but-wrong on-device guess permanently suppresses
   the server one.

**Fix.** Add a ruling ahead of FC-R2: *does Field Companion own `field_captures` enrichment, share
it with Phase 3, or defer to it?* Then either (a) route Wave 6's transcription/structuring through
`capture_enrichment_runs` (one ledger, one queue, one consumer), or (b) state in §10 why voice is a
different lane, and reconcile §Principle 7 with 00515's auto-fill in the same paragraph. Either way,
name Phase 3 in §9.1 and in P-7, and talk to its owner before ALTERing the table.

---

### F3 · HIGH · confidence 0.95 — Wave 1's placement line opens a funnel that commits the capture

**Where:** package §7.5 (*"Wave 1 adds the placement line only, presenting the **existing**
`.assignVenue(id)` sheet… one tap from the shutter to the app's only project picker"*), §1
("the cheapest possible project affordance"), plan Task 11, Task 12, Wave 1 acceptance criterion 5,
Wave 1 "What a designer feels" item 3.

**Claim.** S1 has exactly one primary action and it is **not** "save and go back". The new line
starts a three-sheet funnel ending in a terminal screen — and ✕ discards the project she just picked.

**Evidence.** `Capture/Features/Route/S1AssignVenueScreen.swift`:
- `:78` `onClose: { coordinator.dismissSheet() }` — ✕ never calls `persistRouting()`.
- `:100-107` the single `RouteActionButton` is **"Choose destination"** → `advance()`.
- `:359-362` `private func advance() { persistRouting(); coordinator.present(.destination(specimen.id)) }`
  — routing persists **only** on the path into S3.
- `:363-417` `persistRouting()` does correctly write `sessionContext.remember(…)` including
  `projectRoomID`, so the *inheritance* half of the premise is sound.

`.assignVenue` and `.destination` are both `CaptureSheet` cases (`CaptureNavigation.swift:44-58`)
over one root `.sheet(item:)`, so S3 *replaces* S1. S3 then routes and presents S4/S5
(`S3DestinationScreen.swift:52-57, 136+`). Measured from the shutter: card → placement → project →
room → *Choose destination* → destination → terminal ≈ **5–6 taps**, and the capture is committed
mid-flow. `ViewfinderModel.swift:281-284` also shows the card is one-shot; nothing returns to it.

The same defect makes plan Task 12's new comment untrue: *"it places the first unplaced capture and
**returns for the next**"* — there is no return.

**Fix (small, and it makes Wave 1 real).** Add a second primary to S1 when presented from the
capture path: **Done** → `persistRouting(); coordinator.dismissSheet()`; make ✕ either persist or say
plainly that the placement was not kept. Re-write acceptance criterion 5 to name the return surface,
and re-write "What a designer feels" item 3 with the honest tap count.

---

### F4 · HIGH · confidence 0.95 — a Field punch item at `'draft'` lands in a collapsed Drafts fold, not a court

**Where:** package Flow 5 (*"**Lands:** … the coordination band's court groups, the `decision` margin
branch, the Desk's `overdue_decision` need kind. **Zero new portal code.**"*), §4 M4, §9.6, §16.1
(*"no card to clear"*), rulings FC-R7 (recommended default `'draft'`), plan 4-8.

**Claim.** All three named landings are false for `status='draft'`. The item is not lost — it
appears in one place the package never mentions, and that place is a queue to clear.

**Evidence.**
- `supabase/migrations/00282_sms_core.sql:645` — the `margin_items` **decision** branch ends
  `where cd.status in ('pending', 'responded', 'expired')`. A draft is not in the margin.
- `apps/designer-portal/src/lib/document/coordination-derivation.ts:84-86` —
  `isOpen(item) { return item.status === 'pending'; }`; `groupByCourt` (`:103-110`) skips
  `!isOpen(item)`, docstring: *"resolved/draft items don't sit in anyone's court."*
- `packages/supabase/src/hooks/use-coordination.ts:346` — `if (item.status !== 'pending') continue;`
  in `summarizeCourts`, so the court bar counts zero.
- **Where it does appear:** `apps/designer-portal/src/components/document/margin-rail.tsx:375-378`
  (`legacyCoordinationDrafts`) and `:519-556` — a collapsed **"Drafts · N"** disclosure whose rows
  open the composer for editing/publishing (`usePublishCoordinationItem`, `:210`).

**Why it matters.** M4 is the trade-walk promise and one of only two new *verbs* in the program.
As specified, Leah photographs a defect, speaks it, taps twice — and the GC sees nothing, the court
bar counts nothing, the Desk raises nothing, and a **Drafts · N** counter accrues in the margin
until she clears it at her desk. That is precisely the triage queue §16.1 refuses, relocated.

**Fix.** Either (a) rule FC-R7 **(c)** — `'pending'` when `designer_clients.client_id` is registered,
`'draft'` otherwise, with the branch on the device — and say what the draft case means; or (b) keep
`'draft'` and rewrite Flow 5, M4 and §16.1 to say *"it lands in the margin's Drafts fold and you
publish it at the desk"*, which is a defensible design but is not the one the package sells. Do not
brief 4-8 until this is ruled. Note the ruling's stated cost-of-being-wrong is currently backwards:
it warns that (b) "silently 500s"; (a) silently succeeds into a fold, which is harder to notice.

---

### F5 · HIGH · confidence 0.85 — publishing that draft re-raises the same failure, and notifies the client about the GC's punch item

**Where:** rulings FC-R7 (*"`'draft'` — the only status that always works"*), package Flow 5's ⚠ box,
§15.7 (*"Never a client-facing surface in v1"*), AGENTS.md (*no automated external sends*).

**Claim.** `'draft'` does not avoid the registered-client failure; it defers it to the publish step,
days later, on a surface where the message makes no sense. And publishing a **GC**-court punch item
enqueues a **client** notification.

**Evidence.** `supabase/migrations/00399_journey_authority_integrity.sql:3466-3516`
(`publish_client_decision`) flips `draft → pending` and calls
`_enqueue_decision_notification(p_decision_id, 'decision_required')`. That function
(`00466_project_approval_notification_requeue.sql:54-90`) resolves
`v_client_id := designer_clients.client_id`, sets `v_recipient_id := v_client_id` for
`decision_required`, and then:
```sql
IF v_recipient_id IS NULL THEN
  RAISE EXCEPTION 'decision % has no notification recipient' …
```
So on exactly the projects FC-R7 worries about, publish **raises** — with an error about
notification recipients, while she is trying to send a punch item to a general contractor. And where
it succeeds, the homeowner is notified about a defect in the GC's court.

**Fix.** Price both halves in FC-R7: the deferred failure, and the client notification. If a Field
punch is genuinely trade-facing, the honest landing may be `project_tasks` with `owner='gc'` plus
the SMS rail (already party-anchored and live) rather than `client_decisions` at all — say so, or
accept the notification and state it in §15.

---

### F6 · HIGH · confidence 0.90 — the honesty repair misses the sheet where most voice notes are taken

**Where:** package §1 defect 1, §7.11, §15.4 (the failure ladder), plan Task 8.6, Task 14.

**Claim.** Wave 1 repairs the discard at `SiteScanContextCapture.swift:129` — but the *other* voice
surface, N4, refuses to keep a wordless note at all, and Wave 1 edits that file without touching it.

**Evidence.** `Capture/Features/Recognition/Voice/VoiceNoteSheet.swift:62-69`:
```swift
RecognitionActionBar(
    secondaryTitle: "Discard",
    primaryTitle: "Attach note",
    primaryEnabled: !transcript.isEmpty && !isRecording, …
```
and `:189-192` — `transcript` is only replaced from the result `if !r.transcript.isEmpty`. So with
an empty transcript the primary is **disabled** and the only enabled control is **Discard**
(`:194-199`), which cancels and dismisses without writing the specimen. After Wave 1 the `.m4a`
exists on disk, is referenced by nothing, is never uploaded and is never deleted.

Plan Task 8.6 adds two lines *after* `specimen.voiceAudioFilename = result?.audioFilename` (`:205`)
— inside `attach()`, which she cannot reach.

**Fix.** In Wave 1: enable **Attach note** whenever `result.audioSegments` is non-empty, label it
honestly (*"Keep the recording"*), apply the §15.4 ladder line, and delete the segment files on
Discard. Add it to the device-pass script (record in a loud room from **N4**, not only from the scan
screen).

---

### F7 · HIGH · confidence 0.85 — making audio "required media" can stop a note from ever syncing

**Where:** plan Task 6.6 (`missingRequiredMedia` extended to every segment), Task 9.2 (throws
`missingLocalMedia` per segment), package §8.2 (*"A failed `AVAudioFile` open is non-fatal … Never
block a capture"*).

**Claim.** The non-blocking rule is stated for the *open* failure only. Everything downstream treats
audio as mandatory, so today's always-syncing transcript-only note becomes a note that can be stuck.

**Evidence.** `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:510-537`: photos are exempted
once they carry a durable `remotePath` (`:512-517`); the voice branch (`:518-522`) appends the
filename **unconditionally**, and `validateRequiredMedia` (`:533-537`) throws
`CaptureMediaAvailabilityError.missingLocalMedia`. `LocalCaptureSyncService.swift:366` calls it at
the top of `uploadMedia`, and `:405-411` throws again per unreadable voice file. The voice upload
never records a remote path on the specimen (`:404-420` keeps `voicePath` local), so **a voice file
is required-local forever**, unlike a photo. `CaptureMediaAvailabilityError` is not a
`LocalSyncError`, so `isDeferrable` (`:48-53`) does not apply — it is a hard failure, not a retry.

**Failure scenario.** A 12-minute walk-through on a phone at 2% free space; segment 3 fails to
flush, or the App-Group container path changes across a reinstall. Today the transcript commits.
After Wave 1 the whole note is blocked — the honesty repair made the outcome worse.

**Fix.** Mirror the photo rule (stamp and exempt a segment once uploaded); on a missing local
segment **drop it, mark the row `audio_lost`, and commit the transcript**. Add a device-pass step:
fill the disk, record, confirm the note still lands.

---

### F8 · HIGH · confidence 0.80 — C6 is specified as press-and-hold, for notes up to twenty minutes

**Where:** package §7.4 (the C6 mock — `(  ●  hold  )`), Flow 3 (*"hold the big mic, speak, release.
Auto-saves on release."*), §4 M2 (client walk-through), §8.2 (cap **20 minutes / 24 segments**),
§8.3 (interruption → segment N+1).

**Claim.** The interaction and the design target contradict each other. Nobody holds a button for a
twenty-minute client walk-through, one-handed, while pointing at a room — and a slipped finger ends
the note. The whole segment/rotation apparatus exists for long notes the gesture forbids.

**Evidence.** Today's N4 mic is a hold: `VoiceNoteSheet.swift:114-129` —
`DragGesture(minimumDistance: 0).onChanged { begin() }.onEnded { end() }`, a11y label *"Hold to
talk"*. The app **already has the right interaction** one screen away:
`SiteScanContextCapture.swift:175-177` — `pill(model.isRecordingVoice ? "stop.circle.fill" :
"mic.fill", model.isRecordingVoice ? "Stop" : "Note") { model.toggleVoice() }` — tap to start, tap
to stop.

**Fix.** Make C6 (and N4) **tap-to-start / tap-to-stop** with a large visible Stop, and keep
press-and-hold only as the C3 card's quick shortcut for a ten-second remark. Copy the shipped toggle
rather than inventing one. Then §8.2's caps become meaningful instead of unreachable.

---

### F9 · HIGH · confidence 0.85 — the consent exposure starts in Wave 1; every control is Wave 3+

**Where:** package §15, rulings FC-R11 (*"**Blocks.** Wave 3's C6 voice mode reaching anyone but
Kody"*), §9.2 (`audio_retention … DEFAULT '90_days'`), §10 (the purge cron is Wave 6), plan P-6.

**Claim.** Wave 1 is the first time third-party audio leaves a Field device and is retained on
Patina infrastructure. Every mitigation the package designs — the `solo`/`conversation` choice, the
affirmation chip, the kit default, the recording chrome, the purge — is Wave 3 or Wave 6. The ruling
is scoped to the wrong wave, and the retention column asserts a policy nothing implements.

**Evidence.** Plan Tasks 8 and 9 write and upload the `.m4a` in Wave 1. §9.2 ships
`audio_retention text NOT NULL DEFAULT '90_days'` in the same migration while
`field-note-media-maintenance` is listed under §10 "Wave 6, if ruled in" (plan 6-6). Both
Wave-1-reachable voice surfaces record other people by construction — N4 (a rep at a showroom) and
the in-scan context capture (`SiteScanContextCapture.swift:117-142`, used on a walk-through with a
client present). §15.1's own grep stands: no recording-consent policy exists anywhere under `docs/`.

**Fix.** (a) Re-scope FC-R11 to **block Wave 1**. (b) Gate the recorder behind the fail-closed
`isFeatureEnabled` seam Wave 1 is already adding (§F35) so the exposure has an off-switch that needs
no build. (c) Either ship the purge with Wave 1 or default the column to `'keep'` and say plainly in
§15 that retention is unenforced until Wave 6 — a column that asserts a 90-day policy nothing
implements is the exact class of claim §15 exists to forbid.

---

### F10 · HIGH · confidence 0.80 — the Wave-4 portal payoff routes into a page that is fail-closed

**Where:** package §11.2, §11.6 (*"No new portal flag; the portal changes ship unflagged"*), §4 M7,
Flow 8, rulings FC-R10, plan 4-5.

**Claim.** Mounting `RoomFilesSection` unflagged produces a block of rows whose every destination is
dark. The package correctly refuses a *new* flag; it never addresses the *existing* one.

**Evidence.** `components/room-file/room-files-section.tsx:65-69` links each row to
`/room/${scan.id}/file`. That view is `useFeatureFlag("room-file")`
(`components/room-file/room-file-view.tsx:10, :63`), fail-closed by house rule, and the portal's
only `field_captures` reader lives inside it (`packages/supabase/src/hooks/use-room-files.ts:378` —
the sole `.from('field_captures')` in the whole web tree). §11.6's own reasoning acknowledges
`room-file` is fail-closed and that "most existing field surface is dark", then does not act on it.

**Fix.** Add a ruling (or a Wave-4 prerequisite with a named owner): **enable `room-file` for the
pilot cohort**, with the flag-on walk as a completion criterion, not a follow-up. Decide `call-sheet`
at the same time if party/SMS surfaces are in the story. Until then §4's "After wave 4" column for
M1 and M7 is aspirational.

---

### F11 · HIGH · confidence 0.80 — the only work that can reach Leah today is scheduled last

**Where:** plan §1 (Wave 1 = "No portal work"), §1.5 (Wave 0.5, gated on FC-R14), §4 (Wave 4 ≈ 4
engineer-weeks, ~10 weeks in), rulings FC-R14; program risks P-1/P-2/P-3.

**Claim.** The program's own risk register says nothing reaches Leah, nothing is measurable, and the
wedge is unconfirmed. Four Wave-4 packages need **no Field build at all** and act on data already in
production — yet they sit behind ~10 weeks of iOS work and a distribution pipeline that does not
exist.

**Evidence.**
- **4-5** — `RoomFilesSection` is complete and returns `null` with no scans (`:37-40`);
  `useProjectRoomScans` exists. Any `room_scans` already carrying `project_id` (writable by Field
  since 00265) renders today.
- **4-11** — iOS has been writing `receiving_inspections.photo_asset_ids`
  (`SupabaseReceivingService.swift:115`) into rows `log-inspection-drawer.tsx:151` hardcodes `[]`
  for. Those photos are in production now: a live defect, not a future feature.
- **4-1** — `useCaptureMediaUrls` has two in-repo precedents
  (`letterhead-instruments.tsx:118-130`; `useFieldMediaUrl` in `use-party-sms.ts`).
- **4-12** — the Library provenance chip reads `products.capture_source`, which already carries data.

**Fix.** Split a **Wave 1P** (portal, ≈1 engineer-week, Sonnet) alongside Wave 1: 4-1 + 4-5 + 4-11 +
4-12 plus the `room-file` decision (§F10). Reversible with a portal revert, and the cheapest possible
answer to "does field material in the Document change how she works?"

---

### F12 · HIGH · confidence 0.85 — a voice note in the margin is truncated to 80 characters, and escalation carries only those 80

**Where:** package §2.1 (*"`useEscalateNoteToDecision` and `useEscalateNoteToScopeChange` work on
field notes for free"*), §11.4, §9.4 (the view replace changes "exactly the `note` branch's
`payload`"), Flow 2 step 4, plan 4-3/4-4.

**Claim.** The `margin_items` note branch does not carry a note's body — it carries
`left(n.body, 80)` as `title` and an empty `detail`. The portal's `NoteBody` renders no body at all,
and escalation passes the truncated title. A one-minute transcript therefore appears in the Document
as its first 80 characters, and escalating it produces a decision whose text is those 80 characters.

**Evidence.**
- `supabase/migrations/00282_sms_core.sql:829-830` — `left(n.body, 80) as title`,
  `''::text as detail`.
- `apps/designer-portal/src/components/document/margin-bodies.tsx:814-880` (`NoteBody`) renders the
  author, the escalation actions and nothing else — the body never appears.
- `:855-859` — `toDecision.mutate({ noteId, projectId, body: row.title })`, i.e. the truncated text
  becomes the decision's body.

This is fine for the note the margin was designed for (R14: *"≤5 seconds — one tap, type, save"*).
It is not fine for a transcript, which is the entire artefact this program produces.

**Fix.** Wave 4's view replace must carry the full body (a `payload.body`, or widen `detail` for the
note branch) and `NoteBody` must render it; `useEscalateNoteToDecision` must be passed the full text.
Say so in §9.4 — the current instruction ("recreate the prior body verbatim and change only the
`note` branch's `payload`") is compatible with this, but nobody will do it unless it is written down.

---

### F13 · MEDIUM · confidence 0.80 — Wave 2's truth fix flips the destination default toward Library

**Where:** package Flow 6 (*"`applySmartGuess` stops lying"*), §7.12, plan 2-2.

**Claim.** Removing the hardcoded guess is right, but it lands three waves before the visit *kind*
that makes the consequence safe. After 2-2, a confidently classified photo stops recommending Inbox
and starts recommending **Library** — i.e. minting a product — including for a photo of a damaged
baseboard.

**Evidence.** `Capture/Features/Route/S3DestinationScreen.swift:52-57`:
```swift
private var recommended: CaptureDestination {
    if specimen.destination == .library || specimen.destination == .inbox { return specimen.destination }
    return specimen.hasUnconfirmedGuess ? .inbox : .library
}
```
`applySmartGuess` (`ViewfinderModel.swift:409-419`) guarantees `hasUnconfirmedGuess == true` today,
so everything recommends Inbox. The package names the defect and the mis-steer but not the direction
of the swing.

**Fix.** In 2-2, hold the recommendation at `.inbox` regardless of confidence until visit kinds exist
(Wave 3), or gate the Library recommendation on `kind == 'sourcing'`. Add a Wave-2 device-pass step:
photograph a wall defect, confirm the recommendation is not Library.

---

### F14 · MEDIUM · confidence 0.80 — "no inbox" is a claim about the portal, sold as a claim about the product

**Where:** package §2.1, §16.1, §17.3 (*"The word 'Inbox' in Field's user-facing copy"* — retired),
§7.7 (S3 retained), plan 3-11, Task 14.3.

**Evidence.** The concept stays (`status='inbox'`, `CaptureDestination.inbox`, S3 kept), the device
tray is a triage queue by another name (*"4 captures not placed yet"*), and **ten** designer-visible
strings carry the word:
`S3DestinationScreen.swift:77` ("Inbox — finish later", on a screen §7.7 explicitly keeps, whose
blurb also says *"a quick visit you'll triage tonight"*), `S1AssignVenueScreen.swift:306,333`,
`SiteScanContextCapture.swift:86` ("Photo added to Inbox"), `:141` ("Voice note added to Inbox"),
`:267`, `SiteScanSetupScreen.swift:154`, `SettingsScreen.swift:34`,
`S4SavedTerminalScreen.swift:170`, `LocalCaptureSyncService.swift:38`. Plan Task 14.3 rewrites
`:267` only.

**Fix.** Pick one. Either retire the concept from her vocabulary (rename the destination, rewrite all
ten strings, re-title S3) or keep the word and delete the §17.3 claim. And soften §16.1 to what is
true and still impressive: **no portal inbox, no Desk population, no triage card**.

---

### F15 · MEDIUM · confidence 0.80 — visit metadata is denormalized with no update path for saved captures

**Where:** package §9.3 (`visit_label`, `visit_started_at`, `visit_ended_at` as columns on
`field_captures`), §2.1 ("No `field_visits` table"), Flow 7, §11.3.

**Claim.** The no-table decision is right; its consequence is unpriced. A visit's end time and label
can never reach captures already at `status='saved'`, and the package's own idempotency table says so
without connecting the two.

**Evidence.** `00235_commit_field_capture_rpc.sql:187` — the upsert ends
`WHERE field_captures.status NOT IN ('saved', 'dismissed')`, and when skipped returns
`'created', false` without touching the row (`:190-199`). A sourcing visit routes to Library, i.e.
`status='saved'` (`:255-266`) — so **every market-run capture is immutable the moment it commits**.
Closing that visit cannot stamp `visit_ended_at` on any of them. Also unspecified: a mid-visit rename
leaves two labels for one `visit_id`, and §11.3 says "one line per `visit_id`… grouped in the hook"
with no tiebreak.

**Fix.** (a) State the label rule (latest `created_at` wins) in §11.3. (b) Derive the visit's span in
the Visits block from `min/max(created_at)` and treat `visit_ended_at` as a device-side nicety, or
(c) add one narrow `SECURITY INVOKER` update RPC — which costs the "zero new RPCs" claim and should
be priced now rather than discovered in Wave 4.

---

### F16 · MEDIUM · confidence 0.75 — nothing can play the audio for ten weeks, while the copy says it is "here"

**Where:** package §15.4 (*"We couldn't make out the words — the audio is here."*), §7.4, plan Task
14.2; playback lands in 4-4.

**Evidence.** `grep -rn "AVAudioPlayer\|AVPlayer" apps/mobile/Capture --include="*.swift"` returns
**zero hits**. There is no playback anywhere in Patina Field, and the portal play button is Wave 4
(behind §F10's flag question). From Wave 1 until Wave 4, "the audio is here" is a claim she cannot
check — on the exact surface the package is repairing *because* it made an unverifiable claim.

**Fix.** Add a play control in Wave 1 (S — the file is in the App Group; an `AVAudioPlayer` on the
N4 sheet and the tray row). A day of work that turns the honesty repair from an assertion into
something she can hear.

---

### F17 · MEDIUM · confidence 0.75 — the PostHog key ships per-machine and will silently regress

**Where:** plan Task 2 (2.2 "create the local `Secrets.swift`"), acceptance criterion 6, §1.5,
package §14 ("prerequisite zero").

**Evidence.** `Capture/App/Configuration/AppConfiguration.swift:130-132`:
```swift
public static var postHogAPIKey: String {
    Secrets.postHogAPIKey ?? ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""
}
```
The env fallback is read at **runtime**, so it only works when Xcode injects a scheme variable —
never on a device install, never on TestFlight, never in CI. `Secrets.swift` is gitignored, and
project memory records a worktree trap where a fresh pbxproj regen **drops** it. The gate therefore
passes on the one Mac that has the file and fails silently everywhere else, including the archive
Wave 0.5 exists to produce.

**Fix.** Make Task 2 deliver a build-time path: an `.xcconfig`/build-setting → `Info.plist` key, or a
CI/archive step that writes `Secrets.swift` from a secret; plus a startup log line ("analytics
disabled — no key") and an archive-time assertion. Then acceptance criterion 6 means something for a
build Leah could hold.

---

### F18 · MEDIUM · confidence 0.70 — FC-R2 overrides the designer judge silently, and the kind/kit vocabulary is redundant

**Where:** package §2.4 decision 1, §9.3, rulings FC-R2.

**Evidence.** `research/30-judge-designer-workflow.md` recommends **three kinds** — *Site visit ·
Market · Roving* — with walk-through/trade/install as kits. FC-R2 presents the options as
"two / three / five" without disclosing that the panel it cites for authority recommended three.
Separately the model names one thing twice: `visit_kind ∈ ('site','sourcing')` alongside
`visit_kit ∈ ('site','walk_through','market','trade_walk','install')` — a market run is
`kind='sourcing', kit='market'`, and `kit='site'` duplicates `kind='site'`.

**Fix.** State the override and its argument in FC-R2 (the argument — a null kind removes a code path
— is good; make it visible next to the judge's counter). Then collapse the vocabulary: either kinds
are `site`/`market` and the kit list drops both duplicates, or the kit is the only axis.

---

### F19 · MEDIUM · confidence 0.70 — the kit chip ships a wave before anything it selects exists

**Where:** package §2.3, §7.3 (V0's KIT row), plan 3-3; payoff in 4-8 (punch verb), 4-11 (install
camera), §8.7 (extraction framings, Wave 6).

**Claim.** In Wave 3 a kit changes only the C1 pill layout and the consent default. The trade-walk
kit's whole point — the shutter makes a punch item — is Wave 4; install's is Wave 4; the framings are
Wave 6. Four extra chips at every door for one real behaviour, on the screen whose cost is the entire
FC-R1 argument.

**Fix.** Ship in Wave 3 only the distinction that carries weight — the **conversation** posture
(§F9) — and defer the four-way chooser to Wave 4, when the verbs it tunes exist.

---

### F20 · MEDIUM · confidence 0.70 — M6 is the brief's literal phrase and the weakest cell, and the mitigation is a queue with no reminder

**Where:** package §4 M6, §9.4 ⚠, rulings FC-R6(a), §16.1.

**Claim.** Kody's brief is *"capturing whatever a designer needs while on the move."* Under FC-R6(a)
a roving capture never reaches the portal until she files it, and the only prompt to file is a band
she must open the app to see. That is a filing queue with no reminder, in a program whose §16.1 says
it has none.

**Evidence.** `00196_per_item_claims_and_margin_notes.sql:38-40` — a `margin_notes` row needs a
project or a proposal, so an unplaced note cannot be one. `field_captures`' only portal reader is
scan-scoped and flag-gated (`use-room-files.ts:378`). Nothing notifies.

**Fix.** (a) Name it in §16 as an accepted limitation, in the brief's own words. (b) Give it one
cheap mechanism — a local notification when the unplaced count crosses a threshold, or the Wave-5
Live Activity carrying it. (c) Attach a falsifiable kill-criterion to `capture.unplaced`, which §14
already defines.

---

### F21 · MEDIUM · confidence 0.70 — no volume design: a two-hour visit lands as N linear rows in a narrow rail

**Where:** package Flow 2 step 4, §11.3 (Visits block), §11.4, §4 M1 ("12 captures · 1 scan · 3
notes"), Flow 8 ("no card to clear").

**Claim.** The margin rail is a rail — a linear list built for the R14 five-second note. The package
sends every field note into it with no grouping, and simultaneously builds a Visits block that shows
the same material again. Nothing specifies what a project with six visits and forty notes looks like.

**Evidence.** `margin-rail.tsx:436-468` renders items as a flat list (needs-action float → anchor
order → a "Settled" fold); the note branch has no visit dimension, and §9.4's payload change adds
`field_capture_id` and `has_audio` only. §11.3's Visits block re-lists the same captures.

**Fix.** Decide the relationship before Wave 4: either field notes group under their visit in the
margin (one row per visit, expanding), or the Visits block is the only home and the margin gets only
notes she deliberately promoted. State the expected volume per project in §11 so the rail is designed
against it.

---

### F22 · MEDIUM · confidence 0.65 — mounting `RoomFilesSection` ships placeholder copy into the Document

**Where:** package §11.2, §17.4 (copy debt listed for nine **Field** files only), plan 4-5.

**Evidence.** `components/room-file/room-file-copy.ts:1-10`:
> *"⚠ ESCALATE-CLASS PLACEHOLDERS … every designer-visible string here — section titles, the
> UNVERIFIED stamp, badge legend, empty states — is a design-owned decision, not a code call …
> Treat these as provisional until that ruling lands."*

`RoomFilesSection` renders `C.sectionTitle` from that file (`:53`). Wave 4's unflagged mount puts
provisional copy on the project spread — the surface with the most rulings behind it.

**Fix.** Add `room-file-copy.ts` (and the Room File view's strings) to the brand-voice pass budgeted
in §17.4, as a Wave-4 line item beside 4-5.

---

### F23 · MEDIUM · confidence 0.65 — spec and plan disagree on the context-screen copy, and the plan's version is less true

**Where:** package §7.11 (three ESCALATE strings → **wave 3**, proposed *"…These photos and notes go
to Maple St · Living."*), plan Task 14.3 (**wave 1**, different words).

**Evidence.** Plan 14.3 proposes *"Photos and notes you take here stay with this scan session."*
They do not stay: `SiteScanContextCapture.swift:135-142` enqueues them through the outbox to
`field_captures`, pinned to the scan by provenance and readable in the Room File. "Stay with this
scan session" reads as *they do not leave this phone*. The spec's version cannot ship in Wave 1
either — there is no visit, so there is no "Maple St · Living" to name. Neither touches the two
success toasts on the same screen (`:86`, `:141`) that say "added to Inbox" (§F14).

**Fix.** Assign the copy to one wave, write a Wave-1-safe version (*"These photos and notes reach the
studio as soon as you have signal — they're notes, not a scan."*), and rewrite both toasts in the
same commit.

---

### F24 · MEDIUM · confidence 0.60 — tap counts are best-case and exclude the confirming taps

**Where:** package §6 Flow 1 (≤3 taps), Flow 5 ("3 taps + 1 hold"), Flow 2 (2 taps + 1 hold), §4's
"After wave 4" column.

**Evidence.** Flow 5's own steps are ⋯ → *Make it a punch item* → confirm the court → **Add** = four
taps plus the hold. Flow 1 is 3 taps *"(Optional: tap a kit)"* = 4 whenever a kit is used, which §2.3
treats as normal for walk-throughs, trade walks and install days. Flow 2's 2 taps assume the card's
Save is reachable without the placement detour of §F3.

**Fix.** Publish the counts with optional steps included, or label them "best case, project already
answered". Since Field has never emitted an event, these are the program's only stated targets — they
should be the pessimistic ones.

---

### F25 · MEDIUM · confidence 0.60 — a mis-placed capture can never be un-placed from the device

**Where:** package §9.2(c) — the proposed inbox branch uses
`project_id = COALESCE(p_project_id, project_id)`.

**Claim.** COALESCE cannot distinguish "not supplied" from "explicitly cleared", so once a capture
carries a project no device act can remove it. S1 — renamed *"Correct this capture"* (§7.6) — cannot
perform the correction it is named for, and a capture stamped by the wrong visit (the package's own
R3-1, *"a wrong visit is a **systematic** error"*) is uncorrectable from the phone.

**Fix.** Add an explicit clear (a `p_clear_routing boolean`, or a sentinel), or state the limitation
in §9.2 and name the portal surface that un-places — there is none today
(`route_field_capture`/`dismiss_field_capture` have zero web callers).

---

### F26 · MEDIUM · confidence 0.60 — three strings break Patina's register

**Where:** package §7.4 (the C6 mock), §15.4, §7.6. Checked against
`.agents/skills/patina-brand-voice/SKILL.md` ("Technology is the silent enabler… Outcomes first";
"plain-spoken Midwest"; "understatement over exclamation").

| String | Problem | Suggested |
|---|---|---|
| `2:14 · seg 3` (C6 chrome) | "seg 3" is implementation showing through. She has no model for segments and no action to take. | Show elapsed only; keep the segment count in telemetry, where §14 already has it. |
| *"note ended at 20:00"* (§7.4 cap) | Reads as a clock time (8 pm), and is lowercase mid-sentence. | *"This note reached twenty minutes and stopped. Start another when you're ready."* |
| *"Route this capture" → "Correct this capture"* (§7.6) | Implies she made a mistake; the screen is where placement *happens*. | *"Where this belongs."* |

Two strings are excellent and should survive the brand-voice pass verbatim: *"We couldn't make out
the words — the audio is here."* and *"12 projects on this phone. Others need signal."*

---

### F27 · MEDIUM · confidence 0.65 — Wave 1's headline defect is only reachable inside a scan session

**Where:** package §1 defect 1, §4 M2, plan §1 "What a designer feels" item 1.

**Claim.** The silent discard is real, but it lives on the in-scan context capture — so "she holds
the mic on a loud job site and the recording is still there" requires her to be running a LiDAR scan
(or on the non-Pro reference screen). The two other voice paths fail differently and Wave 1 fixes
neither.

**Evidence.** The gate is `SiteScanContextCapture.swift:129`, inside `stopVoice()` on the
`SiteScanContextModel` (reached from the F2 scan overlay and the non-Pro context screen). It also
falls back to `partialTranscript` first (`:128`), so the discard needs both to be empty. N4's failure
is different and unaddressed (§F6); C6 does not exist until Wave 3.

**Fix.** Either extend the Wave-1 repair to N4 and the tray (§F6) — which is the honest reading of
§15.4's ladder — or narrow the package's framing so it does not describe a moment Wave 1 does not
reach.

---

### F28 · MEDIUM · confidence 0.60 — no local-audio lifecycle: the App Group grows without bound

**Where:** package §8.2 (240 KB/min), §8.4 (storage), §15.2(5) (server retention), rulings FC-R13;
nothing anywhere covers the phone.

**Evidence.** `grep -rn "removeItem" apps/mobile/Capture --include="*.swift"` finds deletions only in
`SiteScanBundleHome.swift` (scan bundles). Capture media is written by
`CaptureStore.writeMedia(_:filename:)` and never pruned; `LocalCaptureSyncService.uploadMedia` does
not clear local files after a successful commit; `VoiceNoteSheet.discard()` (`:194-199`) abandons a
recorded segment with no delete. At 240 KB/min a single 30-minute walk-through is ~7 MB, and a
market day of photos already accumulates.

**Fix.** Add a device-side retention rule to Wave 1 (delete a segment once its commit receipt lands,
delete on Discard, and a size-capped sweep), and add a line to FC-R13: retention is two policies —
the server's and the phone's.

---

### F29 · MEDIUM · confidence 0.60 — three brief-relevant moments vanish without being refused

**Where:** package §4 (M1–M7), §16 (non-goals).

`[G1]` mapped nine moments; the package's table carries seven, dropping **M8** (a finish/sample —
where does it land) and **M9** (reading the current plan or spec on site, which `[G1]` scored an
outright FAIL and `[D6]` §C10 names Programa's QR-to-spec pattern for). And the client
walk-through's real output — a preference or a selection reaching Discovery or the brief — has no
destination in any wave: Field never touches `discovery` and decisions are read-only by design.

Half the value of a direction is the work it refuses (§16's own words) — but only refusals that are
*written down* count.

**Fix.** Add to §16: no plan/spec viewer on the phone; no path from Field to `discovery`/the brief;
no finish-as-first-class-object. If any is intended later, name the wave.

---

### F30 · MEDIUM · confidence 0.60 — Wave 6 bundles a cheap deterministic win with a speculative one, behind a gate whose answer is already known

**Where:** package §1 (*"Wave 6 … deliberately not scheduled"*), §8.6 (server transcription), §8.7
(structuring), §8.9 (cost), plan §6 ("The gate — two numbers").

**Claim.** Kody's brief asks for *"voice notes with transcription"*. Server transcription is
deterministic, costs **$1.15/mo** at pilot volume, has an exact in-repo precedent
(`derive-scan-photo-media`), and is what makes a twenty-minute walk-through note usable. Structuring
is the speculative half. The package gates them together on "measured device-transcript quality" —
but §8.2 *specifies* the device transcript as lossy at every 50-second boundary, so the gate's answer
is knowable in advance.

**Fix.** Split Wave 6. Schedule **transcription** with Wave 4 (it is the brief's literal ask, and it
makes the margin note readable — see §F12), and keep **structuring** evidence-gated exactly as
written. Also reconcile the mechanism with Phase 3 first (§F2).

---

### F31 · LOW · confidence 0.65 — `margin_notes`' engagement constraint is an OR, not an XOR

**Where:** package §9.4 ⚠, rulings FC-R6, and the judge reports.

**Evidence.** `00196_per_item_claims_and_margin_notes.sql:38-40`:
```sql
constraint chk_margin_notes_engagement
  check (project_id is not null or proposal_id is not null)
```
Inclusive OR. The conclusion (an unplaced note cannot be a margin note) is unchanged, but three
documents now assert an XOR and someone will design against it.

**Fix.** Correct the wording in the spec and the ruling.

---

### F32 · LOW · confidence 0.55 — the headline estimate does not reconcile with the plan

**Where:** package §1 ("≈13–15 engineer-weeks across waves 1–4"); plan §1 (≤2) + §2 (≈1) + §3 (≈5) +
§4 (≈4) = **12**, plus Wave 0.5 (M, unpriced).

**Fix.** Say the 13–15 includes Wave 0.5 and slack, or restate as "≈12 engineer-weeks of build plus
distribution". Kody will do this arithmetic.

---

### F33 · LOW · confidence 0.55 — the Today mock omits the affordance that makes FC-R1 survivable

**Where:** package §5.2's wireframe, FC-R1.

**Evidence.** `WorkDashboardScreen.swift:88-101, 119-130` already renders a `cameraRealmButton`
("Camera", `coordinator.switchRealm(.camera)`) in the header, in both the standard and
accessibility-size layouts. Even with no visit open the camera is **one tap** from Today — the single
strongest argument for FC-R1(a), and the mock does not show it.

**Fix.** Put the existing Camera control in the §5.2 wireframe and cite it in FC-R1's default.

---

### F34 · LOW · confidence 0.50 — "Visits" and "Site visit" will name the same event twice

**Where:** package §11.3, Flow 7, FC-R3.

**Evidence.** `00198:28-29` admits `activity='site_visit'`; `time-derivation.ts:16` labels it
**"Site visit"**. One close act writes a **Visits** row on the project spread and a **Site visit**
row in the Hours ledger — two names for one thing in one page family.

**Fix.** Name the relationship in FC-R3 ("the Visits block is the record; the Hours entry is its
billing shadow"), and consider linking the rows.

---

### F35 · LOW · confidence 0.50 — the "kill switch" gates nothing

**Where:** package §11.6 (*"Wave 1 adds `isFeatureEnabled` to the seam (fail-closed) so a kill switch
exists"*), plan 1-3, Task 3.

The seam is right and cheap, but §16 and every wave say "no flag", so nothing in waves 1–5 is gated
by it — a kill switch wired to no circuit.

**Fix.** Gate the recorder behind it (§F9). That gives the seam a real first consumer, the consent
ruling an off-switch that needs no build, and Task 3 a device-pass step.

---

### F36 · LOW · confidence 0.50 — Wave 1 edits frozen contracts before the wave-2 foundation commit that exists for exactly that

**Where:** package §5.5 (*"One commit, one named owner, at the top of wave 2"*), §17.1 (frozen wire
contracts kept untouched), plan Tasks 6.3–6.6, 8.6.

Wave 1 changes `FieldCapturePayload.Voice` (a contract §17.1 lists as frozen), `Specimen`'s SwiftData
shape, `VoiceNoteResult` and `ContextCaptureService`'s signature — all before the wave-2 commit whose
purpose is to touch frozen seams once, with a named owner. The changes are additive and defensible;
the process claim is not.

**Fix.** Either move the wire/schema edits into the foundation commit, or amend §5.5 to say the
freeze covers navigation/DI/Live-Activity seams and that additive wire keys are exempt.

---

### F37 · LOW · confidence 0.50 — a Field punch names a court with no person, while the working field loop is party-anchored

**Where:** package Flow 5's payload (`court: 'gc'`, no `court_party_id`), §17.1 (the SMS rail kept).

**Evidence.** `client_decisions.court` admits the field kinds (`00281:167-171`) and the coordination
composer resolves a `courtPartyId` from `project_parties`; the SMS rail — the product's only complete
field→structure loop — is anchored on `party_id` (`apply_field_effect`, 00282). Field already reads
`project_parties` (`SupabaseSiteRequestService.swift:44`), so a picker is cheap.

**Fix.** Either carry `court_party_id` (one picker, one existing query) or state in Flow 5 that a
Field punch is court-level only and the party is attached at the desk.

---

### F38 · LOW · confidence 0.50 — unioning designer-owned scans changes a client-provenance instrument without a ruling

**Where:** package §11.2 second bullet, plan 4-5.

`useClientScans` (`letterhead-instruments.tsx:84-95`) filters `room_scans.user_id =
clientProfileId`, and `useClientRoomScans` (`use-room-scans.ts:185-214`) filters
`user_id = designer_clients.client_id`. Both are *client-provenance* instruments — "what your client
sent you" — inside the handoff-pipeline narrative. Unioning designer-owned scans is probably right,
but it changes what the instrument means and is proposed as a "two one-hook change".

**Fix.** Make it a named ruling (or a line in FC-R10), and keep the provenance visible in the row
("yours" vs "from your client").

---

### F39 · LOW · confidence 0.50 — Wave 1's title over-promises the half that is not there

**Where:** plan §1 title (*"The note survives, **and it lands somewhere**"*), package §1.

Of fifteen Wave-1 packages, three are perceptible to a designer (audio survival, the offline banner +
auto-drain, the placement line — the last being §F3). "Lands somewhere" is true only server-side: no
portal surface reads a `field_captures` row outside the flag-gated scan-scoped list, so after Wave 1
nothing she captured looks any different in the Document.

**Fix.** Retitle *"The note survives"*, and state in the wave goal that portal visibility begins in
Wave 4 (or Wave 1P, §F11). The package is otherwise scrupulous about this kind of honesty.

---

### F40 · LOW · confidence 0.50 — the device pass has a step a walker cannot perform

**Where:** plan §1 "Device pass" step 6 — *"confirm all three rows server-side carry `project_id` and
`project_room_id`"*, and Task 15.4.

Mid-walk, on a phone, with no stated tool. Every other step is observable on the device.

**Fix.** Name the mechanism (a `psql` one-liner or a Studio filter) and move it into a post-walk
verification block.

---

### F41 · LOW · confidence 0.50 — a stored confidence number invites a rendered confidence number

**Where:** package §9.3 (`suggestion_confidence numeric(3,2)`) vs Principle 4 ("never a confidence
number") and §2.2 ("the basis is always shown **in words**").

Storing it for ordering is fine; nothing in the spec forbids the next surface from rendering it.

**Fix.** One line in §9.3: *this column orders suggestions and is never rendered.*

---

### F42 · LOW · confidence 0.45 — Wave 1's migration adds columns nothing writes, one of which asserts a policy

**Where:** package §9.2(a).

`note_setting` (UI in Wave 3), `transcript_edited_at` (Wave 6), `capture_kind`'s `'note'`/`'context'`
values (no Wave-1 writer — C6 is Wave 3), and `audio_retention` (purge in Wave 6). Forward-declaring
the lane is defensible; `audio_retention` is not, because it states a 90-day policy nothing
implements (§F9).

**Fix.** Keep the lane; default `audio_retention` to `'keep'` until the purge exists, or ship the
purge with Wave 1.

---

## Rulings review (as Kody)

| # | Recommended default | Verdict |
|---|---|---|
| FC-R17 | Reserve 00521–00526 | **Wrong band** — 00521 is taken (§F1). Right instinct, restate. |
| FC-R14 | TestFlight = yes | **Right**, and it is the single highest-leverage yes in the set. Pair it with §F17 or the key never reaches a TestFlight build. |
| FC-R1 | Today is home, with the launch table | **Right**, and cheaper than it reads — the Camera control already sits in W1's header (§F33). |
| FC-R2 | Two kinds + four kits | **Under-argued** — the designer judge said three, and the two axes overlap (§F18). Kits should follow their verbs (§F19). |
| FC-R3 | Today / a visit / Visits / unplaced | **Fine**; add the Visits ↔ Site-visit relationship (§F34). |
| FC-R5 | Merge rooms by trimmed name, never cross-assign | **Right**, and the best cost/benefit in the package. |
| FC-R6 | An unplaced note waits on Today | **Right shape, missing mechanism** (§F20). |
| FC-R11 | Kit-defaulted consent + lawyer's read | **Right answer, wrong wave** — it must block Wave 1 (§F9). |
| FC-R4 | Device writes `margin_notes` / `create_client_decision` directly | **Right**, and well-argued from *who is speaking*. But it needs §F12 (the 80-char truncation) or the note it writes is unreadable. |
| FC-R7 | `'draft'` | **Wrong as stated** — it lands in a Drafts fold (§F4) and re-raises at publish (§F5). Re-decide with those two facts on the table. |
| FC-R8 | Per-designer in v1 | **Right**, sequenced first, correctly priced. |
| FC-R10 | Unflagged portal changes | **Right about the new flag, silent about the existing one** (§F10). |
| FC-R15 | Punch photo back-references the capture row | **Right**, and honest that a project-general media table is still owed. |
| FC-R9 | No background audio in v1 | **Right** — and §F8 matters more: fix the gesture before fixing the background mode. |
| FC-R12 | Nothing auto-applies | **Right for this program, but no longer this program's ruling** — Phase 3 already auto-applies to the same table (§F2). Rule the family. |
| FC-R13 | 90-day audio retention | **Right server-side; incomplete** — nothing purges the phone (§F28), and nothing purges the server until Wave 6 (§F9). |
| FC-R16 | A spoken measurement is never a measured record | **Right**, well-grounded in R108.1 + R114.1, and the named re-open trigger is handled correctly. |

**Two rulings that are missing.**
- **Does Field Companion own `field_captures` enrichment, or share it with Phase 3?** (§F2) — this
  sequences ahead of FC-R8, because it decides whether Wave 6 exists in the shape written.
- **What is the phone's own retention policy for capture media?** (§F28).

---

## What is right, and should not be re-litigated

- **A field note is a note.** One nullable `margin_notes.field_capture_id`, no new margin kind. Both
  judges were right; this is the best judgement in the package.
- **No `field_visits` table.** The column-and-group-by shape is correct (its unpriced consequence is
  §F15, not the decision).
- **No new `status` value.** The catch that `field_captures_org_inbox_select` keys on
  `status='inbox'` (`00233:174-188`), so a terminal status silently revokes studio read, is a real
  defect caught in another direction. Keep it.
- **The suggested/confirmed split enforced in the schema**, with the basis in words.
- **Voice first, before any IA change.** Correct sequencing, correctly argued, and it repairs a live
  honesty violation — even though the repair as scoped is incomplete (§F6, §F27).
- **Surfacing `create_client_decision`'s real gates** (`designer_client_id`, `_can_author_proposal`,
  the registered-client raise) — genuinely under-reported everywhere else. The default is wrong; the
  finding is right.
- **FC-R5, FC-R8, FC-R16** as recommended.
- **The refusal to add a third dark portal flag** — §F10 makes it incomplete, not wrong.

---

*Read-only review. The only repository file written is this report.*
