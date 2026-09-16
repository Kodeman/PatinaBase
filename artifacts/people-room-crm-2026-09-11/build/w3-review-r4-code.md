# W3 (P2) — adversarial code review, round 4

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `b5af75f3e`. Scope: every changed file under `apps/designer-portal/src` and
`packages/supabase/src` across `3d65f81e4..HEAD` (43 files, +7190/−138), read in full,
plus the migrations the prior round's findings touched.

`git status` is clean on tracked paths (the only lines are sandbox `Operation not permitted`
reads of `.env.example` files — harness, not product).

**Verdict: NOT clean — 1 major, 10 minor. Zero blocking.**

---

## 1. Prior round re-checked

Every one of the eleven r3 findings is closed, verified in the code rather than from the log.

| r3 finding | State | Evidence |
|---|---|---|
| W3-R3-1 merge stranded the firm's paper | **fixed** | `00629:1125-1157` — step 1 moves EVERY absorbed head unconditionally (`WHERE d.holder_id = p_merged AND d.superseded_by IS NULL`), step 2 walks the retired rows outermost-first with a 16-deep cap, step 3 writes the edge last. The face follows: `compare-merge-sheet.tsx:103-104`. |
| W3-R3-2 `bid_quoted_by` checked against the CALLER's studio | **fixed** | `00631:161-193` — `v_recorded := project_recorded_studio(...)`, a NULL refusal with its own HINT, and `AND sc.organization_id = v_recorded` beside `= v_org`. |
| W3-R3-3 absorbed card's number resolved to no card | **fixed** | `00629:493-523` — candidates keep merged cards, map through `resolve_merged_contact()`, dedupe, re-read the heads, `HAVING count(*) = 1`. |
| W3-R3-4 identity consent word read `not_asked` over a recorded `opted_out` | **fixed** | `00629:976-984` channels upsert; `00626:1123` `identity_phone_numbers()`'s third leg over `mobile/office/dispatch/after_hours`. |
| W3-R3-5 lineage table forgeable | **fixed** | `00629:325` policy dropped, `:328` `GRANT SELECT … TO authenticated`; `seed/00-legacy-grants.sql:16409` regenerated. |
| QA-1 trade never resolved | **fixed** | `rolodex-picker.tsx:458-466` `tradeFor()`, three legs, used at all three call sites (`:542`, `:598`, `:789`). |
| QA-2 name at zero width at 390 | **fixed** | `party-mini-row.tsx:189-196, 236` — `min-w-[8rem] flex-1 sm:min-w-0`, `break-words sm:truncate`, `flex-wrap sm:flex-nowrap`. |
| QA-3 `openThePicker()` strict-mode collision | **fixed** | `e2e/people/bring-forward.spec.ts:107-109` waits on `[data-doc-sheet-title]`. |
| MAJOR-1 NULL firm on the single add | **fixed** | `rolodex-picker.tsx:542` `companyName: firmNameFor(contact)`. |
| MAJOR-2 unfindable household, minted per press | **fixed** | `household-band.tsx:188-200, 275-296` — `householdWouldBeFindable`, `aria-disabled` + `aria-describedby`, reason always on the face, press writes nothing. |
| MAJOR-3 raw refusal tokens on two faces | **fixed** | `write-error.ts:51-77` (eight new tokens); `household-band.tsx:219,238,261`; `roster-row.tsx` bid catch. |
| MAJOR-4 merge sentence promised reachability | **fixed** | `compare-merge-sheet.tsx:100-106` — "…'s own number and address travel with them" / "so an old link still opens this person". |

Nothing that was fixed regressed.

## 2. The brief's checklist

| Check | Answer |
|---|---|
| Travel list writes only the allowed facts | **PASS.** `use-coordination.ts:2529-2540` names `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id` and nothing else. No pricing, no notes, no `show_to_client`, no bid column. `TRAVELS`/`STAYS_BEHIND` (`travel-list-pane.tsx:20-34`) match SPEC §5.7 #5. |
| Consent never copied per seat | **PASS (R-AY holds).** A diff-wide grep of every added line for `sms_consent*`, `consent_status`, `opt_out_*`, `record_channel_consent` finds only reads and test fixtures — no write anywhere in W3's portal or hook code. |
| Merge survivor flip | **PASS.** `preferredSurvivorId` (older, id-tiebroken), two `aria-pressed` column heads, the pre-pick taken once (`compare-merge-sheet.tsx:142-151`) so a refetch cannot undo a flip. |
| A true consequence sentence | **PASS**, after W3-R3-1/-4 — every clause now matches what `merge_studio_contacts()` does, including the household repoint at `00629:1243-1252`. |
| PR-n gating | **PARTIAL** — see **m6**. The figure is held correctly; the member act is not. |
| "Close this seat" replaced every hard delete | **PASS.** One `.delete()` on `project_parties` exists in the whole data layer (`use-coordination.ts:992`), reached only from `roster-row.tsx:923-949` "Added by mistake", `held` behind `seatDeleteRefusal`, whose `hasBid` leg now reads the columns as well as the stage. `CloseSeatAct` is the person card's new door. The word "Remove" appears on no face. |
| Invalidations complete | **MOSTLY** — see **m4**. |
| aria rules | **PASS.** Every standing gate uses `held` + `aria-disabled` + a reason always on the face (`DocumentAction` renders `disabled={unavailable && !held}`, `document-action.tsx:308`). Native `disabled` survives only on form-incomplete/pending states, which is the shipped idiom. `role="checkbox"` + `aria-checked` for the multi-select row. |
| Document grammar | **PASS.** Zero `box-shadow` in any new file; `--ink*`, `--rail`, `--paper`, `--hairline-strong`, `--terracotta-ink` all defined (`globals.css:1972-2002`); `.t-body-sm` steps used. |
| SPEC vocabulary | **PASS** on the new faces — `MERGE_MATCHED_ON_LABELS`, `SEAT_BID_OUTCOME_ACTS/_LABELS`, `HOUSEHOLD_MEMBER_ROLE_LABELS`; `client_rep` never renders. |
| DocSheet for every sheet | **PASS.** `CompareMergeSheet` is its own `DocSheet`; the household band and the bid editor are inline regions, not sheets. |

## 3. Gates, run in this review

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | `tsc --noEmit`, **rc=0, no output** |
| `pnpm --filter @patina/designer-portal type-check` | `tsc --noEmit`, **rc=0, no output** |
| `pnpm --filter @patina/admin-portal build` | **rc=0**, full route table printed |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2868 tests, all passed** (7.3 s) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **25 passed** |

The local database is currently in a partial state — `project_parties` carries 00631's eight bid
columns and the full `project_parties_stage_check` vocabulary, while `studio_compliance_documents`
and `studio_channel_consent` do not exist and `projects` is empty. That is a concurrent reset by
another session, not a product fact; no runtime probe was attempted against it and nothing was
written to it. Column- and constraint-level checks below were taken from the one read that did
answer (`\d public.project_parties`) and otherwise from the migration files.

---

## 4. Findings

### MAJOR-1 — the picker prints the wrong refusal channel, and drops R-Q's job clause

`apps/designer-portal/src/lib/document/bring-forward.ts:149-162`, called at
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:773-780`.

```ts
const how = record.optOutSource === "inbound_stop" ? "by text" : "to the studio";
```

`inbound_stop` is not a consent source. `studio_channel_consent`'s own CHECK admits exactly
`verbal | written | web_form | inbound_sms | other` (`00594:210`, `:222`, `:259`), and the portal
type says the same (`use-consent.ts:35`). So the `"by text"` branch is **unreachable**, and a real
inbound STOP — whose `opt_out_source` is `inbound_sms` — falls to the `else`.

R-Q fixes one wording everywhere, and `consent-sentence.ts` is its one composer:
`REFUSAL_PHRASE.inbound_sms = "Opted out by text"` (`consent-sentence.ts:29`). W3 minted a second
composer beside it that disagrees with the first about the same record.

**Failure scenario.** F-12 Pete Rusk texted STOP on 3 Dec 2025 on the Lindqvist kitchen. Leah opens
Bring forward on a new job, and his mini row reads

> Opted out to the studio, 3 Dec 2025.

while the Directory row, the collapsed roster row (R-T) and his person card all read

> Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.

Two surfaces, one record, two different claims — and the picker's is wrong about HOW he refused,
which is the fact that decides whether a studio may ask him again. This is the wave's own headline
specimen, on the wave's own headline surface.

The project clause is the second half: the picker hardcodes `originProjectName: null`
(`rolodex-picker.tsx:778`) although the record carries `origin_project_id`
(`use-consent.ts:58`), so R-Q's `", on the <project>"` never prints at the pick.

**Why no test caught it:** `bring-forward.test.ts:146` and `:156` assert against invented tokens
(`"inbound_stop"`, `"studio_recorded"`) that the CHECK constraint forbids. Both tests pass
vacuously and pin the bug in place.

**Fix.** Delete `carriedConsentNotice` and call `consentSentence({ status: 'opted_out',
optOutSource: record.opt_out_source, optOutAt: record.opt_out_at, projectName })` — the ruled
composer — resolving the job name off `record.origin_project_id` (the picker already holds
`useProjects()`-shaped data one level up in the Call Sheet, or add the lookup). Rewrite both tests
against real `ConsentSource` values.

---

### m1 — `asBidError` maps a constraint name that does not exist

`packages/supabase/src/hooks/use-coordination.ts:2337`; test at
`packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts:217`.

The key is `project_parties_bid_valid_until_check`. The real constraint, confirmed on the live
table and at `00631:86-88`, is **`project_parties_bid_window_check`**. A repo-wide grep finds
`project_parties_bid_valid_until_check` in exactly two places: the sentence map and the test that
asserts on it.

**Failure scenario.** The studio types "the answer was owed 5 Oct" and "the number holds until
1 Oct". Postgres names `project_parties_bid_window_check`; `asBidError` misses; the raw string
reaches `writeErrorMessage`, whose schema-word guard (`violates`/`constraint`/`relation `) swallows
it to the fallback. The face says "Could not write the bid." instead of the sentence that was
written for exactly this case — "A number cannot stop holding before the day it was owed."

No schema word reaches the face, which is why this is minor rather than major.

**Fix.** Rename the key to `project_parties_bid_window_check` and re-point the test.

---

### m2 — clearing the bid outcome strands the stage and the off-job date

`packages/supabase/src/hooks/use-coordination.ts:2427-2443`.

```ts
if (patch.bidOutcome !== undefined) {
  dbPatch.bid_outcome = patch.bidOutcome ?? null;
  if (patch.bidOutcome) {                       // ← falsy '' / null skips the stage
    dbPatch.stage = SEAT_BID_OUTCOME_STAGE[patch.bidOutcome];
    if (patch.bidOutcome === 'withdrawn') dbPatch.off_job_at = today;
  }
}
```

`off_job_at` is written but never cleared, and the stage moves only on a truthy outcome.

**Failure scenario A.** A row is mis-marked "They withdrew" → `stage = off_job`, `off_job_at =
today`, and it drops into Done. The studio reopens the editor (MAJOR-7 made that reachable) and
picks "Nothing recorded yet". `bid_outcome` clears; the stage does not. The seat sits in Done with
no bid behind it, and no other surface in the portal edits `stage`.

**Failure scenario B.** The same row is corrected to "Selected" → `stage = awarded` with
`off_job_at` still set. Nothing prints it today (`rosterWindowClause` reads `offJobAt` only in the
`done` band, `roster-row.tsx:105-112`; the person card's "Closed <date>" is inside `pastSeats`,
which splits on stage) — so it is a latent wrong fact on the record rather than on a face.

**Fix.** Write the stage on every outcome change, mapping the cleared outcome back to `bidding`
(or to the row's pre-bid stage), and `dbPatch.off_job_at = null` whenever the new outcome is not
`withdrawn`.

---

### m3 — the expiry notice can never speak for paper held on a person card

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:342-351, 468-475`;
`apps/designer-portal/src/components/document/roster/roster-row.tsx:255-281`.

The picker fetches `useComplianceDocumentsFor(firmIds)` where `firmIds` is built from
`c.company_id` alone, then asks `noticedPaperClause([contact.company_id, contact.id], …)` — the
person's own id is in the holder set but never in the document set. The roster row is narrower
still: `[row.companyId]` against `useComplianceDocuments({ holderId: row.companyId })`.

Direction §3.2 R5 and R-BA both say a sole proprietor IS their own firm and their own documents are
the firm's — and 00629's sole-proprietor fold deliberately moves the certificates onto the PERSON
card (`00629:1160-1169`).

**Failure scenario.** A sole-proprietor sub whose COI lapsed and whose notice row the sweep wrote:
the mini row prints the paper word `Lapsed` (from `identity_paper_state`, which reduces over both)
with **no sentence beneath it**, and `bringForwardConsequence` omits the lapse entirely — so
SPEC §5.7 #7's third clause never appears for that population. An omission, not a wrong fact.

**Fix.** `firmIds` → `[...hits.flatMap(c => [c.company_id, c.id])]`; on the roster row, read the
seat's own card id beside `row.companyId`.

---

### m4 — two invalidation gaps around the household

`packages/supabase/src/hooks/use-studio-contacts.ts` (`useMergeStudioContacts` `onSuccess`);
`packages/supabase/src/hooks/use-coordination.ts` (`useBringForward` `onSuccess`).

`merge_studio_contacts()` rewrites `client_households.member_person_ids` and
`primary_member_person_id` (`00629:1243-1252`) — correctly, that was r1 M-3's fix — but the
mutation invalidates ten key roots and none of them is `client-households`. A Call Sheet open in
the same session keeps the pre-merge membership.

`useBringForward` can seat a `client_rep` (`DEFAULT_SCOPE_KINDS` includes it,
`rolodex-picker.tsx:110`), which changes `useProjectHousehold`'s `memberCardIds` and therefore
whether "Open a household" is held — and it does not invalidate
`["client-households", "project", projectId]` either.

**Fix.** Add `clientHouseholdKeys.all` to both. (`clientHouseholdKeys.all` is `["client-households"]`,
so React Query's prefix match covers the project key too.)

---

### m5 — the household's overlap fallback is an unordered `.limit(1)`

`packages/supabase/src/hooks/use-households.ts:308-313`.

```ts
.from("client_households").select("*").overlaps("member_person_ids", memberCardIds).limit(1)
```

No `.order()`, and no organization scope beyond RLS. A person card that belongs to two households
— a property manager, or a spouse the studio recorded under two client records — makes the answer
a plan detail. The band then prints *a* household's `co_threshold_cents` as "Change orders over
$X need a signature from the household." for this job, which is a money fact.

The pointer path (`designer_clients.household_id`) answers first when one resolves, so this only
bites the no-login population — which is the population PR-c exists for.

**Fix.** `.order("created_at", { ascending: true })` at minimum; better, order by overlap size, or
refuse in words when more than one household matches.

---

### m6 — "Add a household member" is not held for a plain member, and its sentence promises a grant that will be refused

`apps/designer-portal/src/components/document/roster/household-band.tsx:385-392`, `95-107`.

PR-n is enforced twice in the database — `client_households`' WITH CHECK on the figure, and
`add_household_member()`'s `household_grant_forbidden` on the whole act (`00632:395-399`). The band
holds the **figure** act correctly (`:359-362`, `aria-disabled` + a reason always on the face) but
leaves the **member** act ungated, and `householdMemberConsequence` tells the same non-principal:

> Chidi Okonkwo joins the household and takes a seat on the Okonkwo residence. **They may sign
> money to $2,500.** Nothing is sent to them.

On a household carrying a figure with `role = 'client_rep'`, that act cannot succeed for them. The
refusal does arrive as a sentence (`asHouseholdError` → `writeErrorMessage` passes it through
untouched — verified: the sentence matches none of the schema-word patterns), so nothing is
written and no token leaks. But two acts an inch apart disagree about the same rule.

**Fix.** Mirror the figure act: `held={!isPrincipal && household.co_threshold_cents != null &&
role === 'client_rep'}` with the existing `household-figure-held` reason, and drop the grant clause
from the consequence sentence in that branch.

---

### m7 — the estimator and household rolodexes are read from `project_consent_org()`, the guards check `project_recorded_studio()`

`apps/designer-portal/src/components/document/roster/roster-groups.tsx:74, 120-131, 196-206`
(`consentOrg` originates at `call-sheet.tsx:109`, `useProjectConsentOrg`).

`project_consent_org()` is `COALESCE(p.studio_id, _primary_studio_for(p.designer_id))`
(`00594:1133`). `project_recorded_studio()` is `p.studio_id`, with no fallback
(`00624:342`) — and it is what `assert_party_bid_quoted_by()` and `assert_project_party_cards()`
check against.

On a job with `studio_id` set the two agree. On the studio-less legacy population R-BD/R-BI name,
`consentOrg` is non-NULL while the recorded studio is NULL, so `bidPeople` offers estimator cards
that the trigger refuses on every press with `party_bid_quoted_by_project_has_no_studio`. The
refusal is a sentence (`write-error.ts:66-68`), and leaving the estimator blank still saves — the
trigger early-returns on NULL (`00631:157-159`) — so this is an act offered that cannot land, not
a wrong fact.

**Fix.** Read `bidPeople` and the household band's `organizationId` from `useProjectRecordedStudio`
(the picker already does, `rolodex-picker.tsx:232`), and say so where it is NULL.

---

### m8 — `pickerHistoryLine` prints the seating year as if it were the job's year

`apps/designer-portal/src/lib/document/bring-forward.ts:59-65`.

```ts
const year = closed ? `closed ${closed}` : (history.lastAt ?? "").slice(0, 4) || null;
```

`lastAt` is the PARTY ROW's `created_at` — the day the studio seated them. On a job still open the
line reads

> Worked 1 prior project, Lindqvist kitchen, 2025.

where 2025 is when Dana was added, not anything about the job. SPEC §5.7 #4 asks for the year that
job closed. The bare numeral beside a job name reads as the job's date. Deliberate per the file's
own comment, so flagged as a wording risk rather than a defect.

**Fix.** Either drop the year when `completed_at` is absent, or label it ("seated 2025").

---

### m9 — `merge.spec.ts` carries a known-failing assertion, and neither spec was run

`apps/designer-portal/e2e/people/merge.spec.ts:175-179`.

The r3 fix log records `merge.spec.ts`'s failing assertion as "diagnosed in r3 QA as a test
self-contradiction — not in the handed-back list", and the wave's brief forbade an e2e run. So the
two Playwright specs W3 ships are both unexecuted and one is believed broken. `toHaveCount(0)` on
`[data-duplicate-band]` after the merge is the shape at risk: the seeded book carries direction
§3.1's own canonical duplicate pair, so the band survives the spec's own merge — and the assertion
may only pass by accident of `onMerged` navigating to the survivor's card.

Both specs are otherwise correctly shaped: chromium-pinned, `adminDb` from
`e2e/helpers/supabase-admin`, `expect.poll` with timeouts, `beforeAll`/`afterAll` teardown,
web-first `expect`.

**Fix.** Scope the count to the pair (`[data-compare-merge*="${olderId}"]`) rather than to the
band, and run both specs before the wave closes.

---

### m10 — `w3-room-report.md` quotes wording the code no longer prints

`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md` §4, §7.

- §7 quotes the clause as "Northgate Electric's insurance **lapses in 30 days**, on 6 October
  2026." M2R-1 removed the interval — `expiryNoticeClause` (`compliance-notice.ts:76-78`) now
  prints "lapses on 6 October 2026."  The report's §4 sample `data-bid-note` carries the same
  stale phrasing in `roster-row.tsx:270`'s doc comment.
- §4 says the editor is "Bidding band only"; MAJOR-7 widened it to
  `band === 'bidding' || hasBid` (`roster-row.tsx:666`).

A reader of the report gets two wrong facts about the shipped face. **Fix:** amend §4 and §7, and
the stale comment at `roster-row.tsx:270`.

---

## 5. Checked and clean

- **No cross-tenant read or write.** Every new list read is `.eq('organization_id', …)` or
  RLS-scoped; `client_households`' four policies gate on `is_active_studio_member` +
  `is_studio_comember` with the PR-n narrowing on the figure (`00632:223-267`).
- **No consent write outside `record_channel_consent`.** Verified by sweeping every added line.
- **No new hard delete.** One `.delete()` on `project_parties`, pre-existing and guarded.
- **No data loss on merge.** `merged_into` is a tombstone, `archived_at` untouched,
  `resolve_merged_contact()` maps forward, `studio_contact_merges` is append-only and
  SELECT-only to members, and the compliance, channel, designation, bid-estimator and household
  repoints are all present.
- **Hooks above early returns** in all five new components (`CloseSeatAct`, `ArchiveCardDoor`,
  `CompareMergeSheet`, `HouseholdBand`, `TravelListPane`) and in the two widened ones.
- **No stale-pair hazard in the merge sheet:** `DocSheet` is modal, so the duplicate band cannot
  be clicked while a pair is open, and `survivorId` resets on close.
- **The duplicate band can only pair rolodex cards** (`people-derivation.ts:1370`,
  `row.role !== "contact"` → skip), so the sheet never opens on a non-card id.
- **`merged_into` is filtered out of every list read** (`useStudioContacts`, `includeMerged`
  default false), so the picker, the estimator select and the household-member select cannot
  offer a folded card.
- **`phone`/`phone_e164`**: the bring-forward insert writes `phone`; `normalize_party_phone_e164`
  (00281) derives `phone_e164`, which is what `people_directory_seats.consent_status` keys on.
- **Every stage `useSetPartyBid` can write** (`declined`, `no_response`, `awarded`, `off_job`,
  `invited`, `bidding`) is in `project_parties_stage_check`, confirmed on the live table.
