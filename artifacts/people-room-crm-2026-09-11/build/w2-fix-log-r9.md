# W2 fix log — round 9

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, from HEAD `1b07d5517`
("fix(people-room): W2 round-8 findings").

Five findings assigned: `QA-R9-1` (major), `CR9-1` (blocking), `CR9-2`
(blocking), `CR9-3` (major), `CR9-4` (major). Nothing else was touched — the
forty-seven unassigned r9 minors (`CR9-5` … `CR9-51`) are untouched and still
open. No server was started, no port taken, no database written, no production
anything.

## Gates, run at the end of this round

```
$ pnpm --dir <worktree>/apps/designer-portal run type-check     EXIT=0
$ pnpm --dir <worktree>/packages/supabase run type-check        EXIT=0
$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document src/components/document/rooms 'src/app/(document)/desk' \
    src/components/document/mobile src/components/document/coordination \
    src/components/document/__tests__ src/lib/analytics
  Test Suites: 269 passed, 269 total
  Tests:       4147 passed, 4147 total                          EXIT=0
$ npx eslint <the eight changed non-test files>                 EXIT=0, no output
```

4147 tests, up from r8's 4138: nine new assertions, listed per finding below.
No shared workspace package changed (the diff is `apps/designer-portal/src` and
one artifact file), so no dist rebuild and no admin-portal build was owed.

---

## QA-R9-1 · MAJOR — the text gate's sentence called a full do-not-contact block "never text"

**What was wrong.** One literal spoke for every rule carrying `sms` among its
forbidden channels. F-15 Frank Bauer's rule forbids `sms`, `mobile`, `office`,
`dispatch`, `after_hours`, `email` and `ap_email` and routes to Rosa Delgado —
R-BL's own hard-block example — and the card printed "The studio's rule for this
person says never text.", naming the one channel the rule does not single out,
inviting the email and the call it forbids, and dropping the routing instruction
entirely. The roster row carried the same defect in its own wording.

**What changed.**

- `apps/designer-portal/src/lib/document/contact-rule.ts:132-167` — new
  `contactRuleTextHeldClause(rule, routeName)`, derived off the same two facts
  R-BL keys its hard block on (`contactRuleIsDoNotContact` and the route), in
  the module that already exists so four faces read one rule. It returns
  `"says do not contact directly. Write <name> instead"`, `"says do not contact
  directly"` (route unresolved — R-L/C22: never a dangling id), `"routes contact
  through <name>"`, `"says never text"`, or `null`.
- `components/document/people/views/person-profile.tsx:77-89` — the literal
  becomes `ruleHeldTextSentence(clause)`; `RULE_FORBIDS_TEXT_SENTENCE` stays
  exported as `ruleHeldTextSentence("says never text")`, unchanged in wording.
  `:292-295` — `ruleHoldsText = contactRuleForbidsSms(rule) ||
  contactRuleIsHardBlock(rule)`, and `ruleHeldClause` is computed off the
  already-resolved `routeTo`. `:374-379` — the consequence slot branches on it.
- `components/document/roster/roster-row.tsx:248-259` — the same two facts, the
  row's own tail ("Change the rule on their card first."), off the `routeTo`
  prop the row already receives for its `ContactRuleLine`.

**The one behaviour change beyond wording.** The rail is now held by a HARD
BLOCK as well as by a `sms` prohibition. It is a strict superset — no act that
was held is now live — and it follows R-BL: a routed rule sends the studio to
another person, which a live composer on this one contradicts. A rule that
closes only the text rail (F-27 Ray Thao) is unaffected and still reads "says
never text"; F-11 Dana Kowalski (`forbidden={email}`) still texts freely.

**Evidence.**

- `src/lib/document/__tests__/contact-rule.test.ts` — five new assertions over
  the seed's own `FRANK_RULE` and `RAY_RULE` rows (do-not-contact + route;
  do-not-contact with the route unresolved; the single-channel rule; a routed
  rule with a channel still open; the two null cases). 28 tests pass.
- `people/__tests__/person-profile.test.tsx` — new: "names a do-not-contact
  block, and its route, instead of 'never text'". The card's `useStudioContacts`
  mock became a mutable ref (`rolodexData`) so the route can resolve to a real
  name, as `contactRouteTarget` requires. Asserts the act is
  `aria-disabled="true"` and the sentence reads "The studio's rule for this
  person says do not contact directly. Write Rosa Delgado instead. Change the
  rule above before any text goes out." 14 tests pass.
- `roster/__tests__/roster-row.test.tsx` — new: the same case on the row, with
  `routeTo={{ name: 'Rosa Delgado', … }}`. The existing r3 test (Dana Kowalski,
  `forbidden={['sms']}`, no route) is untouched and still asserts the "never
  text" wording, which is the regression guard for the narrow case. 24 pass.

---

## CR9-1 · BLOCKING — a seat line opened the field party sheet under a fabricated kind

**What was wrong.** `openSeat` coerced every non-field `party_kind` to `'sub'`
before opening `PartyProfileSheet`, which prints the role it is handed twice —
the eyebrow "Field crew · Subcontractor" (`party-profile-sheet.tsx:576`) and the
Kind row (`:330`). A `client_rep` household member (PR-c / C5), an `other` seat
(Ray Thao, Carol Nyström), a `client` (Adaeze Okonkwo) and a `vendor` (Claire
Bissett) each opened a sheet stating a kind the record does not hold, over their
real name, company and project, with a field-link band and an SMS composer under
it. Reachable in two clicks through both doors R-AA opened: the person card's
`SeatLine` (`person-profile.tsx:396`) and the Directory row's seat disclosure
(`person-row.tsx:236-239`), neither of which gates on kind the way
`roster-row.tsx:360` does with `seatProfileRole`.

**What changed.** `components/document/people/people-room.tsx:397-425` — the
first of the two fixes the finding names, the one that puts no false fact on any
face:

- a field-roster kind (`gc`, `sub`, `installer`, `receiver`) still opens the
  field sheet, and now under its OWN kind rather than a coerced one;
- every other seat goes where R-AA already sends a seat line — the PERSON'S
  CARD. The identity's directory role is read off the room's own `all` rows the
  way the deep-link handler at `:232-242` reads it, because `usePerson` filters
  on `role` and a guessed one returns no row; `"contact"` is the fallback (the
  `studio_contacts` branch a carded non-field person lives on).
- `setOpenFirm(null)` and `setOpenParty(null)` first, so the body's
  `openFirm ? … : openPerson ? …` chain lands on the card (the CR3-4 lesson).
- A seat with no `person_id` opens nothing rather than opening something false.

Option 2 in the finding (pass the real `party_kind`, drop the eyebrow) was not
taken: it fixes the two labels and leaves the field-link band and the SMS
composer standing on a household member's sheet, which the finding also names.

**Evidence.** `people/__tests__/people-room-address.test.tsx`, new describe
"the seat line's destination", two tests: an `installer` seat opens the party
sheet with `data-party="seat-1"` and `data-role="installer"`; a `client_rep`
seat opens NO party sheet and leaves the person card standing. The file's
`PersonProfile` stub now exposes an "open the seat" button wired to
`onOpenSeat`, and its `PartyProfileSheet` stub renders its `partyId` and `role`
instead of `null`, so the sheet's absence is observable. 8 tests pass.

**Residual, NOT fixed (out of this round's assignment).** The person card's
"Send a text" act calls `onOpenSeat(firstSeat)`; where that first seat is a
non-field kind the act now re-opens the card the reader is already on, rather
than opening a mislabelled sheet. No false fact, but no motion either. Recorded
here for the next round rather than fixed under a finding that did not name it.

---

## CR9-2 · BLOCKING — "No one by that name in the rolodex." printed under the people it had just found

**What was wrong.** `rolodex-picker.tsx:430-445` rendered the sentence UNGATED,
directly beneath `{hits.length > 0 && <ul>…</ul>}`, so every normal search on
SPEC §5.7's surface — Leah task 5's own screen — printed it under the matches.
Pre-existing on `origin/main`, inside the file W2c rewrote. The band's comment
explains the BUTTON's placement, not the sentence's.

**What changed.** `components/document/roster/rolodex-picker.tsx:430-442` — the
sentence is gated `{hits.length === 0 && …}` inside the band; "Add someone new"
stays exactly where it is, on every frame, which is what the band's comment
(mnote 3) is actually about.

**Evidence.** `roster/__tests__/rolodex-picker.test.tsx`, describe "the fallback
is always visible": the first test now asserts the way out is present, the hit
row (Rosa Martínez) is present and the empty sentence is ABSENT; the second test
("shows it on an empty rolodex too") is unchanged and is the guard that the
sentence still prints when the search finds nobody; the third no longer proves
"one sheet" through the fallback sentence but through the hit row itself. Both
rewritten assertions fail against the pre-fix file. 13 tests pass.

---

## CR9-3 · MAJOR — the company card's money-book line: settled by amending SPEC, and the door recorded as W3

**What was wrong.** SPEC §5.3 #7 and direction §3.3 R5 fix a read-only line
"Draw 1 waiver ledger, in the money book" as an INLINE ACT ("Open the money book
(inline)"). The card prints a plain `<p>` with different words and no control.

**What was found before choosing.** There is no money book. `grep -rn "money
book\|money-book\|moneyBook" apps/designer-portal/src` returns exactly two hits,
both inside `company-card.tsx` — the constant and its region comment. No route,
no surface, nothing to link to; R-B already ruled the money papers into a later
room, and `project_parties` carries no draw or waiver column, so SPEC's own
literal ("Draw 1") has no source either. Wiring an act would mean inventing a
destination and a number.

**What changed.** The second of the two fixes the finding names.

- `artifacts/people-room-crm-2026-09-11/specimens/SPEC.md:526` — §5.3 #7 amended
  with a **Specimen only** clause: the specimen keeps its inert inline act
  (R-AB), and the SHIPPED card prints the read-only sentence "Waiver ledger and
  draw state, in the money book." with no control, because no money book exists
  in this build and no draw number can be told truthfully. The inline door and
  the draw number in front of it are recorded, in the SPEC row itself, as **W3
  money-book work**. The specimen files were not touched, so they stay
  conformant to the row.
- `components/document/people/company-card.tsx:116-127` — a docblock on
  `MONEY_BOOK_LINE` carrying the settlement, so the next reader sees why the
  line is a sentence and does not wire it to a placeholder route.

No behaviour change; the card prints exactly what it printed before.

**W3 carry:** the company card's Jobs region owes an inline door into the money
book for this firm, and a draw number in front of it, when the money book and
the draw/waiver columns exist.

---

## CR9-4 · MAJOR — "Try again" could not retry the read it apologised for

**What was wrong.** `project-team-roster.tsx:109` called only
`projectQuery.refetch()`, while `isError` is driven by `rosterError` from
`useCallSheetRoster` — which returned no `refetch` at all
(`use-call-sheet-roster.ts:87-93`). When the roster read failed, which is the
case the sentence "The project roster could not be read." names, the act did
nothing for it and the band never cleared. A regression from W2c's repoint:
`origin/main` ran `Promise.all([rosterQuery.refetch(), projectQuery.refetch()])`.

**What changed.**

- `components/document/roster/use-call-sheet-roster.ts:55-64, 97-103, 111` —
  `CallSheetRosterResult` gains `refetch: () => Promise<unknown>`, a
  `useCallback` over the three composed queries' own `refetch` (roster, seats,
  authority), keyed on those three function identities. Additive: `call-sheet.tsx`
  and every other consumer is unaffected.
- `components/document/roster/project-team-roster.tsx:48, 106-114` — the act runs
  `Promise.all([refetchRoster(), projectQuery.refetch()])`.

**Evidence.** `roster/__tests__/project-roster-surfaces.test.tsx`,
"distinguishes a roster it could not read from an empty one": the roster and
seats mocks now carry their own `refetch` spies, the `use-project-authority`
mock carries `mockRefetchAuthority`, and the test asserts all three of
`retryRoster`, `retrySeats` and `retryProject` are called exactly once. Against
the pre-fix file the roster and seats spies are never called. 12 tests pass in
that file; the full roster suite is 90 green.

---

## What this round did not touch

`CR9-5` … `CR9-51` (the six new r9 minors and the forty-one carried r8 minors),
`QA-R9-2` (Northgate's warranty clause and tax-id line) and `QA-R9-3` (the
`?sheet=call` deep link) were not in the assignment and are unchanged. The
Playwright specs under `e2e/people` were not run — no port was taken.
