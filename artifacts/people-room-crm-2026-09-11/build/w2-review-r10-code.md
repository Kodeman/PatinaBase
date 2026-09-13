# W2 adversarial code review — round 10

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD **`412937520`**
("fix(people-room): W2 round-9 findings"). No server started, no port taken,
no database written, nothing touched on Strata.

Read first, in full: `rulings.md` (§1–§6, through R-BM), `synthesis/direction.md`
§1–§6 + §3.9, `specimens/SPEC.md` §3/§5/§6/§7/§8, `build/w2a-report.md`,
`w2b-report.md`, `w2c-report.md`, `w2-review-r5-code.md`, `w2-review-r5-qa.md`,
`w2-fix-log-r5.md`, `w2-review-r9-code.md`, `w2-fix-log-r9.md`,
`w1a-report.md`, `w1b-report.md`. Then the whole diff against `origin/main`
under `apps/designer-portal/src`, `packages/supabase/src/hooks`,
`packages/types/src` (106 files, +23,273 / −5,131).

---

## 0. Gates, run here at HEAD `412937520`

```
$ pnpm --dir <wt>/apps/designer-portal run type-check
> tsc --noEmit
DESIGNER_TC=0

$ pnpm --dir <wt>/packages/supabase run type-check
> tsc --noEmit
SUPABASE_TC=0

$ pnpm --dir <wt>/apps/admin-portal run build
…
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
ADMIN_BUILD=0

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster src/lib/document \
    src/components/document/rooms 'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__ src/lib/analytics
Test Suites: 1 failed, 268 passed, 269 total
Tests:       4146 passed, 4146 total
  ● people/outreach/__tests__/audiences-tab-scope.test.tsx
    A jest worker process (pid=12750) was terminated by another process: signal=SIGSEGV
$ npx jest --silent -w 1 src/components/document/people/outreach/__tests__/audiences-tab-scope.test.tsx
Test Suites: 1 passed, 1 total   ← worker SIGSEGV, not a test failure

$ cd packages/supabase && npx vitest run src/hooks/__tests__
Test Files  90 passed (90)
     Tests  1176 passed | 12 skipped (1188)
EXIT=0

$ npx eslint src/components/document/people src/components/document/roster \
    src/lib/document/{people-derivation,roster-derivation,contact-rule}.ts src/lib/analytics
✖ 5 problems (0 errors, 5 warnings)   ← all pre-existing kinds; react-hooks
                                         rules are ON, so 0 rules-of-hooks errors
```

All four named gates green.

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| `useFeatureFlag('call-sheet')` anywhere | **none**. The surviving `'call-sheet'` strings are the registry ledger key, the `ticket-derivation` overlay token, and two test mocks (CR10-25) |
| A writer of `sms_consent_status` / `sms_opt_out_at` / `sms_consented_at` / the other five frozen columns in `apps/` or `packages/` | **none**. Every hit is `database.types.ts`, a docblock, a READ of `v_project_roster.sms_consent_status` (00594's repointed column), or a locally-constructed synthetic roster object (`roster-derivation.ts:149`) |
| Consent writes | only `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` RPCs (`use-consent.ts:297,327,356`, `use-coordination.ts:499,780`). No table write to `studio_channel_consent` anywhere in `apps/` or `packages/` |
| Hard delete | two. `project_parties` behind `seatDeleteRefusal` (`use-coordination.ts:951`) and `studio_contact_rules` in `useClearContactRule` (`use-studio-contacts.ts:1092`, CR10-9). No other `.delete()` in the People hooks |
| Site access code field | none. `project_site_access_cards` has no code column; `site-access-card.tsx` has no input for one; `"Studio only. This card never reaches a client page."` prints at `:291`; the card is imported only by `call-sheet.tsx`, never by `apps/client-portal` |
| `box-shadow` in changed files | 0 in components. Three hits in `globals.css`, all pre-existing (`:360` the sheet elevation, `:1942` a print reset) and one in a `state-word.tsx` comment |
| CSS custom properties used but undefined | one: `--color-linen` (CR10-31). Every other apparently-undefined token (`--font-heading`, `--doc-mobile-bar-height`, `--wash`, `--ink-x/y`, `--strata-cycle`, `--doc-quiet-reserve`) is published at runtime and every use carries a fallback. PR-v's alias block (`globals.css:2004-2032`) sits on bare `:root` and resolves all four `STATE_WORD_PIGMENTS` pairs |
| `disabled` attribute on an act | every People/roster `DocumentAction` that passes `disabled` also passes `held`, so the rendered attribute is `aria-disabled`. Three transient exceptions + one `<option>` + one raw `<button>` survive (CR10-26, CR10-27, CR10-24) |
| `aria-expanded` pairs with a real id | 17 sites, all paired with `aria-controls`, and every panel id is rendered unconditionally with `hidden={…}` — no dangling target |
| One live region | **no**: eight (CR10-16) |
| Analytics | no inline `posthog.capture` in any People/roster surface; every event goes through `lib/analytics/people-events.ts` |
| Ad-hoc fetch to a service | none. The one `fetch` is `compliance-chase.ts` → the portal's own `/api/people/chase-renewal` route, which proves studio membership through the caller's RLS before enqueuing with the service role |
| Types redefined | none found; `party.ts`'s hand-written kind list now imports `PartyKind` from `@patina/types` |
| dist packages rebuilt | `packages/types/dist/*` written `2026-09-13 07:34`, src `2026-09-12 20:57`/`22:48`; `partyKindOwesPaper`, `PARTY_KINDS_ACCEPTED_BY_DB`, `STATE_WORD_PIGMENTS`, `resolveStateWord` all present in `dist/*.d.ts`. utils / api-routes / api-client / help-system untouched by this diff |
| Playwright under `e2e/people` | six specs, all `test.skip(({browserName}) => browserName !== 'chromium')`, `test` from `../fixtures/auth`, DB assertions through `../helpers/supabase-admin` under `expect.poll`, no `networkidle`, no `waitForTimeout`. Shape-checked, **not run** — no port taken |

## 2. Round 9, re-checked at this HEAD

The five assigned r9 findings are **all FIXED**, verified in the code, not from the log:

| r9 id | Verified at HEAD |
|---|---|
| QA-R9-1 | `contact-rule.ts:132-167` `contactRuleTextHeldClause` exists and is read by `person-profile.tsx:292-295,374-379` and `roster-row.tsx:248-259`. Frank Bauer's seeded rule (forbids all seven channels, routed) now reads "says do not contact directly. Write Rosa Delgado instead" |
| CR9-1 | `people-room.tsx:413-425` — `isFieldRosterRole` gates the party sheet; every other seat resolves its own directory role off `all` and opens the person card. No coercion to `'sub'` remains |
| CR9-2 | `rolodex-picker.tsx:430-442` — the empty sentence is gated `hits.length === 0`; "Add someone new" still prints on every frame |
| CR9-3 | `SPEC.md:526` carries the **Specimen only** amendment; `company-card.tsx:116-127` carries the settlement docblock on `MONEY_BOOK_LINE` |
| CR9-4 | `use-call-sheet-roster.ts` exposes `refetch` over all three composed queries; `project-team-roster.tsx:106-114` runs `Promise.all([refetchRoster(), projectQuery.refetch()])` |

**The forty-seven unassigned r9 minors (CR9-5 … CR9-51) are every one still OPEN.** Each was
re-read at this HEAD and re-verified against the code and, where the claim is about
data, against the local database. They are carried below as CR10-9 … CR10-55 with
their r9 id in brackets.

---

## 3. Findings

### CR10-1 · BLOCKING · high confidence (NEW — the residual r9's own fix log recorded and left) — the person card's seat lines, and its "Send a text", are INERT for every non-field seat

`people-room.tsx:413-425`:

```ts
const openSeat = (seat: PeopleDirectorySeat) => {
  if (isFieldRosterRole(seat.party_kind)) { setOpenParty({…}); return; }
  const personId = seat.person_id;
  if (!personId) return;
  const resolved = all?.find((p) => p.person_id === personId)?.role ?? "contact";
  setOpenFirm(null); setOpenParty(null);
  setOpenPerson({ id: personId, role: resolved });   // ← the card already open
};
```

`onOpenSeat={openSeat}` is passed to exactly one component — `PersonProfile`
(`people-room.tsx:445`). It is **not** passed to `DirectoryView` (grep: no other call
site), so the Directory row's seat disclosure correctly falls back to
`onOpen()` (`person-row.tsx:238`) and R-AA is satisfied there.

On the PERSON CARD it is not. Two controls call it:

- `person-profile.tsx:396` — `<SeatLine seat={seat} onOpen={(s) => onOpenSeat?.(s)} />`, one per live seat under "Seats on projects";
- `person-profile.tsx:381-392` — the "Send a text" act, `onClick={() => { if (firstSeat && onOpenSeat) onOpenSeat(firstSeat); }}`.

For a seat whose `party_kind` is not one of `gc`/`sub`/`installer`/`receiver`,
`openSeat` sets `openPerson` to the id already open at the same role
(`people-room.tsx:440-448` renders `<PersonProfile personId={openPerson.id} …>`),
so the press re-renders the identical card and **nothing moves**. SPEC §7 #13 /
R-AB sanction inert acts in the *specimens*; this is the shipped room, where an
enabled button that writes nothing and goes nowhere is the defect R-AA was
written against.

Reachable on the local seed today: Adaeze Okonkwo is `contact` / `party_kind =
client`, one live seat on the Okonkwo residence. Open her card, press the seat
line under "Seats on projects" — an enabled `button[data-seat-line]` — and the
screen does not change. The same holds for Chidi Okonkwo (`client`), Ray Thao
and Carol Nyström (`other`), Claire Bissett (`vendor`), Sam Rowe (`architect`).

"Send a text" is held for all of them **only because** their consent is
`not_asked` on the seed (`person-profile.tsx:293` `canText = person.consent_status
=== "granted" && !ruleHoldsText`). The moment Leah performs task 2 and records
Adaeze's consent through the card's own "Record consent" door, the act goes live
and does nothing — an enabled act, under the sentence "This sends one text to
the number on file", that sends nothing and opens nothing.

The r9 fix log names this itself, under CR9-1: *"the act now re-opens the card
the reader is already on… No false fact, but no motion either. Recorded here for
the next round rather than fixed."*

**Fix.** Direction §3.2 R4 already names the seat line's destination on the card:
"Open the Call Sheet (inline)" — `/doc/<project>?sheet=call`, which every seat
has regardless of kind. Point the card's `SeatLine` there, and point "Send a
text" at the one surface that can compose one (the seat's party sheet for a
field kind; otherwise hold the act with the sentence that says so, the way
`MINT_WITHOUT_SEAT_SENTENCE` already does for a card with no seat).

---

### CR10-2 · MAJOR · high confidence [CR9-51, CR8-11] — the Directory prints "No open seat on this project." underneath a disclosure that just said "2 seats"

`person-row.tsx:96-101` enables the seats read only when the disclosure opens:

```ts
const { data: seats } = usePeopleSeats({ personId: seatsOpen ? person.person_id : null });
```

and `:241-246` renders

```tsx
{seatsOpen && (seats ?? []).length === 0 && (
  <li className="t-body-sm py-2 text-[var(--ink-subtle)]">No open seat on this project.</li>
)}
```

Two defects in one line. (a) `seats` is `undefined` for the whole first
round-trip, so the sentence prints on **every** first expand of **every** row,
directly beneath a trigger reading `{seatCount} seats` (`:225`) — the count and
the sentence contradict each other on screen. On the seed, Dana Kowalski's row
says "2 seats" and then says there are none. (b) The sentence itself is R-V's
**project-scoped** fallback, quoted verbatim from the person card's "Seats on
projects" region; the Directory is the cross-project ledger and names no
project, so the words are false there even when the list really is empty.

**Fix.** Branch on the query's own `isPending`/`isFetching` (print nothing, or
the room's "Reading…" voice) and give the Directory its own sentence — the seats
it is missing are not "on this project".

---

### CR10-3 · MAJOR · high confidence [CR9-32, CR8-30] — a PHONE line marked "It bounces" prints "This address bounced back… Texts and calls still reach them."

`reach-access.tsx:97-110`:

```ts
export function heldChannelReason(channel: StudioContactChannel): string {
  switch (channel.status) {
    case "bounced":
      return `This address bounced back${dated}. Texts and calls still reach them.`;
    …
```

keyed on `status` alone. `isPhoneChannel(channel.channel_kind)` exists four
lines above (`:92`) and is called at `:353`, and it is not consulted here.

This is not hypothetical: the status editor this wave added
(`CHANNEL_STATUS_WORDS`, `:126-131`, written to through
`useSetStudioContactChannelStatus`) offers **"It bounces"** on every channel row
regardless of kind, so a studio marking Dana Kowalski's mobile as bouncing gets,
beside `(612) 555-0111`, a sentence that calls a phone number an address and
then promises that texts and calls still reach her on the very line it has just
declared held. Two clicks, no seed change, a self-contradicting fact on the
card direction §3.2 R2 makes the home of reach.

(The seed's one held channel is Dana's `email`, status `dead`, so the wrong
branch is not on screen at rest — see CR10-56 for what that costs SPEC §5.2 #3.)

**Fix.** Branch `heldChannelReason` on `isPhoneChannel(channel.channel_kind)`
and give the phone half its own words ("This number bounced a text back…",
"Calls still reach them."); or narrow the editor so "It bounces" is offered only
on an email kind.

---

### CR10-4 … CR10-8 — new minors found this round

| id | Confidence | Finding |
|---|---|---|
| CR10-4 | high | `party-mini-row.tsx:149,153` — `truncate` (i.e. `text-overflow: ellipsis`) on the picker mini row's NAME and its firm/trade line. SPEC §8 #5 names `text-overflow` forbidden and direction §1 line 9 fixes "rows wrap instead of truncating"; this is Leah task 5's own surface, where a long firm name is exactly what the studio is scanning for. Pre-existing (`git show origin/main:…party-mini-row.tsx:118,122,127`) inside the file W2c rewrote — the same class as CR10-30 (`placeholder=`) and CR10-51 (the ✓ glyph). `rolodex-seed-sheet.tsx:80` and `view-shell.tsx:298` carry a third and fourth, both untouched by this wave |
| CR10-5 | high | `person-row.tsx:165-183` — the 390 row's line 2 renders `reach · consent · paper` with the FIRST middle dot unconditional: `<StateWord family="reach"…/><span aria-hidden>·</span><StateWord family="consent"…/>`. `StateWord` renders `null` for a value that names no word (its whole R-BB contract), and `consent_status` is null for anyone the studio holds no record on — Leah Hartwell, Priya Natarajan, Dale Whitcomb, Marcus Hale, Sofia Ferraro, Owen Ashby in the fixture. Those rows print a dangling separator at 390: "ACCOUNT · · NOT ON FILE". The paper dot beside it IS gated (`{paper ? <>…</> : null}`); the consent one is not |
| CR10-6 | medium | `seat-line.tsx:66-73` prints `getPartyKindLabel(seat.party_kind)` and `getFieldTradeLabel(seat.trade)` — the Title-Case column vocabulary, so the seat line reads "Okonkwo residence · Subcontractor · Electrical · ON THE JOB · 12 Oct 2026 to 13 Aug 2027" where SPEC §5.1 #8 fixes "Okonkwo residence · sub · electrical · On the job · …". The identity line two pixels above it lowercases the same trade on purpose (`people-derivation.ts` `personIdentityLine`: `directoryTradeLabel(...).toLowerCase()`), so one row spells one trade two ways. Same class as CR10-28's "Client Rep", and `person-profile.tsx:436-446` (Past seats) carries the same two labels |
| CR10-7 | medium | `site-access-card.tsx:364-371` — the whole "who to call first" line is the `tel:` target at **every** width (`fullWidth`, no width branch), where SPEC §6.2 / R-X fix the adaptation as "the whole line at 390, only the digits at 1440". Its accessible name also doubles the name: `TelLink` composes `Call ${personName}, ${text}` and `text` is already `"Luis Ochoa, superintendent, (612) 555-0109"`, so a screen reader hears "Call Luis Ochoa, Luis Ochoa, superintendent, (612) 555-0109". W2c §4 #9 concedes "nothing in this surface measures a viewport" |
| CR10-8 | medium | `directory-view.tsx:469-501` — the duplicate band renders the sentence then the two name buttons separated by nothing but a space: "These two cards share a phone. Adaeze Okonkwo Chidi Okonkwo". SPEC §5.1 #17 / R-Y ask for "the sentence… followed by the two names, each a live open-person control", which this satisfies structurally; as prose it reads as one four-word name. A separator ("and", a middle dot) costs one literal |
| CR10-9 | low | `use-studio-contacts.ts:1080-1100` — `useClearContactRule` HARD-DELETES the `studio_contact_rules` row, so `set_by` / `set_at` / `reason` are destroyed and the card can no longer say a rule was ever lifted. Every other retirement this wave added is dated rather than deleted (`useCloseAffiliation`, `useCloseProjectPartySeat`, `useSetStudioContactChannelStatus`), and direction §1 line 8's grammar is the same. No caller today (`grep useClearContactRule` → the export and its test only), which is why this is low |

---

### CR10-10 … CR10-55 — the forty-seven carried r9 minors, every one re-verified OPEN at HEAD `412937520`

Line numbers re-checked here. Grades kept at r9's so the synthesis stays stable.

| id | r9 id | Conf. | Finding, at this HEAD |
|---|---|---|---|
| CR10-10 | CR9-5 | high | `person-profile.tsx:503-505` — History prints `formatSeatDate` (short): "Last touch 17 Oct 2026." SPEC §5.2 #10 fixes "Last touch 17 October 2026". `formatLongDate` is in the same tree |
| CR10-11 | CR9-6 | medium | `rolodex-picker.tsx:359` (`placeholder="a name, a company, a trade…"`) and `:542` (`placeholder="optional"`). Direction §5.4's Editing state is "label always visible, no `placeholder`"; the Add sheet itself is clean |
| CR10-12 | CR9-7 | medium | `party-profile-sheet.tsx:548-552` — `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. An empty string reaches `project_consent_org(p_project_id := '')` → raw `22P02 invalid input syntax for type uuid` in the error slot, where the hook's own written sentence exists for exactly that case |
| CR10-13 | CR9-8 | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role: 'all' })` UNSCOPED for the head count while `directory-view.tsx:145-148` reads `{ role: 'all', scope: scope === 'mine' ? 'mine' : undefined }` for the list. MINE narrows the list and not the head. May be intended (direction §3.1 makes the head a count of cards) — a ruling, not necessarily a fix |
| CR10-14 | CR9-9 | low | Two query roots outside any keys object, invalidated by nothing: `use-coordination.ts:2148` `['project-recorded-studio', projectId]`, `use-consent.ts:381` `['project-consent-org', projectId]` |
| CR10-15 | CR9-10 | low | `person-profile.tsx` renders no "Edit identity" and no "Archive", which direction §3.2 R1 names as the card's two tertiary controls. SPEC §5.2's acceptance list does not require them |
| CR10-16 | CR9-12 | medium | **Eight live regions** where SPEC §7 #3 asks for one: `people-room.tsx:565` (the Room's, the only explicit `aria-live`), plus `role="status"` at `directory-view.tsx:377`, `call-sheet.tsx:206`, `roster-row.tsx:687`, `project-team-roster.tsx:94`, `rolodex-picker.tsx:448`, `rolodex-seed-sheet.tsx:208`, `room-shell.tsx:193` |
| CR10-17 | CR9-13 | high | `people-room.tsx:506,523` pass `directoryCount={all?.length}` — the RAW row count — to the compact selector and the rail, three lines from a head printing `directoryHeadLine(directoryEntryCounts(directoryIdentityRows(all)))` (`:476`). Two counts of one book, one screen apart |
| CR10-18 | CR9-14 | high | `add-person-sheet.tsx:465-469` reads `isOrgAdmin` off `organizationId` (the BOOK's studio) while the four `project_party_authority_studio_*` policies gate on `project_party_recorded_studio()`. `useProjectRecordedStudio` is in the same file at `:502-504`. Fail-closed at the DB, so the cost is a refusal the face did not predict |
| CR10-19 | CR9-15 | high | `use-access-grants.ts:296-307` invalidates `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — never `partySmsKeys.links(partyId)`, which `useRevokeFieldLink` does (`use-party-sms.ts:203`). Two doors onto one token, two answers |
| CR10-20 | CR9-16 | high | `party-profile-sheet.tsx:491` — `createLink.mutateAsync({ partyId })` with `projectId` omitted, so `useCreateFieldLink`'s `['project-roster', projectId]` leg is skipped. `seatProjectId` is in scope and IS passed to the revoke at `:515` |
| CR10-21 | CR9-17 | high | `person-row.tsx:52-58` exports `openPersonLabel`; nothing imports it. The rendered control (`:142-149`) carries the bare `display_name`, where SPEC §7 #6 asks for "the person's name and role summary only" |
| CR10-22 | CR9-18 | medium | `use-coordination.ts:936-946` — the hard-delete guard asks `studio_compliance_documents WHERE holder_id = <the card>` while the face refuses on `row.paper` = `identity_paper_state(card, COALESCE(seat.company_id, card.company_id))` (R-BA/R-BJ). An RLS-refused read returns `[]` rather than raising, so the guard reads "no paper held". The face holds the act first, which is why this is not higher |
| CR10-23 | CR9-19 | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492,673,770,913` (the last **inside the hard-delete guard**, where a NULL org silently sets `hasConsentRecord = false`) and `useProjectConsentOrg` itself (`use-consent.ts:387`), consumed by `call-sheet.tsx:99` and `project-team-roster.tsx:52`. R-BI scopes the studio-less population to W3 |
| CR10-24 | CR9-20 | medium | `party-mini-row.tsx:195-204` — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`. Both the attribute (SPEC §7 #4, direction §5.5) and opacity-as-state (SPEC §8 #5) are named forbidden. Transient at its one call site |
| CR10-25 | CR9-22 | high | `command-bar.test.tsx:65` still mocks the `call-sheet` flag with eleven `mockCallSheetFlag` assignments, and `__tests__/call-sheet-doorways.test.tsx:92` carries it too. `command-bar.tsx` reads no such flag |
| CR10-26 | CR9-21 | high | Four dead `useFeatureFlag` imports referenced nowhere in their own file: `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48` |
| CR10-27 | CR9-23 | high | `company-card.tsx:142` — `if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`)` still concatenates the raw `company_kind`, so ten of twenty-one seeded firms read one word on the Directory row (`companyKindShortLabel`) and another on the card it opens. The r6 fix log asked for a ruling: `companyKindShortLabel('sub')` is "Subcontractor", which would break SPEC §5.3 #1's "Electrical sub". **Still owed** |
| CR10-28 | CR9-24 | low | The Add sheet's door reads "a household member" (`add-person-sheet.tsx:154`), writes `party_kind: 'client_rep'` (`:136`), and every seat line prints `PARTY_KIND_LABELS.client_rep` = **"Client Rep"** (`field-config.ts:206`). C5's letter is kept (the string `client_rep` never reaches a face); the title-cased abbreviation is a second word for the thing the studio's own door called a household member |
| CR10-29 | CR9-25 | low | Three acts emit a real `disabled` while their mutation is in flight, because `DocumentAction` computes `unavailable = disabled \|\| loading` and emits `disabled={unavailable && !held}`: `roster-row.tsx:667-668`, `notice-log.tsx:138-139`, `rolodex-picker.tsx:598` (`disabled` with no `held` at all). Transient; `loading` is also set |
| CR10-30 | CR9-30 | low | `add-person-sheet.tsx:1560` — `disabled` on an `<option>`. SPEC §7 #4's ban is written for the specimen files and an `<option>` has no `aria-disabled` equivalent. **New this round:** a third surviving `placeholder=` at `party-profile-sheet.tsx:941` (pre-existing on `origin/main:842`, and it does carry a visible label) |
| CR10-31 | CR9-31 | medium | `--color-linen` is defined nowhere in `apps` or `packages` and is spent at `party-profile-sheet.tsx:908`, `add-person-sheet.tsx:1639`, `directory/letter-line-field.tsx:191`, always `bg-[var(--color-linen)]/45` with no fallback. Confirmed pre-existing on `origin/main`. It is the ONLY undefined-and-unfallbacked custom property in the changed set |
| CR10-32 | CR9-33 | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. `people-format.ts` and `seat-line.ts` both parse by parts and say why |
| CR10-33 | CR9-34 | low | Two `authorityPhrase` implementations: `roster-derivation.ts` `authorityPhrase` joins with `". "` and appends a final stop; `person-profile.tsx:101-111` returns each phrase bare and the caller joins with `" · "` (`:126`). One grant reads "Selections." on the Call Sheet and "Selections" on the person card |
| CR10-34 | CR9-35 | low | `company-card.tsx:155` spells the warranty long — `formatLongDate` gives "21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's fold and every seat line use the short form |
| CR10-35 | CR9-36 | low | `use-people.ts:262-275`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches`, which matches both, so the command bar finds fewer people than the room does for the same string |
| CR10-36 | CR9-37 | low | Two dead ternaries with the same string on both branches: `person-profile.tsx:500-502` (`=== 1 ? "projects" : "projects"`) and `add-person-sheet.tsx:1707-1709` (`partyName.trim() ? "them" : "them"`) |
| CR10-37 | CR9-38 | high | `person-profile.tsx:500-502` — `Worked ${person.seat_count ?? 0} of the studio's projects.` `seat_count` is `identity_seat_count()`, a SEAT count (R-BG), printed as a PROJECT count. Verified latent on the seed: `select studio_contact_id, project_id, count(*) … having count(*)>1` returns **0 rows**, so no identity holds two seats on one project today |
| CR10-38 | CR9-39 | high | `company-card.tsx:955-970` gates `NO_JOBS_SENTENCE` on `crew.length` (the sentence at `:959`), while `CrewJobs` returns `null` for an empty seat array (`:191`). A firm with affiliations and no live seats renders the "Jobs" heading, an empty `<ul>` and the money-book line — a region that states nothing, against C32/R-V |
| CR10-39 | CR9-40 | medium | `company-card.tsx:854` — `Remit to {card.remit_to ?? name}` asserts a payee the studio may never have written, on the one region direction §1 line 5 makes this card the sole writer of. Every other absent record in this build prints its own sentence |
| CR10-40 | CR9-41 | high | `use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538` — five card mutations invalidate `studioContactKeys.all` + `['people-directory']` and never `['people-directory-seats']`, though `people_directory_seats` carries `display_name`, `company_name`, `phone_e164`, `consent_status`, `reach_state`, `paper_state`, `contact_rule_summary`, `warranty_until`. The channel, rule, affiliation and compliance fan-outs in the same file DO invalidate both (`:726-727`, `:1002-1003`, `:1180-1181`, `:1468-1469`), so the omission is inconsistent within one module |
| CR10-41 | CR9-42 | high | `company-card.tsx:816-817` — `documentId: docs[0]?.id ?? null, documentLabel: docs[0] ? null : "a current certificate"`. The label is `null` exactly when a document exists, and `api/people/chase-renewal/route.ts:81` falls back to the same literal, so **every** drafted chase reads "Chase <firm> for a current certificate" and never names the paper that lapsed. (`docs[0]` is also soonest-expiry-first, which is not necessarily the lapsed one.) |
| CR10-42 | CR9-43 | medium | Two reducers decide one paper fact and disagree on supersession. The firm row and the seat line print `compliance_state()` / `identity_paper_state()`, which reckon supersession transitively (**R-BF**); the company card's table decides each row in the browser with `documentPaperState` (`compliance-table.tsx:51-62`) over a set `useComplianceDocuments` filtered with a flat `.is('superseded_by', null)` (`use-studio-contacts.ts:1418`). `paperHeldClause` reads that same filtered list. Verified latent on the seed: `count(*) filter (where superseded_by is not null)` = **0** |
| CR10-43 | CR9-44 | low | `person-profile.tsx:334-336` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>` (`reach-access.tsx:825`), `<h3>Contact rule</h3>` (`:943`) and `<h3>Access grants</h3>` (`:1032`). SPEC §5.2 #2 calls these three "sub-heads"; by ear they read as four peers. No heading level is skipped |
| CR10-44 | CR9-45 | low | `seat-line.tsx:92` — `py-[6px]` around an 11px span, roughly 28px tall, where every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the person card, the company card and the Directory row all mount it |
| CR10-45 | CR9-46 | low | `notice-log.tsx:76-101` renders a list of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7) |
| CR10-46 | CR9-11 | high | Two `aria-describedby` dangle once the act becomes available: `roster-row.tsx:668` points at `${panelId}-send-held` unconditionally while `<p id=…>` renders only `{!body.trim() && …}` (`:680-687`); `notice-log.tsx:139` points at `heldId` unconditionally while `<p id={heldId}>` renders only `{picked.length === 0 && …}` (`:155-157`). `roster-row.tsx:526` and `:570` already do it conditionally, in the same file |
| CR10-47 | CR9-25/CR8-6 | medium | `site-access-card.tsx:164-175` — `EditableLine`'s collapsed act is a tertiary whose only text is `Edit`, mounted three times ("The way in" `:514`, "Hours" `:634`, "Receiving" `:648`). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:131` |
| CR10-48 | CR9-27 | high | `reach-access.tsx:1063` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1075`). `site-access-card.tsx:413`, `:578`, `:674` hardcode `id="site-access-emergency-lines"` / `"site-access-key-holder"` / `panelId="site-access-notice-log"` where every other disclosure in this wave uses `useId()` |
| CR10-49 | CR9-28 | medium | `use-studio-contacts.ts:445` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line |
| CR10-50 | CR9-29 | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:10-12` ("A HARD BLOCK — a rule that forbids a channel outright") and `:44-53` give the pre-R-BL reading; `contact-rule.ts:99-101` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which the shipped predicate (`:110-114`) makes false for both — verified against the seed: neither carries `route_to_person_id`, and neither forbids all four direct channels, so neither is a hard block; `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine |
| CR10-51 | CR9-47 | low | `rolodex-picker.tsx:575` renders `{stamp ? '✓' : ''}` — a ✓ glyph, which SPEC §8 #5 names forbidden and SPEC §5.7 #4 repeats. Pre-existing; `coordination/item-composer.tsx:900` carries a second |
| CR10-52 | CR9-48 | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1696-1699`) — the CORRECT wording, since R-AS retired the seat-side dispatch. One line in the report |
| CR10-53 | CR9-50 | high | `PARTY_KINDS_OWING_NO_PAPER` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's OWN principal, lead designer and bookkeeper, and both homeowners, print `Not on file` in the paper column of the studio's own ledger. Confirmed against the local view: Leah Hartwell `contact_kind = studio`, Adaeze and Chidi Okonkwo `contact_kind = client`, all three `paper_state = not_on_file`. C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change |
| CR10-54 | CR9-49 | medium | `use-call-sheet-roster.ts` / `use-project-authority.ts` still live under `components/document/roster` rather than beside `usePartyAuthority` in `@patina/supabase`, and `people/compliance-chase.ts` likewise. Each says so in its own docblock and names the orchestrator. The key nesting is correct (`projectAuthorityKeys.project` under `partyAuthorityKeys.all`, and `useSetPartyAuthority` invalidates the root) |
| CR10-55 | CR9-26 | low | `roster-row.tsx:197` (`doc.expires_on < new Date().toISOString().slice(0,10)`) and `:287` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`) read the clock during render, against the room's own convention (`people-room.tsx:137`, `company-card.tsx`, `person-profile.tsx:146`, all `useMemo(() => new Date(), [])`) |

---

### CR10-56 … CR10-58 — the seed disagrees with SPEC §3's fixture (W1 scope, recorded because the SHIPPED face is what differs)

These are not portal-code defects; the readers agree with the record. They are
recorded so the walk is not surprised and so W1's seed owner can rule.

| id | Conf. | Finding |
|---|---|---|
| CR10-56 | high | `studio_contact_channels` marks Dana Kowalski's email **`dead`**, not `bounced`, so the person card prints `heldChannelReason`'s "This line is dead." where SPEC §5.2 #3 fixes "This address bounced back, 12 March 2026. Texts and calls still reach them." One `status` value in the seed |
| CR10-57 | high | Adaeze Okonkwo reads `reach_state = on_paper`, `consent_status = not_asked` in the local `people_directory`, where fixture F-04 and SPEC §5.4 #5 give her reach `Account` and consent `Texting`. She holds no `profile_id` and no consent record, so the reach word cannot be `Account`. Leah task 2's own subject |
| CR10-58 | low | The seed spells "Carol Nyström"; SPEC §3's fixture spells "Carol Nystrom". Two spellings of one name across the deck and the room |

---

## 4. What this review did not cover

The visual and behavioural walk at 1440 and 390 (`document.documentElement.scrollWidth`
was not measured — the QA reviewer owns 3000/3002), the Playwright specs under
`e2e/people` (shape-checked and chromium-pinned, **not run** — no port taken),
the iOS surfaces under `apps/mobile/Capture`, the W1 migrations beyond the view,
function and CHECK definitions read back from the local database above, and the
Sanity help articles.
