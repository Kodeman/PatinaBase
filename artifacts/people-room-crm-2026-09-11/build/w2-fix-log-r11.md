# W2 round-11 fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, on top of `104a00c9f` ("fix(people-room): W2 round-10
findings"). Thirteen findings assigned: QA-R11-1 and CR11-1 … CR11-12. No server started, no port
taken, nothing written to a database, nothing touched on Strata.

Gates run at the end of the round (all green):

```
pnpm --dir packages/supabase type-check          → clean
pnpm --dir packages/supabase exec vitest run     → 103 files, 1297 passed, 12 skipped
pnpm --dir apps/designer-portal type-check       → clean
pnpm --dir apps/designer-portal exec jest        → 585 suites, 7509 tests, all passed
pnpm --dir apps/admin-portal build               → compiled (shared @patina/supabase edits)
```

`@patina/supabase` resolves from source (`package.json main = ./src/index.ts`), and no
dist-resolved package (`@patina/types`, `utils`, `api-routes`, `api-client`, `help-system`) was
touched, so no dist rebuild was owed.

---

## QA-R11-1 · major · "Mint access" minted a FIELD link on a client's card

**What changed.**

- `apps/designer-portal/src/components/document/people/reach-access.tsx` — the mint act no longer
  reads the identity's first live seat of any kind. It takes four new props naming the **field**
  seat the token hangs off (`mintSeatId`, `mintProjectId`, `mintProjectName`, `mintWindowEnd`)
  plus `mintHeldSentence`. `mint()` refuses on `!mintSeatId`, `expiresAt` is computed from
  `mintWindowEnd`, and the act's `held`/`disabled`/consequence sentence all key on `mintSeatId`.
  New exported literal `MINT_CLIENT_SIDE_SENTENCE`.
- `apps/designer-portal/src/components/document/people/views/person-profile.tsx` — the mint seat is
  `textableSeat`, the same `isFieldRosterRole(seat.party_kind)` test the SMS thread already uses
  (CR10-1). `clientSide` is `isClientSideKind(directoryContactKind(person))`, and the held sentence
  branches on it. `warrantyEnd` now follows the mint seat.
- `apps/designer-portal/src/lib/document/people-derivation.ts` — `isClientSideKind()` exported over
  the existing `CLIENT_KINDS` set (`client`, `lead`, `client_rep`), the Directory's own chip test.

The existing seat props (`seatId`, `seatProjectId`, `seatProjectName`, `seatWindowStart`) are
untouched, because the consent band at `reach-access.tsx:854-856` reads its job from them and would
otherwise lose its "on the <project>" clause for a client.

**Why this shape.** `ACCESS_GRANT_TIER_OPENS.field_link` is "the Call Sheet and the site access
card"; PR-w rules the site access card studio-only with no client RLS branch. So the door is minted
on a field seat or not at all, and the held sentence names the door that IS the client's.

**Evidence.** New test, `reach-access.test.tsx` → "QA-R11-1 — a client-side card holds the act and
never mints a field link": the act carries `aria-disabled="true"`, its `aria-describedby` target
prints `MINT_CLIENT_SIDE_SENTENCE`, and `mintLink` is not called on click. The suite's other 39
tests (Dana Kowalski, a sub, whose field seat and first seat are the same row) stay green.

**The owed defence-in-depth check, done read-only.** The field-link redemption page is
`apps/client-portal/src/app/field/[token]/page.tsx`. It resolves the token through
`resolve_field_link` and renders the party's own coordination surface; a repo-wide grep for
`site_access` across `apps/client-portal/src` returns **no hits**, so no site-access-card content is
served on that page to any bearer today. The exposure named in the finding is not reachable
through the client portal as it stands; the wrong-tier record on the card is the part that was
real, and that is what this fix removes.

---

## CR11-1 · major · a SECOND `<h1>` on `/library` and `/library/judgments`

Took the second option in the finding (demote the two bodies), because `RoomShell` has ten tenants
and only these two carried their own `<h1>`; an opt-in prop would have needed a ruling per tenant.

- `apps/designer-portal/src/components/document/rooms/library/librarian-bar.tsx:32` — `<h1>` → `<h2>`
  (`m-0` added; the type classes are unchanged, so the rendered treatment is identical).
- `apps/designer-portal/src/app/(document)/library/judgments/page.tsx:122` — the `sr-only` `<h1>Side
  by side</h1>` is deleted. Its own comment said it existed *because* the RoomShell title was not a
  heading; it now duplicates the band's `<h1>`.

**Evidence.** `grep -rn "<h1" apps/designer-portal/src/components/document apps/designer-portal/src/app/(document)`
now returns exactly one `<h1>` reachable from a RoomShell tenant — `room-shell.tsx:165`.
`LibrarianBar` has one non-test call site (`library-room.tsx:175`) and its own suite
(`library-entrances.test.tsx`) asserts no heading, so nothing regressed; full designer jest green.

---

## CR11-2 · major · two counts of one book, one screen apart

`apps/designer-portal/src/components/document/people/people-room.tsx` — new memo
`directoryIdentityCount = all ? directoryIdentityRows(all).length : undefined`, passed to both
`PeopleCompactSelector` (`:551`) and `PeopleDesktopRail` (`:568`) in place of `all?.length`. The
head seventeen lines up already reads
`directoryHeadLine(directoryEntryCounts(directoryIdentityRows(all)))`, so the rail number and the
head now reduce the same rows.

---

## CR11-3 · major · a SEAT count printed as a PROJECT count

`apps/designer-portal/src/components/document/people/views/person-profile.tsx` — `person.seat_count`
(`identity_seat_count()`, R-BG) is replaced in the History sentence by `projectCount`, a memo over
the `seats` already read at `usePeopleSeats({ personId })`:
`new Set(seats.map(s => s.project_id).filter(Boolean)).size`. The dead ternary
(`=== 1 ? "projects" : "projects"`) is now a real singular/plural.

**Evidence.** Two new tests in `person-profile.test.tsx` → "the History sentence counts projects,
not seats": two seats on one job print "Worked 1 of the studio's project."; two seats on two jobs
print "Worked 2 of the studio's projects." Both fail against the old expression (which read 2 in
each case).

---

## CR11-4 · major · the company card printed the raw `company_kind` token

- `apps/designer-portal/src/lib/document/people-derivation.ts` — new
  `COMPANY_KIND_PROSE_WORDS` map and `companyKindProseWord()`, keyed **separately** from
  `COMPANY_KIND_SHORT_LABELS` (the column-head register). Every kind 00592's CHECK admits has an
  entry — `gc: "GC"`, `sub: "sub"`, `vendor: "vendor"`, … — except `other`, which has no prose word
  and returns `null`.
- `apps/designer-portal/src/components/document/people/company-card.tsx:142` — the trade branch now
  pushes `${getFieldTradeLabel(trade)} ${prose}`; with no prose word the trade and the short label
  become two separate `·` parts, so no token is ever glued to a trade.

This keeps SPEC §5.3 #1's literal ("Electrical sub") while removing the raw token: with `gc` the
line was "Carpentry & framing gc" and is now "Carpentry & framing GC"; with `other` it was
"Tile other" and is now "Tile · Other".

**Evidence.** New test in `company-card.test.tsx` → "prints the running-prose kind after a trade,
never the column token (CR11-4)". Seed evidence that the branch is live:

```
$ psql … -c "select company_name, company_kind, trades[1] from studio_contacts
             where entity_kind='company' and company_kind is not null and array_length(trades,1)>0"
 Boreal HVAC                   | sub      | hvac
 Cedar & Iron Framing          | sub      | carpentry_framing
 Halvorsen Cabinet Works       | workroom | cabinetry
 Lakeshore Painting Co.        | sub      | paint
 Northgate Electric            | sub      | electrical
 Rivera Finishes               | sub      | paint
 Rusk Mechanical               | sub      | plumbing
 Stonehaven Tile Gallery       | showroom | tile
 Twin Cities Drywall & Plaster | sub      | drywall
 Waterline Supply              | supplier | plumbing
(10 rows)
```

Ten of the seeded firms take this branch. The ruling the r6 log asked for is answered by the split
map rather than by widening `companyKindShortLabel`, which would have broken the SPEC literal
(`companyKindShortLabel('sub')` = "Subcontractor").

---

## CR11-5 · major · every chase draft said "a current certificate"

- `apps/designer-portal/src/components/document/people/compliance-table.tsx` — three new exports:
  `CHASE_ANY_PAPER_PHRASE` (the old literal, kept for the no-documents branch),
  `chaseTargetDocument(documents, today)` (lapsed first, earliest-lapsed of those; else the paper
  lapsing soonest), and `chaseDocumentPhrase(doc)` ("a current …", keeping an acronym's case and
  lowering a plain word).
- `apps/designer-portal/src/components/document/people/company-card.tsx` — `const chaseDoc =
  chaseTargetDocument(docs, today)`, and the mutation now sends `documentId: chaseDoc?.id ?? null`
  and `documentLabel: chaseDoc ? chaseDocumentPhrase(chaseDoc) : CHASE_ANY_PAPER_PHRASE`. The label
  is never null when a document exists, so
  `api/people/chase-renewal/route.ts:83`'s own fallback no longer fires, and
  `p_idempotency_key: compliance_chase:<company>:<document_id>` now keys on the paper that lapsed.

**Evidence.** Four new tests in `compliance-table.test.tsx` under "the paper a chase names". On the
local seed the firm the QA round pressed reads:

```
$ psql … Northgate Electric's documents, soonest-expiry-first
 coi_gl  | 2026-03-31 | {site_access,draw} | lapsed = t
 license | 2027-12-31 | {}                 | lapsed = f
 w9      | (none)     | {payment}          |
```

so the summary goes from `Chase Northgate Electric for a current certificate` to
`Chase Northgate Electric for a current COI, general liability`.

---

## CR11-6 · major · two dangling `aria-describedby`

- `apps/designer-portal/src/components/document/roster/roster-row.tsx:668` —
  `aria-describedby={!body.trim() ? \`${panelId}-send-held\` : undefined}`.
- `apps/designer-portal/src/components/document/roster/notice-log.tsx:139` —
  `aria-describedby={picked.length === 0 ? heldId : undefined}`.

Both now match the gating their siblings already used (`roster-row.tsx:526`, `:570`).

---

## CR11-7 · major · five card mutations left the seat lines stale

`packages/supabase/src/hooks/use-studio-contacts.ts` — `peopleSeatKeys.all` added to all five
`onSuccess` handlers (create, update, archive, restore, and the seat↔card link at `:556`), and the
raw `['people-directory']` literals in those handlers replaced with `peopleKeys.all` (the same key,
now the canonical one). The module already imported both key objects for the four fan-outs that did
it right. `grep -n "peopleSeatKeys.all"` now reports nine call sites: `282, 361, 392, 422, 556`
(the five fixed) and `745, 1021, 1199, 1487` (the four that were already correct).

---

## CR11-8 · major · a revoked door stayed on the party sheet

- `packages/supabase/src/hooks/use-party-sms.ts` — `partySmsKeys` gains
  `all: ['field-links'] as const`.
- `packages/supabase/src/hooks/use-access-grants.ts` — `useRevokeAccessGrant`'s `onSuccess`
  invalidates `partySmsKeys.all` alongside the four keys it already had, so the person card's
  Revoke tells the party sheet the same thing `useRevokeFieldLink` does (`use-party-sms.ts:203`).

---

## CR11-9 · major · minting from the party sheet left the Call Sheet on "On paper"

`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:491` —
`createLink.mutateAsync({ partyId, projectId: seatProjectId ?? undefined })`. `seatProjectId` was
already in scope and already passed to the revoke twenty-four lines down, so
`['project-roster', projectId]` is now invalidated on the mint as well as on the revoke.

---

## CR11-10 · major · eight live regions where the contract asks for one

Took both halves of the offered fix — the inline notices route through one announcer per surface,
and the bands themselves become paper.

**The People room** (`people-room.tsx`): new `announcement` state and one standing
`<p role="status" aria-live="polite" data-people-announcer className="sr-only">` rendered
unconditionally inside `RoomShell` — a live region that is always mounted, which the old
conditionally-mounted toast was not. `notify()` writes the toast *and* the announcer; the Add
sheet's `onAdded` writes `setNotice` (R83's inline band, still no toast) *and* the announcer. The
visible toast keeps `data-people-status` and loses `role="status"`/`aria-live`.

**The Call Sheet** (`call-sheet.tsx`): the same shape — `announcement` state, one standing
`data-call-sheet-announcer` sr-only line, the `added` band demoted to `data-call-sheet-added`, and
both `onAdded` paths writing the announcer. `RosterGroups` gains an optional `onAnnounce` prop
(`roster-groups.tsx`) and hands it to every `RosterRow`; `roster-row.tsx`'s `setNote` now writes its
note to paper (`data-roster-row-note`) and speaks it through that announcer, so thirty rows can no
longer hold thirty live regions.

**`project-team-roster.tsx`**: same pattern — one `data-project-roster-announcer`, the added band
demoted, `onAnnounce` passed to `RosterGroups`.

**Demoted to paper, announced by the surface that owns them**: `directory-view.tsx:377`
(`data-directory-notice`), `rolodex-seed-sheet.tsx:208` (`data-rolodex-seed-notice`).

**`room-shell.tsx:193`**: the leave veil loses `role="status"`/`aria-live` — it was a second live
region on every one of the ten Rooms, and the navigation that follows it is the announcement.

**`rolodex-picker.tsx:453`**: a refusal is not a polite live region. `role="status"` → `role="alert"`,
the idiom `add-person-sheet.tsx:1719` already uses in the same flow (this also closes CR11-61).

`person-profile.test.tsx`'s standing assertion `queryAllByRole("status")` → length 0 on the person
card still passes.

---

## CR11-11 · major · the Add sheet asked the wrong studio about a money grant

`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx` — the
`useProjectRecordedStudio` call is moved above `isOrgAdmin` (both unconditional hooks; the order is
stable), and `isOrgAdmin` now reads the membership role on `recordedStudioId` rather than on
`organizationId`, returning `false` when there is no recorded studio. The four
`project_party_authority_studio_*` policies gate on `project_party_recorded_studio()`, so the face
and the DB now answer the same question, and fail closed the same way. Authority is only written on
a seat kind, which already refuses to submit without a `projectId` (`:687`), so no path loses the
band to the new `null` branch.

---

## CR11-12 · major · the company card's Jobs region stated nothing

`apps/designer-portal/src/components/document/people/company-card.tsx` — new
`crewHoldsASeat = crew.some(a => (seatsByPerson.get(a.person_id) ?? []).length > 0)`, and the Jobs
region gates `NO_JOBS_SENTENCE` on `!crewHoldsASeat` instead of on `crew.length === 0`. `CrewJobs`
returns `null` for an empty seat array (`:191`), so a firm with affiliations and no live seats used
to render the heading, an empty `<ul>` and the money-book line. It now prints its sentence (C32 /
R-V).
