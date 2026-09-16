# W2 adversarial code review — round 7

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD **`4aadffce4`**
("fix(people-room): W2 round-6 findings").

Read first: `rulings.md` §1–§6 (through R-BM), `synthesis/direction.md` §1–§6
including §3.9's C1–C38, `specimens/SPEC.md` §3/§5/§6/§7/§8, `w2a-report.md`,
`w2b-report.md`, `w2c-report.md`, `w2-review-r5-code.md`, `w2-review-r5-qa.md`,
`w2-fix-log-r5.md`, `w2-review-r6-code.md`, `w2-review-r6-qa.md`,
`w2-fix-log-r6.md`, `w1a-report.md`, `w1b-report.md`. Every changed non-test
file under `apps/designer-portal/src`, `packages/supabase/src/hooks` and
`packages/types/src` was read in full or in the regions the checks name. The
local database was read for evidence; nothing was written, no dev server was
started, no port was taken, no production anything.

**Verdict: NOT CLEAN — 1 blocking, 2 major, 41 minor.**

The blocking and both majors are NEW to this round. Round 6's five assigned
findings (`QA-R6-1`, `QA-R6-2`, `CR6-1`, `CR6-2`, `CR6-3`) are **all fixed**;
the 33 unassigned r6 minors are **all still open** and carried below with
re-verified line numbers at this HEAD.

---

## 0. Gates, run here, at HEAD `4aadffce4`

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
DESIGNER_TC_EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
[exited with code 0]

$ pnpm --dir <worktree> --filter @patina/admin-portal build
...
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
[exited with code 0]

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document 'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__ \
    src/lib/analytics
Test Suites: 202 passed, 202 total
Tests:       3335 passed, 3335 total
Snapshots:   0 total
Time:        10.094 s
[exited with code 0]
```

All four green. 3335 tests = r6's 3290 plus the suites the wider path set picks up.

---

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** `views/person-profile.tsx` — last hook `useComplianceDocuments({holderId: firmId})` at `:234`, first early return (`role === 'maker'`) at `:238`. `company-card.tsx` — the three seeding `useEffect`s at `:393/:419/:430`, `if (!card)` at `:445`. `reach-access.tsx` (`ChannelRow` and `ReachAccess`), `people-room.tsx`, `add-person-sheet.tsx`, `roster-row.tsx`, `site-access-card.tsx`, `rolodex-picker.tsx`, `directory-view.tsx`, `person-row.tsx`, `access-grant-list.tsx` (`GrantRow`), `view-shell.tsx`, `use-call-sheet-roster.ts`, `use-project-authority.ts`: no conditional hook, no hook after a return. `SeatFacts` and `CrewJobs` are their own components. `roster-row.tsx:177`'s `useComplianceDocuments(cond ? {…} : undefined)` is a conditional ARGUMENT on an `enabled`-gated query, not a conditional hook. |
| Hydration gate | **PASS, with the carried nit (CR6-25).** `/people` and the document shell are `'use client'`; no `window`/`document` read during render in any changed file — every read is inside `useEffect` or a handler. `roster-row.tsx:184` and `:264` still call a bare `new Date()` in render. |
| One canonical query key per entity | **PASS**, with one stray root (CR6-27). Table unchanged from r6 §2. |
| Every mutation's invalidations | Four fan-outs still short (CR6-11, CR6-12, CR6-14, CR6-15, CR6-27). |
| RLS-safe writes send every joined column | **PASS.** `studio_contact_channels` INSERT sends `owner_type`+`owner_id`; `studio_contact_rules` sends `subject_type`+`subject_id`; `studio_person_affiliations` sends `person_id`+`company_id`; `studio_compliance_documents` sends `organization_id`; `project_party_authority` sends `engagement_id`+`scope`; `project_site_access_cards` sends `project_id`; `studio_contacts` sends `organization_id`; `project_parties` sends `project_id`. |
| Consent writes ONLY through `record_channel_*` | **PASS.** `grep -rn "studio_channel_consent"` over `apps`/`packages` (tests and `database.types.ts` excluded) returns **two `.select('*')` reads** (`use-consent.ts:212`, `:254`) and comments. The three RPC doors are `use-consent.ts:297/:327/:356` plus `use-coordination.ts:499` and `:780`. **No table write to `studio_channel_consent` anywhere.** |
| No portal writer of `sms_consent_*` (R-AS / R-AY) | **PASS.** The frozen-column grep (tests + `database.types.ts` excluded) returns **ten hits and zero writers**: `use-coordination.ts:77-84` (the `ProjectParty` READ interface), `:989` (`ProjectRosterRow`, the column 00594 repointed to the record's verdict), `:528` + `use-people.ts:104` + `people-derivation.ts:246` (comments), `roster-derivation.ts:149` (a synthetic in-memory client row, literal `null`), `:399` (a READ of the repointed view column), one e2e comment. `useAddProjectParty`'s INSERT and `useUpdateProjectParty`'s `dbPatch` name none of the eight. |
| No hard delete outside the mistaken-add predicate | **PASS, with one weak leg (CR6-14).** Exactly two `.delete()` in the whole changed set: `use-coordination.ts:951` (`project_parties`, behind a server-side re-derivation of `seatDeleteRefusal` from three fresh reads at `:902-948`) and `use-studio-contacts.ts:1092` (`useClearContactRule`, lifting a rule — documented). |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:248` and nowhere else. `grep -rn "site_access\|siteAccess\|project_site_access" apps/client-portal/src` → **zero hits**. No `show_to_client` in `site-access-card.tsx` or `notice-log.tsx` (one docblock mention that there is none). |
| No code field anywhere | **PASS, schema AND face.** `grep -rni "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode" apps packages` → **zero hits**; `UpdateSiteAccessCardInput` carries `lockboxVersion` / `alarmRef` only; and CR6-3's face half is fixed — `site-access-card.tsx:515` now reads `label="Lockbox version"` with `empty="No lockbox version on file."`. |
| PR-n gating, client AND DB | **PASS on the DB; still mis-scoped on the client** (carried, CR6-8). |
| `call-sheet` flag fully removed | **PASS in product code, with leftovers (CR6-17).** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. All 14 consumers repointed, every dead branch deleted. `command-bar.tsx:487 case 'call-sheet'` is a surface-key switch; `registry.tsx:236/:471` and `ticket-derivation.ts:80,740` are the overlay key. Leftovers: four dead `useFeatureFlag` imports, one live test mock (11 `mockCallSheetFlag` assignments), two flag-shaped parameters in `lib/document`. |
| dist rebuilt after edits | **PASS, verified by content, not only mtime.** `@patina/types` is the only dist-bearing package in the diff. `dist/field-config.js` 2026-09-12 23:00:19 > `src/field-config.ts` 22:48:54; `dist/studio-config.js` 21:27:48 > `src/studio-config.ts` 20:57:22. A fresh `tsc -p tsconfig.json --outDir <tmp>` produced files **byte-identical** to both shipped `dist` files (`diff -q` clean). The r6 fix commit `4aadffce4` touched no file under `packages/types`. |
| Analytics only via `people-events.ts` | **PASS.** The only `posthog` reference under `components/document/people`, `components/document/roster` and `lib/analytics/people-events.ts` is `people-events.ts:20-25`, behind `isAnalyticsEnabled()`. No inline `posthog.capture`. (Docblock drift, CR6-28.) |
| Document grammar — `box-shadow` = 0 | **PASS.** Sweeping every file in `git diff origin/main --name-only`: `globals.css:360` and `:1942` (both pre-existing, outside this diff's single 29-line hunk at `:2001`) and one docblock sentence in `state-word.tsx:13`. No `boxShadow` in any TSX. `StateWord` paints border + text on `background: 'transparent'` (SPEC §8 #10). |
| **Every CSS custom property used is defined in the designer portal's `globals.css`** | **PASS for W2's own tokens — CR6-1 FIXED.** 95 distinct `var(--…)` tokens are spent by the changed `.ts`/`.tsx`/`.css` files; 167 are defined in `apps/designer-portal/src/app/globals.css`. `var(--hairline)` → **0 hits** (was 14); `var(--hairline-strong)` → 34, and it is defined on bare `:root` at `globals.css:1994`. The only undefined token still spent in a People/roster surface is `--color-linen` (CR6-30, all three sites pre-existing). Every other name the sweep flags is a runtime-set or Tailwind-supplied property (`--font-heading`, `--radix-collapsible-content-height`, `--stagger-index`, `--doc-quiet-reserve`, `--ink-x/--ink-y`, `--i`, `--x`, `--wash*`), none of them in a People/roster file. |
| Every string on a face is SPEC vocabulary | **PASS on the schema-word sweep; three vocabulary findings (CR7-6, CR7-7, CR7-8).** `grep -oE "'(client_rep\|party_kind\|sms_consent_status\|studio_contact_id\|project_parties\|not_on_file\|lapses_soon\|opted_out\|field_link\|on_paper)'"` over the People/roster TSX returns nine hits, **every one a comparison or a prop value, none rendered text**. The word "Remove" appears nowhere in either surface tree (SPEC §5.4 #14). CR6-2's kind-only branch is fixed (`companyKindShortLabel`, `company-card.tsx:138`). |
| aria: no `disabled` attribute | **PASS on every act this wave authored**, with four carried exceptions. `DocumentAction` emits `disabled={unavailable && !held}` (`document-action.tsx:309`), so each `disabled={…}` paired with an identical `held={…}` lands as `aria-disabled="true"` and stays focusable. Exceptions: `add-person-sheet:1501` (`<option disabled>`, CR6-29), `party-mini-row:370` (a raw `<button disabled>` with `disabled:opacity-50`, CR6-19), `rolodex-picker:423,593` / `roster-row:640` / `notice-log:138` while a mutation is pending (CR6-23). |
| `aria-expanded` pairs with a real id | **PASS.** Every `aria-controls` in the People/roster surfaces resolves to a rendered `id`; every panel is rendered unconditionally with `hidden`, so the target exists while collapsed (`person-row:217-221`, `roster-row:402`, `notice-log:69`, `access-grant-list:416`, `reach-access:389/:454/:839/:934`, `company-card:648/:853/:967`, `site-access-card:412/:577`, `add-person-sheet:1483`). Two `aria-describedby` still dangle when the act becomes available (CR6-20), one id is rendered that nothing points at, plus two hardcoded ids (CR6-26). |
| No `<a>` inside `<button>` | **PASS.** Every `TelLink` is an `<a>` and is always a sibling, never a descendant, of the row's own control: `person-row.tsx:201`, `roster-row.tsx:364`, `contact-rule-line.tsx:118` (inside a `<p>`, outside the row button), `site-access-card.tsx:365,553`, `reach-access.tsx:356`. `party-mini-row` renders a `<button>` whose words are `<span>`s and takes no anchor. The company card's crew line puts `ContactRuleLine` after the `<p>` that holds the name button, not inside it. |
| One live region | **PARTIAL** (carried, CR6-21). `people-room.tsx:559-564` is the Room's announcer (the only one carrying an explicit `aria-live="polite"`); seven other `role="status"` — which carries an implicit polite live region — survive in the room's own surfaces. |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage` / `ConsentWord`. `coordination/party.ts:105` imports `PartyKind` from `@patina/types`. `use-coordination.ts:51` is an explicit re-export alias. |
| No ad-hoc fetch | **PASS.** One `fetch` in the whole changed set: `compliance-chase.ts:47` → the same-origin route `/api/people/chase-renewal`, which proves studio membership through the caller's own RLS read (`route.ts:57-70`) before enqueuing with the service role. Every other match is `refetch()`. No NestJS call outside `@patina/api-routes`. |
| Playwright shape | **PASS (not run — no port taken).** Six specs under `e2e/people/`, every one chromium-pinned by `test.skip(({ browserName }) => browserName !== 'chromium')`; `call-sheet.spec.ts` uses `expect.poll` over the admin client for the `told_refs` assertion; no `networkidle` or `waitForTimeout` in the new specs. |

---

## 2. Round 6, re-checked at HEAD

### The five assigned findings — all **FIXED**

| Finding | Verdict | Evidence at HEAD |
|---|---|---|
| **QA-R6-1** (BLOCKING, the picker's forbidden paper word) | **FIXED** | `roster/party-mini-row.tsx:351` — `{paper && partyKindOwesPaper(kind) && <StateWord family="paper" …/>}`. The two seeded firms QA reproduced (`Great Northern Bank` = `lender`, `City of Minneapolis, CPED Inspections` = `authority`) both fall in `PARTY_KINDS_OWING_NO_PAPER`. Regression case present in `rolodex-picker.test.tsx`. |
| **QA-R6-2** (MAJOR, raw E.164 on the routed line) | **FIXED** | `people/contact-rule-line.tsx:118-122` — `<TelLink phone={routeTo.officePhone} label={telDisplay(routeTo.officePhone)} personName={routeTo.name} />`. |
| **CR6-1** (MAJOR, `var(--hairline)` undefined) | **FIXED** | `grep -rn "var(--hairline)" apps/designer-portal/src` → **0**; `var(--hairline-strong)` → **34**; the token is defined on bare `:root` at `globals.css:1994` (`#D8CCB8`). All fourteen W2 sites moved. |
| **CR6-2** (MAJOR, raw `company_kind` on the card) | **FIXED for the branch the finding evidenced** | `company-card.tsx:138` — `else if (kind) parts.push(companyKindShortLabel(kind))`. The **trade** branch (`:131`) still concatenates the raw column and is carried as **CR7-8** below, exactly as the r6 fix log flagged and owed a ruling. |
| **CR6-3** (MAJOR, "The way in" free-text label) | **FIXED** | `site-access-card.tsx:508-523` — `label="Lockbox version"`, `empty="No lockbox version on file."`, region head `The way in` unchanged. The optional digits-refusal was not implemented (the finding marked it optional). |

### The thirty-three unassigned r6 minors — **every one still OPEN**

Re-read at HEAD and each confirmed present. Carried below as CR7-12 … CR7-44
with re-verified line numbers; the r6 id is named on each so the two rounds can
be reconciled.

---

## 3. Findings

### CR7-1 · BLOCKING · high confidence — the People Room's head count is `display:none` at 390, so SPEC §5.1 #1's head fact does not print on a phone, and the only count reachable there is the raw row count

`apps/designer-portal/src/components/document/rooms/room-shell.tsx:152-155`

```tsx
<h1 className="m-0 font-mono …">{title}</h1>
{count && (
  <span className="hidden font-mono text-[12px] … sm:inline">
    · {count}
  </span>
)}
```

`hidden … sm:inline` is Tailwind's default `sm` breakpoint, **640px** — the
designer portal's `tailwind.config.ts` defines no `screens` override, so the
default stands. At 390 the span computes to `display:none`.

**Evidence from round 6's own capture.** `build/qa-w2-r6/live-390-directory.html`:

```html
<span class="hidden font-mono text-[12px] tracking-[0.04em] text-[var(--color-aged-oak)] opacity-70 sm:inline">· 41 people · 21 firms</span>
```

The string is in the DOM (which is why a saved-HTML grep finds it at both
widths) and painted at neither 390 nor anything under 640.

**Why it is blocking.** SPEC §5.1 #1 fixes the head as the `<h1>` "The People
Room" **and, beside it**, "29 people · 22 firms". SPEC §3's preamble is
"Both widths must show identical facts", and SPEC §6.2 enumerates the 390
adaptations — the row, the cards, the site access target, the Call Sheet, the
Add sheet — and does not name the head. Direction §3.1's Room head row is
"THE PEOPLE ROOM · 29 people · 22 firms", and PR-g's ruling is that "the head
names both nouns". That count is also the single number the whole
`people_directory` v4 rebuild exists to make honest (rulings §6 ships it at 100%
with no flag, and QA-R2-9 was spent making it count cards rather than rows). It
does not print at the width a studio reads on a job site.

**And what stands in for it there is wrong.** Below 1180px the desktop rail is
hidden and `PeopleCompactSelector` takes over (`view-shell.tsx:282`); its
Directory badge is `directoryCount={all?.length}` (`people-room.tsx:503`,
`:519`) — the RAW `people_directory` row count, **63** on the local seed against
the head's 41 + 21 = 62, because the raw count keeps the company-only
engagement `directoryIdentityRows` deliberately drops (QA-R2-9) — and it sits
inside a nav panel that is `hidden` until the selector is opened. So at 390 the
studio sees no count at all, and the one it can reach by opening the selector
is the number the head was rewritten to stop printing. (That half is carried
separately as CR7-5, since it is wrong at every width.)

**Fix:** print the People Room's count at every width. `RoomShell` is shared by
nine rooms, so scope it rather than dropping `hidden` globally — either give
`RoomShell` an opt-in (`countAtEveryWidth`) that the People Room passes, or
render `directoryHeadLine(...)` under the h1 inside the room's own body at
narrow widths. Do not fix it by pointing the compact selector at the head count:
that control is a view chooser, not the room's head.

---

### CR7-2 · MAJOR · high confidence (escalated from r6's CR6-9 with DB evidence) — the company card lists its crew's PERSONAL field links, prints the reach word "Field link" on a card SPEC §5.3 #9 bars it from, and offers a live Revoke on a person's own door

`apps/designer-portal/src/components/document/people/company-card.tsx:342-345, 724`

```tsx
const firmSeatIds = useMemo(
  () => [...seatsByPerson.values()].flat().map((seat) => seat.seat_id),
  [seatsByPerson],
);
…
<ReachAccess cardId={card.id} cardKind="company" …
  grantSubjectIds={firmSeatIds}
```

`v_access_grants.subject_id` for a `field_link` is the **engagement**, so
handing it every seat id of every crew member makes the FIRM's card render the
crew's personal doors. `AccessGrantList` → `grantRowParts`
(`access-grant-list.tsx:322-331`) prints
`ACCESS_GRANT_TIER_LABELS['field_link']` = **"Field link"**, and `GrantRow`
renders a live **Revoke** disclosure beside it (`:403-459`), because
`isAccessGrantRevokable('field_link')` is true.

**Two rules broken at once.**
- SPEC §5.3 #9: *"No consent word and no reach word anywhere on the company
  card. A firm has neither."* "Field link" is one of the three reach words
  (direction §3.8's Reach family: Account · Field link · On paper). The consent
  half IS correctly withheld (`showConsent={isPerson}`, `reach-access.tsx:815`);
  the reach half is not.
- Direction §5.1's company variant: *"Access grants lists **firm-scoped tokens
  only**."*

**It renders on the seed, on the card SPEC §5.3 fixes.** From the live local
database, read as `designer@patina.dev` under RLS:

```
 tier       | display_name  | company_name
------------+---------------+----------------------
 field_link | Erin Sato     | Marrow & Sons
 field_link | Luis Ochoa    | Marrow & Sons
 field_link | Dana Kowalski | Northgate Electric      ← §5.3's own card
 field_link | Pete Rusk     | Rusk Mechanical
 field_link | Joe Wozniak   | Cedar & Iron Framing
 field_link | Erin Sato     | Marrow & Sons  (Lindqvist seat)
```

So opening **Northgate Electric** — the card SPEC §5.3 #1 fixes as "Electrical
sub · 1 person · 2 projects · warranty through 21 Nov 2026" — prints, under
"Access grants": `Field link · the Call Sheet and the site access card ·
minted … · used …`, with `Ends with the job, …` beneath it and a **Revoke**
act. Marrow & Sons prints three. A studio closing Dana's door from her firm's
card is closing a door that belongs to her seat on one job.

I grade this **major** rather than minor (r6's reading) because the evidence is
no longer hypothetical: the rows exist in the shipped seed, and the string is
one SPEC names by exclusion on that exact surface.

**Fix:** the company variant should read firm-scoped tiers only. Either pass no
`grantSubjectIds` for `cardKind === 'company'` and print "No door is opened onto
a firm." in the region, or filter the read to the tiers whose subject IS a firm
(`rfq_link`, `agreement_link`, `plan_link` where they key on a company) and
withhold every engagement-keyed one. Whichever way, the Revoke act must not
reach a person's own door from a firm's card.

---

### CR7-3 · MAJOR · medium confidence — the person card mints the door, records the consent and sends the text against an ARBITRARY one of the person's live seats, chosen by an unordered query

`apps/designer-portal/src/components/document/people/views/person-profile.tsx:205-208, 278, 345-349, 375`

```ts
const liveSeats = useMemo(
  () => (seats ?? []).filter((s) => !DONE_STAGES.has(String(s.stage))),
  [seats],
);
…
const firstSeat = liveSeats[0] ?? null;
…
  seatId={firstSeat?.seat_id ?? null}
  seatProjectId={firstSeat?.project_id ?? null}
  seatProjectName={firstSeat?.project_name ?? null}
  seatWindowEnd={firstSeat?.on_site_to ?? null}
  seatWindowStart={firstSeat?.on_site_from ?? null}
…
  onClick={() => { if (firstSeat && onOpenSeat) onOpenSeat(firstSeat); }}   // Send a text
```

`usePeopleSeats` (`packages/supabase/src/hooks/use-people.ts:307-326`) issues
`supabase.from('people_directory_seats').select('*').eq('person_id', …)` with
**no `.order()`**. PostgREST returns whatever order Postgres gives, which is not
stable across plans or across a vacuum. So `liveSeats[0]` — and with it the
subject of three different acts — is arbitrary:

- **Mint access** calls `createLink.mutate({ partyId: seatId, projectId:
  seatProjectId, expiresAt })` (`reach-access.tsx:693-700`), so the door is
  minted on an arbitrary job and expires with that job's window.
- **Record consent** passes `originProjectId={seatProjectId}` into
  `record_channel_consent` (`reach-access.tsx:319`, `:334`), so the record's
  `origin_project_id` — the job direction §5.2 says the consent "came from" and
  the clause R-Q prints everywhere ("…on the Lindqvist kitchen.") — is stamped
  with an arbitrary job.
- **Send a text** opens an arbitrary seat's sheet.

Nothing on the card names which seat any of the three chose. The consequence
sentence (`mintConsequenceSentence`) names a DATE, which is self-consistent
with the seat picked, but not the job — so the face cannot be read to tell.
Direction §3.2 R4 gives every seat its own line with its own acts; Reach &
access is card-level and has no seat chooser at all.

**Latent on today's seed, not in the shape of the work.** Every multi-seat
identity in the Okonkwo seed holds one `active`/`awarded` seat and one
`warranty` seat, and `warranty` is in `DONE_STAGES` (`person-profile.tsx:81-87`),
so `liveSeats.length === 1` for all of them today:

```
 display_name     | project_name      | stage
------------------+-------------------+----------
 Dana Kowalski    | Lindqvist kitchen | warranty
 Dana Kowalski    | Okonkwo residence | active
 Pete Rusk        | Lindqvist kitchen | warranty
 Pete Rusk        | Okonkwo residence | awarded
 Erin Sato        | Lindqvist kitchen | warranty
 Erin Sato        | Okonkwo residence | active
 Ingrid Halvorsen | Lindqvist kitchen | warranty
 Ingrid Halvorsen | Okonkwo residence | awarded
 Claire Bissett   | Lindqvist kitchen | warranty
 Claire Bissett   | Okonkwo residence | active
```

A sub on two live jobs for one studio is the ordinary case the moment a second
project runs — which is the premise of Leah task 5 ("Bring Dana, Pete, Ingrid
and the Stonehaven rep onto Okonkwo": all four already hold a Lindqvist seat).

**Fix:** two parts. (1) Give `usePeopleSeats` a deterministic order (`.order('on_site_from', { nullsFirst: false })` then `seat_id`) so the same card reads the same way twice. (2) Name the seat on the face: either let the studio pick which seat a door is minted on / a consent is recorded against when `liveSeats.length > 1`, or print the job in the mint consequence sentence and in the Record-consent band ("…on the Okonkwo residence"). A write that picks its own subject silently is the one shape this program has been removing everywhere else.

---

### CR7-4 · MINOR · medium confidence — three controls on the site access card share the accessible name "Edit"

`site-access-card.tsx:164-175` — `EditableLine`'s collapsed state renders a
tertiary act whose only text is `Edit`, and the card mounts three of them: "The
way in" (`:514`), "Hours" (`:634`) and "Receiving" (`:648`). Read by ear, the
card offers three identical "Edit" buttons with nothing distinguishing them;
`actionKey` (`edit-site-access-way-in` etc.) is analytics, not an accessible
name. Direction §3.7 names an Edit act per region, so three controls is right —
three identical names is not.

**Fix:** `aria-label={`Edit ${label.toLowerCase()}`}` on the collapsed act
(`label` is already in scope, and the SAVE act's row already composes exactly
that string at `:131`).

---

### CR7-5 · MINOR · high confidence — the rail's Directory badge counts raw directory rows, disagreeing with the head it sits beside

`people-room.tsx:503` and `:519` pass `directoryCount={all?.length}` to
`PeopleCompactSelector` / `PeopleDesktopRail`; `view-shell.tsx:134-137` prints
it. `all` is the unfiltered `usePeopleDirectory({role:'all'})` read — firms
included, and the company-only engagement `directoryIdentityRows` drops
(QA-R2-9) included. The head three lines away prints
`directoryHeadLine(directoryEntryCounts(directoryIdentityRows(all)))`
(`:476`), which is the honest number.

On the live seed the rail reads **63** while the head reads **41 people · 21
firms** (62 entries) — one apart, and the difference is exactly the Rivera
Finishes company-only seat the head was rewritten to stop counting.

**Fix:** pass the identity count (`directoryEntryCounts(directoryIdentityRows(all)).people + .firms`, or just `.people`, whichever the badge means) rather than `all.length`.

---

### CR7-6 · MINOR · medium confidence — the studio's own people and the homeowner clients print paper word "Not on file" on their Directory rows

`entryOwesPaperWord` (`people-derivation.ts:1079-1081`) reduces through
`partyKindOwesPaper`, whose exemption list is exactly three kinds
(`packages/types/src/field-config.ts:296-302`): `inspector`, `lender`,
`authority`. Everything else owes paper. From the live view:

```
 display_name     | contact_kind | paper_state
------------------+--------------+-------------
 Leah Hartwell    | studio       | not_on_file
 Priya Natarajan  | studio       | not_on_file
 Dale Whitcomb    | studio       | not_on_file
 Adaeze Okonkwo   | client       | not_on_file
 Chidi Okonkwo    | client       | not_on_file
```

So the studio's own principal, lead designer and bookkeeper, and the two
homeowners the job is for, each carry a terracotta-adjacent `NOT ON FILE` in
the paper column of the studio's own ledger. C13/C24/R-A's reasoning — *"a word
that reads 'Not on file' implies an obligation that was never the studio's to
collect"* — applies verbatim to a designer on the studio's payroll and to the
client. SPEC §5.1 #7 does say a person row carries three word columns, and
§5.1 #5 lists Adaeze and Chidi among the rows, so this is a ruling rather than
an outright defect; recorded because it is the same class R-A settled for two
kinds and left open for two more.

**Fix (needs a ruling):** either add `studio`, `team`, `client` and `lead` to
`PARTY_KINDS_OWING_NO_PAPER`, or amend SPEC §5.1 to say a client and a studio
member print a paper word.

---

### CR7-7 · MINOR · low confidence — the household-member door says "a household member" and the sheet that receives it says "Client Rep"

The Add sheet's kind switch offers **"a household member"**
(`add-person-sheet.tsx:154`), writes `party_kind: 'client_rep'`
(`:135`), and the Call Sheet's Client-side row prints
`labels.kindLabel(seat.party_kind)` → `PARTY_KIND_LABELS.client_rep` =
**"Client Rep"** (`packages/types/src/field-config.ts:206`, rendered through
`callSheetRowFromSeat`'s `meta` at `roster-derivation.ts:631` and
`roster-row.tsx:306`). The person card's Past-seats line prints the same word
(`person-profile.tsx:426`).

C5's rule ("the string `client_rep` never appears on a face") is kept — the
token itself is nowhere. But "Client Rep" is title case with an abbreviation,
against SPEC §8 #3's "plain, present-tense, sentence-case English, the studio's
words", and it is a second word for the thing the studio's own door called a
household member. `PARTY_KIND_LABELS` is pre-existing; what is new is that W2's
household door is now the way that kind gets written.

**Fix:** `client_rep: 'Household member'` in `PARTY_KIND_LABELS`, or a
People-room-local label map for the two kinds the Client-side band prints.

---

### CR7-8 · MINOR · high confidence (the open half of CR6-2, flagged by the r6 fix log and owed a ruling) — the company card's trade branch still concatenates the raw `company_kind`, so a firm reads two ways two clicks apart

`company-card.tsx:131`

```ts
if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`);
else if (kind) parts.push(companyKindShortLabel(kind));   // CR6-2's fix
```

Ten of twenty-one seeded firms carry a trade and fall into the first branch:

```
 Halvorsen Cabinet Works  | workroom | {cabinetry}   → card: "Cabinetry workroom"
 Stonehaven Tile Gallery  | showroom | {tile}        → card: "Tile showroom"
 Waterline Supply         | supplier | {plumbing}    → card: "Plumbing supplier"
 (+ seven `sub` firms → "Electrical sub", "HVAC sub", …)
```

None of these is a schema-shaped token on the face, which is why this is minor
and not the blocking half — but the Directory firm ROW that opens the card
prints `companyKindShortLabel` (`firmIdentityLine`, `people-derivation.ts:1068`)
and reads **"Workroom · 1 on the crew · 2 open jobs"** where the card reads
**"Cabinetry workroom · 1 person · 2 projects"**. That is exactly the
one-firm-two-words defect CR6-2 named, surviving in the branch its fix left
alone.

The r6 fix log states the constraint honestly: `companyKindShortLabel('sub')`
returns "Subcontractor", so applying it here would print "Electrical
Subcontractor" and break `SPEC §5.3 #1`'s literal ("Electrical sub · 1 person ·
2 projects · warranty through 21 Nov 2026") and
`company-card.test.tsx:187`'s pin on it.

**Fix (needs the ruling the fix log asked for):** add a running-prose case to
the company vocabulary (`sub: 'sub'`, `workroom: 'workroom'`, …) so both
positions spend one map, or amend SPEC §5.3 #1. Not a code fix this round may
make alone.

---

### CR7-9 · MINOR · low confidence — Reach & access's three sub-heads are `<h3>`s at the same level as the region head that contains them

`person-profile.tsx:334-336` renders `<h3>Reach &amp; access</h3>`, then mounts
`ReachAccess`, which renders `<h3>Channels</h3>` (`reach-access.tsx:794`),
`<h3>Contact rule</h3>` (`:911`) and `<h3>Access grants</h3>` (`:1000`). The
company card does the same (`company-card.tsx:709`). SPEC §5.2 #2 calls these
three "sub-heads" of the region; by ear they read as four peers. SPEC §7 #11's
heading order is not violated (no level is skipped), which is why this is low
confidence.

**Fix:** `<h4>` for the three sub-heads, or hand `ReachAccess` a heading-level
prop.

---

### CR7-10 · MINOR · medium confidence — two reducers decide one paper fact, and they do not agree on supersession

The Directory firm row and the seat line print `compliance_state()` /
`identity_paper_state()` — server functions that, per **R-BF**, reckon
supersession **transitively** ("a document leaves the count while any reachable
successor along `superseded_by` is in force"). The company card's table decides
each row's word in the browser with `documentPaperState`
(`compliance-table.tsx:51-62`) over a document set that
`useComplianceDocuments` filtered with a flat `.is('superseded_by', null)`
(`use-studio-contacts.ts:1418`).

So a paper superseded by a successor that is itself lapsed is COUNTED by
`compliance_state` (the successor is not in force) and HIDDEN by the table, and
the held clause the card prints (`paperHeldClause`, which reads the same
filtered list) is computed from a different population than the word the row
that opened the card printed. On today's seed the successor would itself show
`Lapsed` in the table, so the visible divergence is small; the two reducers are
still two.

CR6-32's UTC boundary in `documentPaperState` is the same function's second
defect and is carried below.

**Fix:** have the card read `compliance_state(holder)` for the rolled word (it
already calls `useComplianceState`) and stop deriving a competing roll-up from
the filtered list, or pass `includeSuperseded` and apply R-BF's walk client-side.

---

### CR7-11 · MINOR · high confidence — `w2b-report.md` §2 quotes an Add-sheet string the code does not ship

The report's strings table lists `"<name> is invited, not consenting, until they
reply YES."`; the shipped line is
`{partyName.trim() || "They"} is invited, not consenting. Patina has not sent
them anything yet.` (`add-person-sheet.tsx:1637-1640`). The code's wording is
the CORRECT one — CR-4/CR3-1 changed it deliberately because R-AS retired the
seat-side dispatch and nothing is sent — and it is a documented deviation from
SPEC §5.5 #15. The report was not brought along, so a reader reconciling SPEC
§5.5 #15 against the wave report finds two strings and neither is on the face.

**Fix:** one line in `w2b-report.md` §2.

---

### CR7-12 … CR7-44 — the thirty-three r6 minors, all still open

Each re-read at HEAD `4aadffce4`. The r6 id is in brackets; line numbers are
re-verified here.

| id | r6 id | Confidence | Finding, at this HEAD |
|---|---|---|---|
| CR7-12 | CR6-4 | high | `person-row.tsx:230-234` still prints R-V's project-scoped sentence "No open seat on this project." in the cross-project Directory, and still prints it on **every** expand while `usePeopleSeats` round-trips (the query is `enabled:false` until the toggle, `:87-89`), directly under a disclosure reading "N seats" (`:213`). |
| CR7-13 | CR6-5 | high | `person-row.tsx:52-55` exports `openPersonLabel`; `grep -rn openPersonLabel apps/designer-portal/src` returns that definition and nothing else. The rendered control (`:136`) carries the bare `display_name`, where SPEC §7 #6 describes "the person's name and role summary only". |
| CR7-14 | CR6-6 | high | `person-profile.tsx:500-502` — `Worked ${person.seat_count ?? 0} of the studio's ${(…) === 1 ? "projects" : "projects"}.` Same word on both ternary branches, and `seat_count` is `identity_seat_count()`, a seat count (R-BG), printed as a project count. Latent on the seed (no identity holds two seats on one project). |
| CR7-15 | CR6-7 | high | `company-card.tsx:923-939` gates `NO_JOBS_SENTENCE` on `crew.length`, while `CrewJobs` returns `null` for an empty seat array (`:191`). A firm with affiliations and no open seats renders the "Jobs" heading, an empty `<ul>` and the money-book line — a region that states nothing, against C32. |
| CR7-16 | CR6-8 | high | `add-person-sheet.tsx:446-450` still reads `isOrgAdmin` off `organizationId` (the book's studio) while the four `project_party_authority_studio_*` policies gate on `project_party_recorded_studio()`. `useProjectRecordedStudio` is now in the same file at `:483-485`; the fix is one identifier. |
| CR7-17 | CR6-10 | medium | `company-card.tsx:820` — `Remit to {card.remit_to ?? name}` asserts a payee the studio may never have written, on the one region direction §1 line 5 makes the card the sole writer of. Every other absent record in this build prints its own sentence. |
| CR7-18 | CR6-11 | high | `use-access-grants.ts:296-307` invalidates `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — not `partySmsKeys.links(partyId)`, which `useRevokeFieldLink` does (`use-party-sms.ts:205`). Two doors onto one token, two answers. |
| CR7-19 | CR6-12 | high | `party-profile-sheet.tsx:491` — `createLink.mutateAsync({ partyId })`, `projectId` omitted, so `useCreateFieldLink`'s `['project-roster', projectId]` leg is skipped. `seatProjectId` is in scope and IS passed to the revoke twenty-three lines later (`:514-518`). |
| CR7-20 | CR6-13 | high | `command-bar.test.tsx` still carries the `call-sheet` flag mock and **11** `mockCallSheetFlag` assignments; the file is byte-identical to `origin/main` and `command-bar.tsx` reads no such flag. |
| CR7-21 | CR6-14 | medium | `use-coordination.ts:936-946` asks `studio_compliance_documents WHERE holder_id = <the card>` while the face asks `row.paper` = `identity_paper_state(card, COALESCE(seat.company_id, card.company_id))` (R-BA/R-BJ). A seat whose only held paper is the firm's lapsed COI is refused by the face and permitted by the hook. An RLS-refused read returns `[]` rather than raising, so the guard reads "no paper held". |
| CR7-22 | CR6-15 | high | `use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538` — five card mutations invalidate `studioContactKeys.all` + `['people-directory']` and never `['people-directory-seats']`, though `people_directory_seats` carries `display_name`, `company_name`, `phone_e164`, `studio_contact_id`, `consent_status`, `reach_state`, `paper_state`, `contact_rule_summary`, `warranty_until`. |
| CR7-23 | CR6-16 | medium | `call-sheet.tsx:99` → `roster-groups.tsx:67` resolve the tenant with `useProjectConsentOrg` (`project_consent_org()`), which R-BD retires in favour of `project_tenant_org()`; on a studio-less project `peopleById` is empty, `contactRouteTarget` returns `null`, and SPEC §5.4 #12 / R-L's routed line prints "Write Rosa Delgado…" with no email and no `tel:`. `rolodex-picker.tsx:181-186`'s search scope is still a "which org holds the most cards" tally (the stamp is correctly gated). |
| CR7-24 | CR6-17 | high | Four dead `useFeatureFlag` imports survive the retirement, referenced nowhere in their own file: `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48`. Two flag-shaped parameters remain in `lib/document`: `lens-ladder-derivation.ts:636-644` (docblock still describes the flag as live; live branch at `:689`) and `shelves.ts:95-120` (`shelvesFor` has no production caller). `doc/[id]/page.tsx:2028` hard-codes `callSheetEnabled: true`. |
| CR7-25 | CR6-18 | high | `company-card.tsx:782-783` — `documentId: docs[0]?.id ?? null, documentLabel: docs[0] ? null : "a current certificate"`. The label is `null` exactly when a document exists and the route falls back to the same literal (`route.ts:83`), so every drafted chase reads "for a current certificate" and never names the paper. |
| CR7-26 | CR6-19 | medium | `party-mini-row.tsx:370, 372` — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`. Both the attribute (SPEC §7 #4, direction §5.5) and opacity-as-state (SPEC §8 #5) are named forbidden. Transient at the one call site that passes it (`rolodex-picker.tsx:423`). |
| CR7-27 | CR6-20 | high | Two `aria-describedby` dangle once the act becomes available: `roster-row.tsx:641` points at `${panelId}-send-held` unconditionally while the `<p id=…>` renders only `{!body.trim() && …}` (`:653-660`); `notice-log.tsx:139` points at `heldId` unconditionally while `<p id={heldId}>` renders only `{picked.length === 0 && …}` (`:155`). `roster-row.tsx:499` and `:543` already do it conditionally, in the same file. |
| CR7-28 | CR6-21 | medium | Eight live regions can coexist on one screen where SPEC §7 #3 asks for one: `people-room.tsx:561` (the Room's, the only explicit `aria-live`), plus `role="status"` (implicitly polite) at `directory-view.tsx:364`, `call-sheet.tsx:206`, `roster-row.tsx:666`, `project-team-roster.tsx`, `rolodex-picker.tsx:448`, `rolodex-seed-sheet.tsx:208`, `room-shell.tsx:171`. |
| CR7-29 | CR6-22 | medium | `site-access-card.tsx:248-255` — `storedLines()` is the round-trip shape for every write to `emergency_lines` and `.filter((line) => !!line?.name)`, so adding or removing one line silently drops any stored line carrying a phone and a role but no name. The add form refuses a nameless line; a seed or an import can write one, and the render hides them (`:231-233`), so the loss is invisible. |
| CR7-30 | CR6-23 | low | Three acts emit a real `disabled` while their mutation is in flight, because `DocumentAction` emits `disabled={unavailable && !held}` (`document-action.tsx:309`): `roster-row.tsx:639-640`, `notice-log.tsx:137-138`, `rolodex-picker.tsx:593` (`disabled` with no `held` at all). Transient, and `loading` is also set. |
| CR7-31 | CR6-24 | low | `seat-line.tsx:88-101` — `py-[6px]` around an 11px `.t-meta` span, roughly 28px tall, while every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the person card and the company card both mount it. |
| CR7-32 | CR6-25 | low | `roster-row.tsx:184` (`doc.expires_on < new Date().toISOString().slice(0,10)`) and `:264` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`) read the clock during render, against the room's own convention (`people-room.tsx:137`, `company-card.tsx:227`, `person-profile.tsx:146`, all `useMemo(() => new Date(), [])`). |
| CR7-33 | CR6-26 | high | `reach-access.tsx:1028` renders `<p id={mintBandId}>` and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1040`). `site-access-card.tsx:403` and `:571` hardcode `aria-controls="site-access-emergency-lines"` / `"site-access-key-holder"` where every other disclosure in this wave uses `useId()`; two site access cards on one document would collide. |
| CR7-34 | CR6-27 | medium | `use-studio-contacts.ts:445` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line. |
| CR7-35 | CR6-28 | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:11-12` and `:51-53` still give the pre-R-BL reading ("a rule that forbids a channel outright"); `contact-rule.ts:99-101` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid Halvorsen) therefore wear a rule the fixture marks `false`", which the shipped do-not-contact-or-route predicate makes false for both — the live divergence runs the other way (F-26 and F-27 are `block: true` in SPEC §3 and print no leading rule); `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` defines nine. |
| CR7-36 | CR6-29 | low | `add-person-sheet.tsx:1501` — `disabled` on an `<option>`. SPEC §7 #4's ban is written for the specimen files and an `<option>` has no `aria-disabled` equivalent; recorded as the one surviving literal `disabled` on an interactive element in the People surfaces. |
| CR7-37 | CR6-30 | medium | `--color-linen` is defined nowhere in `apps` or `packages` and is spent at `party-profile-sheet.tsx:908`, `add-person-sheet.tsx:1580` and `directory/letter-line-field.tsx:191`, always as `bg-[var(--color-linen)]/45`. All three lines exist on `origin/main`, so the tint has always resolved to nothing. |
| CR7-38 | CR6-31 | medium | `reach-access.tsx:97-110` keys `heldChannelReason` on `channel.status` alone, so a **phone** line marked `bounced` prints "This address bounced back… Texts and calls still reach them." beside a phone number. `isPhoneChannel(channel.channel_kind)` is called four lines away at `:353`. |
| CR7-39 | CR6-32 | low | `compliance-table.tsx:56-57` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`. West of UTC, `toISOString()` rolls to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening. Every other date helper in the room (`formatSeatDate`, `formatLongDate`, `rosterDateKey`) parses by parts for exactly this reason. |
| CR7-40 | CR6-33 | low | Two `authorityPhrase` implementations: `roster-derivation.ts:1024-1043` joins with `". "` and appends a final `"."`; `person-profile.tsx:90-100` returns each phrase bare and the caller joins with `" · "` (`:115`). The same grant reads "Selections." on the Call Sheet and "Selections" on the person card. R-Q's principle applies to authority as much as to consent. |
| CR7-41 | CR6-34 | low | `company-card.tsx:143-144` spells the warranty long — "warranty through 21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's own fold and every seat line use the short form. |
| CR7-42 | CR6-35 | low | `use-people.ts:269-274`'s in-memory search matches name, email and phone digits only, while its own `PeopleFilters.search` docblock (`:184-186`) and direction §3.1 also name firm and trade. The Directory uses `directoryEntryMatches` (`people-derivation.ts:1018-1039`), which does match firm, trade and the party-kind word, so the command bar finds fewer people than the room does for the same string. |
| CR7-43 | CR6-36 | low | Two dead ternaries with the same string on both branches: `person-profile.tsx:501` (`=== 1 ? "projects" : "projects"`) and `add-person-sheet.tsx:1648-1650` (`partyName.trim() ? "them" : "them"`). |
| CR7-44 | — | low | `notice-log.tsx:77-103` renders a list of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7 asks a chip row for a labelled group; a pick-who-was-told list is the same shape). |

---

## 4. What this review did not cover

The visual and behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002
— CR7-1 is a computed-style fact a walk would confirm in one line, and is
evidenced here from round 6's own saved 390 capture), the Playwright specs under
`e2e/people` (shape-checked, not run — no port taken), the iOS surfaces under
`apps/mobile/Capture`, the W1 migrations beyond the functions, policies and
triggers named above, the dev seed beyond the reads quoted, and the Sanity help
articles.
