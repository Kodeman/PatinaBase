# W5 review — round 8 (SwiftUI + product)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build` (branch `build/people-room-crm-2026-09-11`)
Scope: `apps/mobile/Capture/**` — the People room (PR1/PR2/PR3) built for Patina Field.
Read in full before this pass: `w5-build-report.md`, `w5-fix-log-r7.md`, `w5-review-r7.md`, `rulings.md`
(PR-r/PR-s/PR-t, R-A..R-BK), `synthesis/direction.md` §3.4/§3.7/§8, `panel/ux/ux-4-field-mobile.md` §5,
`specimens/people-room-390.html`, `w1b-report.md` (people_directory v4, seats, v_access_grants,
create_field_link), `apps/mobile/AGENTS.md`, `Capture/README.md`. `w3-data-report.md` /
`w4-data-edge-report.md` do not exist in this worktree and `grep -rl record_notice supabase/migrations/`
returns nothing — W3/W4 have not landed, exactly as `w5-build-report.md` §3 already states. Not a fresh
finding.

Claim ladder: **compile-green < sim-verified < device-verified**. Nothing here is device-verified.

---

## R-AV, checked first, as instructed

`grep -rn "sms_consent_status\|smsConsentGranted\|consentStatus" apps/mobile/Capture --include="*.swift"`,
then a full read of every hit. **CLEAN.** No Swift file reads `project_parties.sms_consent_status` (the
frozen column) for a verdict:

- The People files' `consentStatus` / `consent_status` (`PeopleRoomWire.swift`,
  `SupabasePeopleRoomService.swift`) is `people_directory_seats.consent_status` — the RECORD's verdict
  (`channel_consent_status()`, R-AY), appended in 00626. Not the frozen column.
- `SupabaseSiteRequestService.swift:17` carries its own comment confirming the repoint: "R-AV:
  `sms_consent_status` is NOT here." Its `consentStatus`/`smsConsentGranted` fields are sourced from
  `v_project_roster.sms_consent_status` (the view's derived verdict column, not `project_parties`' own).
- `PunchCourtResolver` (`grep -rln PunchCourtResolver`) appears only inside
  `SupabaseSiteRequestService.swift`, `SiteRequestService.swift`, `PunchTaskWrite.swift`,
  `FieldVerbMenu.swift` and their tests — none of which touch the People files, and the one live read
  (`SupabaseSiteRequestService.swift`) is the already-repointed one above.

No finding. Confirmed clean, consistent with r7.

---

## Prior findings, re-verified

| # | Finding | Status now | Evidence this round |
|---|---|---|---|
| r7-1 | `people.openSiteAccess` dead zone (+ `project.openRoster`/`project.openSite`) | **FIXED, reconfirmed live** | Tapped the exact previously-dead coordinate (30, 276) on `people.openSiteAccess` (AX frame `{19.5, 223.83}, {363, 55.67}` — byte-identical to r7's fix) — PR3 opened, "The code is held off Patina; ask Luis Ochoa." rendered |
| r7-2 | Mint result screen's `Copy the link` / `Share it` / `Done`, `people.mintedLink.<id>` | **FIXED, reconfirmed live** | Minted a live link for "Marcus Reyes" (mock mode); AX scan shows all three controls at 44pt height (`people.mint.copy` 101×44, `people.mint.share` 59×44, `people.mint.done` 40.67×44); off-glyph tap on `Done` at (24, 425) dismissed the sheet and returned to the roster |
| r7-6-carried | Disabled Bidding/Done rows rendered full-opacity | **FIXED, reconfirmed live** | AX scan: `people.seat.seat-rivera` and `people.seat.seat-granite` report `"enabled": false`; screenshot shows both visibly dimmed against the full-ink rows above |
| r2-3 | Real-mode phone lines print raw E.164 | **OPEN, unchanged** | `PeopleRoomWire.swift:73-74` (`phoneDisplay: phoneE164, phoneE164: phoneE164`) and `SiteAccessRow.keyHolderLine(_:)` (`:379-383`) still print the raw `+1##########` string in real mode. Compile-green / source-only — not mock-reproducible, mock fields are pre-formatted |
| r2-5 | `project_site_access_cards.alarm_ref` never read/shown | **OPEN, unchanged** | `siteAccess()`'s select list (`SupabasePeopleRoomService.swift:253-256`) still omits it |
| r7 Finding 3 | A Field person card shows a person's seats on OTHER projects, not only the active one | **OPEN, unchanged, no code change (by design pending a ruling)** | `fetchSeats(personID:)` (`SupabasePeopleRoomService.swift:224-232`) filters only on `person_id`, no `project_id` predicate; `person(projectID:personID:)` uses the full result for `card.seats`. `FieldPersonSeatLine`'s own doc comment says "on this job or another (read-only here)" — a deliberate, flagged choice, not an oversight |

---

## New findings this round

### Finding 1 — MINOR, source-only, medium confidence: `FieldSiteAccessRules.looksLikeACode` can false-positive on compound free text and silently withhold a legitimate fact

`FieldRosterRules.swift:171-181`. The heuristic special-cases a text whose TOTAL digit count is exactly 10
or 11 (a bare phone number) as "not a code," then falls back to scanning digit RUNS (split on any
non-digit) for a 4-8 digit run that isn't a year. This works for every case the fixture and the 43 unit
tests exercise (all of which are either pure phone numbers, pure times, or pure digit-runs) — but a
free-text field carrying a phone number PLUS any other short digit token (a unit/gate number, a second
short reference, a stray count) pushes the total digit count away from 10/11 and re-enables the digit-run
scan, which then flags the embedded phone-number fragment itself as code-shaped and withholds the whole
field.

Concretely: `looksLikeACode("Gate 12, call 612-555-0109")` → total digits = 2 + 10 = 12 (not 10/11) → digit
runs are `"12"`, `"612"`, `"555"`, `"0109"` → `"0109"` is a 4-digit run that is not a valid year (`Int("0109")
== 109`) → returns `true`. `withholding` would then replace the ENTIRE field with "The code is held off
Patina; ask …", discarding the gate number and the phone number both, even though nothing here is a lockbox
code.

This applies to `gateControl` (`site_notes`), `hours` (`site_hours`) and `receiving`
(`receiver_instructions`) — every one of `SiteAccessRow.card(...)`'s three `withholding(...)` call sites
(`PeopleRoomWire.swift:358,363-364`). The fixture's own `site_notes`/`site_hours`/`receiver_instructions`
strings are single-purpose (no compound phone+other-digit text), so this is not sim-reproducible against
the Okonkwo fixture and none of the 8 "no code rule" unit tests construct a compound string — all
tested inputs are single-purpose.

**Severity reasoning**: this fails SAFE, not unsafe — PR-r's actual guarantee (no code ever reaches the
screen) is not violated; the failure mode is data loss (a legitimate hours/gate/phone note silently
replaced by the standing sentence), not a leak. That is why this is MINOR rather than MAJOR, but it is a
real, findable defect a studio will eventually hit the day someone writes "Unit 4, ring the buzzer, call
(612) 555-0109" into `site_notes`.

**Fix direction**: scope the digit-run scan to text with the phone-shaped substring removed first (e.g. run
`FieldPhoneLine.dialable`-style phone detection over the string and strip matched spans before running
`digitRuns`), or widen the "total digits" shortcut to also permit a `10`- or `11`-digit SUBSTRING match
rather than requiring the WHOLE string's digits to sum to exactly that count.

### Finding 2 — MINOR, source-only, medium confidence: `PeopleErrorState`'s "Try again" may carry the same frame-on-Button pattern r7 fixed elsewhere in this file

`ProjectRosterScreen.swift` (shared by all three PR screens' error state):

```swift
Button("Try again") { Task { await retry() } }
    .font(CaptureType.callout.weight(.semibold))
    .foregroundStyle(CaptureColor.verdigris)
    .frame(minHeight: 44)
```

`.frame(minHeight: 44)` sits on the `Button` itself rather than inside a label closure with
`.contentShape(Rectangle())` — the exact shape r7-1/r7-2 diagnosed and fixed on five other controls in
this same file/module this round and last (`w5-fix-log-r7.md` explicitly names this control as "carries the
identical `.frame(minHeight: 44)`-on-the-Button shape" and leaves it untouched as out of that pass's named
scope).

Lowered from the MAJOR/BLOCKING severity those five fixed controls carried, because this one has no
`.background`/`.overlay` chain — the visual affordance is bare text, so there is no visually-larger bordered
box inviting a tap outside the actual hit region the way `people.openSiteAccess` (r7-1) and the mint
sheet's `Copy the link`/`Share it`/`Done` (r7-2) had. A user aiming for the text itself will very likely
still land inside whatever the real hit region turns out to be. Not sim-reproduced this round — reproducing
it requires forcing a network failure to reach `PeopleErrorState`, which was out of this round's harness
(mock mode always succeeds); flagging as source-only until someone drives it with a refusing service.

### Finding 3 — noted, not a defect: `PeopleRoomCache`'s synchronous file I/O runs on `@MainActor`

Named because the brief explicitly asks to check for "no main-thread blocking." `PeopleRoomCache`
(`PeopleRoomCache.swift:38`) is `@MainActor` and its `read`/`write` do synchronous `Data(contentsOf:)` /
`.write(to:)` calls directly — every `loadRoster`/`saveRoster`/`pendingNotices`/`queue`/`drain` call blocks
the main actor for the duration of a small (single-envelope) JSON encode/decode and file access. This has
been read and explicitly excused by three prior rounds (r3, r5, r6, r7) as matching `CaptureProjectCache`'s
own established house convention (`CaptureProjectCache.swift:136-137` is likewise `@MainActor`), not a
defect this feature introduced. Re-confirmed present, re-confirmed non-fresh. Listed for completeness per
the brief's explicit ask, not counted as a new finding.

---

## Live walk this round (sim-verified, iPhone 17 Simulator, udid `C8850509-C7DC-43C5-9226-9446404EE98A`, mock mode)

`capture-gate.sh all` — clean:
```
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
```

Driven live via blitz-iphone with the explicit udid (never `booted`), screenshots in
`build/ios-w5-review-r8/`:

- `r8-pr1-roster.png` — PR1 opens on Okonkwo residence, R-U's head line, vitals ("10 on the job this
  week · 5 reachable by text · 2 with accounts · 2 on paper" — recomputed correctly from the fixture's
  ten this-week seats), banded rows.
- `r8-pr3-siteaccess.png` — PR3 opens from the head act; **PR-r walked live**: "Lockbox, version 3. The
  code is held off Patina; ask Luis Ochoa." No code field anywhere on the card.
- `r8-pr3-notice-saved.png` — Logged a note ("Told Ngozi the alarm code changed.") through the inline band;
  outcome printed "Written down." (mock `recordNotice` succeeds immediately, as designed).
- `r8-pr2-samrowe.png`, `r8-pr2-adaeze.png` — **R-V walked live**: "No grant on file." fallback on cards
  with no authority row.
- `r8-pr2-chidi-authority.png` — **PR-t walked live**: "AUTHORITY ON THIS JOB — Signs money to an agreed
  amount." No `$` figure anywhere on Chidi Okonkwo's card.
- `r8-mint-form-filled.png`, `r8-mint-result.png`, `r8-mint-done-dismissed.png` — **PR-s / PR-d walked
  live**: minted "Marcus Reyes" from the "Add someone met on site" sheet; result read "Marcus Reyes is on
  the roster. The job carries no window yet, so it ends 11 December 2026 — ninety days from today." with
  the link, Copy/Share/Done all at 44pt, and `Done` dismissing the sheet from an off-glyph tap.

Two of my own early taps missed a field/button and are not app defects: a tap at (100, 782) on the
site-access screen landed on the *toggle* rather than past it (expected — expanded the log band correctly),
and a first mint-name tap at (150, 120) landed above the `FULL NAME` field's actual frame (y 172-219) and
typed nothing; a corrected tap at (150, 195) entered "Marcus Reyes" without incident. Neither is evidence of
a hit-target defect in the app.

No force-unwraps/`try!`/`as!` in any People file, `PeopleRoomService.swift`, `FieldRosterRules.swift`,
`PeopleRoomCache.swift`, or the mocks (fresh grep this round, all clean). Modern SwiftUI throughout:
`@Observable` models, `NavigationStack`-hosted screens, `async`/`await` for every read and write, no
`DispatchSemaphore`/`.wait()`/`Thread.sleep`. Accessibility labels present on every tap target reviewed
(tel lines compose reach+stage+"call <name>" into one label; roster rows compose name+firm+trade+clauses;
mint fields carry explicit `.accessibilityLabel`); 44pt or taller confirmed by live AX measurement on every
control exercised this round. Tests are substantive: 43 `Swift Testing` cases cover banding order,
the `tel:` line's E.164 normalization, the no-code heuristic (8 cases, none compound), PR-t's figure
stripping, R-Q's consent sentence, and the offline cache/queue/drain contract; 3 XCUITest cases drive PR1 →
PR3 and PR1 → PR2 end to end.

---

## Verdict

**Clean** by the stated bar (zero BLOCKING, zero MAJOR). 3 items this round: Finding 1 (MINOR, new,
medium confidence, source-only), Finding 2 (MINOR, new — a carried structural risk r7's own fix log named
but left out of scope — medium confidence, source-only), Finding 3 (not a defect, noted per the brief's
explicit ask). r7's Findings 1 and 2 are fixed and reconfirmed live; r7's Finding 3 and r2-3/r2-5 remain
open exactly as scoped, unchanged.

## Claim levels

- **Sim-verified**: R-AV's clean status via SupabaseSiteRequestService's repoint comment plus a fresh grep;
  r7-1/r7-2/r7-6-carried's fixes, all re-tap-dispatched live at real coordinates this round; the full
  roster → site access → log-who-was-told → person (×3) → mint walk, all screenshotted.
- **Compile-green / source-only**: Finding 1 (no compound-text case in the fixture or tests to trigger it
  live); Finding 2 (no reachable error state in mock mode); r2-3, r2-5 (real-mode-only paths); r7 Finding 3
  (a design choice, not a crash or visible defect to screenshot).
- **Device-verified**: nothing. No physical-device or TestFlight run was made this round, consistent with
  every prior round.
