# W5 review — round 1 (SwiftUI + product)

Reviewer pass over commit `395cd420a` ("feat(field): the People room on the designer's phone —
roster, person, the way in") plus every pre-existing file it touches. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Nothing outside `apps/mobile/Capture/**` and this
`build/w5-*` file was touched by this review.

**Claim ladder.** `capture-gate.sh all` run fresh (sandbox disabled for the Xcode/CoreSimulator
calls — the default sandbox blocks CoreSimulatorService, DerivedData and provisioning-profile
access, unrelated to the code under review): `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) ·
✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`, matching the build report. The app was then driven on
the booted iPhone 17 Simulator (udid `C8850509-C7DC-43C5-9226-9446404EE98A`, explicit throughout,
mock mode) via `capture-run.sh PR1.roster` and blitz-iphone: roster → Chidi Okonkwo's person card →
site access card → logged a "who was told" note (landed, mock) → minted a field link for "Marcus
Reyes" (landed, mock, link + expiry sentence printed). Screenshots in
`build/ios-w5-review-r1/`. Findings below are **sim-verified** unless marked otherwise; two are
**compile-green only** (real-service paths never exercised, exactly as the build report's own
claim ladder states) and are labelled as such.

## Rulings walked and confirmed clean

- **PR-r** (never store/print the gate code): `wayIn` on the live PR3 screen read exactly
  "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." Grep for
  `gate_code|gateCode|access_code|accessCode` across `apps/mobile/Capture` returns nothing.
- **PR-t** (no threshold figure on a phone): Chidi Okonkwo's card read "AUTHORITY ON THIS JOB —
  Signs money to an agreed amount." with no figure anywhere on screen. Grep for
  `threshold_cents|thresholdCents` returns only comments explaining its deliberate absence.
- **PR-w** (studio-only, no client leg): the card prints "Studio only. This card never reaches a
  client page." and the RLS backing it (00625) has no client policy (confirmed by reading the
  migration, not just the app).
- **Writes limited to two**: `recordNotice` and `mintFieldLink` are the only mutating calls in
  `SupabasePeopleRoomService`; every other method is a read. No trade- or homeowner-facing
  surface, no compliance upload, no authority editing anywhere in the five new screens/sheet.
- **Offline** (ux-4-field-mobile §6): `PeopleRoomCache` stores roster + site-access JSON per
  project per owner (hashed keys, never a raw id as a path component), renders
  `FieldPeopleDates.lastLoaded` in ink instead of a spinner, and queues a refused `recordNotice`
  for retry-in-order on the next good load — walked directly: the log-note write landed in mock
  mode and printed "Written down."
- **R-X** (390 tel: target): every phone line (`PeopleTelLine`, `SiteAccessCallLine`) is a sibling
  `Link`, never nested in the row's own `Button`, full-width, `frame(minHeight: 44)`.
- No force-unwraps, `try!`, or `as!` anywhere in the nine new/changed Swift files.
- Tests are meaningful: 43 `CaptureTests` cases exercise band-order precedence, `tel:` edge cases,
  the "looks like a code" detector, `FieldAuthorityWords.phoneSafe`, and offline queue/drain; 3
  XCUITest cases walk PR1→PR2 and PR1→PR3 end to end and assert the "held off Patina" sentence
  literally.

## Findings

### 1 — MAJOR, confidence HIGH (pre-existing, not part of this diff, but explicitly in scope per the brief's R-AV check): `SupabaseSiteRequestService` still reads the frozen `project_parties.sms_consent_status` column directly

`apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift:16-17,48-49,88-89`.
`partyColumns` includes `sms_consent_status` and both call sites select it from
`.from("project_parties")` — the raw base table, not even `v_project_roster`. That value feeds
`consentStatus == "granted"` → `smsConsentGranted`, which `PunchCourtResolver` and
`FieldVerbMenu` gate texting/dispatch decisions on.

R-AV (rulings.md, close-out MAJOR-2) states this exact reader must be repointed to
`v_project_roster.sms_consent_status` (the record's verdict) "in this program," and the brief
for this review named it as the first thing to check. It has not been repointed — it reads the
column the freeze trigger (R-AS/R-AX) declares frozen-legacy and readable-but-untrustworthy. The
freeze only blocks *writes*, so this compiles and runs, but a court/dispatch decision on a real
project can still diverge from `studio_channel_consent`'s verdict (e.g. a fold's
`refusal_unanswered` case that `channel_consent_status()` accounts for and the raw column does
not).

**Fix**: point `partyColumns`/both `project_parties` reads at `v_project_roster` (or an
equivalent view backed by `channel_consent_status()`), the way `people_directory_seats` already
does for W5's own three screens.

### 2 — MAJOR, confidence HIGH (device-verified): reach and stage words are invisible to VoiceOver on every roster row with a phone number

`PeopleSupport.swift`'s `PeopleTelLine` renders `words` (reach, then stage — e.g. "Field link",
"On the job") inline with the phone number, but the dialable branch overrides accessibility with
`.accessibilityLabel("Call \(display)")`, discarding `words` entirely. Confirmed live: every
`people.tel.seat-*` element's `AXLabel` on the booted Simulator was exactly `"Call (612)
555-0104"` etc. — never "Field link", "Account", "On paper", "On the job", "Awarded", etc.

This is not merely a missing label — the underlying `RosterRow` never prints reach/stage as text
anywhere else, so it is the ONLY place that information exists on screen. A VoiceOver user
reading Dana Kowalski's row (held-clause visible on screen) hears the held clause and the
opted-out note (those DO combine correctly via `.accessibilityElement(children: .combine)`), but
never hears whether she is reachable by "Field link" or "On paper", or whether her stage is "On
the job" vs. "Awarded" vs. "Off the job" — exactly the two word-families the Call Sheet exists to
answer (direction §3.8). The no-phone branch (`FieldPhoneLine.noPhone`) does NOT have this bug —
it correctly combines words + "No phone on file" into one label — so the regression is specific
to the dialable case's explicit override.

**Fix**: build the accessibility label from `words + ["Call \(display)"]` rather than
overwriting it, e.g. `.accessibilityLabel("\(words.joined(separator: ", ")), call \(display)")`.

### 3 — MINOR, confidence HIGH (compile-green only — never exercised in real mode): real-mode phone lines print raw E.164 digits, not a formatted number

`PeopleRoomWire.swift`: `SeatRow.seat` sets `phoneDisplay: phoneE164` (line ~68) and
`SiteAccessRow.keyHolderLine` interpolates `seat.phoneE164` directly (line ~283) — both use the
machine-readable `+16125550109` form where `FieldRosterSeat.phoneDisplay`'s own doc comment
promises "As a person reads it: '(612) 555-0111'." `CaptureKitMocks/PeopleRoomMocks.swift`
always supplies a separately-formatted `phoneDisplay` string, which is why every sim-verified
screenshot (mock mode) looks correct and this defect was invisible to the build's own walk. A
real-mode PR1 roster row or PR3 "Key holder" line would show "+16125550109" instead of "(612)
555-0109".

**Fix**: format `phone_e164` for display (or select a pre-formatted column) rather than reusing
the dialable string for both purposes.

### 4 — MINOR, confidence HIGH on the fact / MEDIUM on materiality: `person()` is not scoped to the project it is called with

`SupabasePeopleRoomService.person(projectID:personID:)` takes `projectID` but never uses it in
the `people_directory` query (`.eq("id", value: personID)` only). RLS/studio-membership is the
only scoping applied; nothing at the service layer enforces "the active project ... and nothing
studio-wide" (the module's own header comment, and ux-4-field-mobile §5's first must-not) for
this one method. Not currently exploitable — the only navigation path passes a `personID` drawn
from that project's own roster, and the debug/verification deep-link route resolves to a fixed
fixture id, gated off in release builds — but the invariant is not defended in code the way the
other four methods defend it (roster/siteAccess both filter by `project_id`).

**Fix**: either accept the current behaviour explicitly in a comment (a person's cross-project
seat lines are intentionally shown per `FieldPersonSeatLine`'s own doc comment, so full isolation
may not be desired), or add a project-membership check so the parameter isn't silently unused.

### 5 — MINOR, confidence MEDIUM: `project_site_access_cards.alarm_ref` is never read or shown

Migration `00625`'s own banner names "who to call when the alarm goes" as one of the facts this
table exists to hold, and defines a distinct `alarm_ref` column for it (separate from
`site_notes`). `SupabasePeopleRoomService.siteAccess`'s select list omits it, and grep for
`alarm_ref`/`alarmRef` across `apps/mobile/Capture` returns nothing. PR3 is meant to be the
complete "how a body gets on site" card; nothing in the build report or rulings marks this as
deliberately deferred.

### 6 — MINOR, confidence HIGH on the fact / MEDIUM-HIGH on materiality: minting a field link has no offline queue or retry, contra ux-4-field-mobile §6.4

ux-4-field-mobile.md §6 states plainly: "A field link's ... expiry ... should not hard-fail a
renewal attempted with no signal; the mint should retry when connectivity returns rather than
reading as broken on the spot." `MintFieldLinkSheet.mint()` only sets an inline `errorMessage`
("try again when you have some [signal]") on failure — unlike `SiteAccessModel.logWhoWasTold()`,
which queues via `PeopleRoomCache` and retries on the next good load. The build report's own §4
("Offline") describes queuing for "the one write" (singular), confirming this was a scoping
choice rather than an oversight, but it leaves the panel's explicit requirement for this exact
feature unmet. (Low practical cost today — the form fields survive the failure and a manual
re-tap works — but it is a named requirement, not a nice-to-have.)

### 7 — MINOR, confidence MEDIUM (compile-green only): the mint's three writes are not atomic

`mintFieldLink` performs `studio_contacts` insert → `project_parties` insert →
`create_field_link` RPC as three sequential, independent PostgREST calls with no compensating
rollback. A failure between steps 1 and 2 — plausible exactly under the low-signal job-site
conditions this feature is built for — leaves an orphaned rolodex card with no seat and no link,
silently added to the studio's contacts with no user-visible trace and no retry path (the sheet's
error message offers no way to resume from "card exists, seat does not"). Untested: the one mint
test named in the build report (§5, "the mint (1)") covers the expiry-sentence/link-shape logic
only, on a mock that performs the operation as a single call.

### 8 — MINOR, confidence LOW-MEDIUM (device-observed): disabled bidding/done rows give no visual affordance

`RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` (Rivera Finishes, Granite
North — the two uncarded firm-only seats) renders with identical styling to every tappable row;
nothing keys off `isEnabled` to dim or otherwise mark it non-interactive. Confirmed on the booted
Simulator: both rows render in full ink black, same as every open row above them. A designer
tapping either gets no feedback that the row does not open (correctly — there is no card to
open), just silence.

## Not re-litigated

`w1b-report.md` §8's own "owed to W2" list (frozen consent columns still read by
`PunchCourtResolver`/`SupabaseSiteRequestService`, `site_request_resend()`'s seat leg, etc.) is
the same population as Finding 1 above; I did not separately re-derive every item in that list,
only confirmed the one the review brief named explicitly (R-AV) is still open.

## Verdict

**Not clean** — 2 MAJOR, 0 BLOCKING. The five rulings the build report leads with (PR-r, PR-t,
PR-w, PR-s/PR-d, R-X) all hold up under direct device inspection and are not among the findings
above.
