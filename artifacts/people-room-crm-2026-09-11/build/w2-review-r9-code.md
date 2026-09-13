# W2 adversarial code review — round 9

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD **`1b07d5517`**
("fix(people-room): W2 round-8 findings").

Read first: `rulings.md` §1–§6 (all, through R-BM), `synthesis/direction.md`
§1–§6 including §3.9's C1–C38, `specimens/SPEC.md` §3/§5/§6/§7/§8,
`w2a-report.md`, `w2b-report.md`, `w2c-report.md`, `w2-review-r5-code.md`,
`w2-fix-log-r5.md`, `w2-review-r8-code.md`, `w2-fix-log-r8.md`,
`w1a-report.md`, `w1b-report.md`. Every changed non-test file under
`apps/designer-portal/src`, `packages/supabase/src/hooks` and
`packages/types/src` (106 files tree-to-tree) was read in full or in the
regions the checks name. No dev server was started, no port taken, no
production anything, nothing written to any database.

**Verdict: NOT CLEAN — 2 blocking, 2 major, 47 minor.**

Round 8's seven assigned findings (`QA-R8-1`, `QA-R8-2`, `CR8-1`, `CR8-2`,
`CR8-3`, `CR8-4`, `CR8-5`) are **all fixed**, verified at this HEAD. The
forty-one unassigned r8 minors (`CR8-6` … `CR8-46`) are **all still open**,
re-verified here with current line numbers. Both blocking findings and both
majors are **new to this round**; one blocking is pre-existing code inside a
file W2c rewrote, the other is W2's own wiring.

---

## 0. Gates, run here, at HEAD `1b07d5517`

```
$ pnpm --dir <worktree>/apps/designer-portal run type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir <worktree>/packages/supabase run type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
EXIT=0

$ pnpm --filter @patina/admin-portal build        # the strictest gate
▲ Next.js 16.2.10 (webpack)
✓ Compiled successfully in 27.6s
  Finished TypeScript in 30.9s ...
✓ Generating static pages using 13 workers (137/137) in 591ms
EXIT=0

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document src/components/document/rooms 'src/app/(document)/desk' \
    src/components/document/mobile src/components/document/coordination \
    src/components/document/__tests__ src/lib/analytics
Test Suites: 269 passed, 269 total
Tests:       4138 passed, 4138 total
Snapshots:   0 total
Time:        19.097 s
EXIT=0

$ cd packages/supabase && npx vitest run --silent
 Test Files  103 passed (103)
      Tests  1297 passed | 12 skipped (1309)
   Duration  3.97s
EXIT=0
```

All five green. None of the findings below is caught by any of them.

---

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** `views/person-profile.tsx` — last hook `useComplianceDocuments({holderId: firmId})` `:234`, first early return (`role === 'maker'`) `:238`. `company-card.tsx` — three seeding `useEffect`s `:405/:431/:442`, `if (!card)` `:457`. `reach-access.tsx` (`ChannelRow` `:150-207`, `ReachAccess` `:594-716`), `people-room.tsx`, `add-person-sheet.tsx`, `roster-row.tsx` `:166-192`, `site-access-card.tsx` `:201-239`, `rolodex-picker.tsx`, `directory-view.tsx`, `person-row.tsx`, `access-grant-list.tsx`, `view-shell.tsx`, `use-call-sheet-roster.ts`, `use-project-authority.ts`: no conditional hook, none after a return. `SeatFacts`, `CrewJobs`, `GrantRow`, `ChannelRow`, `EditableLine` are their own components. `useSiteAccessSummary` returns early at `:86` with no hook after it. `roster-row.tsx:190`'s `useComplianceDocuments(cond ? {…} : undefined)` is a conditional ARGUMENT on an `enabled`-gated query. |
| Hydration gate | **PASS, with the carried nit (CR9-26).** No `window`/`document` read during render in any changed file. `roster-row.tsx:197` and `:281` still call a bare `new Date()` in render. |
| One canonical query key per entity | **PASS**, with three stray roots (CR9-28 `['studio-contact-history', ids]`, CR9-9 `['project-recorded-studio', …]` / `['project-consent-org', …]`). `useChannelConsentRecords`' list key is correctly UNDER `consentKeys.all` (`use-consent.ts:247`); `useProjectAuthority`'s project key is correctly UNDER `partyAuthorityKeys.all` (`use-project-authority.ts:24-27`). |
| Every mutation's invalidations | Four fan-outs still short (CR9-15, CR9-16, CR9-18, CR9-28). |
| RLS-safe writes send every joined column | **PASS.** `studio_contact_channels` sends `owner_type`+`owner_id`; `studio_contact_rules` `subject_type`+`subject_id`; `studio_person_affiliations` `person_id`+`company_id`; `studio_compliance_documents` `organization_id`+`holder_type`+`holder_id`; `project_party_authority` `engagement_id`+`scope`; `project_site_access_cards` `project_id`; `studio_contacts` `organization_id`; `project_parties` `project_id`. |
| Consent writes ONLY through `record_channel_*` | **PASS.** `grep -rn "studio_channel_consent"` over `apps`/`packages` (tests + `database.types.ts` excluded) returns two `.select('*')` READS (`use-consent.ts:212`, `:254`) and comments — **no table write anywhere**. The RPC doors are `use-consent.ts:297` (`record_channel_consent`), `:327` (`record_channel_invite`), `:356` (`record_channel_reconsent`), plus `use-coordination.ts:499` and `:780` (`record_channel_invite`). |
| No portal writer of `sms_consent_*` (R-AS / R-AY) | **PASS.** The frozen-column grep (tests + `database.types.ts` excluded) returns ten hits and **zero writers**: `use-coordination.ts:77-84` (the `ProjectParty` READ interface), `:989` (`ProjectRosterRow`, the column 00594 repointed to the record's verdict), `:528` + `use-people.ts:104` + `people-derivation.ts:250` (comments), `roster-derivation.ts:149` (a synthetic in-memory client row, literal `null`), `:399` (a READ of the repointed view column), one e2e comment. `useAddProjectParty`'s INSERT (`use-coordination.ts:513-537`) and `useUpdateProjectParty`'s `dbPatch` (`:641-698`) name none of the eight. |
| No hard delete outside the mistaken-add predicate | **PASS, with one weak leg (CR9-18) and one R-BD leg (CR9-19).** Exactly two `.delete()` in the changed set: `use-coordination.ts:951` (`project_parties`, behind a server-side re-derivation of `seatDeleteRefusal` from three fresh reads at `:902-948`) and `use-studio-contacts.ts:1092` (`useClearContactRule`, documented). |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:248` and nowhere else. `grep -rni "site_access\|siteAccess\|project_site_access" apps/client-portal/src` → **zero hits**. No `show_to_client` anywhere in `site-access-card.tsx` or `notice-log.tsx`. |
| No code field anywhere | **PASS, schema AND face.** `grep -rni "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode" apps packages` → **zero hits**. `site-access-card.tsx:514-518` reads `label="Lockbox version"` / `empty="No lockbox version on file."`; the card prints "Studio only. This card never reaches a client page." at `:290-292`; `wayInSentence` (`roster-derivation.ts:1039-1049`) carries "The code is held off Patina; ask …" and no digits. |
| PR-n gating, client AND DB | **PASS on the DB; still mis-scoped on the client** (carried, CR9-14). |
| `call-sheet` flag fully removed | **PASS in product code, with leftovers (CR9-21, CR9-22).** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. Every remaining `call-sheet` string is a surface key, an overlay key or a registry key. |
| dist rebuilt after edits | **PASS, verified by content.** `@patina/types` is the only dist-bearing package in the diff (`packages/supabase` ships from source). `dist/*.js` and `dist/*.d.ts` stamped 2026-09-13 07:34:38 > `src/field-config.ts` 2026-09-12 22:48:54 and `src/studio-config.ts` 20:57:22. A fresh `npx tsc -p tsconfig.json --outDir $TMPDIR/types-dist-check` produced `field-config.js`, `studio-config.js`, both `.d.ts` and `index.js` **byte-identical** to the shipped `dist` (`diff -q` clean, 5/5). `partyKindOwesPaper` / `PARTY_KINDS_OWING_NO_PAPER` (2 hits) and `STATE_WORD_PIGMENTS` / `consentWordFor` (6 hits) are present in `dist`. |
| Analytics only via `people-events.ts` | **PASS.** The only `posthog` reference under `components/document/people`, `components/document/roster` and `lib/analytics/people-events.ts` is `people-events.ts:20-25`, behind `isAnalyticsEnabled()`. No inline `posthog.capture`. (Docblock drift, CR9-29.) |
| Document grammar — `box-shadow` = 0 | **PASS.** Sweeping all 92 changed `.ts`/`.tsx`/`.css` files: `globals.css:360` and `:1942` (both pre-existing, outside this diff's single 29-line hunk at `:2004-2032`) and one docblock sentence in `state-word.tsx:13`. No `boxShadow` in any TSX. |
| **Every CSS custom property used is defined in the designer portal's `globals.css`** | **PASS for W2's own tokens.** 95 distinct `var(--…)` tokens are spent by the 92 changed files; 168 are defined in `apps/designer-portal/src/app/globals.css`. The PR-v alias block (`--sage`, `--golden`, `--terracotta`, `--sage-ink`, `--golden-ink`, `--color-dusty-blue-ink`) sits on **bare `:root`** — the block opens at `globals.css:1975` and closes at `:2036`, so `STATE_WORD_PIGMENTS` resolves on every surface, not only inside `html:has([data-document-shell])`. The only undefined name still spent in a People surface is `--color-linen` (CR9-31; all three sites verified present on `origin/main`). Every other name the sweep flags is runtime- or Tailwind-supplied (`--font-heading`, `--font-inter`, `--font-mono`, `--radix-collapsible-content-height`, `--stagger-index`, `--doc-quiet-reserve*`, `--doc-mobile-bar-height`, `--ink-x`/`--ink-y`, `--i`, `--x`, `--wash*`, `--strata-cycle`), none of them in a People/roster file. |
| Every string on a face is SPEC vocabulary | **FAIL — CR9-2 (blocking), CR9-3 (major), plus CR9-5, CR9-23, CR9-24, CR9-10, CR9-33, CR9-35, CR9-43.** The schema-word sweep itself passes: `client_rep` / `party_kind` / `sms_consent_status` / `studio_contact_id` / `project_parties` / `not_on_file` / `lapses_soon` / `opted_out` / `field_link` / `on_paper` appear only as comparisons or prop values, never as rendered text. The forbidden-word sweep (`badge`, `pill`, `modal`, `toast`, `spinner`, `wizard`, `dashboard`, `CRM`) over rendered text in `components/document/people` and `components/document/roster` returns **nothing**. "Remove" appears nowhere in either surface tree (SPEC §5.4 #14). |
| aria: no `disabled` attribute | **PASS on every act this wave authored**, with four carried exceptions. `DocumentAction` emits `disabled={unavailable && !held}` (`document-action.tsx:309`) and `aria-disabled` through `heldMark` (`:281`, `:310`), so each `disabled={…}` paired with an identical `held={…}` lands as `aria-disabled="true"` and stays focusable. Exceptions: `add-person-sheet:1560` (`<option disabled>`, CR9-30), `party-mini-row:200` (raw `<button disabled>` + `disabled:opacity-50`, CR9-20), and the `loading`-without-`held` pattern on three acts (`roster-row:661`, `notice-log:138`, `rolodex-picker:593`, CR9-25). |
| `aria-expanded` pairs with a real id | **PASS.** Every `aria-controls` in the People/roster surfaces resolves to a rendered `id`; every panel is rendered unconditionally with `hidden`, so the target exists while collapsed. Two `aria-describedby` still dangle once the act becomes available (CR9-11), one `id` is rendered that nothing points at, and three ids are hardcoded (CR9-27). |
| No `<a>` inside `<button>` | **PASS.** Every `TelLink` is an `<a>` and always a sibling, never a descendant, of the row's own control: `person-row.tsx:213` (sibling of the `<div>` holding the open-person button), `roster-row.tsx:381` (outside the toggle's `</div>` at `:373`), `contact-rule-line.tsx:118` (inside a `<p>`, outside any button), `site-access-card.tsx:365`/`:553` (siblings inside a `<li>`/`<p>`), `reach-access.tsx:356`. `party-mini-row` renders a `<button>` whose words are `<span>`s and takes no anchor. |
| One live region | **PARTIAL** (carried, CR9-12). `people-room.tsx:565-566` is the Room's announcer (the only explicit `aria-live="polite"` in the People tree); seven other `role="status"` — which carries an implicit polite live region — survive in the room's own surfaces. |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage` / `ConsentWord`. `coordination/party.ts` imports `PartyKind` from `@patina/types`; `use-coordination.ts:51` is an explicit re-export alias. |
| No ad-hoc fetch | **PASS.** One `fetch` in the whole changed set: `compliance-chase.ts:47` → the same-origin route `/api/people/chase-renewal`, which proves studio membership through the caller's own RLS read (`route.ts:57-70`) before enqueuing with the service role. No NestJS call outside `@patina/api-routes`. |
| Playwright shape | **PASS (not run — no port taken).** Six specs under `e2e/people/`, every one chromium-pinned by `test.skip(({ browserName }) => browserName !== 'chromium')` (`add-sheet:31`, `company-card:15`, `directory:16`, `person-card:24`, `call-sheet:25`, `add-client-letter`); `call-sheet.spec.ts:150-163` uses `expect.poll` over `helpers/supabase-admin`'s `adminDb`; web-first `await expect(...)` throughout; no `networkidle` and no `waitForTimeout` in any of them. |

---

## 2. Round 8, re-checked at HEAD

### The seven assigned findings — all **FIXED**

| Finding | Verdict | Evidence at HEAD |
|---|---|---|
| **QA-R8-1** (grant end date one day past the window) | **FIXED** | `access-grant-list.tsx:134-138` `lastOpenDay()` backs the stored instant off a second and takes the UTC date; `grantEndsSentence` `:152-155` applies it to the field-link tier only, so the caller-supplied `…T23:59:59Z` and the ninety-day branches keep their own day. |
| **QA-R8-2** (26px of 390 overflow from one act label) | **FIXED** | `company-card.tsx:666-669` — `<span className="sm:hidden">Set designations</span>` + `<span className="hidden sm:inline">Set paperwork contact, signer and site contact</span>`. The three fields it opens name themselves (`:688`). |
| **CR8-1** (held clause spoke the column head) | **FIXED** | `roster-derivation.ts:914-927` `HELD_CLAUSE_PAPER_NOUNS` / `heldClausePaperNoun`; `roster-row.tsx:203-210` routes `docLabel` through it. `COMPLIANCE_DOC_TYPE_LABELS` unchanged, so SPEC §5.3 #3's Type column head still reads "COI, general liability". |
| **CR8-2** (every `designer_clients` row dropped) | **FIXED** | `people-derivation.ts:880-914` — `directoryEntryIsCardedElsewhere(row, carded)` narrows the exclusion to a legacy client row whose `profile_id` or ten-digit phone resolves to a person CARD; `directoryDuplicatePairs:1315` keeps its unconditional exclusion, as the finding directed. |
| **CR8-3** (trade chips narrowed on the card, row printed the seat) | **FIXED** | `people-derivation.ts:1002-1009` `directoryTradeAdmits(row, trade, seatTrade)`; `directory-view.tsx:339` passes `seatTrades.get(row.person_id)` from the index at `:194-197`, with `seatTrades` in the memo's deps at `:360`. |
| **CR8-4** (nothing could create a company card) | **FIXED** | `add-person-sheet.tsx:742-760` — create-or-match against `firms`, gated on `recordedStudioId` (CR5-1), recorded in `chainRef.firmCardId` so a retry cannot file twice; `firmCardId` feeds both the seat's `companyId` (`:773`) and the affiliation (`:869-875`). |
| **CR8-5** (roster row printed the paper word ungated) | **FIXED** | `roster-groups.tsx:88-94` `cardKindById` off the `useStudioContacts` read the file already made, handed down at `:162-166`; `roster-row.tsx:441` gates on `partyKindOwesPaper(contactKind ?? row.partyKind)`. |

### The forty-one unassigned r8 minors — **every one still OPEN**

Carried below as CR9-6 … CR9-46 with the r8 id named and line numbers
re-verified at this HEAD. None of them was in the r8 assignment (the r8 fix
log says so explicitly), and none has been fixed incidentally.

---

## 3. Findings

### CR9-1 · BLOCKING · high confidence (NEW) — a seat line opens the field-party sheet under a fabricated kind: a household member, a city inspector, a client and a maker rep all read "Field crew · Subcontractor"

`apps/designer-portal/src/components/document/people/people-room.tsx:397-404`

```ts
const openSeat = (seat: PeopleDirectorySeat) => {
  setOpenParty({
    id: seat.seat_id,
    role: (isFieldRosterRole(seat.party_kind)
      ? seat.party_kind
      : "sub") as PartyRole,
  });
};
```

`isFieldRosterRole` admits four kinds (`gc`, `sub`, `installer`, `receiver`,
`use-people.ts:56-61`). **Every other seat kind is coerced to `'sub'`** and
handed to `PartyProfileSheet`, which prints the role it was given, twice:

```tsx
<div className={META}>Field crew · {getPartyKindLabel(role)}</div>   // party-profile-sheet.tsx:576
…
['Kind', getPartyKindLabel(role)],                                   // :330
```

So a `client_rep` seat — the household member PR-c and C5 built the whole
"a household member" door for — opens a sheet headed **"Field crew ·
Subcontractor"** with a **Kind** row reading **"Subcontractor"**, over the
person's real name, company and project (the sheet now resolves those through
`usePersonSeat`, which "Admits EVERY party kind", `use-people.ts:141-144`).
The same is true of an `other` seat (Ray Thao, Carol Nyström — both stored
`other` because the CHECK has not widened, w2a §6 item 2), a `client` seat
(Adaeze Okonkwo) and a `vendor` seat (Claire Bissett).

**It is two clicks from the Directory.** `openSeat` is the `onOpenSeat` handed
to BOTH doors R-AA opened:

- `people-room.tsx:422` → `PersonProfile onOpenSeat={openSeat}` → the person
  card's Seats-on-projects region renders `<SeatLine … onOpen={(s) => onOpenSeat?.(s)} />`
  for every live seat (`person-profile.tsx:396`), with no kind gate;
- `people-room.tsx:550` → `DirectoryView onOpenSeat` → `PersonRow` → the seat
  disclosure's `SeatLine` (`person-row.tsx:236-239`).

The roster row already solved this the right way and the note is in the file:
`roster-row.tsx:349-360` prints its chevron only where `seatProfileRole(row.partyKind)`
is non-null, because "'vendor' / 'client_rep' / 'other' / 'client' are excluded
from the view by design, so a chevron on them would open an empty sheet"
(`roster-derivation.ts:179-190`). The person card's and the Directory's seat
lines carry no such guard, and R-AA forbids making them inert — so the coercion
happens instead, and the sheet states a kind the record does not hold.

Beyond the two wrong words: the sheet's field-link band and its SMS composer
render unconditionally, so a household member's sheet offers "Mint a field
link" and a text thread.

**Fix:** either route a non-field seat to the PERSON CARD (`setOpenPerson`)
rather than the field sheet — the card is the room's unit and already carries
every fact the sheet would show — or pass the seat's real `party_kind` and let
`PartyProfileSheet` print it (and drop the "Field crew" eyebrow for a kind that
is not field crew). Coercing to `'sub'` is the one option that puts a false
fact on the face.

---

### CR9-2 · BLOCKING · high confidence (NEW, pre-existing code in a file this wave rewrote) — the rolodex picker prints "– No one by that name in the rolodex." under a list of the people it just found

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:401-445`

```tsx
{hits.length > 0 && (
  <ul className="mt-3 flex flex-col">
    … the matches …
  </ul>
)}

{/* The way out sits under the hits from the first frame (mnote 3). */}
<div className="mt-4 flex flex-wrap items-baseline justify-between …">
  <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
    – No one by that name in the rolodex.
  </p>
  {!adding && (<button …>Add someone new</button>)}
</div>
```

The sentence is **not gated on `hits.length === 0`**. It renders on every open
of the picker, including the normal case where the search returned matches — so
the studio reads "No one by that name in the rolodex." directly beneath Dana
Kowalski, Pete Rusk and Ingrid Halvorsen. The band's own comment explains the
BUTTON's placement ("the way out sits under the hits"), not the sentence's.

This is the surface SPEC §5.7 and Leah task 5 both name ("From the rolodex"),
and it is the picker W2c rewrote for words, rules and history lines. Confirmed
pre-existing: `git show origin/main:…/rolodex-picker.tsx:352-355` carries the
identical ungated block. It was not introduced by W2 and no prior round named
it — I am grading it against this round's rubric ("Blocking = wrong fact on a
face"), not against the carry. Fable may rule it down to major on the strength
of its provenance; it should not keep passing unnamed.

**Fix:** one condition — `{hits.length === 0 && <p>– No one by that name in the
rolodex.</p>}` inside the band, leaving "Add someone new" where it is.

---

### CR9-3 · MAJOR · high confidence (NEW) — the company card's Jobs region has no door to the money book, and prints a sentence where SPEC §5.3 #7 fixes an act

`apps/designer-portal/src/components/document/people/company-card.tsx:963-965`
and `:116-117`

```tsx
export const MONEY_BOOK_LINE = "Waiver ledger and draw state, in the money book.";
…
<p className="t-body-sm mt-3 text-[var(--ink-subtle)]">{MONEY_BOOK_LINE}</p>
```

SPEC §5.3 #7 fixes the region as:

> Region "Jobs": "Okonkwo residence · Dana Kowalski · On the job" with the stage
> word, and a read-only line **"Draw 1 waiver ledger, in the money book" as an
> inline act**.

Direction §3.3 R5 says the same, naming the control "Open the money book
(inline)". What ships is a plain `<p>` with different words and **no control at
all** — there is no link, no button, no `onClick`, nothing in the whole company
card that reaches the money book (`grep -rn "money book" components/document/people`
returns this constant and its test). E11's read-only line into the waiver ledger
is the one place direction §2.2 lets the company card touch money, and the card
states it rather than offering it.

Two facts keep this major rather than blocking: SPEC's own literal embeds a
draw number ("Draw 1") the card has no column for — `project_parties` carries no
draw or waiver data and w2c §4 item 2 records the bid/draw columns as P2 — and
SPEC's phrase "a read-only line … as an inline act" is itself ambiguous about
whether a control is owed. Under the round's rubric ("missing SPEC acceptance
string", "inert act") it could be graded blocking; I am leaving that to Fable.

**Fix:** either wire the line as an inline act onto the money book's own route
for this firm (the shape `person-profile`'s "Open the Call Sheet" inline act
already uses), or amend SPEC §5.3 #7 to the sentence the card can honestly
print and record the missing door as W3 money-book work.

---

### CR9-4 · MAJOR · high confidence (NEW — a regression introduced by W2c's repoint) — the project roster's "Try again" cannot retry the read it apologises for

`apps/designer-portal/src/components/document/roster/project-team-roster.tsx:101-113`

```tsx
{!isLoading && isError && (
  <div …>
    <p role="alert" …>The project roster could not be read.</p>
    <DocumentAction actionKey="retry-project-roster" variant="secondary"
      onClick={() => void projectQuery.refetch()}>
      Try again
    </DocumentAction>
  </div>
)}
```

`isError` is `rosterError || (clientName === undefined && projectQuery.isError)`
(`:50`), and `rosterError` comes from `useCallSheetRoster` (`:43`), which
composes `useProjectRoster` + `usePeopleSeats` + `useProjectAuthority` and
**returns no `refetch`** (`use-call-sheet-roster.ts:87-93` returns
`projection`, `authorityBySeat`, `isLoading`, `isError`, `today` and nothing
else). So when the roster read is the thing that failed — the common case, and
the one the sentence names — pressing "Try again" refetches the PROJECT query
and leaves the roster exactly as it was. The error band never clears and the
studio has no way out but a page reload.

This is new to W2c: on `origin/main` the same act read
`void Promise.all([rosterQuery.refetch(), projectQuery.refetch()])`
(`git show origin/main:…/project-team-roster.tsx:114`), and `rosterQuery` was
the roster's own `useProjectRoster`. The repoint to `useCallSheetRoster` dropped
the half that mattered.

**Fix:** return the three queries' `refetch` from `useCallSheetRoster` (or a
single composed `refetch`), and have the act call it alongside
`projectQuery.refetch()`.

---

### CR9-5 … CR9-10 — new minors

| id | Confidence | Finding |
|---|---|---|
| CR9-5 | high | `views/person-profile.tsx:503-505` — the History line prints `formatSeatDate(...)`, the SHORT form: "Last touch 17 Oct 2026." SPEC §5.2 #10 fixes the sentence as "Worked 2 of the studio's projects. **Last touch 17 October 2026**, text, logistics." `formatLongDate` is imported into the same tree (`people-format.ts:29`) and is what every other sentence in the card spends. The same class as CR9-35 (CR8-33) in the opposite direction: two date forms, one room. (The channel and topic — "text, logistics" — have no source and are correctly not faked.) |
| CR9-6 | medium | `roster/rolodex-picker.tsx:359` (`placeholder="a name, a company, a trade…"`) and `:537` (`placeholder="optional"`). Direction §5.4's Editing state is "fields on paper (§A14): label always visible, no `placeholder`", and SPEC §5.5 #12 bans the attribute outright from the Add sheet — which this picker's inline add duplicates. Pre-existing (`git show origin/main:…:290`, `:457`), inside a region W2c rewrote; the Add sheet itself is clean (`grep -n placeholder add-person-sheet.tsx` → nothing). |
| CR9-7 | medium | `people/party-profile-sheet.tsx:548-552` — the invite passes `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. An EMPTY STRING reaches `useRecordPartySmsConsent`, which hands it to `project_consent_org(p_project_id := '')` — Postgres answers `22P02 invalid input syntax for type uuid`, and the sheet renders that raw string in its error slot. The hook's own written sentence for a studio-less job ("This project isn't attached to a studio yet…", `use-coordination.ts:775-777`) is only reachable when a real uuid resolves to NULL. Narrow (both ids null means a seat the sheet could not resolve at all), but the fallback is the one shape that cannot produce a sentence. |
| CR9-8 | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role: 'all' })` — UNSCOPED — for the head count, while `directory-view.tsx:145-148` reads `{ role: 'all', scope: scope === 'mine' ? 'mine' : undefined }` for the list. With the MINE lens pressed the head keeps printing the studio-wide count over a narrowed list. Distinct from CR9-13 (CR8-7), which is about the rail's raw row count; this one is head-vs-list within the same screen. Direction §3.1 makes the head "count of E1 cards, E2 cards", so this may be intended — a ruling, not necessarily a fix. |
| CR9-9 | low | Two more query roots outside any keys object and invalidated by nothing: `use-coordination.ts:2148` `['project-recorded-studio', projectId]` and `use-consent.ts:381` `['project-consent-org', projectId]`. Both read a project's studio, which changes rarely; the same class as CR9-28 (CR8-26) with a much lower blast radius. |
| CR9-10 | low | `views/person-profile.tsx` renders no "Edit identity" and no "Archive" act, which direction §3.2 R1 names as the card's two tertiary controls (`grep -n "Edit identity\|Archive" person-profile.tsx` → nothing). SPEC §5.2's acceptance list does not require them, which is why this is low; the Add/Edit sheet can edit a card, but nothing on the person card opens it. |

---

### CR9-11 … CR9-51 — the forty-one carried r8 minors, all still open

Each re-read at HEAD `1b07d5517`; the r8 id is in brackets and line numbers are
re-verified here. Grades are kept at r8's so the synthesis stays stable across
rounds.

| id | r8 id | Confidence | Finding, at this HEAD |
|---|---|---|---|
| CR9-11 | CR8-9 | high | Two `aria-describedby` dangle once the act becomes available: `roster-row.tsx:662` points at `${panelId}-send-held` unconditionally while `<p id=…>` renders only `{!body.trim() && …}` (`:674-681`); `notice-log.tsx:139` points at `heldId` unconditionally while `<p id={heldId}>` renders only `{picked.length === 0 && …}` (`:155`). `roster-row.tsx:520` already does it conditionally, in the same file. |
| CR9-12 | CR8-10 | medium | Eight live regions can coexist where SPEC §7 #3 asks for one: `people-room.tsx:565` (the Room's, the only explicit `aria-live`), plus `role="status"` at `directory-view.tsx:377`, `call-sheet.tsx:206`, `roster-row.tsx:687`, `project-team-roster.tsx:94`, `rolodex-picker.tsx:448`, `rolodex-seed-sheet.tsx:208`, `room-shell.tsx:193`. One of the brief's own named checks. |
| CR9-13 | CR8-7 | high | `people-room.tsx:506` and `:523` still pass `directoryCount={all?.length}` — the RAW `people_directory` row count — to the compact selector and the desktop rail, three lines from a head that prints `directoryHeadLine(directoryEntryCounts(directoryIdentityRows(all)))` (`:476`). Two counts of the same book, one screen apart. |
| CR9-14 | CR8-12 | high | `add-person-sheet.tsx:465-469` still reads `isOrgAdmin` off `organizationId` (the BOOK's studio) while the four `project_party_authority_studio_*` policies gate on `project_party_recorded_studio()`. `useProjectRecordedStudio` is in the same file at `:502-504`; the fix is one identifier. PR-n's two halves gate on two different orgs. |
| CR9-15 | CR8-13 | high | `use-access-grants.ts:296-307` invalidates `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — not `partySmsKeys.links(partyId)`, which `useRevokeFieldLink` does (`use-party-sms.ts:203`). Two doors onto one token, two answers. |
| CR9-16 | CR8-14 | high | `party-profile-sheet.tsx:491` — `createLink.mutateAsync({ partyId })`, `projectId` omitted, so `useCreateFieldLink`'s `['project-roster', projectId]` leg is skipped. `seatProjectId` is in scope and IS passed to the revoke twenty-odd lines later (`:515`). |
| CR9-17 | CR8-15 | high | `person-row.tsx:52-58` exports `openPersonLabel`; `grep -rn openPersonLabel apps/designer-portal/src` returns that definition and nothing else. The rendered control (`:142-149`) carries the bare `display_name`, where SPEC §7 #6 describes "the person's name and role summary only". |
| CR9-18 | CR8-16 | medium | `use-coordination.ts:936-946` asks `studio_compliance_documents WHERE holder_id = <the card>` while the face asks `row.paper` = `identity_paper_state(card, COALESCE(seat.company_id, card.company_id))` (R-BA/R-BJ). A seat whose only held paper is the firm's lapsed COI is refused by the face (`roster-row.tsx:262`) and permitted by the hook. An RLS-refused read returns `[]` rather than raising, so the guard reads "no paper held". |
| CR9-19 | CR8-17 | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492` (the add path's consent gate), `:673`, `:770`, `:913` (**inside the hard-delete guard**, where a NULL org silently sets `hasConsentRecord = false`), and `useProjectConsentOrg` itself (`use-consent.ts:387`), consumed by `call-sheet.tsx:99`, `project-team-roster.tsx:52` and through them by `roster-groups.tsx:67`. R-BI scopes the studio-less population to W3, which is why this stays minor. |
| CR9-20 | CR8-18 | medium | `party-mini-row.tsx:197-204` — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`. Both the attribute (SPEC §7 #4, direction §5.5) and opacity-as-state (SPEC §8 #5) are named forbidden. Transient at the one call site (`rolodex-picker.tsx:423`, while `addParty.isPending`). |
| CR9-21 | CR8-19 | high | Four dead `useFeatureFlag` imports survive the retirement, referenced nowhere in their own file: `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48`. |
| CR9-22 | CR8-20 | high | `command-bar.test.tsx` still carries the `call-sheet` flag mock (`:65`) and **11** `mockCallSheetFlag` assignments; `__tests__/call-sheet-doorways.test.tsx` carries it too. `command-bar.tsx` reads no such flag. |
| CR9-23 | CR8-21 | high | `company-card.tsx:131` — `if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`)` still concatenates the raw `company_kind`. Ten of twenty-one seeded firms fall in that branch, so the Directory firm row reads "Workroom · 1 on the crew · 2 open jobs" (`companyKindShortLabel`) where the card it opens reads "Cabinetry workroom · 1 person · 2 projects". The r6 fix log asked for a ruling: `companyKindShortLabel('sub')` is "Subcontractor", which would break SPEC §5.3 #1's "Electrical sub". **Still owed.** |
| CR9-24 | CR8-22 | low | The Add sheet's door reads "a household member" (`add-person-sheet.tsx:154`), writes `party_kind: 'client_rep'` (`:136`), and the Call Sheet's Client side prints `PARTY_KIND_LABELS.client_rep` = **"Client Rep"** (`field-config.ts:206`). C5's "the string `client_rep` never appears on a face" is kept; the title-cased abbreviation is a second word for the thing the studio's own door called a household member (SPEC §8 #3). |
| CR9-25 | CR8-23 | low | Three acts emit a real `disabled` while their mutation is in flight, because `DocumentAction` computes `unavailable = disabled \|\| loading` and emits `disabled={unavailable && !held}`: `roster-row.tsx:660-661`, `notice-log.tsx:137-138`, `rolodex-picker.tsx:593` (`disabled` with no `held` at all). Transient; `loading` is also set. |
| CR9-26 | CR8-24 | low | `roster-row.tsx:197` (`doc.expires_on < new Date().toISOString().slice(0,10)`) and `:281` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`) read the clock during render, against the room's own convention (`people-room.tsx:137`, `company-card.tsx:227`, `person-profile.tsx:146`, all `useMemo(() => new Date(), [])`). |
| CR9-27 | CR8-25 | high | `reach-access.tsx:1063` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1075`). `site-access-card.tsx:413`, `:578` and `:674` hardcode `id="site-access-emergency-lines"` / `"site-access-key-holder"` / `panelId="site-access-notice-log"` where every other disclosure in this wave uses `useId()`; two site access cards on one document would collide. |
| CR9-28 | CR8-26 | medium | `use-studio-contacts.ts:445` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line. |
| CR9-29 | CR8-27 | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:10-12` ("A HARD BLOCK — a rule that forbids a channel outright") gives the pre-R-BL reading, as does `:51-53`; `contact-rule.ts:99-103` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which R-BL's shipped predicate (`:110-114`, do-not-contact OR a route) makes false for both; `people-events.ts:3` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine. |
| CR9-30 | CR8-28 | low | `add-person-sheet.tsx:1560` — `disabled` on an `<option>`. SPEC §7 #4's ban is written for the specimen files and an `<option>` has no `aria-disabled` equivalent; recorded as the one surviving literal `disabled` on a non-transient control in the People surfaces. |
| CR9-31 | CR8-29 | medium | `--color-linen` is defined nowhere in `apps` or `packages` and is spent at `party-profile-sheet.tsx:908`, `add-person-sheet.tsx:1639` and `directory/letter-line-field.tsx:191`, always as `bg-[var(--color-linen)]/45`. Confirmed pre-existing on `origin/main`. |
| CR9-32 | CR8-30 | medium | `reach-access.tsx:97-110` keys `heldChannelReason` on `channel.status` alone, so a **phone** line marked `bounced` prints "This address bounced back… Texts and calls still reach them." beside a phone number. `isPhoneChannel(channel.channel_kind)` is called four lines away at `:353`. |
| CR9-33 | CR8-31 | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC, `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. `people-format.ts:29-39` parses by parts for exactly this reason and says so in its own docblock. |
| CR9-34 | CR8-32 | low | Two `authorityPhrase` implementations: `roster-derivation.ts:1053-1072` joins with `". "` and appends a final `"."`; `person-profile.tsx:90-100` returns each phrase bare and the caller joins with `" · "` (`:115`). The same grant reads "Selections." on the Call Sheet and "Selections" on the person card. |
| CR9-35 | CR8-33 | low | `company-card.tsx:143-144` spells the warranty long — `formatLongDate` gives "21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's own fold and every seat line use the short form. |
| CR9-36 | CR8-34 | low | `use-people.ts:269-274`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches` (`people-derivation.ts:1205-1227`), which matches firm, trade, the labelled trade and the party-kind word — so the command bar finds fewer people than the room does for the same string. (The `PeopleFilters.search` docblock at `:184-186` was corrected; the body was not.) |
| CR9-37 | CR8-35 | low | Two dead ternaries with the same string on both branches: `person-profile.tsx:500-502` (`=== 1 ? "projects" : "projects"`) and `add-person-sheet.tsx:1707-1709` (`partyName.trim() ? "them" : "them"`). |
| CR9-38 | CR8-36 | high | `person-profile.tsx:500-502` — `Worked ${person.seat_count ?? 0} of the studio's projects.` `seat_count` is `identity_seat_count()`, a SEAT count (R-BG), printed as a PROJECT count. Latent on the seed (no identity holds two seats on one project); SPEC §5.2 #10 fixes the sentence as "Worked 2 of the studio's projects." |
| CR9-39 | CR8-37 | high | `company-card.tsx:946-962` gates `NO_JOBS_SENTENCE` on `crew.length`, while `CrewJobs` returns `null` for an empty seat array (`:191`). A firm with affiliations and no open seats renders the "Jobs" heading, an empty `<ul>` and the money-book line — a region that states nothing, against C32/R-V. |
| CR9-40 | CR8-38 | medium | `company-card.tsx:843` — `Remit to {card.remit_to ?? name}` asserts a payee the studio may never have written, on the one region direction §1 line 5 makes this card the sole writer of. Every other absent record in this build prints its own sentence. |
| CR9-41 | CR8-39 | high | `use-studio-contacts.ts:276-279, 351-354, 378-381, 404-407, 533-539` — five card mutations invalidate `studioContactKeys.all` + `['people-directory']` and never `['people-directory-seats']`, though `people_directory_seats` carries `display_name`, `company_name`, `phone_e164`, `studio_contact_id`, `consent_status`, `reach_state`, `paper_state`, `contact_rule_summary`, `warranty_until`. |
| CR9-42 | CR8-40 | high | `company-card.tsx:805-806` — `documentId: docs[0]?.id ?? null, documentLabel: docs[0] ? null : "a current certificate"`. The label is `null` exactly when a document exists, and the route falls back to the same literal (`route.ts:83`), so every drafted chase reads "for a current certificate" and never names the paper. |
| CR9-43 | CR8-41 | medium | Two reducers decide one paper fact and disagree on supersession. The firm row and the seat line print `compliance_state()` / `identity_paper_state()`, which reckon supersession transitively (**R-BF**); the company card's table decides each row in the browser with `documentPaperState` (`compliance-table.tsx:51-62`) over a set `useComplianceDocuments` filtered with a flat `.is('superseded_by', null)` (`use-studio-contacts.ts:1418`). `paperHeldClause` reads that same filtered list. |
| CR9-44 | CR8-42 | low | `person-profile.tsx:334-336` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>` (`reach-access.tsx:825`), `<h3>Contact rule</h3>` (`:942`) and `<h3>Access grants</h3>` (`:1031`). The company card does the same (`company-card.tsx:732`). SPEC §5.2 #2 calls these three "sub-heads"; by ear they read as four peers. No heading level is skipped, which is why this is low. |
| CR9-45 | CR8-43 | low | `seat-line.tsx:92` — `py-[6px]` around an 11px span, roughly 28px tall, while every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the person card, the company card and the Directory row all mount it. |
| CR9-46 | CR8-44 | low | `notice-log.tsx:77-103` renders a list of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7). |
| CR9-47 | CR8-45 | low | `rolodex-picker.tsx:570` renders `{stamp ? '✓' : ''}` — a ✓ glyph, which SPEC §8 #5 names forbidden and SPEC §5.7 #4 repeats ("drawn per §8 #5, **no tick glyph**"). Pre-existing; `coordination/item-composer.tsx:900` carries a second, outside the People surfaces. |
| CR9-48 | CR8-46 | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1696-1699`) — the CORRECT wording, since R-AS retired the seat-side dispatch. One line in the report. |
| CR9-49 | CR8-6 | medium | `site-access-card.tsx:164-175` — `EditableLine`'s collapsed act is a tertiary whose only text is `Edit`, mounted three times ("The way in" `:514`, "Hours" `:634`, "Receiving" `:648`). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:131`. |
| CR9-50 | CR8-8 | medium | `entryOwesPaperWord` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's own principal, lead designer and bookkeeper, and both homeowners, each print `Not on file` in the paper column of the studio's own ledger. C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change. |
| CR9-51 | CR8-11 | high | `person-row.tsx:242-246` still prints R-V's project-scoped sentence "No open seat on this project." in the cross-project Directory, and prints it on **every** expand while `usePeopleSeats` round-trips (`enabled` flips with the toggle, `:99-101`), directly under a disclosure reading "N seats" (`:225`). |

---

## 4. What this review did not cover

The visual and behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002;
`document.documentElement.scrollWidth` was not measured), the Playwright specs
under `e2e/people` (shape-checked, not run — no port taken), the iOS surfaces
under `apps/mobile/Capture`, the W1 migrations beyond the view branches,
functions and CHECK constraints quoted above, the dev seed, and the Sanity help
articles.
