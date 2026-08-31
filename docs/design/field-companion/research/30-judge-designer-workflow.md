# J1 — Judge panel: the DESIGNER-WORKFLOW lens

**Program:** Patina Field → a true field companion to the designer portal's project flow
**Date:** 2026-08-24 · **Agent:** Judge (designer-workflow lens) · **Mode:** read-only
**Lens:** judged as **Leah** (working interior designer, mobile, one-handed, busy) *and* as
the **portal product owner** (does field information land where the project flow needs it,
without re-entry, without growing the Document's surface area, in Patina's voice).

**Inputs read in full:** `[D1]`–`[D7]` (`01`–`07`), `[G1]` `10-gap-analysis.md`,
`[T1]` `11-tech-architecture.md`, and all three directions (`20-direction-A/B/C.md`).

**Method:** I re-verified in the repo every claim that discriminates between the three
directions — i.e. every claim a direction uses to argue it is cheaper, safer, or more
grounded than its rivals. Verifications are marked **[J-verified]** with file:line. I did
not re-verify claims all three share.

---

## 0 · What I verified this session

Five checks, because each one moves a score.

### 0.1 `makeDraft` drops the room — **[J-verified], and it is a real bug**

Direction A (§0.3) and Direction C (verification 3) both found this; no discovery report
did. Confirmed at `apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift`:

```
venue.projectId   = context.routing.projectID
venue.projectName = context.routing.projectName
venue.room        = context.routing.room
venue.shelf       = context.routing.shelf
                        ← venue.projectRoomId is never assigned
```

`CaptureRoutingMemory.projectRoomID` is write-only. **Every capture after the first
inherits the project and silently loses the FF&E room**, even inside a session where the
designer already answered the room question. This is a two-line fix and it is a hard
prerequisite for *any* direction that promises room-level landing — including B's, whose
Pin carries a room. It belongs in wave 0 of whatever wins.

### 0.2 Field can already write real work — **[J-verified], and this is the most consequential finding in the judging set**

Direction A's §0.4 is the claim that most changes the shape of the program, so I checked
all three grants:

| Target | Grant | Verified at |
|---|---|---|
| `margin_notes` | `for all to authenticated using (designer_id = auth.uid()) with check (…)` | `00196_per_item_claims_and_margin_notes.sql:51-54` |
| `create_client_decision` (punch / RFI) | `REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated` | `00415_decision_selection_and_template_privacy.sql:1091-1096` (latest redefinition) |
| `project_tasks` | `FOR ALL USING (… p.designer_id = auth.uid())` — **designer-of-record only** | `00169_project_documents_and_tasks.sql:61-62` |

So A is right: `apply_field_effect`'s party-anchor + service-role wall (`00282:472`) is a
real wall for a texting GC and **was never the wall for Leah's own phone.** She is
`auth.uid()`. **A spoken note can become a real margin note and a real punch item with no
LLM, no edge function, no cron, no `field_note_drafts` table and no agent-queue kind.**

That single fact demotes `[T1]`'s entire server pipeline from *foundation* to *optional
enrichment*, and it is why A can ship the program's stated goal with a two-migration
server footprint while B and C cannot.

**Two constraints A does not name, and both bite.** `create_client_decision` also requires
a `designer_clients` relationship id in the payload *and*, for `status='pending'`, a
registered client user (`00413_configuration_com_and_decision_selection.sql:1850-1861`):

```
SELECT * INTO v_relationship FROM public.designer_clients
WHERE id = NULLIF(p_payload->>'designer_client_id','')::uuid FOR SHARE;
IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN … END IF;
IF v_status = 'pending' AND v_relationship.client_id IS NULL THEN
  RAISE EXCEPTION 'pending decisions require a registered client recipient'; END IF;
```

A punch item raised on a project whose homeowner has never signed into the client portal
will fail. See concern #2.

### 0.3 One project fetch already carries both room concepts — **[J-verified]**

`CaptureKit/CaptureKit/Work/ProjectsService.swift` — `FieldProjectDetail` returns
`specRooms: [FieldProjectRoom]` ("Project-scoped FF&E rooms (`project_rooms`), used by
spec placement") **and** `rooms: [FieldProjectRoom]` ("Client-owned physical rooms
(`rooms`), used by site scanning") from one `projectDetail(id:)` call.

A's §0.2 is correct: the three-way room collision that `[G1] §2.0 pt 4` calls a blocking
schema ruling is, on the device, a **matching rule** — a merged picker can stamp whichever
id is legal per lane. This is the only proposal in the set that unblocks a unified "put
this in this room" affordance **without** a schema ruling first. B (§7.4) and C (§7.5)
both resolve the collision by *picking one and deferring the other*, which is safe but
leaves the scan lane and the FF&E lane permanently unreconciled.

### 0.4 The offline project cache is a genuine L, for all three — **[J-verified]**

`CaptureProjectRef` (`CaptureKit/Domain/Specimen.swift:224-244`) is a five-field stub:
`id · remoteId · name · createdAt · ownerUserID · ownerWorkspaceID`. No rooms, no
FF&E, no coordinates. And S1's offline degrade is exactly as reported — two identical
strings, *"Project rooms are unavailable offline. This capture can still go to Library or
Inbox."* (`S1AssignVenueScreen.swift:306,333`).

All three directions need this cache built (A §1.5/1-3, B §2.5.4, C §2.6). **It is not an
A-specific cost** — but A leans on it hardest, because A's door *must* work offline, while
B's pin is optional and C pre-caches at visit start when she usually still has signal.

### 0.5 Two smaller confirmations

- `V1SessionTrayScreen.swift:125-126` — *"Route all N"* really does
  `if let first = items.first { coordinator.present(.assignVenue(first.id)) }`. You can
  bulk-park, you cannot bulk-place. Confirmed.
- `project_time_entries.activity` really admits `'site_visit'`
  (`00198_time_entry_source_activity.sql:28-29`). C's time-entry-at-close idea rides an
  existing vocabulary, not a new one.

---

## 1 · Scores

Five dimensions, 1–10, `total` = sum (max 50).
`effort_to_first_value`: 10 = fastest. `risk`: 10 = lowest risk.

| Direction | workflow_fit | speed_on_the_move | feasibility_repo_fit | effort_to_first_value | risk | **total** |
|---|---|---|---|---|---|---|
| **A — The Project Spine** | 8 | 9 | 9 | 7 | 7 | **40** |
| **B — Capture first, file later** | 6 | 8 | 7 | 8 | 6 | **35** |
| **C — Moments as modes** | 9 | 7 | 6 | 5 | 5 | **32** |

---

## 2 · Rationale

### Direction A — The Project Spine · **40**

**workflow_fit 8.** A's diagnosis is right and it is the right *order*: on a site visit
"which project?" changes once, at the door; "what is this?" changes twenty times an hour.
Today the app asks the cheap question repeatedly and the expensive one never. Asking it
once, standing still, with both hands free, is how a designer actually arrives somewhere.

As the **portal product owner** this is the strongest of the three by a distance, and for
a reason the other two miss: **A is the only direction that does not grow the Document's
surface area.** No inbox. No triage queue. No Desk population. No new `NeedKind`, no
`document_state` column, no new room/ledger/verb in `lib/document/registry.tsx`, no third
"Capture Inbox" (I84), no new portal flag. Field material appears in the surfaces Leah
already reads — the margin, the FF&E line, the Room-files block, the Library shelf. The
portal's last year of rulings has been about *shrinking* surface (R21's dissolve, R95's
"no dashboards on the Desk", R94's "notes recede"); A is the only direction that runs with
that grain instead of across it.

A's §6.3 is the best single design judgement in all three documents: it **refuses** the
`field_note` margin kind that both `[D3] §10 rec 5` and `[T1] §2.5` propose, on the
grounds that *a field note is a note* — same author, same studio-privacy, same escalation
ladder, same aged-oak lane — and that giving it its own kind builds a field ghetto in the
margin and tells Leah that what she said on site is a different species from what she
typed at her desk. Instead: one nullable `margin_notes.field_capture_id` column and two
extra facts in the existing `note` branch's payload. That is exactly the house voice, and
it inherits `useEscalateNoteToDecision` / `useEscalateNoteToScopeChange` for free.

Two real deductions. **(a) The identity inversion.** `apps/mobile/Capture/README.md` opens
*"Patina Field is a standalone camera-first iOS app"*; A makes the day the home and the
camera the mid-visit landing. Leah's reflex on a site is *phone out, shoot* — and the
first launch of the day now lands on a list. A's §2.1 launch table (mid-visit launches go
straight to C1) is a good mitigation and A names the cost honestly as ruling A-01, but it
is a binary product decision, not an implementation detail. **(b) The roving hole.** A's
own R-A10 concedes `margin_notes` requires `project_id XOR proposal_id`
(`chk_margin_notes_engagement`), so the drive-home thought — M6, the purest "companion"
moment in Kody's brief and the one the phrase *"whatever a designer needs while on the
move"* most points at — cannot be a margin note. A tolerates one queue ("Today") and calls
it the one it tolerates; that is an admission the spine leaks at exactly the moment the
brief cares most about.

**speed_on_the_move 9.** Flow 2 is **2 taps + 1 hold, offline, with project *and* room
attached**, against today's ≈7 taps + a hold and no project. The derivation is honest, not
aspirational: the C3 inline mic removes the C5→N4→attach→C5 detour (5 taps), and skipping
S3 is already the code's own branch (`saveFromCard()`'s `destination == .undecided`
guard). Flow 6 preserves the founding market economy at 1 tap per specimen, 2 to tag.
Flow 3 gives walk-and-talk a real home as a fifth `CameraMode`, which `ContextCaptureService`
already proves is committable. The cost is 3 taps and ~8 s at every door; on a four-stop
day that is four doors, and if she skips one she is in unfiled-roving.

**feasibility_repo_fit 9 — the highest score I gave anything.** A's server footprint for
waves 0–4 is *one* `CREATE OR REPLACE FUNCTION` and two additive migrations. No edge
function, no cron, no `agent_tasks` kind, no new table, no new RPC. In a repo whose prod
ledger has a hole at 00512 (parked, unapplied, on a branch carrying a known live defect)
and whose SQL suite is 71/108 red, that restraint is worth a great deal. It ships the
portal changes **unflagged** with a sound argument — every change renders nothing unless a
Field build wrote the data — which is the only answer in the set to G-22 (`room-file` and
`call-sheet` are already fail-closed; a third dark flag makes the work unwalkable, and
MEMORY.md records at least four flags no human has ever seen). And its two distinctive
findings (§0.2, §0.4 above) are both **[J-verified]** and both load-bearing: they are what
let A defer the entire T1 pipeline behind an evidence gate rather than build it first.

Against: the offline project+room cache is L-sized with no precedent (§0.4 above), it
edits four frozen seams, and A misses the `designer_clients` / registered-client
constraints on `create_client_decision` (§0.2, concern #2).

**effort_to_first_value 7.** W0 ≈1.5 + W1 ≈5–6 ⇒ ~7 weeks to the thesis, and W1 delivers
project + room landing + portal visibility with **zero voice work and zero server work**.
Total 16–20 weeks for waves 0–4 — the lowest committed total of the three, with the LLM
wave deliberately unscheduled rather than promised. The deduction is a sequencing mistake:
**the voice audio writer sits in wave 2.** The single most defensible fix in the entire
program — a note that transcribes to nothing on a noisy site is discarded with the toast
"Nothing recorded", a live violation of a law ruled four separate ways — waits behind an
L-sized offline cache. B puts it in wave 1 and B is right (see §4).

**risk 7.** Two sharp risks, both A's own: ruling A-01 is binary and kills the premise if
it goes the wrong way; and a wrong visit is a **systematic** error — yesterday's visit
silently stamping today's twenty captures is worse than today's twenty unattached ones
(R-A3). A's mitigations (>30-min confirm, 12-h auto-end, never cross a calendar day,
INVARIANT V) are proportionate, and B's suggested/confirmed split would make them better
still (§3). Offsetting all of it: A has the smallest blast radius in the set — no LLM, no
server pipeline, no new tables in the shipping waves, no new Desk population, no new flag
— and it is overwhelmingly bug-fixes and wiring, which makes it the cheapest thing to
reverse if Leah Session 05 says the wedge is elsewhere.

---

### Direction B — "Capture first, file later" · **35**

**workflow_fit 6.** B is right about one true thing the other two soften: **at High Point
she does not yet know which project a chair is for.** That is the whole point of sourcing,
and forcing a destination at capture time either produces a wrong answer or a stopped
designer. B also lands the sharpest observation in the set — today's product *already*
defaults to "file later," dishonestly, because the hardcoded `applySmartGuess` literal
makes `hasUnconfirmedGuess` always true and therefore makes S3 recommend Inbox for
literally every capture ever taken.

But as the portal product owner, **B builds the exact thing the Document spent a year
removing.** A durable Tray, a Desk population above the fold, a new registry room, a new
flag, a "filing debt" line. B's own R-1 names the landfill as "the direction's single
biggest failure mode and the honest counter-argument to it," and its kill-criterion —
*"if median time-to-file exceeds 7 days after 60 days of real use, this direction has
failed"* — is a design that admits it might not work and cannot be falsified for two
months, on an analytics channel that has never carried a single byte.

The deeper problem is persona. B's F5 and its ruling B-05 lean on *"the designer **or an
assistant** files items."* Leah is the standing pilot subject and, per `[D4] §3`, a working
solo designer whose device pilot has not been confirmed to have happened at all. **B is
designed for a studio Leah does not yet have.** And filing 30 items later is homework;
designers do not do homework, which B concedes in R-2.

What is genuinely excellent and belongs in whatever ships: the **suggested/confirmed split
enforced in the schema** (`suggested_project_id` ≠ `project_id`; nothing reads `suggested_*`
as truth; the basis always shown in words) and the **learned centroid** — remember the
coordinate of every *filed* capture against its project in the local cache, and let
proximity suggest next time. No geocoding, no `projects` schema change, offline,
improves with use, and *explainable* ("you filed 9 captures to Maple St from right here").
That is Designer-Taught Intelligence in the literal sense, and it needs no Always-location
and no App Review conversation.

**speed_on_the_move 8.** B has the **fastest shutter in the set**: 1 tap, ~1.5 s, thumbnail
flies to the tray handle, the viewfinder stays live, nothing opens. For a market run or a
trade walk where you are shooting fifteen defects in a row, that is exactly right, and
B's hold-the-mic voice entry (no specimen round-trip) is the cleanest of the three. But
the *work per capture* is not lower — it is deferred, and the deferred half is the
expensive half. A site visit with twelve captures across three rooms costs B twelve taps
plus a filing pass where room assignment is per-item (the Pin carries one room at a time);
A and C cost three door taps plus twelve × two, all room-correct at the moment of capture.
B is fastest at the shutter and slowest at the truth.

**feasibility_repo_fit 7.** B is the most "connect what was already built and left
unconnected" of the three, and that is a real virtue: `route_field_capture` /
`dismiss_field_capture` shipped in 00235 with zero web callers; `routeAll` is tested and
wired only to cull-to-inbox; `SmsReviewCard` is a byte-for-byte template for the Desk card;
`V1SessionTrayScreen`'s `groups` widens from visit-scope to unfiled-scope; and the App
Group already exists explicitly *"so the Share and Widget extensions read/write the same
DB"*, so B's share-extension path is half-built.

Against: B needs a **new RPC** (`file_field_capture` — correctly identified, since
`route_field_capture` always mints a product), a **new value on a shipped `status` CHECK**
on a table with a shipped device writer, and — if B-04 says yes — a **new union view**
across two tables with two different RLS models. And B's assistant premise forces **B-05
to be answered "per-studio,"** which drags in the `supabase_storage_admin`-owned
`capture-media` object policy: a **platform-admin phase migration**, not an ordinary one.
B is the only direction where that migration is required rather than conditional, and it
flags it without pricing it. B also carries the largest portal footprint of the three
(new hook family, new card, new Desk population, new registry room, new flag) in the
surface with the most rulings.

**effort_to_first_value 8 — the best of the three.** W0+W1 ≈ 6 engineer-weeks to the
headline, **and W1.1 is the voice audio fix.** B is the only direction that lands the
honesty repair in wave 1, and that is the right instinct: it is one file, the entire
downstream chain is built and dead-waiting, and it is walkable on a device with no schema
and no portal work. The deduction is that W1.3 (the Tray rebuild) is L-sized and is
precisely the package whose value is unproven.

**risk 6.** Three compounding: the landfill (unmeasurable for 60 days, on a dead channel);
the assistant premise the persona does not support; and the largest new-surface footprint
in a repo that wants less surface. Partially offset by the best wrong-record mitigation in
the set — B's honesty contract is enforced in the schema, not in the UI, which is strictly
stronger than A's or C's.

---

### Direction C — "Moments as modes" · **32**

**workflow_fit 9 — the highest of the three, and deservedly.** C reads the designer's day
correctly: *"Her calendar says '10:00 Maple St walk-through,' not 'capture 14 photos.'"*
And it grounds that in the product's own data model — `project_time_entries.activity ∈
design | sourcing | client | site_visit | admin` **[J-verified]** — so the argument is
that the phone is the only surface that does not already know a designer's time comes in
named blocks. C is also the only direction that maps Kody's brief's moments one-for-one
(site visits, client walk-throughs, markets/showrooms, trade/install days).

**The kit is the best idea produced by any of the three.** "The mode decides what is one
tap away" — on a trade walk the shutter makes a punch item; on a walk-through the big
affordance is the microphone, not the shutter — is the most designer-true insight in the
set, and it is grounded: `SiteScanContextControls`' shipped pill row is the prototype.
F5's "hold the shutter → photo + immediate voice, one gesture" is the best single-gesture
design anyone wrote.

Three more that are genuinely C's: **mode-conditioned extraction** (§5.3 — an open-ended
extractor over *"the return on the left casing is proud"* produces a note; the trade-walk
extractor produces a punch item in the GC's court; same model, same cost, materially
better landing); **mode-conditioned consent** (§5.5 — walk-through defaults
`note_setting='conversation'` and arms the affirmation chip), which is the only place in
any direction where the design buys an *ethical* improvement rather than just fewer taps,
and the cheapest real answer to the one ruling with legal exposure; and **the close as
output** — the Visit Page answers `[G1]`'s O6 ("a shareable site-visit artifact without
retyping"), which G1 scored an outright FAIL and which neither A nor B addresses.

Deductions as Leah: **five modes is a form at the door.** MO1's wireframe is a five-wide
kind row plus a suggestion block plus a room row plus a primary and a secondary — a lot of
screen before a single photo, every time she arrives anywhere. And **the payoff is
back-loaded**: the mode's value is the close, the close's value is the generated output,
and the generated output is W3. If she does not close, starting a mode bought her nothing
extra. C's own R-C2 mitigation ends *"if telemetry shows closes lagging starts, the close
must become passive"* — which is Direction B.

**speed_on_the_move 7.** F2 matches A at 2 taps + 1 hold with room attached (same
derivation: C3 mic pill + S3 skip). F3's Action-Button-into-already-recording is the best
walk-through entry in the set — but it is W5. Against that: the door is more expensive than
A's (five kinds, then place, then room) and the close is a *second* ritual — MO3 is a full
screen with a narrative, a capture grid and a proposals list. C's day-total interaction
cost is the highest of the three.

**feasibility_repo_fit 6.** C is honest about its seams and its verification set is
accurate (I confirmed the `makeDraft` omission and the `site_visit` activity value). Its
sharpest observation is one nobody else made: `CaptureSyncAttributes` is stamped **FROZEN**
but *nothing renders it*, so the freeze currently protects nothing and **right now is the
only cheap moment in the product's life to change its shape.** That is true and should be
acted on regardless of which direction wins.

But C is by far the biggest build. `field_visits` is a new table with its own RLS and its
own lifecycle; `close_field_visit` is a new `SECURITY DEFINER` RPC; `field_visit.summarize`
is a second agent-queue kind; the whole `[T1]` pipeline (00514–00518, two edge functions,
two crons, `field_note_drafts`, the confirm/dismiss/stage RPC trio) is adopted wholesale;
plus a Visit Page block, a margin branch, a Desk population, a registry entry, a flag,
five kits, and MO1/MO3/MO4/MO5 + C6.

And the `field_visits` table is a **second state machine that must be kept in sync with the
device's** — precisely what `docs/field-site-requests/p1-contract.md` rules against
("There is no… second mobile persistence stack"). A explicitly refuses a visits table for
this reason ("giving it a server table would mean a second lifecycle to keep in sync for
no read the portal actually needs") and I think A has the better of that argument: the
Visit Page can group by a `visit_id` *column* exactly as A proposes, without a row and
without a lifecycle. C also carries 16 owed rulings before a line of code — the largest
Kody-time debt in the set.

**effort_to_first_value 5.** W0+W1 ≈ 6.5 weeks, but W1 does **not** include the voice fix
(W2) and does not include the generated output (W3, ~14.5 weeks in). ≈24 engineer-weeks
total — the largest — and the modes only "earn their keep" in W4.

**risk 5.** C is the only direction with **two independent adoption gates on the same
feature**: she must remember to start a visit (R-C1) *and* she must remember to close it
(R-C2). Those multiply. A has one gate (start); B has one (file). Combined with the
back-loaded value and R-C3 (Leah Session 05 unrun; "capture/memory" is one of four MVP
wedge candidates), C asks for ~14 weeks of investment before the thesis is testable — the
worst possible shape for a bet whose premise is explicitly unconfirmed. Its per-risk
mitigations are well-written and its loose-capture escape hatch ("the mode is never a
toll") is the right YAGNI line; the problem is the shape of the whole, not the parts.

---

## 3 · Best elements to graft from the non-winning directions

### From C (the richest source)

1. **The kit.** The visit's *kind* tunes what is one tap away — the C1 pill row and the C3
   card's secondary act. Cheap, because `SiteScanContextControls`' pill row is a shipped
   prototype. This is the idea that makes a "trade walk" feel like a different instrument
   from a "market run" without being a different app.
2. **Mode-conditioned extraction framings** (§5.3). `visitKind` selects the allowed item
   kinds and the framing sentence. Design it now, build it whenever the LLM wave is ruled
   in — it costs nothing to specify and it is the difference between a note and a punch
   item in the GC's court.
3. **Mode-conditioned consent default** (§5.5). Walk-through ⇒ `note_setting='conversation'`
   with the affirmation chip armed; site/market ⇒ `solo`. The cheapest substantive answer
   to K-01/A-09, and it converts an invisible act into a deliberate one.
4. **The close as *output*, not triage.** A's V4 is a receipt; C's MO3 produces something.
   Graft the *idea*: make the end-of-visit act generate the Visits-block row on the project
   spread. Even with zero LLM — *"Tuesday at Maple Street · 12 photos · 3 notes · 1 scan ·
   Living + Dining"* — that is the artifact `[G1]` O6 says does not exist on either side.
5. **The time-entry offer at close.** `activity='site_visit'` already exists **[J-verified]**.
   Written as a *completed* entry (`duration_minutes > 0`), never a running timer —
   `00177:37-39` enforces one running timer per user with a partial unique index owned by
   the portal's TimerButton. One tap that makes a site visit legible in the Hours ledger.
6. **The `CaptureSyncAttributes` timing catch.** Frozen but unrendered ⇒ this is the only
   cheap moment to change its shape. Do it in the same foundation-owner commit.
7. **G2's live camera on install day.** A loading dock is not a photo library.

### From B

8. **The suggested/confirmed split, enforced in the schema.** `suggested_project_id` ≠
   `project_id`; nothing reads `suggested_*` as truth; the *basis is always shown in
   words*. This is the best trust mechanism produced by any direction, and it is exactly
   what A needs: it makes unfiled-roving captures safe to auto-suggest at filing time, and
   it future-proofs any later location/calendar suggestion so it can never become a silent
   fact. It also directly hardens A's sharpest risk (R-A3).
9. **The learned centroid.** Remember the coordinate of each *filed* capture against its
   project in the local cache; next visit, proximity suggests. No geocoding, no `projects`
   schema, offline, explainable. This should **replace or precede** A's wave-4 `CLVisit`
   work, because it needs no Always-location entitlement and no App Review conversation.
10. **The 4-hour window becomes a prompt, not a silent reset** — *"Still at Maple St?"* /
    Yes / New / Not pinned. A one-screen change that mitigates the systematic-mis-stamp
    risk better than a timer does.
11. **The flight toast for the sourcing kind.** Thirty shutter presses in a row should not
    each raise a confirm card. Keep C3 as the confirm surface on a site visit; auto-dismiss
    it to a 1.2 s toast on a market run.
12. **B's voice failure ladder (§5.6) as the copy source.** *"We couldn't make out the
    words — the audio is here."* That table is the best-written artifact in the set and
    should be lifted close to verbatim into the brand-voice copy pass.

---

## 4 · Recommended synthesis

**Direction A as the spine, with C's kit and close-as-output grafted onto its visit, and
B's suggestion honesty grafted onto its edges. Three visit kinds, not five. And the voice
fix moves into the first shippable slice.**

Concretely:

- **Base: A.** Ask once at the door; every capture inherits project *and* room; **no
  inbox, no triage, no Desk population, no new `NeedKind`, no new registry surface, no new
  portal flag.** Field material appears in the surfaces Leah already reads. Portal changes
  ship unflagged because they are inert without Field data (verify — concern #13).
- **Keep A's §6.3 refusal.** A field note is a note. One nullable
  `margin_notes.field_capture_id` and two extra payload facts on the existing `note`
  branch — no `field_note` margin kind, no field ghetto in the margin.
- **Three kinds, C's words: Site visit · Market · Roving.** Walk-through, Trade walk and
  Install day become **kits chosen after the project**, as a second chip — which buys C's
  kit idea and C's consent default without a five-wide picker at the door.
- **Move the voice fix into wave 1.** This is the one place I would overrule every plan's
  effort table except B's. The audio writer is one file; the whole downstream chain
  (`VoiceNoteResult.audioFilename` → `payload.voice.audioPath` → the four audio MIME
  branches → `00234`'s allow-list → `00235`'s reader → `field_captures.voice_audio_path`)
  is built and dead-waiting; and it repairs a **live honesty violation** — a note that
  transcribes to nothing is discarded with "Nothing recorded", against a law ruled four
  separate ways (R108.5, R110/FR-10, R113, R114.1). It is also the only slice that is
  walkable on a device with **no schema, no portal work and no flag**, which makes it the
  best possible first proof that the program works at all.
- **Adopt A's §0.4 as the architecture** (both grants **[J-verified]**): Field writes
  `margin_notes` and calls `create_client_decision` directly, on the existing outbox, with
  the caller-supplied `p_decision_id` as the free idempotency key. This defers the entire
  `[T1]` server pipeline — two edge functions, two crons, `field_note_drafts`, an agent
  kind, a confirm/dismiss/stage RPC trio, three migrations — behind an evidence gate.
- **Adopt B's suggested/confirmed schema split** for anything not set at the door, plus
  B's learned centroid and B's "Still at Maple St?" prompt.
- **Adopt C's close-as-output**: A's V4 becomes a receipt that *produces* the Visits-block
  row, plus C's one-tap time entry.
- **Room: A's merge-by-name** over `specRooms` + `rooms` from the one existing
  `projectDetail(id:)` call **[J-verified]**, stamping only the id legal for each lane
  (`project_rooms.id` → `field_captures.project_room_id`; `rooms.id` →
  `siteScanContext.projectRoomId` + `room_scans.room_id`), never cross-assigned. The only
  proposal that unblocks a unified room affordance without a schema ruling.
- **No `field_visits` table.** `visit_id` as an opaque device-minted column on
  `field_captures` (A §7.1) gives the portal every read it needs without a second
  lifecycle to keep in sync.

**Sequencing** (dependencies, not a schedule):

| Slice | Contents | ≈ |
|---|---|---|
| **W0** | PostHog key + confirm `surface='field-ios'` rows appear · `isFeatureEnabled` on the `CaptureAnalytics` seam · `useCaptureMediaUrls` · live ledger check · **four one-liners**: `makeDraft`'s dropped room, `applySmartGuess` → the real service, `routeAll` wired, `OfflineQueueBanner` rendered + `NWPathMonitor` | 1.5 wk |
| **W1a** | **Voice survives**: audio writer, 50 s recognizer rotation, interruption → segment N+1, `requiresOnDeviceRecognition`, C6 voice mode. No schema, no portal, no flag — device-walkable on its own. | 2 wk |
| **W1b** | **The visit spine**: kinds + kits, offline project/room cache (sequence first — it is the L), V0 door, visit chip on C1/C3/C5, S3 skipped, V4 receipt, migrations 00514/00515, portal Room-files mount + Visits block + designer-scan union | 5 wk |
| **W2** | **Work from the field**: margin notes + punch via `create_client_decision` on the outbox, `designer_client_id` on the DTO, render `receiving_inspections.photo_asset_ids` (a live defect), Desk open-visit need-line | 3 wk |
| **W3** | **Kits earn their keep**: trade-walk punch with photo (gated on the photo ruling), install-day live camera, close-as-output + time entry, market bulk + provenance chip | 3 wk |
| **W4** | App Intents (no new target) → `CaptureWidgets` target → Control Center + Lock Screen + **the Live Activity renderer that has never existed**; learned-centroid suggestion | 3.5 wk |
| **W5** | Server transcription + LLM structuring, exactly as `[T1]` designs it, behind the same two verbs W2 shipped. **Evidence-gated, not scheduled.** | 3 wk |

---

## 5 · Concerns the plan writer must resolve

1. **Ruling A-01 comes before any code.** Does Field stop being camera-first? If Kody says
   no, the synthesis still works but the door must be re-shaped: camera stays home, "Today"
   becomes a strip on W1 rather than the launch surface, and the visit chip is the only new
   chrome. Write the plan so that answer is reversible without re-planning.

2. **`create_client_decision` has two constraints A does not name, both [J-verified].** It
   requires a `designer_clients` relationship id in the payload (A flags this —
   `designer_client_id` is absent from `FieldProject`'s DTO) **and**, for `status='pending'`,
   a registered client user: *"pending decisions require a registered client recipient"*
   (`00413:1858-1861`). **A punch item on a project whose homeowner has never signed into
   the client portal will fail.** Decide before W2: raise punch items at `status='draft'`,
   or land them somewhere else.

3. **`project_tasks` writes are designer-of-record only** (`p.designer_id = auth.uid()`,
   **[J-verified]** `00169:61-62`). A studio co-member's "Make it a task" 42501s. This is
   the same fault line as A-11 / K-03 / B-05 and it must be decided **once, for the whole
   family** — `field_captures` RLS, `margin_notes` (studio *read* only, via 00205),
   `project_tasks`, and the `capture-media` object policy — not per surface. If the answer
   is per-studio, the storage policy is a `supabase_storage_admin`-owned **platform-admin
   phase migration**; sequence that ruling before any schema work.

4. **The offline project+room cache is the largest new subsystem and it is on the critical
   path.** `CaptureProjectRef` is a five-field stub **[J-verified]**. Size it honestly,
   sequence it first inside W1b, and *specify its failure copy*: "12 projects on this
   phone. Others need signal." Never an empty list, never a spinner, never a disabled
   control — that is the exact regression from S1's current behaviour the whole direction
   exists to avoid.

5. **The roving/unfiled hole is real and A under-solves it.** `margin_notes` requires
   `project_id XOR proposal_id` (`chk_margin_notes_engagement`), so a drive-home note
   cannot be a margin note. M6 is the purest "companion" moment in the brief. Decide what
   an unfiled note *is* before shipping — a `field_captures` row that waits on Today (A's
   answer), or a nullable-engagement `margin_notes` row (a schema change) — and do not
   discover it in wave 2.

6. **Where a punch photo lives is the one hard schema decision none of the three closes.**
   There is no project-general photo table; coordination items have **no attachment
   affordance at all**. C's option 2 — the punch item back-references the `field_captures`
   row and the portal signs `capture-media` — is the best of the six proposals across the
   three documents, needs no new media table, and gives correct provenance. Take it, and
   say out loud that a project-general media table is still owed.

7. **Three kinds or five must be settled before the door screen is designed**, because the
   door is the direction's entire cost. My recommendation is three kinds + kits; it is a
   ruling, not a finding.

8. **The voice fix must be the first shippable slice.** Every plan except B puts it in
   wave 2. It is one file, the downstream chain is dead-waiting, it repairs a ruled honesty
   violation, and it is the only slice that can be walked on a device with no schema, no
   portal work and no flag. Make it W1a and gate it on a device pass.

9. **PostHog, `isFeatureEnabled` and TestFlight are preconditions, not wave-0 hygiene.**
   Field has never emitted a single analytics event (live-verified in `[D7]`: 0 rows for
   `surface='field-ios'` over 180 days vs 6,017 for `patina-ios`) and there is **no
   distribution pipeline at all** — no fastlane, no archive step, no confirmed ASC record.
   So today the program cannot be measured and cannot reach Leah. Every effort number,
   every kill-criterion and every "did this help?" claim across all three documents is
   currently unfalsifiable. Price TestFlight as a wave-0 line item and make *"confirm
   `surface='field-ios'` rows appear"* an explicit gate with an owner, not a checkbox.

10. **Leah Session 05 is unrun** (findings template still blank) and its block 2 ranks
    "capture/memory" against three other MVP-wedge candidates; nor is there any
    confirmation Leah has *ever* held Patina Field on a real site (M4's literal gate was
    deferred at R113). Structure the plan so W0+W1 is a cheap, reversible bet — which the
    synthesis is, being overwhelmingly bug-fixes and wiring — and hold anything with a
    server pipeline (W5) for the session's answer.

11. **Four frozen seams, one commit, named as a foundation-owner edit.**
    `CaptureRoute`/`CaptureSheet`/`CaptureScreenID` (`CaptureNavigation.swift:4-6` — "Changing
    a case is a foundation-owner-only edit"), `AppContainer` (`:13`), and
    `CaptureSyncAttributes`. Act on C's catch in the same commit: the Live-Activity
    attributes are frozen but nothing renders them, so this is the only cheap moment to
    change their shape. Also fix `screen.F1.context`, which is not a `CaptureScreenID`
    case and has therefore never appeared in a screenshot sweep.

12. **Copy debt is inside the blast radius, not adjacent to it.** ~9 files of ESCALATE-class
    placeholder strings sit on exactly the SiteScan coach/anchor/context surfaces the
    site-visit kit uses — and `SiteScanContextCapture.swift:267` ("these land in your
    Inbox") becomes a **lie** under a spine with no inbox. Budget a brand-voice pass with
    Kody as a wave line item, not an afterthought. Every new string is bound by
    "Designer-Taught Intelligence, never AI" and by the truth-framing law (degrade
    honestly, never block, never silently drop).

13. **The unflagged-portal argument needs one explicit check.** A ships portal changes
    unflagged because each renders nothing without Field data. `RoomFilesSection` returning
    `null` with no scans is verified in its own docstring; the **Visits block** and the
    **margin-note payload change** are asserted, not verified. Confirm both before
    committing to the unflagged posture — it is the right posture and it is worth
    protecting from one counterexample.

14. **Migration hygiene, non-negotiable.** Mint from **00514**; re-verify the live Strata
    ledger before writing a byte; coordinate with the **parked and unapplied 00512** on
    `followon/sd-caller-hardening-00512` (a branch that also carries a known live defect);
    copy the `00437:516-529` `REVOKE ALL … FROM PUBLIC, anon` idiom on every new routine or
    the ACL conformance gate trips — prod default privs auto-grant `anon` EXECUTE and that
    has bitten twice. And **71/108 SQL tests are red** (00483 `pg_temp`), so new RLS tests
    must be written to run standalone, and the plan must say so plainly rather than
    reporting a suite result.

---

*Read-only judging pass. No repository file was modified other than this report.*
