# W5 review — round 3 (SwiftUI + product)

Reviewer pass over `395cd420a` ("the People room on the designer's phone"), `a19e548cb` (r1 fix —
the record's consent word, and VoiceOver words), and `35ec452e4` (r2 fix — the five inputs' AX
labels), plus every pre-existing file either touches. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Nothing outside `apps/mobile/Capture/**` and this `build/w5-*`
file was touched by this review.

**Claim ladder.** `capture-gate.sh all` run fresh: `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep
(inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep` — matches all three prior reports. The app was
then driven on the booted iPhone 17 Simulator (udid `C8850509-C7DC-43C5-9226-9446404EE98A`,
explicit throughout, mock mode) via `capture-run.sh PR1.roster` and blitz-iphone: roster → scrolled
through This week / Later / Bidding / Done → opened the mint sheet, filled it, minted a link for
"Marcus Reyes" (landed, mock, link + expiry sentence) → back to roster → opened the site access
card → scrolled to "Who was told" → logged a note ("Written down.") → back to roster → opened Chidi
Okonkwo's card (PR-t) → opened Adaeze Okonkwo's row deliberately to re-probe Finding 11. Screenshots
in `build/ios-w5-review-r3/`. Findings below are **sim-verified** unless marked otherwise.

Tooling note, not a finding against the app: `device_action key:"return"` on this pass typed the
literal string "return" into the focused `TextField` rather than issuing a return-keypress/dismiss
(the mint's "Full Name" field read "Marcus Reyesreturn" afterward, visible in
`pr1-mint-result.png`). Re-typing without the stray key event was not required to complete the
walk, so it is recorded here per the round-2 precedent for simulator/driver quirks and not counted
below.

## R-AV, checked first, as instructed

`grep -rn "smsConsentGranted\|sms_consent_status\|consentStatus" apps/mobile/Capture --include="*.swift"`,
independently re-run this round. Every hit is one of: a comment stating the frozen column is
deliberately absent; `PunchTaskWrite.swift`'s pure value type, which only ever consumes an
already-resolved `smsConsentGranted: Bool` handed to it and touches no table; or a `consentStatus`
field typed against `people_directory_seats.consent_status` / `people_directory.consent_status`
(`PeopleRoomWire.swift`, `SupabasePeopleRoomService.swift`) or `SupabaseSiteRequestService`'s
`seatConsentColumns = "seat_id,consent_status"` read from `people_directory_seats` — all
record-backed, none the frozen `project_parties.sms_consent_status`. Read
`SupabaseSiteRequestService.swift:1-125` directly: `partyColumns` no longer carries
`sms_consent_status` (its own comment names R-AV and the reason), and `seatConsent(projectID:)`
is the sole consent reader, keyed off `people_directory_seats`. **No Swift file selects the frozen
column for a verdict. This check is clean**, independently reconfirmed.

## Round-1 and round-2 findings, re-verified

| # | Finding | Status now | Evidence |
|---|---|---|---|
| r1-1 | `SupabaseSiteRequestService` read the frozen `sms_consent_status` | **FIXED**, reconfirmed | See R-AV above |
| r1-2 | Reach/stage words invisible to VoiceOver on dialable rows | **FIXED**, reconfirmed live | `people.tel.seat-F-04` → `"Account, On the job, call (612) 555-0104"`; `seat-F-05` → `"On paper, On the job, call (612) 555-0105"` (live `scan_ui`, this round) |
| r2-3 | Real-mode phone lines print raw E.164 (`SeatRow.phoneDisplay = phoneE164`; `SiteAccessRow.keyHolderLine` prints raw `seat.phoneE164`) | **OPEN, unchanged** | `PeopleRoomWire.swift:71` and `:271-272`, byte-for-byte what r1/r2 flagged. Not sim-reproducible (mock never carries real-mode's raw-E.164 path — mock's own `phoneDisplay` fields are already human-formatted), so this remains a **compile-green** finding, confirmed by source re-read |
| r2-4 | `person(projectID:personID:)` never filters by `projectID` | **OPEN, unchanged** | `SupabasePeopleRoomService.swift:82-89` — `.eq("id", value: personID).single()`, no `project_id` predicate |
| r2-5 | `project_site_access_cards.alarm_ref` never read or shown | **OPEN, unchanged** | `siteAccess()`'s select list (`SupabasePeopleRoomService.swift:150-158`) still omits it; fresh grep for `alarm_ref`/`alarmRef` across `apps/mobile/Capture` returns nothing |
| r2-6 | Minting a field link has no offline queue/retry (contra ux-4-field-mobile §6.4) | **OPEN, unchanged** | `MintFieldLinkSheet.mint()` (lines 159-176) still only sets `errorMessage`; no `PeopleRoomCache` call anywhere in the file |
| r2-7 | The mint's three writes are not atomic | **OPEN, unchanged** | `mintFieldLink` (`SupabasePeopleRoomService.swift:211-232`) is still three sequential independent calls (`studio_contacts` insert → `project_parties` insert → `create_field_link` RPC) with no compensation |
| r2-8 | Disabled bidding/done rows have no visual affordance | **OPEN, unchanged, reconfirmed live** | `RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` still carries no `isEnabled`-keyed styling. Live `scan_ui` this round: Rivera Finishes and Granite North both report `"enabled": false` in the AX tree (correct for VoiceOver) while rendering in the same full-opacity ink-black text as every open row above them (`pr1-bidding-done-disabled.png`) |
| r2-9 | Mint sheet's four fields and the notice `TextEditor` had no accessibility label | **FIXED in the r2 fix pass, reconfirmed live** | Live `describe_screen` on the open mint sheet this round: `people.mint.name` → `AXLabel: "Full Name"`, `.firm` → `"Company"`, `.trade` → `"Trade"`, `.phone` → `"Mobile"`; `people.noticeDraft` → `AXLabel: "What changed and who you told"`. All five now correctly labeled |
| r2-10 | Four buttons (`people.mintLink`, `people.logWhoWasTold`/`.saveNotice`, `people.mint.submit`) fall short of the 44pt tap-target minimum despite `.frame(minHeight: 44)` | **OPEN, unchanged, reconfirmed live** | Live `scan_ui`/`describe_screen` this round: `people.mintLink` AXFrame height **19.33pt**; `people.logWhoWasTold` **19.67pt**; `people.saveNotice` **19.67pt**; `people.mint.submit` **19.67pt** — identical measurements to r2, same missing `.contentShape(Rectangle())`/pre-frame padding recipe named in r2's fix |
| r2-11 | `MockPeopleRoomService.person(projectID:personID:)` silently falls back to `PeopleRoomFixtures.people[0]` (Dana Kowalski) for any of the 13/17 seats not in the four-card fixture | **OPEN, unchanged, reconfirmed live** | `PeopleRoomMocks.swift:305-308`, unedited since r2. Live repro this round: tapped Adaeze Okonkwo's row (`seat-F-04`, personID `F-04`) → screen opened with navigation title "Dana Kowalski" and her full card (channels, bounced-email clause, consent sentence) — `pr2-finding11-wrong-card.png`. Confined to mock mode; the real service's `.single()` throws instead |

Findings r2-3 through r2-8 and r2-10/11 were explicitly out of scope for the r2 fix pass (its stated
scope was "exactly one finding — Finding 9"), so none of this is a surprise — recorded here per the
brief's instruction to re-check every prior finding rather than assume.

## New findings this round

### 12 — MAJOR, confidence HIGH (compile-green; masked by every mock/sim run to date): the mint's expiry sentence is computed from data the client never sends, and will not match the token `create_field_link` actually mints in real mode

`MintFieldLinkSheet`'s result screen prints `mint.expirySentence`, built in
`SupabasePeopleRoomService.mint(seatID:cardID:token:endsAt:)`
(`SupabasePeopleRoomService.swift:250-260`) from `endsAt = ProjectsWireDate.parse(seat.onSiteTo)`,
where `seat` is the row `insertSeat(_:cardID:)` (`:234-248`) just returned from the
`project_parties` insert. `NewSeatPayload` (`PeopleRoomWire.swift:335-355`) — and the mint sheet
that builds the `FieldLinkMintRequest` it comes from — never sets `on_site_to` (there is no field
for a window anywhere in `MintFieldLinkSheet`'s form), and nothing in the schema defaults or
triggers it (`grep -n "on_site_to" supabase/migrations/*.sql` shows no default/trigger touching the
column). So in real mode, `endsAt` is **always nil** for a PR-s mint, and the sentence always falls
to the generic branch: `"Ends when the job's window closes. It renews when they use it."`

That sentence is not just uninformative, it misdescribes what actually happens server-side. The
RPC this call goes through, `create_field_link(p_party_id UUID)` (00627, the shipped one-arg
signature, now a delegate to the two-arg body with `p_expires_at = NULL`), computes: the seat's
window end (none, here) → else the caller's `p_expires_at` (not supplied by the one-arg overload at
all) → **else the old 90-day fallback** (00627's own comment: "With no window on the seat... the
old 90-day fallback still applies"). So every PR-s mint through this screen actually receives a
concrete, calculable 90-day expiry — a real date the app could show — while the copy the studio
member sees claims the link "ends when the job's window closes" (there isn't one) and "renews when
they use it" (a property of the RPC's supersede behavior on a *future* mint call, not a promise that
this token silently extends itself). Compounding this: `create_field_link`'s own return shape,
`RETURNS TABLE (id UUID, token TEXT)`, carries no `expires_at` column at all, and `FieldLinkRow`
(`PeopleRoomWire.swift:375-378`) does not decode one — so even if the client wanted to read the
RPC's own answer back, it structurally cannot; the true date is knowable only by the client
computing "now + 90 days" itself, which it does not do.

This is entirely masked by every sim-verified walk to date, including this round's: the mock
(`MockPeopleRoomService.mintFieldLink`, `PeopleRoomMocks.swift:319-329`) derives `ends` from
`PeopleRoomFixtures.seats.compactMap(\.onSiteTo).max()` — the fixture's own seats always carry a
window — so the mock always prints a real date ("Ends with the job, 30 September 2027.", reproduced
live this round in `pr1-mint-result.png`) and never exercises the nil-window branch the real service
will hit on every PR-s mint made through this screen's own UI (which has no window field).

**Fix**: either have the client compute and print the 90-day fallback date itself when no window
exists (mirroring the RPC's own documented rule), or have `create_field_link` return `expires_at`
and decode it in `FieldLinkRow`, and build the sentence from the RPC's actual answer rather than a
locally-guessed one.

### 13 — MAJOR, confidence HIGH (compile-green; masked by every mock/sim run to date): the site access card's "Who was told" section is unconditionally empty in real mode

`SupabasePeopleRoomService.siteAccess()`'s select list
(`SupabasePeopleRoomService.swift:150-158`) is `"id, project_id, lockbox_version, site_hours,
site_notes, emergency_lines, receiver_instructions, changed_at, key_holder_engagement_id"` — it
fetches `changed_at` (used only to build the head-line summary via `FieldSiteAccessRules.headLine`)
but never `changed_by` or `told_refs`, both of which exist today on `project_site_access_cards`
(00625) independent of W3/W4. `SiteAccessRow.card(projectName:keyHolder:)`
(`PeopleRoomWire.swift:243-267`) then unconditionally sets `notices: []`. The result:
`SiteAccessScreen.whoWasTold(_:)`'s `ForEach(card.notices)` renders nothing in real mode, ever — not
"nothing yet," but nothing regardless of whether the desk has recorded a lockbox change with a full
`told_refs` list.

The build report's own "Owed" section (§8) names `record_notice` (the *write*) as not existing yet
and therefore compile-green-only, and that framing is correct and disclosed. What is not disclosed
anywhere in the build report is that the **read** side of the same section — for the single most
recent change the schema already supports today via `changed_at`/`changed_by`/`told_refs` — is
*also* entirely unimplemented, independent of whether W3/W4's fuller notice-log RPC ever lands.
Per direction §3.7 and ux-4-field-mobile §3, "Who was told" is one of the site access card's five
named regions and the only history the card carries about its own way-in; on real data it is
invisible today.

This is masked by every sim-verified walk (including this round's `pr3-who-was-told.png`) because
`PeopleRoomFixtures.siteAccess` (`PeopleRoomMocks.swift:283-290`) hardcodes two `FieldSiteNotice`
values directly, bypassing the real read path entirely.

**Fix**: select `changed_by`/`told_refs` alongside `changed_at`, resolve `changed_by` (a profile id)
and `told_refs` (party/seat ids) to display names — the same names the roster already resolves
elsewhere — and construct one `FieldSiteNotice` from the card's own row when those columns are
populated, independent of whatever multi-entry log W3/W4 eventually adds.

## Rulings re-walked and re-confirmed clean

- **PR-r**: PR3 live this round reads exactly "Lockbox, version 3. The code is held off Patina; ask
  Luis Ochoa." (`pr3-site-access.png`).
- **PR-t**: Chidi Okonkwo's card, opened correctly this round (personID `F-05`, one of the fixture's
  four cards), reads "AUTHORITY ON THIS JOB — Signs money to an agreed amount." with no figure
  anywhere (`pr2-chidi-authority.png`).
- **PR-w**: "Studio only. This card never reaches a client page." printed live on PR3.
- **Two writes only**: `recordNotice` (logged "Told Marcus Reyes about the lockbox." this round,
  landed, "Written down.") and `mintFieldLink` (minted "Marcus Reyesreturn" — see the tooling note
  above for the stray text) remain the only mutations exercised or discoverable across the five
  screens/sheet.
- **R-X**: `people.tel.*` and `people.callFirst.*` continue to measure the full 44pt-or-more,
  full-width targets live (unaffected by Finding 12/13 above, which concern text content and a
  missing read, not tap-target geometry).
- No force-unwraps/`try!`/`as!`/`.self)!` in any People file, `CaptureKit` People-adjacent file, or
  the mocks (fresh grep this round, all four locations).
- No hardcoded `Color(...)`/`UIColor(...)` in `Features/People` — every color is a `CaptureColor`
  token, consistent with the app's dark-mode handling elsewhere.
- `PeopleRoomCache` performs its (small, single-envelope-per-object) disk reads/writes synchronously
  on `@MainActor`, matching `CaptureProjectCache`'s own established pattern in this codebase
  (`CaptureProjectCache.swift:136-137` is likewise `@MainActor`) — not flagged as a fresh defect
  since it is the house convention this feature correctly followed, not one it introduced.

## Verdict

**Not clean** — 2 new MAJOR findings (12, 13), 0 new BLOCKING. Findings r2-3 through r2-8 and
r2-10/11 remain open exactly as scoped by the r2 fix log (out of scope for that pass, not silently
dropped) and are reconfirmed live or by source re-read this round. r1's two MAJORs (frozen consent
column, VoiceOver reach/stage words) and r2's one MAJOR (mint-sheet/notice-editor AX labels) remain
fixed and are reverified.
