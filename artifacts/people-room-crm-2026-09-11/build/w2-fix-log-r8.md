# W2 fix log — round 8

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, on top of `20802af7f` (the round-7 fix commit). Seven findings
assigned — two BLOCKING QA, one BLOCKING code, four MAJOR code. Nothing else touched. No migration
written, no prod touched, no server started. Local DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` (W1 + Okonkwo seed) read only.

DB evidence for every finding below: `build/probe309-w2-fix-r8.sql` / `.out`, read as
`designer@patina.dev` under RLS inside a rolled-back transaction.

**Gates, run here after the edits**

| Gate | Result |
|---|---|
| `pnpm --dir apps/designer-portal run type-check` (`tsc --noEmit`) | clean |
| `pnpm --dir packages/supabase run type-check` | clean |
| `pnpm --dir apps/designer-portal exec jest src/components/document src/lib/document` | **426 suites, 5788 tests, all passing** |

No shared workspace package was edited (every change is under `apps/designer-portal/src`), so no
dist rebuild and no admin-portal build is owed.

---

## QA-R8-1 — BLOCKING — the access-grant row's end date was one day past the seat's own window

**What changed.** `apps/designer-portal/src/components/document/people/access-grant-list.tsx` —
`grantEndsSentence` no longer prints `expires_at.slice(0, 10)` for a field link. A new local
`lastOpenDay()` backs the stored instant off by one second and takes the UTC date of the result,
i.e. the LAST DAY THE DOOR IS OPEN rather than the first day it is shut. Scoped to the field-link
tier; every other tier still prints its own instant's date unchanged.

**Why that shape rather than a flat minus-one-day.** `create_field_link`
(`00627_access_grants_and_field_link_window.sql:578-585`) stores an EXCLUSIVE boundary in three
different shapes, and only one of them is `window + 1 day`:

| RPC branch | Stored `expires_at` | Old print | New print |
|---|---|---|---|
| live window | `max(on_site_to, warranty_until) + interval '1 day'` → midnight | day AFTER the job | the window's last day |
| caller-supplied | `…T23:59:59Z` (the portal's own shape, `reach-access.tsx:728-729`) | same day | same day |
| ninety-day fallback | `now() + interval '90 days'`, mid-afternoon | same day | same day |

A blanket `-1 day` would have moved the second and third branches a day too early. Backing off an
instant answers all three with one rule.

**Evidence.** Probe §1, Dana Kowalski's Okonkwo seat:

```
 display_name  | on_site_to | warranty_until |       expires_at       | last_open_day
---------------+------------+----------------+------------------------+---------------
 Dana Kowalski | 2027-05-24 |                | 2027-05-25 00:00:00+00 | 2027-05-24
```

The card's Seats-on-projects line and its Mint-Access consequence sentence both read the seat's
`on_site_to` (24 May 2027) already; the grant row now reads it too.

**Tests.** `reach-access.test.tsx` — the grant-row fixture's `expires_at` was `2027-08-13T00:00:00Z`
asserting "13 August 2027", which pinned the defect: under the RPC's convention that stored value
means a window that ended on the 12th. The fixture is corrected to `2027-08-14T00:00:00Z` (what the
RPC actually stores for R-D's 13 Aug 2027 window) with the same expected string, and a new case
"the field link's end date is the seat's own last day, not the day after" pins Dana's 25 May
boundary → "24 May 2027", both other RPC branches, and a `doc_share` left untouched.

---

## QA-R8-2 — BLOCKING — 26px of horizontal overflow at 390 from one act label on the company card

**What changed.** `apps/designer-portal/src/components/document/people/company-card.tsx:650-670` —
the `set-firm-designations` act's children are now two spans: `Set designations` (`sm:hidden`) and
the full `Set paperwork contact, signer and site contact` (`hidden sm:inline`).

`.da-act`'s shared treatment carries `whitespace-nowrap` AND `shrink-0`, so letting the label wrap
would have meant overriding both from a caller and relying on Tailwind's utility ordering to win —
fragile. The second option the finding names (shorten the 390 label, keep the full sentence at
1440) is deterministic, and the three designations name themselves the moment the act is pressed:
the disclosure's own field labels read "Paperwork contact", "Signer", "Site contact", under the
region head "Crew & designations".

`sm` is 640px, so 390 takes the short name and 1440 the full sentence. The accessible name follows
the rendered span (a `display:none` element is out of the a11y tree). At 390 the short label
measures ~146px against the 390px viewport, against the 398px the old one measured.

No test or e2e spec referenced the string (`grep -rn "Set paperwork contact, signer and site
contact" apps/designer-portal` → the component and the review files only).

---

## CR8-1 — BLOCKING — the roster held clause spoke the company card's column head

**What changed.**

* `apps/designer-portal/src/lib/document/roster-derivation.ts` — a room-local
  `HELD_CLAUSE_PAPER_NOUNS` map and `heldClausePaperNoun(docType, fallbackLabel)` beside
  `heldClause`: `coi_gl → insurance`, `coi_wc → workers comp insurance`, `coi_auto → auto
  insurance`, `license → licence`, `bond → bond`. Those five are exactly
  `DATED_COMPLIANCE_DOC_TYPES` — the only papers that can lapse into this clause at all. Anything
  else falls through to the label the caller already held.
* `apps/designer-portal/src/components/document/roster/roster-row.tsx:187-199` — the clause's
  `docLabel` goes through it.

`COMPLIANCE_DOC_TYPE_LABELS` is **unchanged**, as the finding directs: "COI, general liability" is
correct as the company card's Paper-table Type column head (SPEC §5.3 #3).

**Evidence.** Probe §2 — Northgate Electric's blocking paper is `coi_gl`, `GL-22907-25`, expiring
`2026-03-31`, blocking `{site_access,draw}`, so the clause paints on Dana Kowalski's row. It now
reads SPEC §5.4 #7's string verbatim: "Site access held. Northgate Electric's insurance lapsed 31
March 2026."

**Tests.** `roster-row.test.tsx` pinned a FICTIONAL doc type (`coi_general_liability`) mocked
straight to `'insurance'`, so it passed on a value the seed does not hold. The mock now carries the
real table (`coi_gl: 'COI, general liability'`) and the fixture the real `coi_gl`, with an added
`expect(clause?.textContent).not.toContain('COI')`.

---

## CR8-2 — MAJOR — QA-R7-3's fix had dropped every `designer_clients` record, not the duplicate

**What changed.** `apps/designer-portal/src/lib/document/people-derivation.ts:838-905`.
`directoryEntryIsLegacyClientRecord` is kept as-is (it is still the correct unconditional gate
inside `directoryDuplicatePairs`, which the finding says to leave alone). `directoryIdentityRows`
now builds the set of PERSON CARDS in hand — `role === 'contact'`, `entity_kind !== 'company'`,
their `profile_id`s and their ten-digit phones — and excludes a `client` row only when its own
profile or phone resolves to one, through a new `directoryEntryIsCardedElsewhere(row, carded)`.

**Evidence.** Probe §3, read as `designer@patina.dev`: of the studio's seven `client` rows, exactly
ONE collides with a person card —

```
            display_name            | profile_hits_card | phone_hits_card
------------------------------------+-------------------+-----------------
 Client User                        | f                 | f
 Client User                        | f                 | f
 Elena Marlowe (no-login household) | f                 | f
 Karin Lindqvist                    | f                 | f
 Nora Ellison                       | f                 | f
 The Ashfords (no-login household)  | f                 | f
 The Okonkwo household              | f                 | t
```

"The Okonkwo household" (Adaeze's own number) still drops — the row QA-R7-3 was actually about. The
other six stay, so the head returns to **41 people · 21 firms** (probe §4: 42 raw person-shaped rows
minus the household), Karin Lindqvist is reachable again as SPEC §3's head derivation requires, and
the Clients chip stops listing five prospects with none of the studio's client records.
`portfolio-view` and `nurture-view` read those same rows, so the room no longer disagrees with
itself.

**Tests.** `people-directory-derivation.test.ts` — both QA-R7-3 cases pass unchanged (the household
still drops on the phone collision). Two added: "keeps a client record the studio holds no card
for" (Karin Lindqvist stays; head counts 2) and "drops a client record whose LOGIN already holds a
card" (the profile leg).

---

## CR8-3 — MAJOR — the trade chips narrowed on the card while the row printed the seat

**What changed.**

* `apps/designer-portal/src/lib/document/people-derivation.ts` — a new pure
  `directoryTradeAdmits(row, trade, seatTrade)` beside `directoryTradeOf`, carrying the SAME
  precedence `personIdentityLine` uses: the card's own trade/specialty first, the seat's after it.
* `apps/designer-portal/src/components/document/people/views/directory-view.tsx:340` — the
  predicate is `directoryTradeAdmits(row, trade, seatTrades.get(row.person_id))`, handing the filter
  the index the line at `:556` already reads. `seatTrades` added to the memo's deps.

**Evidence.** Probe §5 — every carded crew/sub person card in the book: `card_has_trade_key = f`,
`card_specialties = []`, while the seat carries `electrical`, `carpentry_framing`, and so on. Before
this change `directoryTradeOf` returned `null` for all of them, so all eight chips — under Crew and
under Makers — narrowed to zero rows and printed "Nobody under this narrowing yet." over rows
reading "· electrical".

The finding's separate note ("decide whether the Makers trade line should render specialties rather
than field trades") is a **ruling owed, not fixed here** — no maker specialty value
(`tile_stone`, `plumbing_fixtures`, `lighting`, `millwork_fabrication`) is a `FieldTrade`, so the
Makers trade line still answers with the wrong vocabulary. Out of this finding's stated scope.

**Tests.** Three added cases under "CR8-3 — the trade chip narrows on the trade the row prints":
a carded crew member admitted on their seat's trade (and NOT admitted with a null seat trade — the
defect itself), the card's own value outranking the seat, and `all`.

---

## CR8-4 — MAJOR — nothing in the portal could create a company card

**What changed.** `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx`
— the firm field is now create-or-match rather than match-only, the second option the finding names.
`useAddStudioContact` is wired in as `addFirmCard`; `submitParty` files a `company` card BEFORE the
seat is written, and the seat then carries a real `company_id` and the person a real affiliation:

* fires only when the studio typed a name, no card was picked, and the JOB records a studio
  (`recordedStudioId`) — CR5-1's rule, because a card minted into the book's org on a job recording
  another studio fails `assert_project_party_cards()` and strands a row. Where the job records no
  studio the typed name stays the snapshot string it is today, and the existing `noBookClause`
  already tells the studio what was not kept.
* matches an existing firm case- and space-insensitively before filing, so "a firm typed twice is a
  firm the rolodex holds twice" (this field group's own rule) still holds.
* takes the person's own kind as `contact_kind` (`sub`, `gc`, …) — the shape every seeded company
  card carries (`select entity_kind, contact_kind … from studio_contacts`: 8 `company`/`sub`, 2
  `company`/`gc`, …).
* records itself in `chainRef.firmCardId`, so CR-20's resume-never-restart contract holds: a press
  that fails at a later step does not file the firm twice on the retry.
* `firmCardId = matchedFirm?.id ?? chain.firmCardId` now feeds BOTH the seat's `companyId` and the
  `setAffiliation` write, which was previously gated on `matchedFirm` alone.

With this, a firm the studio meets for the first time becomes a Directory firm row, gets a company
card, and can hold its COI, W-9, payee and chase — the spine direction §1 line 5 makes the company
card the sole writer of. `w2b-report.md:40`'s "firm create-or-match" is now true of the code.

**Not done, and named:** the "Add firm (secondary)" Room-head control of direction §3.1 is still
absent. The finding offers either path; this is the one that closes the data hole in the flow the
studio actually uses. A standalone head act is a new sheet and new vocabulary — outside "fix
exactly these findings".

**Tests.** `add-person-sheet-kinds.test.tsx` — the mock gains `useAddStudioContact`. The case "a
firm typed by hand has no card yet, so no id is sent" pinned the defect and is replaced by three:
"files a company card for a firm typed by hand, and ties the person to it" (asserts the mint's exact
arguments, the seat's `companyId`, and the affiliation), "matches a firm the book already holds
rather than filing it twice" (`"  cedar & iron framing "` → `firm-cedar`, no mint), and "files no
firm card where the job records no studio" (back to the snapshot string).

---

## CR8-5 — MAJOR — the Call Sheet roster row was the one surface printing the paper word ungated

**What changed.**

* `apps/designer-portal/src/components/document/roster/roster-groups.tsx` — a `cardKindById` index
  built from the `useStudioContacts(consentOrg)` read the file ALREADY makes for the rule routes, and
  a `contactKind` prop handed to each `RosterRow` keyed on `row.personId`.
* `apps/designer-portal/src/components/document/roster/roster-row.tsx` — the unfold's paper word is
  now `{partyKindOwesPaper(contactKind ?? row.partyKind) && <StateWord family="paper" …/>}`, the same
  predicate the picker mini row took for QA-R6-1 and the Directory row, the person card and the
  company card all use.

Reading the CARD's kind is what makes it work: `project_parties_party_kind_check` has not been
widened (a declared W3 gap, `w2a-report.md` §6 item 2), so `row.partyKind` alone cannot answer.
Probe §6 —

```
 display_name  | party_kind | card_kind
---------------+------------+-----------
 Carol Nyström | other      | inspector
 Dana Kowalski | sub        | sub
 Ray Thao      | other      | inspector
```

`people_directory_seats.person_id` IS the card id for a stamped seat (00626's identity key takes
`studio_contact_id` first), confirmed against the seed, so `row.personId` is the join. A row with no
card resolved falls back to its seat's kind — today's behaviour.

Adaeze's and Chidi's `client` / `client_rep` "Not on file" is deliberately UNCHANGED: the finding
names it as CR8-30 (CR7-6), a ruling owed rather than a settled rule.

**Tests.** Two added under "CR8-5 — the paper word is owed before it is printed": an inspector row
(`partyKind: 'other'`, `contactKind: 'inspector'`) printing no paper word, and a sub with no
`contactKind` still printing one off the seat kind.

---

## What this round did not touch

* QA-R8-3 (MINOR — dead `contactRuleBlocks` still pinning the pre-R-BL heuristic) was not in the
  assigned set; `contactRuleBlocks` and its test are unchanged.
* CR8-6 … CR8-44, the forty-one carried r7 minors, were not in the assigned set.
