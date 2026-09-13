# W5 — Patina Field: the People room, scoped to the job in front of the designer

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build` (branch `build/people-room-crm-2026-09-11`)
App: **Patina Field**, on-disk `apps/mobile/Capture`, bundle `cloud.patina.field`, scheme `field://`
Nothing outside `apps/mobile/Capture/**` and this artifacts folder was touched. No prod DB write; every
Simulator run was mock mode (`CaptureKitMocks`), so nothing reached Strata or the local stack either.

**Claim ladder used throughout: compile-green < sim-verified < device-verified.** Section 7 states the level
of every claim. Nothing here is device-verified.

---

## 1. What was built

Three screens, one route, one seam, one cache, one mock, one UI test bundle.

| Screen | id | Route | What it answers |
|---|---|---|---|
| PR1 · Project roster | `screen.PR1.roster` | `.people(screen:projectID:personID:)` | Who is on this job, in four bands, and how to reach each of them |
| PR2 · Person | `screen.PR2.person` | same route, `personID` set | Who this person is, which channels are allowed, what they may approve |
| PR3 · Site access card | `screen.PR3.site-access` | same route | How a body gets on site, and who was told when it changed |

One route case carries all three, the way `.site(screen:…)` carries the twenty Site Request screens — so
`CaptureRoute` grew by one case, not three, and only `registryKey`'s switch had to move.

The mint (PR-s) is a sheet inside PR1, not a fourth screen id.

### Rulings the code enforces rather than remembers

| Ruling | Where it lives |
|---|---|
| **PR-r** — Patina never holds the gate code | `project_site_access_cards` has no code column (00625); `FieldSiteAccessCard` has no property for one; every free-text field on the card passes through `FieldSiteAccessRules.withholding()`, which replaces anything code-shaped with "The code is held off Patina; ask <name>." A code typed into `site_notes` at the desk still does not reach a job site. |
| **PR-t** — no threshold figure on a phone | `SupabasePeopleRoomService.fetchAuthority` does not select `threshold_cents`. The figure is not hidden on this surface; it never arrives on it. `FieldAuthorityWords.phoneSafe` is the second line of defence for a free-text grant: "Signs money to $2,500." → "Signs money to an agreed amount." |
| **PR-s** — Field may mint a link for someone met on site | `MintFieldLinkSheet` → `studio_contacts` insert (the card) → `project_parties` insert (the seat) → `create_field_link(p_party_id)`. The card and the seat are made in the same moment. |
| **PR-d / PR-l** — the link ends with the job | The mint prints the expiry in words off the seat's `on_site_to`; 00627's RPC already resolves the later of window end and warranty. |
| **PR-w** — the card is studio-only | Printed on the card's own face: "Studio only. This card never reaches a client page." RLS does the enforcing (00625). |
| **R-S** — the held clause prints wherever the rule is shown | On the collapsed roster row, with a 2px terracotta leading rule. |
| **R-T** — the opted-out note prints on the collapsed row | Same, not hidden inside an unfold. |
| **R-X** — at 390 the whole line is the tel: target | Site access "who to call first" lines and every roster row's phone line are ≥44pt, full width, and are `Link`s, not nested anchors (FM-6). |
| **R-U** — the site-access summary at the head of the roster | `FieldSiteAccessRules.headLine()`. |
| **R-V** — a fallback is a fact, never an empty region | "No contact rule on file.", "No grant on file.", "No open seat on this project.", "No phone on file". |
| **ux-4 §5 must-nots** | No studio-wide Directory, no compliance upload, no authority editing, no trade- or homeowner-facing write, no engagement chrome. Two writes exist and only two. |

---

## 2. Files

### New — CaptureKit (pure Foundation, no SDK)

- `apps/mobile/Capture/CaptureKit/CaptureKit/Work/PeopleRoomService.swift` — the seam and its DTOs:
  `FieldRosterBand`, `FieldRosterSeat`, `FieldProjectRoster`, `FieldPersonChannel`, `FieldPersonSeatLine`,
  `FieldPersonCard`, `FieldSiteContactLine`, `FieldSiteNotice`, `FieldSiteNoticeDraft`,
  `FieldSiteAccessCard`, `FieldLinkMintRequest`, `FieldLinkMint`, `protocol PeopleRoomService`.
- `apps/mobile/Capture/CaptureKit/CaptureKit/Work/FieldRosterRules.swift` — the tested rules:
  `FieldRosterWeek`, `FieldRosterGrouping` (bands), `FieldPhoneLine` (the `tel:` line),
  `FieldSiteAccessRules` (the way in, the no-code rule, the head line), `FieldAuthorityWords` (PR-t),
  `FieldPeopleDates` (dates and the "Last loaded …" line), `FieldPeopleVocabulary` (column → word).
- `apps/mobile/Capture/CaptureKit/CaptureKit/Work/PeopleRoomCache.swift` — the on-disk cache and the
  notice queue.

### New — CaptureKitMocks

- `apps/mobile/Capture/CaptureKitMocks/PeopleRoomMocks.swift` — `PeopleRoomFixtures` (the Okonkwo
  residence, fixture names verbatim: Luis Ochoa, Erin Sato, Tom Marrow, Dana Kowalski, Joe Wozniak,
  Ngozi Eze, Sam Rowe, Adaeze and Chidi Okonkwo, Priya Natarajan, Carol Nystrom, Pete Rusk, Ray Thao,
  Frank Bauer, Amara Osei, Ingrid Halvorsen, Rivera Finishes, Granite North) + `MockPeopleRoomService`.

### New — app target

- `apps/mobile/Capture/Capture/Features/People/ProjectRosterScreen.swift` (PR1 + `RosterRow` + `PeopleErrorState`)
- `apps/mobile/Capture/Capture/Features/People/PersonDetailScreen.swift` (PR2 + `PersonChannelRow`)
- `apps/mobile/Capture/Capture/Features/People/SiteAccessScreen.swift` (PR3 + `SiteAccessCallLine` + `SiteAccessCopy`)
- `apps/mobile/Capture/Capture/Features/People/MintFieldLinkSheet.swift` (PR-s)
- `apps/mobile/Capture/Capture/Features/People/PeopleSupport.swift` (word pigment, the `tel:` line, clauses, the stale line)
- `apps/mobile/Capture/Capture/Features/People/PeopleScreens.swift` (registrar)
- `apps/mobile/Capture/Capture/Features/People/SupabasePeopleRoomService.swift` (the real reads and the two writes)
- `apps/mobile/Capture/Capture/Features/People/PeopleRoomWire.swift` (PostgREST rows and payloads)
- `apps/mobile/Capture/Capture/Features/People/PeopleRoomServiceFactory.swift`

### New — tests

- `apps/mobile/Capture/CaptureTests/PeopleRoomTests.swift` — 43 Swift Testing cases (§5).
- `apps/mobile/Capture/CaptureUITests/PeopleRoomUITests.swift` — 3 XCUITest cases (§5).

### Edited

| File | Change |
|---|---|
| `CaptureKit/CaptureKit/Support/CaptureScreenID.swift` | +3 cases (`pr1Roster`, `pr2Person`, `pr3SiteAccess`); header count 75 → 78 |
| `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift` | +1 route case, `people(screen:projectID:personID:)` |
| `CaptureKit/CaptureKit/Navigation/RouteRegistry.swift` | +1 `registryKey` |
| `Capture/App/DeepLinking/CaptureDeepLink.swift` | PR ids route + land in the Work realm; the PR and SR case bodies lifted into `routePeopleScreen` / `routeSiteRequestScreen` (function-body-length) |
| `Capture/App/Composition/ScreenRegistry.swift` | registers `PeopleScreens` |
| `Capture/App/Composition/AppContainer.swift` | `peopleRoom` (real via factory, mock otherwise) + `peopleRoomCache` |
| `Capture/Features/Projects/ProjectDetailScreen.swift` | "Everyone on this job" opens PR1 from P2 — the Work-surface entry point |
| `scripts/generate_project.rb` | `CaptureTests` links `CaptureKitMocks` (the fixture assertions); new `CaptureUITests` UI-test bundle on the Capture scheme |
| `README.md` | screen table + counts (77 built, 78 total), the UI-test command |

### Not committed

`Capture/Capture/App/Configuration/Secrets.swift` was copied into this worktree from the main checkout
(it is gitignored, per-checkout). A real-mode build needs it; mock mode does not.

---

## 3. Data contract read

| Object | Source |
|---|---|
| roster | `people_directory_seats` (00626) filtered `project_id`, ordered `on_site_from` — `seat_id, person_id, project_id, project_name, party_kind, display_name, trade, stage, on_site_from, on_site_to, company_name, off_job_at, off_job_reason, phone_e164, consent_status, reach_state, paper_state, contact_rule_summary` |
| person | `people_directory` v4 (00626) + `studio_contact_channels` (00593) + `people_directory_seats` + `project_party_authority` (00624, **without** `threshold_cents`) |
| site access | `project_site_access_cards` (00625) + the key holder's seat + `projects.name` |
| notice | `record_notice` RPC (W3/W4) |
| mint | `studio_contacts` insert → `project_parties` insert → `create_field_link(p_party_id)` (00627) |

**One thing the brief named that does not exist yet.** `w3-data-report.md` and `w4-data-edge-report.md`
are not in `artifacts/people-room-crm-2026-09-11/build/`, and `grep -rl record_notice supabase/migrations/`
returns nothing — W3/W4 have not landed. `recordNotice` is therefore written against the RPC's named
shape and is **compile-green only**: against a database without it, PostgREST refuses, the screen prints
the refusal, and the notice queues for retry. It never reports a write that did not happen. When W3/W4
land, check `RecordNoticeParams` (`p_project_id`, `p_what`, `p_told`) and `NoticeRow`
(`id`, `what`, `recorded_at`, `recorded_by`, `told_names`) against the real signature.

The site access card has **no address column** (00625), so PR3 prints the job's name and no address in
real mode; the fixture carries one because the specimen does.

---

## 4. Offline

No read cache existed in this app before — `CaptureProjectCache` is SwiftData and holds project names and
room lanes, `CaptureKit/Sync` is a write outbox for captures. So W5 added a small on-disk store:

- one JSON file per object per project per owner, under Application Support, keyed by a stable hash of
  `userID|workspaceID` and of the project id (never a raw path component);
- the last good copy renders immediately with `FieldPeopleDates.lastLoaded(storedAt)` in ink —
  "Last loaded 10 minutes ago" — never a spinner;
- a refresh that cannot reach the studio leaves the copy standing and says so;
- the one write queues when it refuses: "No signal. This note will send when you have some.", the queued
  note prints in the log marked "Will send when you have signal.", and every later successful load drains
  the queue in order. A drain that refuses again leaves the queue intact and in order.

A corrupt or shape-changed file reads as "nothing cached", never as a crash.

---

## 5. Gate

`apps/mobile/Capture/scripts/capture-gate.sh all`, run against the iPhone 17 Simulator, tail verbatim:

```
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
```

Two lint violations were found and fixed on the way there (`AppContainer.init` 64 lines and
`CaptureDeepLink.route` 65 lines against the 60-line `function_body_length` limit, which `--strict`
promotes to errors); three unit tests failed first and were fixed (§6).

The project was regenerated with `ruby apps/mobile/Capture/scripts/generate_project.rb` after every file
add — `capture-gate.sh` and `capture-run.sh` do it themselves, and both were used.

### Unit tests — `CaptureTests/PeopleRoomTests.swift`, 43 cases, all passing

- **Band grouping** (9): the week runs Monday to Sunday; a window covering it is this week; one that has
  not opened is later; a bidder with no window is bidding; **off the job outranks an open window**; a
  window that closed before this week with no dated close still reads done; a wordless seat is never
  silently promoted; bands come back in order with their seats sorted; the Okonkwo fixture bands the way
  the specimen does (Luis Ochoa and Dana Kowalski this week, Pete Rusk later, Granite North done).
- **The `tel:` line** (7): the record's `phone_e164` wins; ten digits take `+1`; eleven led by 1 keep
  their own; a malformed E.164 falls back to the displayed number; too short to dial returns nil rather
  than a broken link; the URL carries digits and no punctuation; a row with no number says so.
- **The "no code" rule** (8): the way-in sentence names the lockbox version and who to ask and never a
  code; with nobody named it still refuses to hold one; a bare run of digits reads as a code; a phone
  number, a date and clock times do not; free text carrying a code is withheld and replaced with the
  standing sentence; ordinary free text is printed as written; **no line anywhere on the fixture card
  reads as a code**.
- **Authority, PR-t** (6): a threshold figure never survives to a phone; a line with no figure is left
  alone; every scope says the yes or the no with no digit in it; `prepares_only` outranks the scope; the
  fixture's household member shows "Signs money to an agreed amount." and not $2,500.
- **Vocabulary** (5), including: an unreadable consent record stays silent rather than reading
  "Not asked", and reach falls back to "On paper" and never to an account.
- **Offline** (7): nothing cached reads as nothing; the last good copy comes back with its stamp; one
  account's cached copy is not another's to read; the card caches whole; a notice queues and then drains;
  a drain that cannot reach the studio leaves the queue intact; the "Last loaded …" line.
- **The mint** (1): the expiry sentence and the link shape.

### UI tests — `CaptureUITests/PeopleRoomUITests.swift`, 3 cases, all passing

```
Test Case '-[CaptureUITests.PeopleRoomUITests testAPersonOpensFromARosterRow]' passed (7.248 seconds).
Test Case '-[CaptureUITests.PeopleRoomUITests testRosterOpensOnTheActiveProject]' passed (26.770 seconds).
Test Case '-[CaptureUITests.PeopleRoomUITests testTheSiteAccessCardOpensFromTheRosterAndHoldsNoCode]' passed (7.245 seconds).
** TEST SUCCEEDED **
```

They are **not** part of `capture-gate.sh` (that runs the CaptureKit logic bundle, which cannot drive a
screen). Run them with the command now in `apps/mobile/Capture/README.md`.

---

## 6. What failed first, and why it is worth knowing

1. `ProjectNameRow` collided with `SupabaseSiteRequestService`'s own row type — same module, same name.
   Renamed `PeopleProjectNameRow`.
2. `FieldAuthorityWords.phoneSafe` swallowed the full stop that ended the sentence along with the figure,
   because `.` was in the swallow set unconditionally. A separator now belongs to the figure only when a
   digit follows it.
3. The first week test asserted `DateInterval.contains` at both edges; `contains` is inclusive of `end`,
   so the Monday after the week read as inside it. The test now asserts the start's weekday and the
   duration, which is what the rule actually claims.
4. The bands are reckoned against `FieldProjectRoster.asOf`, supplied by the service, not a clock the
   screen reads. Without it the Okonkwo fixture (October 2026) banded everything as "later" on today's
   date, and a cached roster would silently reband itself as it aged on disk.

---

## 7. Claim level, line by line

**sim-verified** — iPhone 17 Simulator, udid `C8850509-C7DC-43C5-9226-9446404EE98A`, mock mode,
driven with `capture-run.sh <screen>` and the blitz-iphone tools with that explicit udid (never `booted`).
Screenshots in `artifacts/people-room-crm-2026-09-11/build/ios-w5/`:

| Shot | What it shows |
|---|---|
| `pr1-roster.png` | The roster: "Okonkwo residence", R-U's head line, "Open the site access card", the vitals line, the ON THE JOB · THIS WEEK band, rows with reach + stage words and a dialable number |
| `pr1-roster-bidding-done-and-mint.png` | The Bidding band (Rivera Finishes, "No response", "No phone on file") and the Done band (Granite North, "Off the job"), and the mint act |
| `pr2-person-dana-kowalski.png` | Field link · Texting · Lapsed, the consent sentence, the mobile with "Text them" offered on a consenting number, the bounced email with its terracotta clause, the contact rule, two seats |
| `pr2-person-chidi-authority.png` | **PR-t walked:** "AUTHORITY ON THIS JOB — Signs money to an agreed amount." No figure anywhere on the screen |
| `pr3-site-access.png` | **PR-r walked:** "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa." Plus PR-w's "Studio only…", the three call-first lines as full-width tel: targets, key holder, hours |
| `pr3-site-access-who-was-told.png` | Receiving, and the change log with "Log who was told" beneath it |
| `pr1-mint-field-link-sheet.png` | The mint sheet with its consequence sentence: "It never opens billing or the agreement." |
| `pr1-mint-field-link-result.png` | **PR-s walked:** "Marcus Reyes is on the roster. / Ends with the job, 30 September 2027." with the link and Copy / Share |

Also sim-verified by the three XCUITest cases: PR1 opens on the active project, PR3 opens from PR1's head
and carries the "held off Patina" sentence, and a roster row opens the person.

**compile-green (not exercised)** — every real-service path. `SupabasePeopleRoomService`'s five methods
were never run against Postgres in this pass: the Simulator ran on `CaptureKitMocks` throughout and no
`-CaptureForceReal` run was made. That covers the roster read, the person read, the site access read, the
`record_notice` call (whose RPC does not exist yet at all), and the three-step mint. The offline UI
(`PeopleStaleLine`, the queued-notice rows, the refusal copy) is compile-green too — the logic beneath it
is unit-tested, but no Simulator run drove a refusing service, because that would have meant adding a
mock failure switch nobody asked for.

**device-verified** — nothing. No physical-device run, no TestFlight build, no ASC call.

---

## 8. Owed, and not done

- **W3/W4's `record_notice`.** Does not exist. Check the two wire shapes named in §3 when it lands.
- **A real-mode pass.** Point a Simulator run at the local stack
  (`-CaptureForceReal -CaptureSupabaseURL http://127.0.0.1:54321 -CaptureSupabaseAnonKey <key>`) against
  the `people_crm_dev` seed and walk PR1/PR2/PR3. That is what moves §7's second block up a rung.
- **TestFlight.** Rulings §6 says Field ships to TestFlight with this program. It cannot yet: there is no
  App Store Connect app record for `cloud.patina.field` (`apps/mobile/Capture/README.md`'s own BLOCKED
  section), and creating one needs an interactive Apple-ID web session. `scripts/archive-testflight.sh`
  and `scripts/ExportOptions.plist` are standing and ready; `~/.blitz/asc-credentials.json` exists
  (presence checked by name only). The blocker is Kody's, not the build's.
- **The site access card's address.** 00625 holds none; PR3 prints the job's name alone in real mode.
- **The offline face on a Simulator.** See §7.
