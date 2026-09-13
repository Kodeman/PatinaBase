# W5 review — round 7 (SwiftUI + product)

Reviewer pass over `build/people-room-crm-2026-09-11` at `514e3a535` — `395cd420a`
(feat, the People room) through `514e3a535` (r6 fix — 44pt targets on five controls,
and the mock's fallback-to-Dana-Kowalski defect). Since round 6's review
(`w5-review-r6.md`, taken at `d47575a1d`), one further commit landed:
`514e3a535`, which is `w5-fix-log-r6.md`'s subject. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`. Every file
listed in `w5-build-report.md` §2 was read in full this round (not diffed only):
`PeopleRoomService.swift`, `FieldRosterRules.swift`, `PeopleRoomCache.swift`,
`PeopleRoomMocks.swift`, `ProjectRosterScreen.swift`, `PersonDetailScreen.swift`,
`SiteAccessScreen.swift`, `MintFieldLinkSheet.swift`, `PeopleSupport.swift`,
`PeopleScreens.swift`, `SupabasePeopleRoomService.swift`, `PeopleRoomWire.swift`,
`PeopleRoomServiceFactory.swift`, `PeopleRoomTests.swift`, `PeopleRoomUITests.swift`,
plus `AppContainer.swift`, `CaptureDeepLink.swift`, `RootView.swift`'s companion
section, and `ProjectDetailScreen.swift`'s "Everyone on this job" entry point.
Reference docs read first: `rulings.md` (PR-s, PR-t, R-A..R-AF), `synthesis/direction.md`
§3.4/§3.7/§8, `panel/ux/ux-4-field-mobile.md` §5, `specimens/people-room-390.html`,
`build/w1b-report.md`, and `apps/mobile/CLAUDE.md` / `Capture/README.md`.
`w3-data-report.md` and `w4-data-edge-report.md` still do not exist anywhere under
`artifacts/people-room-crm-2026-09-11/`, and `grep -rl record_notice supabase/migrations/`
is still empty — W3/W4 have not landed as of this round either, unchanged from every
prior round's note.

Nothing outside `apps/mobile/Capture/**` and this `build/w5-*` file (plus
`build/ios-w5-review-r7/`) was touched. No `pnpm` build, no database reset, no file
outside scope written. `git status` at the start of this pass showed only W2's
designer-portal work and `artifacts/.../qa-w2-r2/` files staged in the shared
worktree; nothing of W2's was read, moved, or committed by this review.

**Claim ladder.** `capture-gate.sh all` (sandbox disabled for the Xcode/CoreSimulator
calls — inside the sandbox it dies on CoreSimulatorService/DerivedData permission
denials, same as every prior round):

```
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
```

Driven on the same booted iPhone 17 Simulator every prior round used (udid
`C8850509-C7DC-43C5-9226-9446404EE98A`, explicit throughout via blitz-iphone, never
`booted`), mock mode, via `capture-run.sh PR1.roster`. This round's walk: tapped
"Open the site access card" both on-glyph and in its padding margin (see finding 1);
opened the site access card, scrolled to "Who was told," logged a note ("Round 7
review check."), landed ("Written down."); returned to the roster, scrolled to
Bidding/Done, re-measured the disabled rows; minted a field link for "Marcus Reyes"
(landed, "Ends... 11 December 2026 — ninety days from today," verified correct against
the simulator's real clock across the Nov 1 2026 US DST fall-back — see arithmetic
note in finding 4); measured the mint result screen's Copy/Share/Done controls; opened
Chidi Okonkwo's card (PR-t) and Dana Kowalski's and Luis Ochoa's cards. Screenshots in
`build/ios-w5-review-r7/`. Findings below are **sim-verified** unless marked otherwise.

## R-AV, checked first, as instructed

`grep -rn "smsConsentGranted|sms_consent_status|consentStatus" apps/mobile/Capture --include="*.swift"`,
independently re-run this round (seventh time). Every hit is one of: a comment
naming R-AV and stating the frozen column is deliberately absent
(`SupabaseSiteRequestService.swift:17`); the pure value type
`PunchTaskWrite`/`SiteRequestService`/`FieldPartyRef`/`SiteRequestAssignee`, which
only ever consume an already-resolved `smsConsentGranted: Bool` handed to them and
touch no table; or a `consentStatus`/`consent_status` field typed against
`people_directory_seats` / `people_directory` (`PeopleRoomWire.swift`,
`SupabasePeopleRoomService.swift`, `SupabaseSiteRequestService.seatConsentColumns`).
Read `SupabaseSiteRequestService.swift` in full this round: `partyColumns`
(line 22) carries no `sms_consent_status`; `seatConsent(projectID:)` (line 90) is
the sole consent reader for both `fieldParties` and the site-request assignee path,
selecting `seat_id, consent_status` from `people_directory_seats` — the same
record-backed view PunchCourtResolver's data ultimately traces to.
**No Swift file reads the frozen column for a verdict. Clean, independently
reconfirmed for the seventh round running.** No new finding at MAJOR per the
brief's instruction.

## New findings this round

### Finding 1 — BLOCKING-leaning, sim-verified with a live negative repro: `people.openSiteAccess` has a real dead zone inside its own visible, bordered tap target

`ProjectRosterScreen.head(_:)`'s "Open the site access card" button applies
`.padding(16)` and `.frame(minHeight: 44)` **on the `Button` itself**, outside the
label closure — the exact shape `w5-fix-log-r6.md` proved, for five other controls,
does not extend SwiftUI's actual hit-test region even though it does grow the
AX-reported frame. This control was never checked against that finding: r6's fix
list named `people.mintLink`, `people.mint.submit`, `people.logWhoWasTold`,
`people.saveNotice`, `people.text.ch-11-m`. `people.openSiteAccess` sits in the same
file (`ProjectRosterScreen.swift:196-213`) with the identical anti-pattern, and no
round's evidence table has a live tap-dispatch entry for it — r6's review only cites
`people.callFirst.*`/`people.tel.*` (a different, correctly-built pattern) for R-X.

**Live repro this round.** Fresh `capture-run.sh PR1.roster`. `scan_ui` reported
`people.openSiteAccess` at `{19.5, 223.83}, {363, 55.67}` (AX height 55.67pt — taller
than the reported height for the five now-fixed controls, since the HStack+Spacer
label plus outer `.padding(16)` genuinely does occupy that visual space):

- tap at `(30, 276)` — inside the reported frame, in the visible bordered box's
  bottom-left corner, below the key glyph and away from any text — **did nothing**;
  the screen stayed on PR1 (`ios-w5-review-r7/r7-openSiteAccess-deadzone-tap-nonav.png`).
- tap at `(150, 240)` — directly on the "Open the site access card" text — opened
  PR3 correctly (`ios-w5-review-r7/r7-openSiteAccess-text-tap-worked.png`).

So the visibly-bordered, background-filled "button card" a sighted user reads as one
44+pt tap target has a genuine dead strip along its bottom (and, by the same
mechanism, plausibly its top padding and any horizontal margin the HStack's Spacer
does not itself cover) — a thumb landing anywhere in the visual card but off the
icon/text row does nothing, with no visual distinction between the live and dead
areas. This is the entry point to PR3 from PR1's head, so a miss here is a miss on
the single highest-value new mobile screen per ux-4-field-mobile §3.

**Same shape, not yet checked live.** `ProjectDetailScreen.swift:129-146`'s
"Everyone on this job" (`project.openRoster`, the sole Work-surface entry point into
the whole People room) and `:110-126`'s "Open Site" (`project.openSite`) use the
identical `Button { HStack { …; Spacer(); … } }.padding(16).frame(minHeight: 44)`
shape. I did not walk into a live project to tap these this round (time budget), so
this half of the claim is **compile-green / source-only** — flagged because the
mechanism proven on `people.openSiteAccess` applies verbatim to both call sites in a
file this program did not touch, so the same bug is plausible there too. If
`ProjectDetailScreen.swift` predates W5 (it is only in the "Edited" list, not "New"),
this is not itself new to this program on `openRoster`/`openSite`, but W5 added the
"Everyone on this job" button in that same file using that same broken shape, so at
minimum that one instance is squarely a W5 defect.

**Severity.** BLOCKING-leaning: a real, live-reproduced tap failure on the entry
point to a "highest-value" screen, with no visual affordance telling the user why
their tap did nothing — they will plausibly retry, blame the app, or give up,
exactly the one-handed/gloved/thin-signal situation ux-4 §7 exists to protect.
Scoring it BLOCKING outright feels one notch too strong only because the working
area (the text itself, and apparently a good portion of the row given the
HStack+Spacer's width behavior) is still large and centered where a thumb naturally
lands — but the defect is real, live-proven, and undisclosed by any prior round.
Confidence: **high** (two contrasting live taps, same session, same control).

### Finding 2 — MAJOR, sim-verified: the mint result screen's `Copy the link` / `Share it` / `Done` controls, and the roster's `people.mintedLink.<id>`, share the identical 44pt dead-zone defect r6 fixed elsewhere, and remain unfixed

`w5-fix-log-r6.md` disclosed this explicitly ("flagged here rather than fixed, for a
ruling") for `MintFieldLinkSheet.swift`'s `people.mint.copy`, the `ShareLink`, `Done`,
and `ProjectRosterScreen.swift`'s `people.mintedLink.<id>` — all four still use
`.frame(minHeight: 44)` **on the Button**, not inside the label, the same shape r6
proved broken for the five controls it did fix.

**Live re-measurement this round**, fresh mint of "Marcus Reyes" through to the
result screen: `people.mint.copy` `{101 × 19.67}`, `Share it` (no accessibility
identifier) `{59 × 19.67}`, `Done` (no accessibility identifier) `{40.67 × 19.67}` —
all three roughly **half** the 44pt floor, both in the AX tree and (per r6's own
finding about this exact code shape) in actual tap dispatch. I did not re-run r6's
off-glyph tap-dispatch test on these three this round (the r6 fix log already
supplies the mechanism and a fresh AX measurement is sufficient to show the defect
is unfixed and unchanged) — that half of the claim is carried on r6's established
mechanism, not independently re-tested this round.

This is not a new discovery — it is disclosed, known, and open exactly as r6's own
fix log states — but it is still open at r7 and belongs on this round's ledger
since the brief asks for every finding at its current severity, not only new ones.
**Severity: MAJOR** (same class as the five r6 fixed — a real tap-target-too-small
defect on write-completing controls, one of which, `Done`, is the only way to
dismiss the mint sheet other than the nav-bar Close). **Confidence: high**
(fresh AX measurement this round; mechanism proven live by r6 on the identical code
shape).

### Finding 3 — MINOR/product-scope question, sim- and source-verified: a Field person card shows a person's seats on OTHER projects, not only the active one

`FieldPersonCard.seats` (`PersonDetailScreen.swift`'s "Seats" region) is populated,
in real mode, from `SupabasePeopleRoomService.fetchSeats(personID:)`
(`SupabasePeopleRoomService.swift:224-232`), which selects
`people_directory_seats` filtered **only** on `person_id` — no `project_id` filter
at all. `person(projectID:personID:)` uses one row from that unfiltered set purely
as a project-membership gate (`guard let here = seatRows.first(where: { $0.projectID
== projectID })`), then hands **every** row (`seatRows.map(\.personSeatLine)`,
line 122) to the card's `seats` property, which the screen renders in full.

**Live confirmation.** Dana Kowalski's card (fixture F-11, opened from her seat on
the Okonkwo residence — the project this Field session is scoped to) prints two
seat lines: "Okonkwo residence · sub · electrical · 12 Oct 2026 to 13 Aug 2027 · On
the job" **and** "Lindqvist kitchen · sub · electrical · closed 21 Nov 2025 ·
Warranty" (`ios-w5-review-r7/pr2-dana-cross-project-seats-r7.png`) — a second,
unrelated project's name and that engagement's own dates, surfaced on a phone screen
whose stated scope (direction.md §8 P3: "Patina Field roster and site-access
screens scoped to the active project"; ux-4-field-mobile §5 must-not #1: "The
studio-wide Directory or rolodex across every project... Field's job is the job in
front of the designer") is the one job in front of the designer. This is the
fixture's own intended behavior (the mock's hand-authored card matches what the real
service would compose), not an accident of the mock — so it is a design choice this
program made, not a code slip, and it has stood through six prior review rounds
without a finding, which is itself worth noting.

I am not confident this rises to a defect: it is not literally the "studio-wide
Directory" the must-not names (there is still no way to browse the studio's whole
book from Field, and RLS still confines every row to the same studio's own data,
so there is no cross-tenant leak) — it is a single, already-open person's own
cross-job history, surfaced one tap deep from a seat the designer is already
looking at, which is arguably closer to "who else has this sub worked with us on"
than a rolodex browse. But the ruling's literal words ("scoped to the active
project") and the explicit must-not's spirit (Field carries only the job in front
of the designer, nothing wider) point the other way, and no prior round appears to
have weighed this specific tension — r4-14's fix note only concerns
`roleAtFirm`, not the cross-project `seats` array itself. **Flagging for a ruling,
not asserting a violation.** Confidence: **medium** (live-verified behavior;
the scope judgment itself is a genuine, not manufactured, ambiguity).

## Rounds 1–6 findings, re-verified

| # | Finding | Status now | Evidence this round |
|---|---|---|---|
| r1-1 | Frozen `sms_consent_status` read | **FIXED**, reconfirmed | See R-AV above |
| r1-2 | Reach/stage words invisible to VoiceOver | **FIXED**, reconfirmed live | `people.tel.seat-F-02` → `"Account, On the job, call (612) 555-0102"` |
| r2-3 | Real-mode phone lines print raw E.164 | **OPEN, unchanged** | `PeopleRoomWire.swift:73-74` (`phoneDisplay: phoneE164, phoneE164: phoneE164`) and `SiteAccessRow.keyHolderLine(_:)` (`:379-383`, `"\(name) holds a key. \(phone)."` with raw `phoneE164`) — byte-for-byte unchanged since r1. Not sim-reproducible (mock fields are pre-formatted). **Compile-green / source-only**, seventh round open |
| r2-4 | `person(...)` never filtered by `projectID` | **FIXED in r3**, reconfirmed | `SupabasePeopleRoomService.swift:89-94` |
| r2-5 | `project_site_access_cards.alarm_ref` never read or shown | **OPEN, unchanged** | `siteAccess()`'s select list (`:253-256`) still omits it; fresh grep for `alarm_ref`/`alarmRef` returns nothing this round too |
| r2-6 | Mint has no offline queue/retry | **FIXED in r3**, reconfirmed | `PeopleRoomCache.pendingMints/queueMint/drainMints` present and unit-tested |
| r2-7 | Mint's three writes not atomic | **FIXED in r3**, reconfirmed | `mintFieldLink` compensates on each later failure |
| r2-8 | Disabled bidding/done rows have no visual affordance | **OPEN, unchanged, reconfirmed live** | `RosterRow.identity`'s `Button(...).disabled(seat.personID == nil)` carries no `isEnabled`-keyed styling. Live this round: `people.seat.seat-rivera` and `people.seat.seat-granite` both report `"enabled": false` while rendering in identical full-opacity ink to every open row above (`ios-w5-review-r7/pr1-bidding-done-r7.png`) |
| r2-9 | Mint sheet fields / notice editor had no AX label | **FIXED (r2)**, reconfirmed | `people.mint.name` → `"Full Name"`, `people.noticeDraft` → `"What changed and who you told"` |
| r2-10 / r5-17 | Five plain-style buttons fell short of the 44pt tap-target minimum | **FIXED in r6, reconfirmed live** | `people.logWhoWasTold` measured `{330 × 44}` this round; tapped at `(350, 780)`, far from the glyphs, and the note editor opened (`ios-w5-review-r7/pr3-savenotice-landed-r7.png` shows the completed write). `people.mintLink` `{354 × 44}`, `people.mint.submit` `{362 × 44}` (enabled once the name field held text), both exercised end-to-end this round with a real mint landing |
| r2-11 | Mock's `person(...)` silently fell back to Dana Kowalski for 13/17 seats | **FIXED in r6, reconfirmed by source re-read** | `MockPeopleRoomService.person` now resolves the authored card, then `cardFromSeat(personID:)`, then throws `notOnThisJob` — no fallback to `people[0]` remains anywhere in `PeopleRoomMocks.swift` |
| — | (r2-10/17's two controls left unfixed by r6) | **See Finding 2 above** — carried forward, not re-derived here |
| — | (a control never checked for this defect at all) | **See Finding 1 above** — new this round |
| r3-12 | Mint's expiry sentence computed from data the client never sends; mock borrowed a fixture date | **FIXED in r3**, reconfirmed live | Live mint this round: "The job carries no window yet, so it ends 11 December 2026 — ninety days from today." Verified correct against the simulator's actual wall-clock (2026-09-13 CDT) plus exactly 90×86400 seconds, crossing the Nov 1 2026 US DST fall-back (CDT→CST), which lands one calendar day earlier in local time than naive (DST-blind) calendar arithmetic suggests — confirmed by explicit UTC-offset computation, not an error |
| | `w5-build-report.md` §7's evidence table staleness | **STILL STALE, third round noting it** | Unchanged since r5; a documentation-hygiene item, not runtime behavior |
| r3-13 | "Who was told" unconditionally empty in real mode | **FIXED in r3**, reconfirmed by source re-read | `siteAccess()`'s select list carries `changed_by, told_refs` |
| r4-14 | Person card's "role at firm" read the party classification, not the job title | **FIXED in r4**, reconfirmed by source re-read | `fetchRoleAtFirm(personID:companyID:)` reads `studio_person_affiliations.role_at_firm` |
| r4-15 | R-Q's consent sentence never reached the real card | **FIXED in r4**, reconfirmed live | Luis Ochoa's card, live: "Verbal consent, 10 Oct 2026, on the Okonkwo residence." (`ios-w5-review-r7`, not separately saved — matches r6's evidence) |
| r5-16 | The "Patina companion" bubble was not suppressed on the People room | **FIXED in r5**, reconfirmed by source re-read | `RootView.swift`: `.people` → `.hidden(.featureOwned)`, visibility a pure function of the route. Not re-shot live this round (unchanged code, already twice live-reconfirmed in r5/r6) |

## Rulings re-walked and re-confirmed clean

- **PR-r**: PR3 live this round: "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." Still no code column, no code-shaped free text anywhere on the card.
- **PR-t**: Chidi Okonkwo's card, live: "AUTHORITY ON THIS JOB — Signs money to an agreed amount." No figure anywhere (`ios-w5-review-r7/pr2-chidi-authority-r7.png`).
- **PR-w**: "Studio only. This card never reaches a client page." printed live on PR3 (not re-screenshotted separately this round; unchanged from r6).
- **Two writes only**: `recordNotice` (logged "Round 7 review check.", landed) and `mintFieldLink` (minted "Marcus Reyes," landed with a verified-correct expiry sentence) remain the only mutations exercised or discoverable across the five screens/sheet this round. No trade/homeowner write path, no studio-wide Directory browse, no compliance upload, no authority editing anywhere in the code.
- **R-AV**: clean for the seventh consecutive round (see above), now including a full re-read of `SupabaseSiteRequestService.swift`'s `seatConsent` function this round rather than only the prior grep.
- No force-unwraps/`try!`/`as!` anywhere in `Features/People`, `PeopleRoomService.swift`, `FieldRosterRules.swift`, `PeopleRoomCache.swift`, or the mocks — fresh grep this round, all clean.
- No `DispatchSemaphore`/`.wait()`/`Thread.sleep` in the People files; `PeopleRoomCache`'s synchronous file I/O on `@MainActor` is the established house pattern, not a fresh defect.
- Dark mode / Dynamic Type: not independently re-shot this round — code identical to r5/r6's already-clean, freshly-screenshotted pass on both axes. **Carried forward as clean on r5's evidence, not independently re-verified this round** (same caveat r6 stated).
- Scope discipline re-checked: no trade/homeowner write path, no compliance upload, no authority editing anywhere in the five screens/sheet; every write requires `session.ownerIdentity` via `requireOwner()`. (Finding 3 above is the one scope question this round surfaces, and it is not a write-surface or trade/homeowner leak.)

## Verdict

**Not clean** — 1 finding at BLOCKING-leaning severity (Finding 1, new this round,
high confidence, live-reproduced), 1 finding at MAJOR (Finding 2, carried forward
from r6's own disclosure, high confidence, fresh live measurement), 1 finding at
MINOR/product-scope-question (Finding 3, new this round, medium confidence, live
screenshot), plus the same three long-open items every round since r2 has carried
(r2-3, r2-5, both compile-green/source-only; r2-8, sim-verified live again this
round). r2-10/17 and r2-11 are **confirmed fixed** this round, live and by source
re-read respectively — real, verified progress since r6. R-AV remains clean for the
seventh consecutive round.

Finding 1 is the headline: a control this program built specifically to be the way
into "the single highest-value new mobile screen" (ux-4 §3) has a live, reproduced
dead zone inside its own visible tap target, undiscovered through six prior review
rounds because those rounds' evidence tables never named it — r6's own fix for the
adjacent defect class explains exactly why it exists and how to fix it (move
`.padding`/`.frame`/`.contentShape` inside the label, the pattern `PeopleTelLine`
and the five r6-fixed controls now use).

## Claim levels

- **Sim-verified**: R-AV grep and full source re-read; PR-r/PR-t wording; the two
  writes (record-notice and mint, both landing correctly, mint's expiry sentence
  independently verified correct across a DST boundary); r2-8's live AX-tree
  `enabled:false` vs. full-opacity rendering; r2-10/17's fix, live end-to-end
  (note logged and landed, link minted and landed); r2-11's fix, confirmed by
  source re-read; Finding 1's negative and positive tap-dispatch pair on
  `people.openSiteAccess`; Finding 2's fresh AX measurements on the mint result
  screen's three controls; Finding 3's live screenshot of Dana Kowalski's
  cross-project seat line.
- **Compile-green / source-re-read only**: r2-3, r2-5 (real-mode-only paths the
  mock's own pre-shaped fixture data cannot exercise); the r3-12 build-report
  staleness observation; light mode and Dynamic Type XXXL (carried forward on
  r5's live evidence); Finding 1's extension to `project.openRoster` /
  `project.openSite` on `ProjectDetailScreen.swift` (same code shape, not
  independently tapped live this round); Finding 2's off-glyph tap-dispatch claim
  for `people.mint.copy` / `Share it` / `Done` (mechanism proven live by r6 on the
  identical shape; not independently re-tapped this round, only re-measured).
- **Device-verified**: nothing — no physical-device or TestFlight run was made
  this round, consistent with every prior round.
