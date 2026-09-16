# W5 fix log — round 4

Scope: **exactly** the two new MAJORs in `w5-review-r4.md` — 14 (the identity header's "role at
firm" read the party classification) and 15 (R-Q's consent sentence never reached the real person
card). Nothing else in that review was touched: r2-3, r2-5, r2-8, r2-10 and r2-11 remain open,
carried forward exactly as the review lists them.

Files changed, all under `apps/mobile/Capture/**`:

| File | Why |
|---|---|
| `Capture/Features/People/SupabasePeopleRoomService.swift` | `person(...)` rewritten: the affiliation read, the consent-sentence read, and the directory select |
| `Capture/Features/People/PeopleRoomWire.swift` | `DirectoryRow` corrected; `AffiliationRow`, `ConsentEvidenceRow`/`ConsentEvidenceParams`, `ChannelConsentRow`, `PeopleContactPhoneRow` added; `SeatRow` gains `company_id` |
| `CaptureKit/CaptureKit/Work/FieldRosterRules.swift` | `FieldConsentSentence` — R-Q's one wording, mirroring the portal's `consent-sentence.ts` |
| `CaptureTests/PeopleRoomTests.swift` | `FieldConsentSentenceTests`, five cases |

No `.swift` file was added, removed or renamed, so `project.pbxproj` is unchanged from r3
(`capture-gate.sh` regenerated the project on every invocation regardless).

---

## Finding 14 — the "role at firm" line read the party classification

**Fixed.** `people_directory.role` is gone from the select list entirely, and the header's second
half now comes from `studio_person_affiliations.role_at_firm` (00592:280) through a new
`fetchRoleAtFirm(personID:companyID:)`:

```
.from("studio_person_affiliations")
.select("id, person_id, company_id, role_at_firm, from_date")
.eq("person_id", value: personID)
.is("to_date", value: nil)
```

Open rows only, keyed to the firm on **the seat in front of the designer** — `person()` now binds
that seat (`guard let here = seatRows.first(where: { $0.projectID == projectID })`, which is the
same row r3's `.notOnThisJob` gate already proved exists) and prefers the affiliation whose
`company_id` matches `here.companyID`, falling back to the first open row. `SeatRow` and the shared
`seatColumns` gained `company_id` to carry that key; the column is on `people_directory_seats`
(verified below). No affiliation → `roleAtFirm` is nil and the header prints the firm alone, which
is the review's "printing nothing is honest" branch.

The value is printed **as written** (`owner`, `pm`, `superintendent`), which is exactly what the
portal's own person profile does (`views/person-profile.tsx:177-180` prints
`affiliation.role_at_firm` raw). No vocabulary map was invented for the phone. Note this differs
from `PeopleRoomFixtures`' hand-written prose ("owner-operator", "superintendent") — the fixture is
prose, the column is a token, and the portal prints the token.

**A prerequisite defect, found while fixing this and necessarily included:** the whole select list
was unreadable, not just `role`. `people_directory` (00626) carries **no `id`, no `name` and no
`company_name` column at all** — it is one row per identity keyed on `person_id`, with
`display_name` for the name:

```
$ psql … -c "select id, name, company_name from public.people_directory limit 1;"
ERROR:  column "id" does not exist

$ curl …/rest/v1/people_directory?select=id,name,company_name,role&limit=1
{"code":"42703",…,"message":"column people_directory.id does not exist"}
```

So `person(...)` in real mode did not print a wrong job title — it **failed outright** with a
PostgREST 42703 before any of it rendered, and fixing 14 or 15 without this would have been fixing
a line nobody could reach. The select is now
`person_id, display_name, reach_state, consent_status, paper_state, contact_rule_summary`, filtered
`.eq("person_id", value: personID)`, and `DirectoryRow`'s `CodingKeys` name those two real columns.
`firmName` now comes from the winning seat's `company_name` (the same column the roster row already
prints) rather than from a column that does not exist.

## Finding 15 — R-Q's consent sentence never reached the real card

**Fixed.** `FieldPersonCard(...)` now carries `consentSentence: said`, built by a new
`consentSentence(organizationID:personID:cardPhone:status:)`:

1. `rpc("identity_consent_evidence", …)` — 00626's own function, which picks **the record whose
   verdict won the identity's worst-first reduction** and returns that record's `channel_value`
   plus its two dates, already **one-sided** there (no `consented_at` when the deciding verdict is
   `opted_out`, no `opt_out_at` when it is not — w1b final review r5 MAJOR-2). None of that rule is
   restated on the phone; the phone only reads the record it names. `identity_phone_numbers()`
   finds the seats' numbers itself but cannot see the card's own, so `fetchCardPhone` passes
   `studio_contacts.phone_e164` in as `p_card_phone_e164`, the same argument the contacts branch of
   the view passes.
2. `studio_channel_consent` for that `channel_value` — `source`, `opt_out_source`, and the job the
   consent came from through the FK embed `origin_project:projects(name)`.
3. `FieldConsentSentence.compose(status:record:)` — R-Q's one wording.

Every leg is `try?`: a sentence that cannot be sourced is not printed and never costs the designer
the rest of the card. `status` is the word the card already prints
(`identity_consent_status()`'s, off `people_directory.consent_status`) — the phone never re-derives
a verdict.

`FieldConsentSentence` mirrors `apps/designer-portal/src/components/document/people/consent-sentence.ts`
exactly: `GRANT_PHRASE` / `REFUSAL_PHRASE` verbatim as `grantPhrase` / `refusalPhrase`, the same
`, on the <project>` clause, the same "no date → no sentence" refusal. Two deliberate details:

- The date is taken from the **record's own string** (`raw.prefix(10)`), never from a parsed `Date`
  rendered in the device's zone — `2026-10-10T01:00:00+00:00` is 9 October in Chicago, and a
  consent dated a day either side of what the studio wrote down is a different fact. This is the
  same slice the portal's `formatSeatDate` takes, and it is why `FieldPeopleDates.short` (which
  formats in the device zone) is not used here.
- `compose` takes `status:` plus a `Record` value rather than six flat parameters — swiftlint's
  `function_parameter_count` refuses six, and the grouping is the record anyway.

---

## Claim ladder

**Compile-green + unit-tested + query-shape-verified against the live local stack.** Not
sim-verified for these two paths and not device-verified: both are real-mode-only, the Simulator
runs `CaptureKitMocks` by default, and `MockPeopleRoomService` was deliberately left untouched
(finding r2-11 and the fixtures' hardcoded `roleAtFirm` / `consentSentence` are out of this pass's
scope), so no mock walk can distinguish these fixes. Stated plainly rather than dressed up.

**Gate** — `scripts/capture-gate.sh all`, sandbox disabled for the Xcode/CoreSimulator calls (inside
the sandbox it dies on CoreSimulatorService and DerivedData permission denials, same as every prior
round):

```
✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep
```

**The five new tests, run alone** (`-only-testing:CaptureTests/FieldConsentSentenceTests`):

```
✔ Test aGrantReadsAsTheSourceTheDateAndTheJob() passed
✔ Test aRefusalReadsOffTheRefusalsOwnSourceAndDate() passed
✔ Test noDateMeansNoSentenceRatherThanAFabricatedOne() passed
✔ Test anUnnamedSourceStillSaysTheFactItCanSay() passed
✔ Test theDateIsTheRecordsOwnAndNotTheDevicesZone() passed
✔ Test run with 5 tests in 1 suite passed
```

They pin R-Q's exact strings — "Written consent, 2 May 2025, on the Lindqvist kitchen.",
"Verbal consent, 13 Oct 2026, on the Okonkwo residence.", "Opted out by text, 3 Dec 2025, on the
Lindqvist kitchen." — the three examples `rulings.md` R-Q names.

**Every new query shape, probed against the local stack** (`127.0.0.1:54321`, service_role, local
only, no prod DB touched, read-only):

| Query | Result |
|---|---|
| `people_directory?select=person_id,display_name,reach_state,consent_status,paper_state,contact_rule_summary` | 200 |
| `people_directory?select=id,name,company_name,role` (the old one, control) | **400 / 42703** |
| `studio_person_affiliations?select=id,person_id,company_id,role_at_firm,from_date&to_date=is.null` | 200 — e.g. `role_at_firm: "owner"`, `"pm"` |
| `people_directory_seats?select=…,company_id,company_name,…` (the full `seatColumns`) | 200 |
| `studio_channel_consent?select=channel_value,source,opt_out_source,origin_project:projects(name)` | 200 — `{"source":"written","origin_project":{"name":"Okonkwo residence"}}` |
| `rpc/identity_consent_evidence` (p_organization_id / p_identity_key / p_card_phone_e164) | 200 |
| `studio_contacts?select=id,phone_e164` | 200 |

The embed resolves because `studio_channel_consent_origin_project_id_fkey` REFERENCES
`projects(id)`; RLS on the table is `studio_channel_consent_member_select` =
`is_active_studio_member(organization_id)`, which the authenticated designer satisfies for their own
studio.

**Sim regression check** (mock mode, iPhone 17, udid `C8850509-C7DC-43C5-9226-9446404EE98A`,
explicit): `capture-run.sh PR1.roster` → roster → Chidi Okonkwo's card. PR2 still renders whole —
"Okonkwo household · household member", "On paper" / "Not asked", channels, contact rule, seats,
"AUTHORITY ON THIS JOB — Signs money to an agreed amount." with no figure. That proves no regression
in the screen; it proves nothing about either fix, since the mock supplies both fields directly.

## Still owed after this pass

- A real-mode walk (device, or Simulator with `-CaptureForceReal` against the local stack) is the
  only thing that can promote either fix above compile-green. Neither was ever walked in real mode
  in any round; the 42703 above says the screen could not have loaded if one had been.
- `MockPeopleRoomService` still hardcodes `roleAtFirm` prose and two `consentSentence` strings, so
  the mock and the real path now diverge in shape (token vs prose). Out of scope here; worth a
  ruling.
- Everything the review carried forward: r2-3 (raw E.164), r2-5 (`alarm_ref`), r2-8 (disabled-row
  affordance), r2-10 (44pt tap targets), r2-11 (mock fallback card).

## Worktree note

`git fetch origin build/people-room-crm-2026-09-11` then
`git rev-list --left-right --count HEAD...origin/build/people-room-crm-2026-09-11` → `0 0`: the
branch is identical to origin, so `pull --rebase` had nothing to replay and was not forced against
W2's in-flight working tree (W2 has staged and unstaged designer-portal changes in this same
worktree; a rebase would have refused or, worse, autostashed them). The commit stages explicit
pathspecs only — the four Swift files and this log. `git add -A` was never run.
