# Judge panel — ENGINEERING lens

**Program:** Patina Field → a true field companion to the designer portal's project flow
**Date:** 2026-08-24 · **Agent:** Judge (engineering) · read-only
**Inputs:** the seven discovery reports `[D1]`–`[D7]`, the two synthesis documents `[G1]`
(`10-gap-analysis.md`) and `[T1]` (`11-tech-architecture.md`), and the three directions
`[A]` `20-direction-A.md`, `[B]` `20-direction-B.md`, `[C]` `20-direction-C.md` — all read
in full. Every claim this judgement leans on was re-verified against the repo this session;
file:line citations below are mine unless marked *(from Dn)*.

> **Lens:** feasibility against the actual repo. Reuse of shipped Field screens/services/seams ·
> Supabase and Agent-OS rule compliance · migration and RLS burden · iOS platform risk ·
> verification burden (device passes) · time-to-first-shippable-value. This is not a product
> judgement; where a direction is engineering-cheap and product-risky I say so and score both.

---

## 0 · Verification pass — what I confirmed, and three corrections

Before scoring, the facts the three directions disagree about.

### 0.1 Confirmed, all three directions right

| Claim | Verified |
|---|---|
| No audio has ever left a Field device | `grep -rn "AVAudioFile\|AVAudioRecorder" apps/mobile/Capture --include="*.swift"` → **0 hits**. `SpeechVoiceNoteService.swift:22-23` declares `mediaDirectory` (never read) and `audioFilename` (only ever read, at `:107`). |
| No `NWPathMonitor` anywhere | `grep -rn "NWPathMonitor" apps/mobile/Capture` → **0 hits**. Regained connectivity never auto-drains. |
| No web code has ever signed `capture-media` | `grep -rn "capture-media" apps/ packages/` (TS/TSX) → **nothing**. |
| `field_captures` has exactly one portal reader | `grep -rln "field_captures" apps/ packages/` → `database.types.ts` and `use-room-files.ts` only. |
| `route_field_capture` / `dismiss_field_capture` have zero web callers | only `database.types.ts` type rows. |
| `RoomFilesSection` is unmounted | only self-references in `room-files-section.tsx`. |
| `applySmartGuess` is a hardcoded literal | `ViewfinderModel.swift:412-419` — `seating` @0.72, `"Oak / bouclé"` @0.6, both stamped `.smartGuess`. |
| `makeDraft` drops the room | `ViewfinderModel.swift:337-345` copies `projectID`/`projectName`/`room`/`shelf`; `venue.projectRoomId` is **never assigned**. |
| `S1AssignVenueScreen` is orphaned from the capture path | `present(.assignVenue…)` → `CaptureDeepLink.swift:96`, `S2CreateProjectScreen.swift:172`, `V1SessionTrayScreen.swift:126`. None is C3 or C5. |
| `routeAll` is only wired to cull-to-inbox | `V2CullDeckScreen.swift:238` (+ the service at `CaptureSyncService.swift:114` and one test). |
| `commit_field_capture`'s inbox branch drops routing | `00235:204-208` sets `status='inbox'` and returns; only the library branch (`:255-266`) writes `project_id`/`project_room_id`/`shelf`. |
| Deployment floor is 18.0 | `generate_project.rb:17` `DEPLOYMENT = '18.0'`. |
| Mic + speech strings ship; background/calendar/always-location do not | `generate_project.rb:83-97` sets camera/mic/speech/photo/location-when-in-use/motion/FaceID. `Info.plist` declares **only** the `field://` URL scheme. No `UIBackgroundModes`, no `NSCalendarsUsageDescription`, no `NSLocationAlwaysAndWhenInUseUsageDescription`. |
| `generate_project.rb` creates exactly four targets | `:28-30` (CaptureKit, CaptureKitMocks, Capture) + `:129` (CaptureTests). No widget/share/UI-test target generation code exists. |
| `capture-gate.sh lint` silently no-ops | `scripts/capture-gate.sh:27-33` — `command -v swiftlint || echo "… skipping"`, still exits 0. `test` builds the `CaptureKit` scheme only. |
| Ledger head is 00513 with a hole | `ls supabase/migrations/ | tail` → `00501`, `00510`, `00511`, `00513`. 00512 absent (parked). |

### 0.2 Correction 1 — `endVisit` is already wired. **[A] §0.1 is wrong, in [A]'s favour.**

`[A]` builds its thesis on *"`endVisit` has **zero call sites outside the file itself**"* and
promises Flow 7 will be "its first" caller. It is not:

```
Capture/Features/Session/V1SessionTrayScreen.swift:61
    Button("End visit", action: endVisit)
Capture/Features/Session/V1SessionTrayScreen.swift:153-154
    private func endVisit() { _ = sessionContext.endVisit(identity: identity) }
```

V1 also already renders the literal heading `Text("This visit")` (`:41`), groups by venue
(`:46`), and carries the exact footer `[A]` and `[B]` describe: `Review each` /
`Route all N` → `if let first = items.first { coordinator.present(.assignVenue(first.id)) }`
(`:118-127`). **`[C]` describes V1 accurately; `[A]` and `[B]` do not.**

Engineering consequence: the visit-end act, the visit tray, and the (broken) bulk-route
footer are all shipped screens. Whichever direction wins, V1 is a screen to **widen**, not
one to build. That is a week off every estimate and it also means `endVisit`'s real semantics
must be read carefully — `CaptureSessionContext.swift:157-167` does not *end* anything, it
**replaces** the context with a fresh one at `now`. There is no `endedAt`, no closed state,
and no record that a visit happened. Any direction that wants a visit with an end has to
change that function's contract, not merely call it.

### 0.3 Correction 2 — `create_client_decision` is materially narrower than **[A] §0.4** implies

`[A]`'s claim that Leah's own phone can already write punch items rests on this RPC. The
grant is real — `REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated`
(`00413:2603-2608`) — and the caller-supplied `p_decision_id` really is a free outbox
idempotency key. But three gates `[A]` does not surface:

```
00413:1866-1875
  SELECT * INTO v_relationship FROM public.designer_clients
   WHERE id = NULLIF(p_payload->>'designer_client_id','')::uuid FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN
    RAISE EXCEPTION 'relationship not found or access denied' …
  IF v_status = 'pending' AND v_relationship.client_id IS NULL THEN
    RAISE EXCEPTION 'pending decisions require a registered client recipient' …
```

1. `designer_client_id` is **mandatory** and is not on Field's `FieldProject` DTO
   (`ProjectsService.swift:19-38` — id/name/status/clientName/phaseLabel/updatedAt only).
2. Authorization runs through `_can_author_proposal(designer_id)`, not `auth.uid()` directly.
3. A punch item created as `status='pending'` **fails outright** on a project whose
   `designer_clients` row has no registered `client_id` — and a trade-walk punch item in the
   GC's court has nothing to do with whether the homeowner has an account.

So the field punch verb must default to `'draft'`, or the plan must accept that it only works
on projects with registered clients. Neither is fatal; both are wave-brief facts, not
footnotes. `[C]` reached the safer conclusion by a different route (it routes punch through
`[T1]`'s `_apply_field_note_draft` applier instead).

### 0.4 Correction 3 — **[B]'s `status='filed'` silently revokes studio visibility.** Nobody caught this.

`field_captures` studio co-visibility is predicated on the inbox status:

```
00233:174-188
CREATE POLICY field_captures_org_inbox_select ON field_captures FOR SELECT
  USING ( status = 'inbox'
      AND organization_id IS NOT NULL
      AND organization_id IN (SELECT om.organization_id FROM organization_members om
                              WHERE om.user_id = auth.uid() AND om.status = 'active') );
```

`[B] §7.3` proposes adding `'filed'` to the shipped CHECK (`00233:36-37`) as the terminal
state of its central act. The moment a capture is filed, it leaves `status='inbox'` and
**every studio co-member loses read access to it** — including the assistant who filed it.
`[B]`'s own thesis ("the designer *or an assistant* files them") destroys its own visibility
in the same statement. Fixable in the same migration (widen the policy predicate, or add an
`organization_id`-scoped SELECT that does not key on status), but it must be *in* the
migration, and `[B]` does not have it.

Two further gates on the same promise, also under-sized in `[B]`:

- There is **no org-scoped UPDATE policy** at all (`00233:154-172` — owner-only insert/update/
  delete). `[B]`'s `file_field_capture` is specified `SECURITY INVOKER` (`[B] §7.3`), so an
  assistant calling it gets zero rows updated. The assistant path needs either a DEFINER
  applier or a new UPDATE policy — a different migration shape than the one `[B]` wrote.
- `capture-media` object policies gate on `auth.uid()::text = foldername[1]` (00234:41-67,
  *from D2/G1*), so an assistant cannot see the photo even with a row read. Adding a
  co-member branch means a `storage.objects` policy owned by `supabase_storage_admin` — a
  **platform-admin phase migration**, not an ordinary one. `[B]` names this correctly but
  files it as ruling B-05 rather than as work in W1.

---

## 1 · Scores

Scale 1–10 per axis; `effort_to_first_value` 10 = fastest; `risk` 10 = lowest risk.
Total = sum (max 50).

| Direction | workflow_fit | speed_on_the_move | feasibility_repo_fit | effort_to_first_value | risk | **total** |
|---|---|---|---|---|---|---|
| **A — The Project Spine** | 8 | 8 | **9** | 7 | 7 | **39** |
| **B — Capture first, file later** | 7 | **9** | 6 | 7 | 6 | **35** |
| **C — Moments as modes** | 8 | 8 | 6 | 5 | 5 | **32** |

### 1.1 Direction A — The Project Spine · **39**

**workflow_fit 8.** A's central engineering insight is that the portal already has homes for
everything Field can produce — `margin_notes` for a note, `client_decisions` for a punch item,
`room_scans`→`room_files` for a scan, `products` for a market find — and that the only thing
missing is a project id at capture time. That is correct and it is why A needs almost no new
server surface. Verified: `margin_notes_designer_all` is `for all to authenticated using
(designer_id = auth.uid()) with check (…)` (`00196:51-54`) — Leah's own phone can write a
margin note today, with no new RPC and no new table. Against: the sourcing kind is a second
spine bolted onto a direction whose whole argument is "one spine", and "roving" is an inbox A
spends §1.4 refusing to build, renamed. A's refusal of a triage queue is intellectually clean
but it means a capture taken before she started a visit has exactly one place to go, on the
phone, in a list she must open.

**speed_on_the_move 8.** 2 taps + 1 hold for photo-plus-note, 1 mode-swipe + 1 hold for a bare
voice note, both fully offline — down from the measured ~7 taps + hold that still has no
project (*from D1 §8*). The door costs 3 taps once. Correct trade for a two-hour site visit;
worse than B's 1 tap for a 30-piece market run, which A partly buys back with the
projects-in-mind chips.

**feasibility_repo_fit 9 — the decisive axis.** A's total server footprint for waves 0–4 is
**one migration plus one `CREATE OR REPLACE` of `commit_field_capture`**. No new table, no new
RPC, no edge function, no cron, no `agent_tasks` kind, no view recreation, no new storage
policy. Compare: `[B]` needs 3 migrations + a new RPC + a new CHECK value + possibly a
two-table view in slice 1; `[C]` needs a new table with its own RLS, a DEFINER RPC, FKs on two
shipped tables, two agent kinds, a widened `project_time_entries` CHECK, *plus* all of `[T1]`.
On the device side A is mostly re-homing: `CaptureSessionContext` already carries
`visitID`/`startedAt`/`lastActivityAt`/`CaptureRoutingMemory{destination, projectID,
projectName, projectRoomID, room, shelf}` in App-Group `UserDefaults` under
`capture.session-context.v1`; `ViewfinderModel.makeDraft()` already copies four of the five
routing fields onto every draft. A's §0.3 finding (`projectRoomID` is write-only) is real and
is a two-line fix — I confirmed `venue.projectRoomId` is assigned nowhere in `ViewfinderModel`.
A also declines `[T1]`'s `field_note_drafts`/`agent_tasks`/edge-function stack entirely in
waves 0–4, which removes the largest block of Agent-OS surface any direction proposes.
Deductions: the three narrowings in §0.3 above; `project_tasks` is designer-of-record only
(`00169:61-62` — `projects.designer_id = auth.uid()`), so "Make it a task" 42501s for a studio
co-member; and A writes business tables **directly from the device**, which is a real
divergence from the house pattern where field signal reaches `client_decisions`/`project_tasks`
only through `review_sms_message` → `apply_field_effect` (SECURITY DEFINER, revoked from
`authenticated`). RLS permits A's path; the architecture does not obviously want it. That is
ruling A-03 and it swings wave 2 by ~2 weeks.

**effort_to_first_value 7.** W0 (~1.5) + W1 (~5–6) ≈ 7 weeks to "everything she captures lands
on the right project and room." That is competitive. The strike is **sequencing**: A puts the
audio writer in W2, so the program's literally-stated ask — *"voice notes with transcription"* —
does not arrive for ~10 weeks. The audio writer is one file and ~15 lines and needs no
migration at all (`voice_audio_path` exists at `00233:69`, the audio MIME allow-list exists at
`00234:26-29`, `uploadMedia` already uploads it, `missingRequiredMedia` already requires it).
Shipping the IA change before the one-file honesty fix is the wrong order in every direction,
and A is the one that defers it furthest.

**risk 7.** Lowest schema/RLS/Agent-OS risk by a wide margin, and the smallest blast radius on
frozen seams. Product risk is A's real exposure: it inverts the app's founding camera-first
posture (`README.md`'s opening line), and its systematic-error mode — a visit left open from
yesterday stamping today's twenty captures — is genuinely worse than today's twenty unattached
ones. A mitigates with a 30-minute confirm and a 12-hour auto-end, both cheap. The
device-writes-business-tables divergence is the item most likely to be reversed on review,
which would cost the wave.

### 1.2 Direction B — Capture first, file later · **35**

**workflow_fit 7.** B is right about the case A is weakest on: at High Point the context does
not exist yet, and forcing it produces either a wrong answer or a stopped designer. B is also
the only direction that gives filing a **second owner** (the Desk, an assistant) — which the
program brief asks for. Against: B defers the program's stated goal by construction. "Field
information lands in the right place in the portal's project flow" becomes "field information
lands in a tray, and later someone puts it in the right place." B names the landfill as its own
highest risk and its mitigations are honest, but a direction whose failure mode is the thing it
is named after starts a point down.

**speed_on_the_move 9 — best of the three.** One tap, no card, no sheet, viewfinder stays live,
thumbnail flies to the handle. Demoting C3 from a gate to a 1.2 s toast is unambiguously right
on the merits: the card's two guess rows show a hardcoded literal today
(`ViewfinderModel.swift:412-419`), and because `hasUnconfirmedGuess` is therefore always true,
S3 recommends Inbox for **every capture ever taken**. B is the only direction that deletes the
gate rather than fixing what it displays.

**feasibility_repo_fit 6.** Excellent reuse instincts — S1 (490 working orphaned lines) becomes
the filing sheet *and* the pin picker; V1 becomes the Tray; `routeAll` is already tested
(`CaptureLifecycleTests.swift:557`) and needs one line at `V1SessionTrayScreen.swift:126`;
`route_field_capture`/`dismiss_field_capture` are shipped with zero web callers and become the
portal's filing acts. But B carries the heaviest *slice-1* backend of the three, and §0.4 above
shows the load-bearing part of it is wrong: the new terminal `status` silently revokes studio
read, the `SECURITY INVOKER` RPC cannot be called by the assistant B designed it for, and the
storage co-member branch is a platform-admin-phase migration B files as a ruling. B also needs
a new Desk population, a `registry.tsx` entry, a hook family, a card component, and a new
fail-closed flag — all in slice 1, on a portal where `room-file` and `call-sheet` already make
most field surface dark and where MEMORY.md records four flags never seen by a human. The
optional `field_tray_items` view unions two tables with two different RLS models (B-04), which
is the right thing to say no to.

**effort_to_first_value 7.** B's own W0+W1 ≈ 6 weeks is the fastest claimed number and W1 is
the only one that contains the audio writer — correct instinct, and the reason B does not score
lower here. But W1 also contains an L (the Tray rebuild), three migrations, a new RPC, a CHECK
change, and an entire portal population. Once §0.4's RLS work lands I read it as ~8 weeks, not 6.

**risk 6.** Highest product risk (the landfill), plus the only direction that changes a shipped
CHECK on a table with a shipped device writer, plus the RLS defect above. Offsetting: B removes
the "she forgot to start a visit" failure mode entirely, every capture is durable regardless of
what she remembers, and B's suggested/confirmed schema split is the best honesty mechanism
proposed anywhere in the three documents (see §2).

### 1.3 Direction C — Moments as modes · **32**

**workflow_fit 8.** The richest match to the shape of a designer's day, and the only direction
that produces a shareable artifact — `[G1]` O6 scores "a site-visit output is a shareable
report without retyping" as an outright FAIL today, and a mode with a close produces one by
construction. C's kit idea is also the only proposal that makes the *right* thing one tap in
each moment (on a trade walk the shutter makes a punch item). And C is the only direction that
read V1 correctly (§0.2). Against: five modes × five kits × five extraction framings × five
portal landings is a very large surface for an app that has never emitted an analytics event.

**speed_on_the_move 8.** Same 2 taps + hold as A inside a visit, with better per-moment
affordances. Same 3-tap door.

**feasibility_repo_fit 6.** C's reuse observations are the sharpest of the three — the kit-pill
row generalises a *shipped* component (`SiteScanContextCapture.swift:162-193`), the band reuses
the Companion Hearth's collapsed presentation which is already pinned as a `safeAreaInset` on
every non-camera screen, and the note that `CaptureSyncAttributes` is stamped FROZEN while
**nothing renders it** — so its freeze currently protects nothing and now is the only cheap
moment to change its shape — is an observation worth acting on regardless of which direction
wins. But C is the heaviest backend by a distance: a new `field_visits` table with its own RLS
and a project-team SELECT (which drags in ruling K-C3 and, if studio-wide, the platform-admin
storage migration), a `close_field_visit` SECURITY DEFINER RPC, `visit_id` FKs on two shipped
tables, **two** new `agent_tasks` kinds, a widened `project_time_entries.source` CHECK, plus
all of `[T1]` (00514–00518, two edge functions, two crons, `field_note_drafts`, the margin
branch). Install-day mode also drags in the NestJS media service (`ReceivingMediaUploadClient`),
which C correctly declines to unify but still has to link around.

**effort_to_first_value 5.** C's own total is ≈24 engineer-weeks and its W0+W1 is ≈6.5. I do not
believe the 6.5. C's W1 bundles the table + the DEFINER RPC + four new screens (MO1/MO3/MO5 +
the band in both realms) + six modifications to shipped screens + five portal changes + the
ESCALATE copy pass + the foundation-seam edit. That is two L packages wearing one label; ~8
weeks is the honest read. And like A, C defers voice to W2 — so the stated headline ask is
~11 weeks out.

**risk 5.** C names its own two chief behavioural risks accurately and they are both severe:
she forgets to start, and she never closes. The second is structural — C's entire payoff (the
Visit Page, the narrative, the proposals) is gated on an explicit close, and C's stated
fallback ("make the close passive, auto-file at the mode's default, review later") *is Direction
B*. A direction whose failure mode is another direction on the panel is a direction with an
unresolved thesis. Add: five modes is five copy surfaces to keep honest on top of the ~9 files
of ESCALATE-class placeholder copy that sit precisely inside the Site-visit kit; and C edits
four frozen seams rather than three.

---

## 2 · Best elements to graft from the non-winning directions

Ranked by value per unit of engineering.

**From [B]:**

1. **The suggested/confirmed schema split** (`[B] §2.4c`, `§7.1`). `suggested_project_id` /
   `suggested_project_room_id` / `suggested_kind` / `suggestion_basis` / `suggestion_confidence`
   are five nullable columns that are **never read as truth** — `project_id` means *filed
   there*, `suggested_project_id` means *we think so*. This is the single best honesty
   mechanism proposed anywhere in the three documents, it costs one `ALTER TABLE` in the
   migration that is being written anyway, and it is exactly what lets a spine degrade safely
   when she forgets the door. Graft unconditionally.
2. **Tray scope = unfiled, not this-visit.** `V1SessionTrayScreen.swift:139-147` builds its list
   from `store.session(visitID:owner:)`, and the context expires at
   `CaptureSessionContextPolicy.inactivityWindow` (4 h, verified `:71`). A thought captured on
   the drive home is outside the window and has nowhere to appear. Widening one query turns the
   shipped tray into the durable holding place both A ("roving") and C ("loose captures")
   need but under-design.
3. **The learned centroid** (`[B] §2.4d`). Remember the coordinate of every *filed* capture
   against its project in the local cache; suggest by proximity next time. Free, on-device,
   offline, explainable, and it needs **zero** schema on `projects` — which matters, because
   `projects.site_address` is free-form nullable TEXT and there is no lat/lng anywhere on the
   table. Best magic-per-line ratio in any of the three documents.
4. **The C3 demotion to a flight toast.** Delete the gate, do not fix its contents. Verified:
   the card's guesses are a literal, and they make S3 recommend Inbox for every capture.
5. **The Desk card modelled byte-for-byte on `SmsReviewCard`**, with the **basis stated in
   words** ("Suggested from where you were") rather than a confidence number. Whatever the
   portal surface ends up being called, this is its grammar.

**From [C]:**

6. **Mode-conditioned extraction** (`[C] §5.3`). `_shared/field-note-extract.ts` takes a
   `visitKind` and selects the allowed item kinds plus a one-sentence framing. Same tool
   schema, same forced `tool_choice`, same anti-hallucination rules, same cost — and it is the
   difference between "the return on the left casing is proud" becoming a note and becoming a
   punch item in the GC's court. Near-zero code for a materially better landing. Graft when the
   structuring wave happens; it costs nothing to design the prompt file for it now.
7. **The close ritual and the Visit Page as an output artifact.** `[G1]` O6 is a FAIL and only
   C addresses it. Even in a spine direction, "here is what happened Tuesday at Maple Street"
   is a better read-back than a chronological list, and the portal block is the same block
   either way.
8. **Act on `CaptureSyncAttributes` now.** It is stamped FROZEN, it is fully built and driven
   by `LocalCaptureSyncService`, and no widget target exists to render it — so the freeze
   protects nothing today and will protect something the day a renderer lands. If the
   `ContentState` shape needs a visit label, an elapsed timer, or a capture count, change it in
   the first foundation-seam commit. This is a free option that expires.
9. **The kit-pill row**, generalised from the shipped `SiteScanContextControls`
   (`SiteScanContextCapture.swift:162-193`). Even without five modes, a two-or-three-pill row
   that differs between a site visit and a market run is cheap and is the mechanism by which
   "what is one tap away" becomes contextual.
10. **Per-pill honesty discipline** — on a non-LiDAR phone the Scan pill becomes *Reference* and
    its output is never labelled a scan. `SiteScanEntryMode.forDevice` already makes the
    decision; the kit just reads it. This is R108.2/R108.5 enforced at the affordance rather
    than in a paragraph.
11. **Widen `project_time_entries.source` to `'field_visit'`** (`[C] §7.3`, K-C10). One CHECK
    line, and it makes field work legible in the Hours ledger. Note C's own correct constraint:
    write a **completed** entry (`duration_minutes > 0`), never a running timer — `00177:37-39`
    enforces one running timer per user with a partial unique index owned by the portal's
    TimerButton.

**Explicitly do not graft:** `[B]`'s `status='filed'` as specified (§0.4); `[C]`'s five modes at
once (start with two and let evidence add the third); `[C]`'s `field_visits` server table in the
first shippable slice (a device-minted `visit_id` column groups a day's work without a second
lifecycle to keep in sync — adopt `[A] §7.1`'s position and revisit only if cross-device visit
resumption is actually wanted).

---

## 3 · Recommended synthesis

**Direction A's spine as the skeleton, B's honesty schema and unfiled-scope tray grafted in, C's
mode-conditioning and close-artifact held for the evidence-gated wave — and the one-file voice
fix pulled to the front, ahead of any IA change.**

The engineering argument in one line: A is the only direction whose first two years of server
footprint fit in one migration, and the two things A is weakest on (what happens when she
forgets the door; where an unfiled capture lives) are both solved by grafts from B that cost
five nullable columns and one query change.

### Slice 0 — Prerequisites · ~1.5 weeks · identical in all three documents

PostHog key in Field's `Secrets.swift` and confirm `surface='field-ios'` rows actually appear
(*from D7*: 0 rows in 180 days vs 6,017 for `patina-ios`); `isFeatureEnabled` on the
`CaptureAnalytics` seam, fail-closed; `useCaptureMediaUrls` batched signed-URL hook (nothing
downstream is anything but cosmetic without it); the four one-line truth fixes —
`makeDraft` copying `projectRoomID`, `applySmartGuess` → the real `HeuristicSmartGuessService`,
`routeAll` wired at `V1SessionTrayScreen.swift:126`, `OfflineQueueBanner` rendered behind a real
`NWPathMonitor`; re-verify the live ledger against Strata and reserve from 00514.

### Slice 1 — The note survives · ~2 weeks · **ship this before any IA change**

All three directions bury the audio writer (A and C in W2, B inside a 5-week W1). It is one
file, it closes a live honesty violation — `SiteScanContextCapture.swift:129` gates on
`!transcript.isEmpty || audioFilename != nil`, so with `audioFilename` permanently nil a note
that transcribes to nothing on a noisy site is discarded with "Nothing recorded" — and it
requires **no migration at all**, because `field_captures.voice_audio_path`, the four audio MIME
branches, the upload path and `missingRequiredMedia` are all built and dead-waiting. Write the
`.m4a` from the existing `AVAudioEngine` tap; rotate the recognition request at ~50 s while the
file stays continuous; open segment N+1 on interruption; set `requiresOnDeviceRecognition =
recognizer.supportsOnDeviceRecognition` in the same commit, because the shipped permission
string already promises on-device and the flag is never set anywhere. Decide in this slice
whether segment 0 stays in the legacy `voice_audio_path` column so 00514's segments array is
purely additive.

This slice alone answers the program's stated ask more directly than any IA change, and it is
independently shippable and independently walkable.

### Slice 2 — The spine · ~5–6 weeks

`[A]`'s wave 1, with four amendments:

- **Two visit kinds, not three.** Site and sourcing. "Roving" is not a kind, it is the absence
  of one — model it as a null kind whose captures carry B's `suggested_*` columns and appear in
  the unfiled tray. That removes a third code path from V0, the chip, the card and the tray.
- **Every capture carries the suggestion columns** (graft 1). A capture taken with no visit open
  is still born with a suggested project from the pin/venue/proximity basis, rendered as a
  question, never written to `project_id`. This is the graft that makes A's door safe to forget.
- **V1 is widened, not replaced** (§0.2). It already says "This visit", already groups, already
  has an End-visit button, already has the footer. Change the query scope from
  `store.session(visitID:)` to unfiled, fix the `items.first` line, and add the visit header.
- **Migration 00514 only.** `capture_kind`, `visit_id`/`visit_kind`/`visit_label`, the five
  `suggested_*` columns, the voice segment columns, `audio_retention`, the provenance GIN index
  carried unbuilt since R112/R113, all five `field_captures` policies restated `TO authenticated`
  (they currently default to PUBLIC, `00233:154-188`), **and** the `commit_field_capture`
  inbox-branch routing fix (`00235:204-208`) without which every note-shaped capture still
  arrives with no project column.

### Slice 3 — It lands in the document · ~3–4 weeks

`margin_notes` written from the device through the *same* outbox (not a second queue) with a
new nullable `field_capture_id`; the existing `note` branch of `margin_items` gains two payload
facts — **no new margin kind** (`[A] §6.3`'s argument is right: a field note *is* a note, and a
`field_note` branch builds a ghetto in the margin); portal audio playback + photo strip; mount
`RoomFilesSection`; union designer-owned scans into the two client-only attach points; the
Visits block; render `receiving_inspections.photo_asset_ids` (a live defect, not a feature).

### Slice 4+ — Work from the field, then evidence-gated intelligence

The two explicit designer-invoked verbs (Make it a task / Make it a punch item) subject to
§0.3's constraints and ruling A-03; then, only if the corpus from slices 1–3 justifies it,
`[T1]`'s server transcription and structuring behind the *same two verbs* with `[C]`'s
mode-conditioned prompt. The UI does not change when the model arrives — it pre-fills a sheet
she was already tapping. That is the correct order and all three documents agree on it.

**Total to the program's stated goal: ~12–13 engineer-weeks**, front-loaded so that slice 0
(1.5 wk) and slice 1 (2 wk) are both independently shippable, independently walkable, and
worth having even if the wedge question comes back "no".

---

## 4 · Concerns the plan writer must resolve

Ordered by how early they block.

1. **The org-inbox RLS predicate keys on `status='inbox'`** (`00233:174-188`). Any terminal
   status the plan introduces — `'filed'`, or an implicit "filed = has `project_id`" — must
   widen that policy **in the same migration**, or studio co-members silently lose read access
   to exactly the rows they were meant to help with. This is a defect in `[B]` as written and a
   trap for any synthesis that adopts a filed state.
2. **The assistant path is three problems, not one ruling.** Org-scoped SELECT exists;
   org-scoped UPDATE does **not** (`00233:154-172` is owner-only), so a `SECURITY INVOKER`
   filing RPC no-ops for an assistant; and `capture-media` object policies gate on
   `auth.uid()::text = foldername[1]`, so a co-member branch is a `supabase_storage_admin`-owned
   **platform-admin phase migration**. Sequence the per-designer-vs-per-studio ruling
   (A-11 / B-05 / K-C3 / `[T1]` K-03) **before** any schema work, and budget the storage
   migration as its own item.
3. **`create_client_decision` needs `designer_client_id`, passes `_can_author_proposal`, and
   rejects `status='pending'` without a registered client** (§0.3). Add `designer_client_id` to
   Field's projects SELECT and `FieldProject` DTO, and decide the field default (`'draft'` is
   the only status that always works). Do not brief a punch verb without this decided.
4. **`project_tasks` writes are designer-of-record only** (`00169:61-62`). "Make it a task"
   returns 42501 for a studio co-member. Either detect-and-degrade to a margin note with an
   honest line, or route through a DEFINER applier — and if the answer is the applier, `[A]`'s
   "no new RPC" claim no longer holds and wave 2 grows.
5. **Direct device writes to business tables are an architectural divergence.** SMS field signal
   reaches `client_decisions`/`project_tasks` only via `review_sms_message` → `apply_field_effect`
   (SECURITY DEFINER, revoked from `authenticated`). The synthesis has the phone insert
   `margin_notes` directly. RLS permits it — `margin_notes_designer_all` is
   `for all to authenticated` on `designer_id = auth.uid()` — and the author really is the
   designer herself, not a third party's parsed claim. But it is ruling A-03 and it moves ~2
   weeks either way. Decide before the slice-3 brief.
6. **The offline project + room cache is the long pole and all three size it differently.**
   `CaptureProjectRef` today is `{id, remoteId, name, createdAt, ownerUserID, ownerWorkspaceID}`
   (`Specimen.swift:224-249`) — a stub for inline-created projects. There is **no
   `VersionedSchema` / `SchemaMigrationPlan` anywhere in Field**; `Specimen.swift:7` says adding
   one is an owner-only migration. **Extend `CaptureProjectRef` with additive optional
   properties** (lightweight-migratable) rather than adding a new `@Model` (`[A] 1-3` proposes a
   new one and sizes it L; `[B]`/`[C]` extend and size it S/M). Extending is an M. The genuinely
   new work is the refresh policy, eviction, owner scoping, and honest staleness display — not
   the storage.
7. **One room picker, two id lanes.** `FieldProjectDetail` already returns **both** lists from
   one `projectDetail(id:)` call — `specRooms` (`project_rooms`, what `field_captures.project_room_id`
   FKs to) and `rooms` (`public.rooms`, what scans attach to and what
   `siteScanContext.projectRoomId` carries). Verified at `ProjectsService.swift:106-140`. A
   merged picker that stamps whichever id is legal per lane and **never cross-assigns** is
   buildable without a schema ruling, but the merge heuristic (`[A]` proposes case-insensitive
   trimmed name) needs an explicit decision and an honest behaviour when the two lists disagree.
   `ContextCaptureProvenance` already refuses to put a `rooms.id` in the `project_room_id`
   column — that refusal must survive.
8. **Do the frozen-seam edit once, in one commit, with a named owner.**
   `CaptureNavigation.swift:4-6` ("Changing a case is a foundation-owner-only edit"),
   `AppContainer.swift:13` ("FROZEN for the waves"), `CaptureSyncAttributes` ("FROZEN — a
   ContentState shape change breaks both"). All three directions edit them; two of the three
   propose exactly this discipline. Fold in graft 8: the `CaptureSyncAttributes` shape change
   is free **only** until a widget target exists.
9. **`endVisit` does not end anything.** `CaptureSessionContext.swift:157-167` replaces the
   context with a fresh one at `now`; there is no `endedAt`, no closed state, no record that a
   visit occurred. Any plan that wants a visit with a beginning and an end changes that
   function's contract and the `Codable` shape persisted under `capture.session-context.v1` —
   which means a legacy-decode path (default the new fields) or the first launch after upgrade
   silently loses the open context.
10. **Verification and distribution are unsolved and identical across all three.**
    `CaptureUITests/` is an empty directory with no target-generation code;
    `generate_project.rb` creates exactly four targets; `capture-gate.sh lint` silently no-ops
    and exits 0 without swiftlint; `test` runs the `CaptureKit` scheme's logic tests only; there
    is no fastlane, no CI archive step, and no confirmed ASC record. **Budget one device pass
    per slice and never let a green `capture-gate.sh` stand in for one.** If the answer to "does
    this reach Leah's phone, not just Kody's" is yes, TestFlight is a hard dependency of slice 1,
    not a wave-4 nicety (A-12 / B-15 / K-C12 are the same ruling).
11. **Nothing in any of these documents is measurable today.** Field has never sent a PostHog
    event (`postHogAPIKey = nil`) and has no feature-flag mechanism at all. Every tap count,
    every latency target, and every kill-criterion in all three directions is currently
    unfalsifiable. Slice 0 item 1 is not housekeeping; it is what makes the rest of the plan
    reviewable.
12. **Migration numbering and the ACL gate.** Filesystem head is `00513`; verified gaps at
    00487/00488, 00496/00497 and 00502–00509 (the directory jumps 00501 → 00510 → 00511 → 00513),
    and **00512 is parked and unapplied** on `followon/sd-caller-hardening-00512`, a branch that
    also carries a known live defect — so if it ever lands it applies out of order. Mint from
    00514, re-verify against Strata before writing a byte, and coordinate with the 00512 owner.
    Every new `public.` routine needs the explicit `REVOKE ALL … FROM PUBLIC, anon` idiom or it
    trips the ACL conformance gate — prod default privileges auto-grant `anon` EXECUTE on new
    public functions, and that has bitten twice.
13. **71/108 SQL tests are red** (00483 `pg_temp` fallout, repair owed). That suite cannot
    certify new RLS work. Either repair it as a dependency or write the new tests to run
    standalone and say so plainly in the slice report.
14. **Where a punch photo lives is still unanswered and it blocks the work verbs.** There is no
    project-general photo table in the schema, and coordination composers have no attachment
    affordance at all. `[A]` proposes `client_decision_options.image_url` (exists, zero DDL,
    semantically wrong — an option is a choice, not evidence); `[C]` proposes a `field_captures`
    back-reference (zero new media tables, correct provenance, makes the punch photo the same
    object as the visit photo). **Prefer C's option 2**, but it is still a ruling before the
    slice-4 brief.
15. **Flag posture.** `room-file` and `call-sheet` already make most existing field surface dark
    by default, and MEMORY.md records at least four flags never seen by a human. `[A]`'s
    argument for shipping the portal changes **unflagged** is sound and worth adopting: every
    change is a read of data that only exists if a Field build wrote it — `RoomFilesSection`
    returns `null` with no scans, the Visits block renders nothing with no visits, the margin
    payload only lights when `field_capture_id` is set. A designer with no Field build sees
    today's portal exactly. If the plan does take a flag, the flag-on walk is a completion
    criterion, not a follow-up.
16. **iOS platform facts, identical across all three, none a differentiator.** 18.0 floor
    (`generate_project.rb:17`) rules out SpeechAnalyzer; mic + speech usage strings already
    ship; `UIBackgroundModes`, `NSCalendarsUsageDescription` and
    `NSLocationAlwaysAndWhenInUseUsageDescription` are absent from both `Info.plist` and the
    `INFOPLIST_KEY_*` build settings, so background audio, calendar suggestion and `CLVisit` all
    require new keys and (for Always-location) a real App Review conversation. An `AppIntent` in
    the **app target** needs no new target and delivers Siri + Shortcuts + Spotlight + Action
    Button at the current floor — note the app already fires a `settings.action_button_rebind`
    event and teaches the Action Button in onboarding for an affordance that does not exist.
    A widget/Control-Center/Live-Activity renderer needs **new Ruby in `generate_project.rb`**
    before a single Swift file matters.
17. **Consent has no policy anywhere under `docs/`.** All three directions converge on the same
    controls (never ambient, solo-vs-conversation chosen at start, unmissable chrome, a
    retention policy mirroring `site-request-media-maintenance`'s 90-day purge). This is the one
    item with legal exposure and it needs a lawyer's read before a non-Kody designer records a
    client — not an engineering decision, but an engineering blocker.
18. **The wedge itself is unconfirmed.** Leah Session 05 (prepped 2026-08-18) has not run — its
    findings template is still blank — and it ranks "capture/memory" against three other MVP
    candidates. There is also no confirmation Leah has ever held Patina Field on a real site
    (M4's device-pilot gate was deferred at R113). Slices 0 and 1 are overwhelmingly bug-fixes
    and wiring of parts that already exist — a cheap, reversible bet worth making regardless.
    Hold the structuring wave for the session's answer.

---

*Read-only judgement pass. No repository file was modified other than this report.*
