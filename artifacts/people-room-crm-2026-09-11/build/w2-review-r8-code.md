# W2 adversarial code review — round 8

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD **`20802af7f`**
("fix(people-room): W2 round-7 findings").

Read first: `rulings.md` §1–§6 (all, through R-BM), `synthesis/direction.md`
§1–§6 including §3.9's C1–C38, `specimens/SPEC.md` §3/§5/§6/§7/§8,
`w2a-report.md`, `w2b-report.md`, `w2c-report.md`, `w2-review-r5-code.md`,
`w2-fix-log-r5.md`, `w2-review-r7-code.md`, `w2-fix-log-r7.md`,
`w1a-report.md`, `w1b-report.md`. Every changed non-test file under
`apps/designer-portal/src`, `packages/supabase/src/hooks` and
`packages/types/src` was read in full or in the regions the checks name. The
local database was read under the designer's own RLS for evidence; nothing was
written, no dev server started, no port taken, no production anything.

**Verdict: NOT CLEAN — 1 blocking, 4 major, 42 minor.**

The blocking is a four-round carry (`CR3-15`) that no fix log has ever taken
and no ruling has ever settled. Three of the four majors are NEW to this round;
one (CR8-5) is new evidence on an ungated surface. Round 7's six assigned
findings (`QA-R7-1`, `QA-R7-2`, `QA-R7-3`, `CR7-1`, `CR7-2`, `CR7-3`) are **all
fixed**; the 41 unassigned r7 minors are **all still open**, re-verified at this
HEAD, and carried below.

---

## 0. Gates, run here, at HEAD `20802af7f`

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
DESIGNER_TC_EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
SUPABASE_TC_EXIT=0

$ pnpm --dir <worktree> --filter @patina/admin-portal build
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
ADMIN_BUILD_EXIT=0

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document src/components/document/rooms 'src/app/(document)/desk' \
    src/components/document/mobile src/components/document/coordination \
    src/components/document/__tests__ src/lib/analytics
Test Suites: 269 passed, 269 total
Tests:       4128 passed, 4128 total
Snapshots:   0 total
Time:        13.331 s
JEST_EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase test          # vitest
 Test Files  103 passed (103)
      Tests  1297 passed | 12 skipped (1309)
```

All four green. None of the findings below is caught by any of them.

---

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** `views/person-profile.tsx` — last hook `useComplianceDocuments({holderId: firmId})` `:234`, first early return (`role === 'maker'`) `:238`. `company-card.tsx` — three seeding `useEffect`s `:405/:431/:442`, `if (!card)` `:457`. `reach-access.tsx` (`ChannelRow`, `ReachAccess`), `people-room.tsx`, `add-person-sheet.tsx`, `roster-row.tsx`, `site-access-card.tsx`, `rolodex-picker.tsx`, `directory-view.tsx`, `person-row.tsx`, `access-grant-list.tsx`, `view-shell.tsx`, `use-call-sheet-roster.ts`, `use-project-authority.ts`: no conditional hook, none after a return. `SeatFacts` and `CrewJobs` are their own components. `roster-row.tsx:177`'s `useComplianceDocuments(cond ? {…} : undefined)` is a conditional ARGUMENT on an `enabled`-gated query. |
| Hydration gate | **PASS, with the carried nit (CR8-24).** No `window`/`document` read during render in any changed file. `roster-row.tsx:184` and `:264` still call a bare `new Date()` in render. |
| One canonical query key per entity | **PASS**, with one stray root (CR8-26, `['studio-contact-history', ids]` outside `studioContactKeys`). |
| Every mutation's invalidations | Four fan-outs still short (CR8-13, CR8-14, CR8-16, CR8-26). |
| RLS-safe writes send every joined column | **PASS.** `studio_contact_channels` sends `owner_type`+`owner_id`; `studio_contact_rules` `subject_type`+`subject_id`; `studio_person_affiliations` `person_id`+`company_id`; `studio_compliance_documents` `organization_id`; `project_party_authority` `engagement_id`+`scope`; `project_site_access_cards` `project_id`; `studio_contacts` `organization_id`; `project_parties` `project_id`. |
| Consent writes ONLY through `record_channel_*` | **PASS.** `grep -rn "studio_channel_consent"` over `apps`/`packages` (tests + `database.types.ts` excluded) returns two `.select('*')` READS (`use-consent.ts:212`, `:254`) and comments — **no table write anywhere**. The RPC doors are `use-consent.ts:297` (`record_channel_consent`), `:327` (`record_channel_invite`), `:356` (`record_channel_reconsent`), plus `use-coordination.ts:499` (`record_channel_invite`) and `:780`. |
| No portal writer of `sms_consent_*` (R-AS / R-AY) | **PASS.** The frozen-column grep (tests + `database.types.ts` excluded) returns ten hits and **zero writers**: `use-coordination.ts:77-84` (the `ProjectParty` READ interface), `:989` (`ProjectRosterRow`, the column 00594 repointed to the record's verdict), `:528` + `use-people.ts:104` + `people-derivation.ts:250` (comments), `roster-derivation.ts:149` (a synthetic in-memory client row, literal `null`), `:399` (a READ of the repointed view column), one e2e comment. `useAddProjectParty`'s INSERT (`use-coordination.ts:513-540`) and `useUpdateProjectParty`'s `dbPatch` name none of the eight. |
| No hard delete outside the mistaken-add predicate | **PASS, with one weak leg (CR8-16) and one R-BD leg (CR8-17).** Exactly two `.delete()` in the changed set: `use-coordination.ts:951` (`project_parties`, behind a server-side re-derivation of `seatDeleteRefusal` from three fresh reads at `:902-948`) and `use-studio-contacts.ts:1092` (`useClearContactRule`, documented). |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:248` and nowhere else. `grep -rni "site_access\|siteAccess\|project_site_access" apps/client-portal/src` → **zero hits**. No `show_to_client` in `site-access-card.tsx` or `notice-log.tsx` (one docblock line saying there is none). |
| No code field anywhere | **PASS, schema AND face.** `grep -rni "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode" apps packages` → **zero hits**. `site-access-card.tsx:508-523` reads `label="Lockbox version"` / `empty="No lockbox version on file."`. The card prints "Studio only. This card never reaches a client page." at `:290-292`. |
| PR-n gating, client AND DB | **PASS on the DB; still mis-scoped on the client** (carried, CR8-12). |
| `call-sheet` flag fully removed | **PASS in product code, with leftovers (CR8-19, CR8-20).** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. Every remaining `call-sheet` string is a surface key, an overlay key or a DOM event name. |
| dist rebuilt after edits | **PASS, verified by content.** `@patina/types` is the only dist-bearing package in the diff. `dist/*.js` and `dist/*.d.ts` stamped 2026-09-13 07:34:38 > `src/field-config.ts` 2026-09-12 22:48:54 and `src/studio-config.ts` 20:57:22. A fresh `npx tsc -p tsconfig.json --outDir $TMPDIR/types-dist-check` produced `field-config.js`, `studio-config.js`, both `.d.ts` and `index.js` **byte-identical** to the shipped `dist` (`diff -q` clean, 5/5). `PARTY_KINDS_OWING_NO_PAPER`/`partyKindOwesPaper` and `STATE_WORD_PIGMENTS`/`consentWordFor` are all present in `dist`. |
| Analytics only via `people-events.ts` | **PASS.** The only `posthog` reference under `components/document/people`, `components/document/roster` and `lib/analytics/people-events.ts` is `people-events.ts:20-25`, behind `isAnalyticsEnabled()`. No inline `posthog.capture`. (Docblock drift, CR8-27.) |
| Document grammar — `box-shadow` = 0 | **PASS.** Sweeping every file in `git diff origin/main --name-only`: `globals.css:360` and `:1942` (both pre-existing, outside this diff's single 29-line hunk at `:2004`) and one docblock sentence in `state-word.tsx:13`. No `boxShadow` in any TSX. |
| **Every CSS custom property used is defined in the designer portal's `globals.css`** | **PASS for W2's own tokens.** 95 distinct `var(--…)` tokens are spent by the 92 changed `.ts`/`.tsx`/`.css` files; 167 are defined in `apps/designer-portal/src/app/globals.css`. The PR-v alias block (`--sage`, `--golden`, `--terracotta`, `--sage-ink`, `--golden-ink`, `--color-dusty-blue-ink`) is on **bare `:root`** at `globals.css:2004-2032`, not inside `html:has([data-document-shell])`, so `STATE_WORD_PIGMENTS` resolves on every surface. The only undefined name still spent in a People surface is `--color-linen` (CR8-29; all three sites verified present on `origin/main`). Every other name the sweep flags is runtime- or Tailwind-supplied (`--font-heading`, `--font-inter`, `--font-mono`, `--radix-collapsible-content-height`, `--stagger-index`, `--doc-quiet-reserve*`, `--doc-mobile-bar-height`, `--ink-x/--ink-y`, `--i`, `--x`, `--wash*`, `--strata-cycle`), none of them in a People/roster file. |
| Every string on a face is SPEC vocabulary | **FAIL — one blocking (CR8-1), plus CR8-4, CR8-21, CR8-22, CR8-30, CR8-31, CR8-41.** The schema-word sweep itself passes: `client_rep` / `party_kind` / `sms_consent_status` / `studio_contact_id` / `project_parties` / `not_on_file` / `lapses_soon` / `opted_out` / `field_link` / `on_paper` appear only as comparisons or prop values, never as rendered text. "Remove" appears nowhere in either surface tree (SPEC §5.4 #14). |
| aria: no `disabled` attribute | **PASS on every act this wave authored**, with four carried exceptions. `DocumentAction` emits `disabled={unavailable && !held}` (`document-action.tsx:309`), so each `disabled={…}` paired with an identical `held={…}` lands as `aria-disabled="true"` and stays focusable. Exceptions: `add-person-sheet:1501` (`<option disabled>`, CR8-28), `party-mini-row:200` (raw `<button disabled>` + `disabled:opacity-50`, CR8-18), `rolodex-picker:423,593` / `roster-row:640` / `notice-log:138` while a mutation is pending (CR8-23). |
| `aria-expanded` pairs with a real id | **PASS.** Every `aria-controls` in the People/roster surfaces resolves to a rendered `id`; every panel is rendered unconditionally with `hidden`, so the target exists while collapsed. Two `aria-describedby` still dangle once the act becomes available (CR8-9), one `id` is rendered that nothing points at, and two ids are hardcoded (CR8-25). |
| No `<a>` inside `<button>` | **PASS.** Every `TelLink` is an `<a>` and always a sibling, never a descendant, of the row's own control: `person-row.tsx:213`, `roster-row.tsx:364`, `contact-rule-line.tsx:118` (inside a `<p>`, outside the row button), `site-access-card.tsx`, `reach-access.tsx:356`. `party-mini-row` renders a `<button>` whose words are `<span>`s and takes no anchor. |
| One live region | **PARTIAL** (carried, CR8-10). `people-room.tsx:565-566` is the Room's announcer (the only explicit `aria-live="polite"`); seven other `role="status"` — which carries an implicit polite live region — survive in the room's own surfaces. |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage` / `ConsentWord`. `coordination/party.ts:105` imports `PartyKind` from `@patina/types`; `use-coordination.ts:51` is an explicit re-export alias. |
| No ad-hoc fetch | **PASS.** One `fetch` in the whole changed set: `compliance-chase.ts:47` → the same-origin route `/api/people/chase-renewal`, which proves studio membership through the caller's own RLS read before enqueuing with the service role. No NestJS call outside `@patina/api-routes`. |
| Playwright shape | **PASS (not run — no port taken).** Six specs under `e2e/people/`, every one chromium-pinned by `test.skip(({ browserName }) => browserName !== 'chromium')`; `call-sheet.spec.ts` uses `expect.poll` over the admin client; no `networkidle` or `waitForTimeout` in the new specs. |

---

## 2. Round 7, re-checked at HEAD

### The six assigned findings — all **FIXED**

| Finding | Verdict | Evidence at HEAD |
|---|---|---|
| **QA-R7-1** (trade missing from the identity line) | **FIXED** | `people-derivation.ts:974-992` `directorySeatTradeIndex`; `directory-view.tsx:194-197` computes it from the `usePeopleSeats({all:true})` read the view already held; `person-row.tsx:151` prints `personIdentityLine(person, seatTrade)`. *(But the trade CHIP was not brought along — CR8-3.)* |
| **QA-R7-2** (raw specialty token) | **FIXED** | `directoryTradeEntryOf` / `directoryTradeLabel` (`people-derivation.ts:918-957`) route a `specialties` value through `getVendorSpecialtyLabel`; the unknown-trade fallback humanizes. Local DB confirms `Claire Bissett.specialties = {tile_stone}` → "Tile & stone". |
| **QA-R7-3** (legacy `designer_clients` row as a person card) | **FIXED for the household, over-reached for everyone else** | `directoryEntryIsLegacyClientRecord` (`:849-853`) is `p.role === 'client'` and excludes the row from `directoryIdentityRows` and `directoryDuplicatePairs`. The household is out — and so is every other client. See **CR8-2**. |
| **CR7-1** (head count `display:none` at 390) | **FIXED** | `rooms/room-shell.tsx:158-170` — `countAtEveryWidth` drops `hidden sm:inline` for `inline` and lets the head wrap; `people-room.tsx:481` passes it; `data-room-count` added. The other eight Rooms are byte-identical without the prop. |
| **CR7-2** (company card lists its crew's personal doors) | **FIXED** | `company-card.tsx:354-357` — `firmGrantSubjectIds` is `[card.id]`; `reach-access.tsx:610-618` filters `shownGrants` to `subject_type === 'contact'` when `cardKind === 'company'`. Belt and braces. |
| **CR7-3** (arbitrary seat behind three writes) | **FIXED** | `use-people.ts:327-329` — `.order('on_site_from', {ascending:false, nullsFirst:false}).order('seat_id')`. `mintConsequenceSentence` names the job (`reach-access.tsx:566-574`); the Record-consent band opens with "This is recorded on the {project}." (`:462-466`, `data-consent-origin`). |

### The forty-one unassigned r7 minors — **every one still OPEN**

Each re-read at HEAD with re-verified line numbers. Carried below as
CR8-4 … CR8-44 with the r7 id named.

---

## 3. Findings

### CR8-1 · BLOCKING · high confidence — the roster row's held clause does not print SPEC §5.4 #7's string: "COI, general liability" stands where the acceptance fixes "insurance"

`apps/designer-portal/src/components/document/roster/roster-row.tsx:186-197`

```ts
const held = blocking
  ? heldClause(row.companyName, {
      docLabel:
        COMPLIANCE_DOC_TYPE_LABELS[blocking.doc_type as …] ??
        blocking.doc_label ?? blocking.doc_type,
      …
```

`COMPLIANCE_DOC_TYPE_LABELS.coi_gl = 'COI, general liability'`
(`packages/supabase/src/hooks/use-studio-contacts.ts:1298`), and
`heldClause` (`roster-derivation.ts:906-922`) composes
`"${blocks} ${owner}${paper.docLabel}${lapsed}."`.

SPEC §5's preamble: *"Every string below must appear on the face, spelled
exactly."* SPEC §5.4 #7 fixes it as:

> "Site access held. Northgate Electric's insurance lapsed 31 March 2026."

What the shipped row prints:

> "Site access held. Northgate Electric's COI, general liability lapsed 31 March 2026."

**It renders on the seed, on the row SPEC §5.4 #7 names.** Read from the local
database as `designer@patina.dev` under RLS:

```
 display_name  |   project_name    | stage  |    company_name    | paper_state
---------------+-------------------+--------+--------------------+-------------
 Dana Kowalski | Okonkwo residence | active | Northgate Electric | lapsed
```

and her firm's paper:

```
 company_name       | doc_type | number      | expires_on | blocks
--------------------+----------+-------------+------------+---------------------
 Northgate Electric | coi_gl   | GL-22907-25 | 2026-03-31 | {site_access,draw}
```

so `row.paper === 'lapsed' && row.companyId` is true, the `useComplianceDocuments`
read fires, and the clause paints.

**History, stated plainly.** This is `CR3-15`, raised in round 3 and carried
through `w2-review-r4-code.prior.md:142` verbatim ("held clause prints 'COI,
general liability' where SPEC §5.4 #7 fixes 'insurance'"). No fix log has taken
it; no ruling in `rulings.md` §3 settles it; it is not scoped to W3/W4 anywhere.
Four rounds graded it minor. Under **this** round's rubric — "Blocking = … a
missing SPEC acceptance string" — it is blocking, and I am grading it as the
rubric says rather than as the carry did. Fable may rule it down; it should not
keep passing unnamed.

**Fix:** one of two, both one line. Either give the roster clause its own
plain-English noun for the dated papers (`coi_gl` → "insurance", `coi_wc` →
"workers comp insurance") in a room-local map beside `heldClause`, or amend SPEC
§5.4 #7 to the column-head vocabulary. Note that the same literal reads
correctly today on the COMPANY CARD's Paper table, where "COI, general
liability" IS the Type column head (SPEC §5.3 #3) — so the fix belongs at the
roster call site, not in `COMPLIANCE_DOC_TYPE_LABELS`.

---

### CR8-2 · MAJOR · high confidence (NEW — the over-reach in QA-R7-3's fix) — every one of the studio's `designer_clients` records is now dropped from the Directory and from the head count, so the studio's own clients are gone from the room, while Portfolio and Nurture still read them

`apps/designer-portal/src/lib/document/people-derivation.ts:849-865`

```ts
export function directoryEntryIsLegacyClientRecord(p: DirectoryPerson): boolean {
  return p.role === "client";
}

export function directoryIdentityRows(rows) {
  return rows.filter(
    (row) => !directoryEntryIsCompanyOnlySeat(row) &&
             !directoryEntryIsLegacyClientRecord(row),
  );
}
```

`directoryIdentityRows` is the single filter behind **both** the Directory list
(`directory-view.tsx:152-155`) and the head count (`people-room.tsx:476`).
`people_directory`'s CLIENTS branch emits `'client'::text AS role` for **every**
`designer_clients` row (`00626:1437`), not only for a household.

**What leaves the room.** Read as `designer@patina.dev` under RLS:

```
 role    | count          person_id                            | display_name                        | phone
---------+-------         -------------------------------------+-------------------------------------+----------------
 client  |     7          d0e80000-…-000000000002              | Karin Lindqvist                     | (612) 555-0190
 contact |    49          d0c10000-…-0000000000a2              | The Ashfords (no-login household)   |
 lead    |     5          d0c10000-…-0000000000b1              | Elena Marlowe (no-login household)  |
 sub     |     1          d0000000-…-00000000c001              | Nora Ellison                        |
 team    |     1          d0e80000-…-000000000001              | The Okonkwo household               | (612) 555-0104
                          cc890e5f-… / 71d38924-…              | Client User ×2                      |
```

All seven go. `studio_contacts` holds 28 person cards and 21 company cards, and
**none of them is Karin Lindqvist, the Ashfords, Elena Marlowe or Nora Ellison**
(`select … from studio_contacts where full_name ilike '%lindqvist%' or …` →
0 rows). So the head moves from r7's live **41 people · 21 firms** to
**34 people · 21 firms**, and the four named humans/households are reachable
from no Directory row at all.

**Three things this breaks.**

1. **SPEC §3's own head derivation counts Karin Lindqvist.** *"29 = the 27
   distinct humans of fixture §2 … plus Karin Lindqvist and Ben Ostrom from
   fixture §4."* She is a client from a prior job and holds no `studio_contacts`
   card. Under this filter the Directory can never reach 29.
2. **The Clients chip now shows prospects but not clients.** `CLIENT_KINDS`
   (`people-derivation.ts:1067`) admits `client`, `lead`, `client_rep`, and
   `role === 'lead'` rows are NOT excluded — so five open leads still list under
   Clients while the studio's seven actual client records do not. On the seeded
   studio the Clients chip is Adaeze, Chidi and five leads.
3. **The room disagrees with itself.** `views/portfolio-view.tsx:43` reads
   `usePeopleDirectory({ role: 'client' })` and `views/nurture-view.tsx:23`
   reads `role: 'all'` — neither applies `directoryIdentityRows`. Portfolio and
   Nurture list exactly the people the Directory says are not people.

The r7 fix log's own reasoning is about the HOUSEHOLD ("A household's own
Directory presence is PR-c's `client_households` object, P2 scope") and about
the duplicate band. Excluding the household from the duplicate scan is right.
Excluding every client record from the studio's book is a different act, and no
ruling in `rulings.md` §3 covers it.

**Fix:** narrow the predicate to the row the finding was about rather than the
branch. A `designer_clients` row whose `client_id` (profile) or whose phone
already resolves to a `studio_contacts` person card is a duplicate of that card
and should drop; one that resolves to no card is the only record the studio has
of that client and must stay, exactly as a `lead` row does. Keep the
unconditional exclusion inside `directoryDuplicatePairs` (that half is correct —
the CLIENTS branch hard-codes NULL consent/paper/rule and `seat_count` 0, so it
can never win a dedupe) and gate the row/head exclusion on an actual card match.

---

### CR8-3 · MAJOR · high confidence (NEW — QA-R7-1's other half) — the trade chip line narrows on the CARD's trade while the row prints the SEAT's, so on the seeded studio every one of the eight trade chips empties the Directory

`apps/designer-portal/src/components/document/people/views/directory-view.tsx:336`

```ts
if (trade !== "all" && directoryTradeOf(row) !== trade) return false;
```

`directoryTradeOf` (`people-derivation.ts:937-939`) reads
`meta.specialties[0]` then `meta.trade`. QA-R7-1 established — and
`people-derivation.ts:960-966` states in its own docblock — that
`people_directory`'s CONTACTS branch, *"where every carded human now lives"*,
carries **neither** for a crew or sub card, because trade is a SEAT fact. The
branch's `jsonb_build_object` (`00626:1845-1869`) emits `contact_kind`,
`entity_kind`, `company_name`, `company_id`, `specialties`, `vendor_id`,
`organization_id`, `archived_at` — and no `trade`.

So the row's printed line and the chip's predicate now read two different
sources: `personIdentityLine(person, seatTrade)` at `:151` prints
"Northgate Electric · electrical" off the seat, and the chip asks the card.

**Every chip is empty on the seed.** The chip row renders
`TRADE_LINE.filter(t => ALL_FIELD_TRADES.includes(t))` — electrical, plumbing,
cabinetry, drywall, paint, hvac, carpentry / framing, radon mitigation
(`directory-view.tsx:414-436`), under Crew **and** under Makers
(`showsTradeLine = chip === "crew" || chip === "makers"`, `:361`). The only
person cards in the whole book carrying anything `directoryTradeOf` can return
are four makers:

```
 full_name      | contact_kind | specialties
----------------+--------------+------------------------
 Claire Bissett | vendor       | {tile_stone}
 Marcus Hale    | vendor       | {plumbing_fixtures}
 Sofia Ferraro  | vendor       | {lighting}
 Owen Ashby     | maker        | {millwork_fabrication}
```

None of those four values is a `FieldTrade`, so none is a rendered chip. Every
crew and sub card returns `null`. Pressing **any** trade chip under **either**
chip that shows the line narrows to zero rows and the room prints
`DIRECTORY_EMPTY_SENTENCE` — "Nobody under this narrowing yet." — over a list
whose rows visibly say `· electrical`, `· drywall`, `· plumbing`,
`· cabinetry`, `· carpentry & framing`.

Direction §3.1 gives the Trade line its own row in the Directory table
("chips under Crew", source `FieldTrade` + `trade_label`); SPEC §5.1 #3 requires
the eight chips on the face. They are on the face and they answer nothing.

**Fix:** hand the filter the same index the line reads. `seatTrades` is already
computed three lines above (`:194-197`); make the predicate
`(directoryTradeOf(row) ?? seatTrades.get(row.person_id)) !== trade`. The
vocabulary split matters here too — a specialty value can never equal a
`FieldTrade` chip, so the Makers trade line is answering with the wrong list and
should either render specialties or not render at all.

---

### CR8-4 · MAJOR · high confidence (NEW) — nothing in the portal can create a company card, so a firm the studio meets for the first time never becomes a Directory row, never gets a card, and can never have its paper recorded

Direction §1 line 1 makes a firm "a card that owns paper and payment"; line 5
makes the company card "the ONLY place a compliance document, a payee identity,
a signer, or a paperwork contact is written". Direction §3.1's Room head row
names two controls: **"Add person (primary), Add firm (secondary)"**.

**There is no Add firm.** `grep -rn "Add firm\|Add a firm\|add-firm"
apps/designer-portal/src` → **zero hits**. `people-room.tsx:485-497` renders one
head act, `Add person`.

**And no other door mints one.** `useAddStudioContact` requires
`entityKind: 'person' | 'company'` (`use-studio-contacts.ts:113`, written at
`:259`). Its only call site in the entire repo outside its own definition is
`roster/rolodex-picker.tsx:246`, which passes `entityKind: 'person'` (`:319`).
`grep -rn "useAddStudioContact\b" apps packages` returns exactly those two
lines plus the export barrel.

**The Add sheet's firm field is match-only, and says so.** `add-person-sheet.tsx:1336-1359`
offers a `<select>` of existing firms plus one option, "A firm not on this
list", which reveals a free-text input. The save path:

```ts
const matchedFirm = firms.find((f) => f.id === firmId) ?? null;
const firmName = matchedFirm?.company_name ?? company;
…
companyName: firmName,
// A firm typed by hand has no card yet and stays a snapshot string.
companyId: matchedFirm?.id ?? null,
…
if (matchedFirm && !chain.affiliationWritten) { await setAffiliation…(); }
```
(`:697-714`, `:804-814`)

So a typed firm writes a `company_name` STRING on the seat and nothing else: no
`studio_contacts` company row, no `company_id`, no affiliation. Downstream, that
firm has **no** Directory firm row (the row comes off the contacts branch's
`entity_kind = 'company'`), **no** company card (`?firm=` needs a card id),
**no** Paper region, **no** payee, and no "Chase the renewal" — the compliance
spine W2 built is unreachable for it. `people-derivation.ts:995-1000`'s
`directoryFirmOf` reads `meta.company_id`, which is NULL, so even the person's
own row loses the firm identity.

`w2b-report.md:40` describes the Add sheet as *"Eight kinds, **firm
create-or-match**, required trade, …"*. The code matches; it does not create.

Grading it major rather than blocking: on the seeded studio every firm already
has a card, so no face is wrong today — the defect is that the room's second
entry type has no writer at all, which is a direction §3.1 control that was
never built and a wave-report claim that is not true.

**Fix:** either add the "Add firm" secondary act direction §3.1 names (one
`useAddStudioContact({entityKind:'company'})` call, the same shape the picker
already uses for a person), or have the Add sheet mint the company card when the
studio types a name the list does not hold, then set `companyId` and the
affiliation from it. If firm creation is meant to be W3's, it needs a ruling and
the w2b report needs its sentence corrected.

---

### CR8-5 · MAJOR · high confidence (NEW evidence on a known rule) — the Call Sheet roster row is the ONE surface that prints the paper word ungated, so a person the studio never owed paper reads "Not on file" in their unfold

`apps/designer-portal/src/components/document/roster/roster-row.tsx:421-422`

```tsx
<StateWord family="consent" value={row.consent} />
<StateWord family="paper" value={row.paper} />
```

Every other surface in this build gates the same word:

| Surface | Gate |
|---|---|
| Directory person row | `entryPaperWord(person)` → `partyKindOwesPaper` (`person-row.tsx:128`, `people-derivation.ts:1213-1223`) |
| Directory firm row | `entryPaperWord(row)` (`directory-view.tsx:523`) |
| Person card R5 | `owesPaper` (`person-profile.tsx:283`, `:459`) |
| Company card R3 | `owesPaper` (`company-card.tsx:479`, `:745`) |
| Picker mini row | `partyKindOwesPaper(kind)` — added by the round-6 fix for **QA-R6-1, graded BLOCKING** (`party-mini-row.tsx:181`) |
| **Call Sheet roster row** | **none** |

Direction §3.8 is categorical: *"a firm whose only people are inspectors or
lenders holds no compliance paper for the studio and carries no paper word at
all, **on any surface**."* R-A and C13/C24 say the same for the person.

**On the seed.** Read as `designer@patina.dev`:

```
   display_name   |  party_kind  |             company_name              | paper_state
------------------+--------------+---------------------------------------+-------------
 Ray Thao         | other        | City of Minneapolis, CPED Inspections | not_on_file
 Carol Nyström    | other        | Great Northern Bank                   | not_on_file
 Adaeze Okonkwo   | client       | Okonkwo household                     | not_on_file
 Chidi Okonkwo    | client_rep   | Okonkwo household                     | not_on_file
```

Unfolding Ray Thao's or Carol Nyström's row on the Okonkwo Call Sheet prints
paper `Not on file` — the exact word C13 rules must never appear for a firm the
studio never asked paper of, and the exact word QA-R6-1 was graded blocking for
on the picker one wave ago. The Directory row for the same two humans correctly
prints nothing, because it reads their CARD's `contact_kind` (`inspector`, of
which the seed holds two) rather than the seat's `party_kind`.

Two notes that keep this honest, and keep it major rather than blocking:
- The seed's `party_kind` for these two is `other`, not `inspector`, because
  `project_parties_party_kind_check` has not been widened — a declared W3 gap
  (`w2a-report.md` §6 item 2). So `partyKindOwesPaper(row.partyKind)` alone
  would not exempt them today; the gate has to reach the card's kind, which the
  row already has via `row.personId`.
- Adaeze's and Chidi's "Not on file" is the same class as CR8-30 (CR7-6), which
  is a ruling owed, not a settled rule.

Either way the **absence of any gate** on this one surface is W2's, and survives
whatever the CHECK does.

**Fix:** gate the word the way the picker now does, off the card's kind:
`{row.paper && identityOwesPaperWord(row) && <StateWord family="paper" …/>}`,
with the predicate reading the seat's card `contact_kind` (the Directory already
resolves it) and falling back to `partyKindOwesPaper(row.partyKind)`.

---

### CR8-6 … CR8-44 — the forty-one r7 minors, all still open, plus one new

Each re-read at HEAD `20802af7f`. The r7 id is in brackets; line numbers are
re-verified here.

| id | r7 id | Confidence | Finding, at this HEAD |
|---|---|---|---|
| CR8-6 | CR7-4 | medium | `site-access-card.tsx:164-175` — `EditableLine`'s collapsed act is a tertiary whose only text is `Edit`, mounted three times ("The way in" `:514`, "Hours" `:634`, "Receiving" `:648`). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:131`. |
| CR8-7 | CR7-5 | high | `people-room.tsx:506` and `:523` still pass `directoryCount={all?.length}` — the RAW `people_directory` row count (**63** on the seed) — to the compact selector and the desktop rail, three lines from a head that now prints **34 people · 21 firms**. The gap grew this round: it was 63 vs 62, it is now 63 vs 55. |
| CR8-8 | CR7-6 | medium | `entryOwesPaperWord` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's own principal, lead designer and bookkeeper, and both homeowners, each print `Not on file` in the paper column of the studio's own ledger. C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change. |
| CR8-9 | CR7-27 | high | Two `aria-describedby` dangle once the act becomes available: `roster-row.tsx:641` points at `${panelId}-send-held` unconditionally while `<p id=…>` renders only `{!body.trim() && …}` (`:653-660`); `notice-log.tsx:139` points at `heldId` unconditionally while `<p id={heldId}>` renders only `{picked.length === 0 && …}` (`:155`). `roster-row.tsx:499` already does it conditionally, in the same file. |
| CR8-10 | CR7-28 | medium | Eight live regions can coexist where SPEC §7 #3 asks for one: `people-room.tsx:565` (the Room's, the only explicit `aria-live`), plus `role="status"` at `directory-view.tsx:372`, `call-sheet.tsx:206`, `roster-row.tsx:666`, `project-team-roster.tsx:94`, `rolodex-picker.tsx:448`, `rolodex-seed-sheet.tsx:208`, `room-shell.tsx:193`. |
| CR8-11 | CR7-12 | high | `person-row.tsx:242-246` still prints R-V's project-scoped sentence "No open seat on this project." in the cross-project Directory, and prints it on **every** expand while `usePeopleSeats` round-trips (`enabled` flips with the toggle, `:99-101`), directly under a disclosure reading "N seats" (`:225`). |
| CR8-12 | CR7-16 | high | `add-person-sheet.tsx:446-450` still reads `isOrgAdmin` off `organizationId` (the book's studio) while the four `project_party_authority_studio_*` policies gate on `project_party_recorded_studio()`. `useProjectRecordedStudio` is in the same file at `:483-485`; the fix is one identifier. PR-n's two halves gate on two different orgs. |
| CR8-13 | CR7-18 | high | `use-access-grants.ts:296-307` invalidates `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — not `partySmsKeys.links(partyId)`, which `useRevokeFieldLink` does (`use-party-sms.ts:205`). Two doors onto one token, two answers. |
| CR8-14 | CR7-19 | high | `party-profile-sheet.tsx:491` — `createLink.mutateAsync({ partyId })`, `projectId` omitted, so `useCreateFieldLink`'s `['project-roster', projectId]` leg is skipped. `seatProjectId` is in scope and IS passed to the revoke twenty-three lines later. |
| CR8-15 | CR7-13 | high | `person-row.tsx:52-58` exports `openPersonLabel`; `grep -rn openPersonLabel apps/designer-portal/src` returns that definition and nothing else. The rendered control (`:142-149`) carries the bare `display_name`, where SPEC §7 #6 describes "the person's name and role summary only". The r7 fix wired `seatTrade` into the helper and left the helper unused. |
| CR8-16 | CR7-21 | medium | `use-coordination.ts:936-946` asks `studio_compliance_documents WHERE holder_id = <the card>` while the face asks `row.paper` = `identity_paper_state(card, COALESCE(seat.company_id, card.company_id))` (R-BA/R-BJ). A seat whose only held paper is the firm's lapsed COI is refused by the face (`roster-row.tsx:245`) and permitted by the hook. An RLS-refused read returns `[]` rather than raising, so the guard reads "no paper held". |
| CR8-17 | CR7-23 | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492` (the add path's consent gate), `:673`, `:770`, `:913` (**inside the hard-delete guard**, where a NULL org silently sets `hasConsentRecord = false`), and `useProjectConsentOrg` itself (`use-consent.ts:379`), consumed by `call-sheet.tsx:99` and `project-team-roster.tsx:51`. Five of the eight local projects carry `studio_id IS NULL` (`select count(*) filter (where studio_id is null) → 5 of 8`); R-BI scopes that population to W3, which is why this stays minor. |
| CR8-18 | CR7-26 | medium | `party-mini-row.tsx:197-204` — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`. Both the attribute (SPEC §7 #4, direction §5.5) and opacity-as-state (SPEC §8 #5) are named forbidden. Transient at the one call site (`rolodex-picker.tsx:423`). |
| CR8-19 | CR7-24 | high | Four dead `useFeatureFlag` imports survive the retirement, referenced nowhere in their own file: `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48`. |
| CR8-20 | CR7-20 | high | `command-bar.test.tsx` still carries the `call-sheet` flag mock and **11** `mockCallSheetFlag` assignments; `__tests__/call-sheet-doorways.test.tsx` carries it too. `command-bar.tsx` reads no such flag. |
| CR8-21 | CR7-8 | high | `company-card.tsx:131` — `if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`)` still concatenates the raw `company_kind`. Ten of twenty-one seeded firms fall in that branch, so the Directory firm row reads "Workroom · 1 on the crew · 2 open jobs" (`companyKindShortLabel`) where the card it opens reads "Cabinetry workroom · 1 person · 2 projects". The r6 fix log asked for a ruling: `companyKindShortLabel('sub')` is "Subcontractor", which would break SPEC §5.3 #1's "Electrical sub". **Still owed.** |
| CR8-22 | CR7-7 | low | The Add sheet's door reads "a household member" (`add-person-sheet.tsx:154`), writes `party_kind: 'client_rep'` (`:135`), and the Call Sheet's Client side prints `PARTY_KIND_LABELS.client_rep` = **"Client Rep"** (`field-config.ts:206`). C5's "the string `client_rep` never appears on a face" is kept; the title-cased abbreviation is a second word for the thing the studio's own door called a household member (SPEC §8 #3). |
| CR8-23 | CR7-30 | low | Three acts emit a real `disabled` while their mutation is in flight, because `DocumentAction` emits `disabled={unavailable && !held}`: `roster-row.tsx:639-640`, `notice-log.tsx:137-138`, `rolodex-picker.tsx:593` (`disabled` with no `held` at all). Transient; `loading` is also set. |
| CR8-24 | CR7-32 | low | `roster-row.tsx:184` (`doc.expires_on < new Date().toISOString().slice(0,10)`) and `:264` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`) read the clock during render, against the room's own convention (`people-room.tsx:137`, `company-card.tsx:227`, `person-profile.tsx:146`, all `useMemo(() => new Date(), [])`). |
| CR8-25 | CR7-33 | high | `reach-access.tsx:1055` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1074`). `site-access-card.tsx:403` and `:571` hardcode `aria-controls="site-access-emergency-lines"` / `"site-access-key-holder"` where every other disclosure in this wave uses `useId()`; two site access cards on one document would collide. |
| CR8-26 | CR7-34 | medium | `use-studio-contacts.ts:445` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line. |
| CR8-27 | CR7-35 | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:11-12` and `:51-53` give the pre-R-BL reading; `contact-rule.ts:99-103` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which R-BL's shipped predicate (`:110-114`, do-not-contact OR a route) makes false for both; `people-events.ts:3` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine. |
| CR8-28 | CR7-36 | low | `add-person-sheet.tsx:1501` — `disabled` on an `<option>`. SPEC §7 #4's ban is written for the specimen files and an `<option>` has no `aria-disabled` equivalent; recorded as the one surviving literal `disabled` on an interactive element in the People surfaces. |
| CR8-29 | CR7-37 | medium | `--color-linen` is defined nowhere in `apps` or `packages` and is spent at `party-profile-sheet.tsx:908`, `add-person-sheet.tsx:1580` and `directory/letter-line-field.tsx:191`, always as `bg-[var(--color-linen)]/45`. Confirmed pre-existing: `git show origin/main:…/party-profile-sheet.tsx:809` and `…/add-person-sheet.tsx:936` carry the same lines, and `git show origin/main:…/globals.css` defines no such token. |
| CR8-30 | CR7-38 | medium | `reach-access.tsx:97-110` keys `heldChannelReason` on `channel.status` alone, so a **phone** line marked `bounced` prints "This address bounced back… Texts and calls still reach them." beside a phone number. `isPhoneChannel(channel.channel_kind)` is called four lines away at `:356`. |
| CR8-31 | CR7-39 | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC, `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. `people-format.ts:29-39` parses by parts for exactly this reason and says so in its own docblock. |
| CR8-32 | CR7-40 | low | Two `authorityPhrase` implementations: `roster-derivation.ts:1024-1043` joins with `". "` and appends a final `"."`; `person-profile.tsx:90-100` returns each phrase bare and the caller joins with `" · "` (`:115`). The same grant reads "Selections." on the Call Sheet and "Selections" on the person card. |
| CR8-33 | CR7-41 | low | `company-card.tsx:143-144` spells the warranty long — `formatLongDate` gives "21 November 2026" (`people-format.ts:28-39`) — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's own fold and every seat line use `formatSeatDate`'s short form. |
| CR8-34 | CR7-42 | low | `use-people.ts:269-274`'s in-memory search matches name, email and phone digits only, while its own `PeopleFilters.search` docblock (`:184-186`) and direction §3.1 also name firm and trade. The Directory uses `directoryEntryMatches` (`people-derivation.ts:1135-1157`), which matches firm, trade, the labelled trade and the party-kind word — so the command bar finds fewer people than the room does for the same string. |
| CR8-35 | CR7-43 | low | Two dead ternaries with the same string on both branches: `person-profile.tsx:500-502` (`=== 1 ? "projects" : "projects"`) and `add-person-sheet.tsx:1648-1650`. |
| CR8-36 | CR7-14 | high | `person-profile.tsx:500-502` — `Worked ${person.seat_count ?? 0} of the studio's projects.` `seat_count` is `identity_seat_count()`, a SEAT count (R-BG), printed as a PROJECT count. Latent on the seed (no identity holds two seats on one project); SPEC §5.2 #10 fixes the sentence as "Worked 2 of the studio's projects." |
| CR8-37 | CR7-15 | high | `company-card.tsx:933-955` gates `NO_JOBS_SENTENCE` on `crew.length`, while `CrewJobs` returns `null` for an empty seat array (`:191`). A firm with affiliations and no open seats renders the "Jobs" heading, an empty `<ul>` and the money-book line — a region that states nothing, against C32/R-V. |
| CR8-38 | CR7-17 | medium | `company-card.tsx:831-833` — `Remit to {card.remit_to ?? name}` asserts a payee the studio may never have written, on the one region direction §1 line 5 makes this card the sole writer of. Every other absent record in this build prints its own sentence. |
| CR8-39 | CR7-22 | high | `use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538` — five card mutations invalidate `studioContactKeys.all` + `['people-directory']` and never `['people-directory-seats']`, though `people_directory_seats` carries `display_name`, `company_name`, `phone_e164`, `studio_contact_id`, `consent_status`, `reach_state`, `paper_state`, `contact_rule_summary`, `warranty_until`. |
| CR8-40 | CR7-25 | high | `company-card.tsx:794-795` — `documentId: docs[0]?.id ?? null, documentLabel: docs[0] ? null : "a current certificate"`. The label is `null` exactly when a document exists and the route falls back to the same literal, so every drafted chase reads "for a current certificate" and never names the paper. |
| CR8-41 | CR7-10 | medium | Two reducers decide one paper fact and disagree on supersession. The firm row and the seat line print `compliance_state()` / `identity_paper_state()`, which reckon supersession transitively (**R-BF**); the company card's table decides each row in the browser with `documentPaperState` (`compliance-table.tsx:51-62`) over a set `useComplianceDocuments` filtered with a flat `.is('superseded_by', null)` (`use-studio-contacts.ts:1418`). `paperHeldClause` reads that same filtered list. |
| CR8-42 | CR7-9 | low | `person-profile.tsx:334-336` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>` (`reach-access.tsx:820`), `<h3>Contact rule</h3>` (`:938`) and `<h3>Access grants</h3>` (`:1028`). The company card does the same (`company-card.tsx:721`). SPEC §5.2 #2 calls these three "sub-heads"; by ear they read as four peers. No heading level is skipped, which is why this is low. |
| CR8-43 | CR7-31 | low | `seat-line.tsx:92` — `py-[6px]` around an 11px span, roughly 28px tall, while every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the person card, the company card and the Directory row all mount it. |
| CR8-44 | CR7-44 | low | `notice-log.tsx:77-103` renders a list of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7). |
| CR8-45 | — | low | **NEW.** `rolodex-picker.tsx:570` renders `{stamp ? '✓' : ''}` — a ✓ glyph, which SPEC §8 #5 names forbidden and SPEC §5.7 #4 repeats ("drawn per §8 #5, **no tick glyph**"). Pre-existing (`git show origin/main:…/rolodex-picker.tsx:479` is the same line), inside a region this wave rewrote. `coordination/item-composer.tsx:900` carries a second, outside the People surfaces. |
| CR8-46 | CR7-11 | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() || "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1637-1640`) — the CORRECT wording, since R-AS retired the seat-side dispatch (`w2a-report.md` §6 item 1) and nothing is sent. One line in the report. |

---

## 4. What this review did not cover

The visual and behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002;
`document.documentElement.scrollWidth` was not measured), the Playwright specs
under `e2e/people` (shape-checked, not run — no port taken), the iOS surfaces
under `apps/mobile/Capture`, the W1 migrations beyond the view branches,
functions and CHECK constraints quoted above, the dev seed beyond the reads
quoted, and the Sanity help articles.
