# W5 fix log — round 3

Scope: **exactly the five findings** handed over from `w5-review-r3.md` — the two new MAJORs
(12, 13) and three of the still-open r2 MAJORs (r2-4, r2-6, r2-7). Findings r2-3, r2-5, r2-8,
r2-10 and r2-11 were **not** in this pass's brief and remain open, untouched. Nothing outside
`apps/mobile/Capture/**` and this `build/w5-*` file (plus `build/ios-w5-fix-r3/`) was edited; no
`pnpm` build, no database reset, no prod write. The only database contact was a **read-only**
`psql` probe against the local stack (`127.0.0.1:54322`) to confirm column and function shapes.

Gate, run fresh at the end of the pass (`scripts/capture-gate.sh all`, sandbox disabled for the
Xcode/CoreSimulator calls — inside the sandbox it dies on CoreSimulatorService and DerivedData
permission denials, same as r2):
`✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`.
Test run: **803 tests in 80 suites passed**, including the six added below.

No `.swift` file was added, removed or renamed, so `generate_project.rb` had nothing new to pick up
(`capture-gate.sh` and `capture-run.sh` regenerate regardless, and did; `project.pbxproj` is
unchanged).

---

## 12 — FIXED (sim-verified)

**What was wrong.** The mint's expiry sentence was built from `seat.on_site_to`, a column
`NewSeatPayload` never sets and nothing defaults, so in real mode `endsAt` was always nil and the
sentence always fell to `"Ends when the job's window closes. It renews when they use it."` —
while `create_field_link(p_party_id)` was actually stamping a concrete 90-day fallback expiry
server-side. Confirmed against the live local database, not only the migration text:

```
create_field_link(uuid)                        -> TABLE(id uuid, token text)
create_field_link(uuid,timestamp with time zone) -> TABLE(id uuid, token text)
```

Neither signature returns `expires_at`, so the reviewer's second option (decode the RPC's own
answer) is not available without a migration — and migrations were out of scope for this pass. The
first option was taken.

**Change.**
- `CaptureKit/CaptureKit/Work/FieldRosterRules.swift` — new `FieldLinkExpiry`, a pure rule
  mirroring 00627's own branches: the seat's window end (the later of `on_site_to` and
  `warranty_until`) **through the end of that day while that day is still ahead**, else the
  ninety-day default. Returns `endsAt`, `lastDay`, `isJobWindow` and the sentence.
- `Capture/Features/People/PeopleRoomWire.swift` — `InsertedRow` decodes `warranty_until` beside
  `on_site_to` and exposes `windowEnd` (the later of the two, NULLs ignored), matching the RPC's
  `max()` over the same two columns.
- `Capture/Features/People/SupabasePeopleRoomService.swift` — the seat insert selects
  `id, on_site_to, warranty_until`; `mint(...)` takes `windowEnd:` and builds both `expiresAt` and
  `expirySentence` from `FieldLinkExpiry`. The "renews when they use it" clause is gone: it
  described the RPC's supersede behaviour on a *future* mint, not this token.
- `CaptureKitMocks/PeopleRoomMocks.swift` — the mock stops borrowing a date off the fixture's
  windowed seats and resolves through the same rule with **no** window, which is the branch a seat
  made from this sheet actually takes. That is what un-masked the finding in the sim.

**Copy now printed** (windowless seat): `The job carries no window yet, so it ends 11 December 2026
— ninety days from today.` A seat that does carry a live window still reads `Ends with the job,
13 August 2027.` (PR-d, unchanged).

**Live proof (sim-verified).** iPhone 17 Simulator, udid `C8850509-C7DC-43C5-9226-9446404EE98A`
passed explicitly on every blitz-iphone call, mock mode, `capture-run.sh PR1.roster` → scrolled to
**Add someone met on site** → typed "Marcus Reyes" → **Add them and mint a link**. The result
screen reads, in the AX tree and on screen:

> `The job carries no window yet, so it ends 11 December 2026 — ninety days from today.`

Today is 2026-09-12; +90 days is 2026-12-11. Screenshot:
`build/ios-w5-fix-r3/pr1-mint-expiry-ninety-days.png`. Before this pass the same walk printed
`Ends with the job, 30 September 2027.` — a fixture date real data never produces.

**Tests added** (`CaptureTests/PeopleRoomTests.swift`, suite `FieldLinkExpiryTests`):
`aLiveWindowDatesTheLinkAndSaysSo` (sentence + `endsAt == window + 1 day`),
`noWindowFallsToTheNinetyDayDefaultWithARealDate`,
`aWindowThatHasAlreadyClosedIsTheSameFactAsNoWindow` (00627's own words), and
`aMintSaysWhenTheLinkEndsInWords` rewritten to assert the real branch and to assert the old
sentence is **not** present.

---

## 13 — FIXED (compile-green; the read path is not reachable in mock mode)

**What was wrong.** `siteAccess()` fetched `changed_at` but never `changed_by` or `told_refs`, and
`SiteAccessRow.card(...)` hardcoded `notices: []`, so PR3's "Who was told" was permanently empty on
real data regardless of what the desk had recorded.

**Change.**
- The select list now reads `… changed_at, changed_by, told_refs, key_holder_engagement_id`.
  Both columns exist today — confirmed against the local database, not just 00625:
  `project_site_access_cards.changed_at :: timestamp with time zone`,
  `.changed_by :: uuid`, `.told_refs :: ARRAY`.
- `SiteAccessRow` decodes both; `card(projectName:keyHolder:changedByName:toldNames:)` builds **one**
  `FieldSiteNotice` from the card's own row when `changed_at` is present — `what` is
  `"The way in changed."` (the card carries no notice text of its own, and inventing one from the
  lockbox version would couple two facts the schema keeps apart).
- `fetchProfileName(profileID:)` resolves `changed_by` through `profiles`
  (`display_name` then `full_name`, the portal's own convention and the shape
  `SupabaseMessagingService.resolveNames` already uses). `fetchToldNames(projectID:refs:)` resolves
  `told_refs` — which 00625 says may be person-card **or** seat ids — against **this project's own
  seats**, matching either leg. Both are best-effort (`try?`): a name that cannot be resolved prints
  as no name, never as an id and never as a failed card.
- A ref this project does not hold is dropped rather than chased studio-wide: Field stays on the job
  (ux-4-field-mobile §5).

This is the read side only, and it is independent of W3/W4's `record_notice` RPC, which still does
not exist — that write remains compile-green and is still owed, exactly as the build report's §8
says. When the fuller notice log lands it adds entries beside this one.

**Claim level: compile-green.** Not sim-verified: `PeopleRoomFixtures.siteAccess` hardcodes its two
notices and the mock never touches this decode path, and exercising the real path needs a signed-in
studio member against a seeded local card, which this pass did not stand up. PR3 was re-walked in
the sim to confirm no regression — both fixture notices still render in full ("Lockbox changed to
version 3. 16 October 2026, by Priya Natarajan. Told: Luis Ochoa, Ngozi Eze, Joe Wozniak, Dana
Kowalski.") along with PR-r's withheld-code sentence and PR-w's studio-only line.

---

## r2-4 — FIXED (compile-green)

**What was wrong.** `person(projectID:personID:)` filtered only on `id`, and `people_directory` is
studio-wide, so any person the caller's studio could see opened from any project's roster.

**Change.** The seats are now the gate, not the identity row: `fetchSeats(personID:)` runs first and
the call throws `PeopleRoomError.notOnThisJob` ("That person is not on this job.") unless one of
those seats carries this `project_id`. Only then are the directory row, the channels and the
authority words fetched — the two concurrent fetches are unchanged, so the round-trip count is the
same as before.

**Claim level: compile-green.** The Simulator runs `MockPeopleRoomService`, whose `person(...)`
ignores `projectID` entirely (that is r2-11, out of scope here), so mock mode cannot exercise this
guard.

---

## r2-6 — FIXED (queue + retry unit-tested; the offline path is not reachable in mock mode)

**What was wrong.** A mint with no signal only set `errorMessage`; nothing was queued and nothing
retried, against ux-4-field-mobile §6.4.

**Change**, built parallel to the notice queue that was already there:
- `CaptureKit` — `FieldLinkMintDraft` (id + request + `askedAt`) and `FieldLinkMintReceipt`
  (the name asked for + the mint that landed).
- `PeopleRoomCache` — `pendingMints`, `queueMint`, `forgetMint`, `drainMints(projectID:owner:using:)`,
  each the exact shape of its notice counterpart, stored in its own `…-mints.json` under the same
  owner-scoped key.
- `MintFieldLinkSheet` — a failed mint hands the request to a new `onQueued:` closure instead of
  dying as an error, and the sheet says so: *"That did not land: <reason> Marcus Reyes is queued —
  the link will be minted when the studio is reachable again, and it will be waiting on the call
  sheet."* The sheet stays a view: the cache write belongs to the roster's model.
- `ProjectRosterModel` — `queueMint(_:)`, a `pendingMints` count, and `drainMints` on every load
  that reaches the studio, de-duplicated by seat id.
- `ProjectRosterScreen` — the head prints *"1 link will be minted when you have signal."*
  (`people.pendingMints`), and a **Links that came through** section prints each drained receipt:
  the name, the expiry sentence, the URL (selectable) and a **Copy the link** button
  (`people.mintedLink.<seatID>`). Without that section the retry would be pointless — the studio
  member needs the link, not just the record.

**Tests added**: `aMintAskedForWithNoSignalIsQueuedAndThenDrained` (queued, drained, named, queue
empty afterwards) and `aMintDrainThatCannotReachTheStudioLeavesTheQueueIntact` (against the file's
existing `RefusingPeopleRoomService`).

**Claim level: unit-tested + compile-green.** Not sim-verified: the mock never refuses, so the
Simulator cannot reach the queued branch without a fault-injecting seam that does not exist.

---

## r2-7 — FIXED (compile-green)

**What was wrong.** Three sequential independent writes (`studio_contacts` insert → `project_parties`
insert → `create_field_link`) with no compensation: a failure after the first or second left an
orphan card and/or a seat with no link, and Field has no screen that could clean either up.

**Change.** A server-side transaction would need a new RPC (a migration, out of scope this pass), so
the client compensates: the seat insert's failure deletes the card; the RPC's failure — including a
response that carries no token, now its own `PeopleRoomError.noLink` rather than a misleading
"no site access card" — deletes the seat and then the card. Both `undo` helpers are deliberately
best-effort (`_ = try? await …`): the caller is already throwing the failure that mattered and a
cleanup that cannot reach the studio must not replace it with its own. The original error is
rethrown in every path.

**Claim level: compile-green.** Not sim-verified: the mock's `mintFieldLink` never performs the three
writes, and proving the compensation needs a real failure injected between real inserts.

---

## What this pass did NOT touch

r2-3 (raw E.164 on real-mode phone lines), r2-5 (`alarm_ref` never read), r2-8 (disabled rows have no
visual affordance), r2-10 (four 19.x-pt tap targets) and r2-11 (the mock's wrong-card fallback)
remain open exactly as `w5-review-r3.md` records them. `record_notice` (the write) still does not
exist; nothing here pretends otherwise.
