# W3 (P2) — adversarial code review, round 12

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `c4b8f7abe`. Reviewed range `3d65f81e4..HEAD` over `apps/designer-portal/src`,
`apps/designer-portal/e2e` and `packages/supabase/src` — 47 files, +10125/−161 — read in full
alongside 00623, 00626, 00629, 00630, 00631, 00632 and `specimens/SPEC.md` §5.7.
Local Postgres only. No server started, no port taken, no prod touched, no migration minted.
One probe run against the local database, inside a transaction that was ROLLBACKed
(residue re-checked: 0 rows).

**Verdict: NOT clean — 0 blocking, 1 major, 11 minor.**

---

## 0. Gates, re-run this round (not taken on trust)

| Gate | Result this round | Report §9 says |
|---|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output | clean ✓ |
| `pnpm --filter designer-portal type-check` | rc=0, no output | clean ✓ |
| `pnpm --filter admin-portal build` | rc=0, full route table printed | exit 0 ✓ |
| `apps/designer-portal` `npx jest` (whole suite) | **593 suites, 7670 tests, 1 snapshot, all green** | 7656 (stale) |
| the nine W3 portal suites by file | 9 suites, **176 tests**, all green | — |
| `packages/supabase` `npx vitest run` | **105 files, 1337 passed / 12 skipped** | 1335 (stale) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **31 passed** | 29 (stale) |

Per-file, measured: `compare-merge-sheet` 16 · `close-seat-act` 6 · `archive-card-door` 8 ·
`household-band` 34 · `rolodex-picker` 37 · `roster-row` 45 · `travel-list-pane` 5 ·
`bring-forward` 15 · `compliance-notice` 10.

Every gate the brief names is green.

## 0b. Prior findings, re-checked

| Round / id | State |
|---|---|
| r11 BLOCKING-1 — merge sentence promised a reduction the RPC does not make | **fixed**. `mergeConsequenceSentence` (`compare-merge-sheet.tsx:132-136`) splits the clause; `carriedRows`' `keptTogether` map (`:199-203`) rides `data-compare-kept` on Trades / Specialties / Sole proprietor; the announcement at `:438-443` carries the same split. 00629:1771-1778 confirms the UNION/OR. Pinned in the spec |
| r11 MAJOR-1 — roster row read only the firm's holder id | **fixed**. `paperHolderIds` (`roster-row.tsx:273-279`) is `[companyId, personId]`, `useComplianceDocumentsFor` feeds `blocking` (`:296`), `held` (`:319`) and `lapsesSoonClause` (`:308-317`), and `paperHolderName` (`:283`) branches on the document's own holder |
| r11 QA MAJOR-1 — one seated pick cost the batch | **fixed**. `addPicked` (`rolodex-picker.tsx:679-698`) splits `seated` from `fresh`, sends only `fresh`, prints both sentences; pinned |
| r11 migrations MAJOR-1 / MAJOR-2 | **fixed** in 00629:1750-1754 and the twelfth refusal (`MERGE_REFUSAL_SENTENCES.merge_seat_on_studioless_project`, `asMergeError`'s `details` branch) |
| r11 m1, m2, m3, m4, m5, m6, m8, m9 | **all still open**, deliberately (fix log r11: "every minor from all three reviews was left standing"). Re-verified below as m1–m8 |
| r11 m7 | **closed** (the batch split above) |
| r10 and earlier blockings/majors | re-read in the shipped files; all still closed |

---

## MAJOR-1 — the browser's retirement reducer lost the `doc_type` leg W3 round 8 added to `compliance_state()`, so a lapsed gating certificate the database still counts is dropped from every list the portal prints

**Where.** `packages/supabase/src/hooks/use-studio-contacts.ts:1569-1600`
(`retainedComplianceDocuments`), against `supabase/migrations/00623_studio_compliance_documents.sql:670-680`
(`compliance_state()`'s `retired` CTE, re-issued by this wave's own commit `c0149d3a4`).

W3 round 8 B-1 moved the third supersede leg into the reader:

```sql
-- 00623:670-680, added this wave
retired AS (
  SELECT DISTINCT c.root FROM chain c JOIN studio_compliance_documents s ON s.id = c.succ
   WHERE (s.expires_on IS NULL OR s.expires_on >= CURRENT_DATE)
     AND c.root_blocks <@ s.blocks
     AND s.doc_type = c.root_doc_type)        -- ← the leg
```

The TypeScript twin, whose own doc-comment says it exists to be "THE RETIREMENT RULE
`compliance_state()` USES, IN THE ONE PLACE THE BROWSER FILTERS" (`:1552-1568`), still asks
only two of the three:

```ts
// use-studio-contacts.ts:1576-1597
const carriesGates = (root, successor) =>
  (root.blocks ?? []).every((gate) => (successor.blocks ?? []).includes(gate));
…
if (inForce(successor) && carriesGates(root, successor)) return true;   // no doc_type test
```

**Failure, concretely — and measured.** 00623:630-648 names the reachable act itself: the
supersede trigger judges a row against its own successor and never against the rows pointing at
it, so *editing the successor's `doc_type`* is judged by nothing, and
`studio_compliance_documents_member_update` lets any active studio member do it in one PATCH.
Probed on the local database in a rolled-back transaction
(`build/probe-w3-r12-doctype.sql`, a firm card with a lapsed gating `coi_gl` and its honest
in-force renewal):

```
A. before supersede:                 lapsed
B. after honest supersede:           current
C. successor retyped w9 -> SQL word: lapsed        ← the r8 fix, working
D. root still has superseded_by=true, successor in force=true, successor blocks superset=true
```

Row D is exactly the three facts `retainedComplianceDocuments` reads, and all three are true —
so the browser retires the lapsed certificate the database is still counting. On one screen:

- **the company card** prints paper word `Lapsed` (`useComplianceState` → `compliance_state`,
  `company-card.tsx:277`) over a Paper-region table that no longer lists the lapsed certificate
  at all (`useComplianceDocuments` → the reducer, `use-studio-contacts.ts:1667`,
  `company-card.tsx:512`), with `paperHeldClause(docs, today)` (`:513`) composing nothing and
  `chaseTargetDocument(docs, today)` (`:516`) finding no target — so **"Chase the renewal" has no
  document to chase**, which is Leah's own repair act;
- **the roster row** prints `Lapsed` with `blocking` undefined (`roster-row.tsx:296-301`), so no
  held clause, no terracotta rule (PR-h's own sentence), and `lapsesSoonClause` is null because
  the word is `lapsed` not `lapses_soon`;
- **the picker's mini row** and `bringForwardConsequence` print the word with no clause
  (`rolodex-picker.tsx:558-565`, `:582-591`), over a travel list promising "document expiries"
  travel.

This is CR13-4's stated failure ("the same paper printed two words") reopened through the one leg
this wave added to the SQL and did not carry to the reducer, and it is the same shape as r11
MAJOR-1 and r10 MAJOR-2: a paper word with nothing beside it on the surface direction §3.8 and
PR-h name. `useComplianceDocumentsFor` — this wave's own new hook — inherits it at `:1636`.

**Fix.** Add the leg to `carriesGates`' sibling test: `successor.doc_type === root.doc_type`
inside `retired()` (`:1593`), and pin it in `people-crm-w3.test.ts` beside the existing chain
cases at `:520-562` (none of which varies `doc_type`) — the four `retainedComplianceDocuments`
specs in `people-crm-foundation.test.ts:394-431` all use one type, which is why the suite stayed
green through round 8.
Confidence: **high** — the divergence was read in both files and the SQL half was measured live.

---

## Minor findings

**m1 — the travel-list pane's "What stays behind" still does not print what SPEC §5.7 #5 prints
(r11 m1, open).** `travel-list-pane.tsx:30-34` ships `prior pricing · prior project notes ·
show to client`; `specimens/SPEC.md:595` says `2025 pricing · 2025 project notes · show to
client`. The "What travels" half matches SPEC exactly, so one side of the row diverges and
nothing records it. Cheap close is an amendment note under SPEC §5.7 in R-BP's shape.
Confidence: high.

**m2 — `CloseSeatAct` is "one component, two surfaces" in the report and one surface in the code
(r11 m2, open).** `person-profile.tsx:521` is its only mount. `roster-row.tsx:972-1027` keeps its
own independent two-step close, and the two already disagree: `roster-row.tsx:1008` announces
`${row.name}'s seat is closed.` with a straight apostrophe, `close-seat-act.tsx:113` with `’`.
Either mount the component in the roster row's `closing` branch (the hard delete stays beside
it) or correct the report's §1/§6 claim that "the wording, the dated write and
`peopleEvents.seatClosed` cannot drift between the two surfaces". Confidence: high.

**m3 — `useMergeStudioContacts` leaves three key families stale (r11 m3, open).**
`use-studio-contacts.ts:2050-2064` invalidates ten families and not `clientHouseholdKeys.all` —
**confirmed this round**: 00629:2266-2276 rewrites `client_households.member_person_ids` and
`primary_member_person_id` in the same transaction, and `useProjectHousehold`'s key
(`use-households.ts:218`) is `["client-households","project",projectId]`, which nothing in the
merge's fanout matches — nor `resolvedContactKeys.all` (the deep-link resolver this wave added)
nor `['studio-contact-history']` (the picker's rollup, keyed on card ids the merge just
repointed). Impact is small because each surface refetches on mount. Confidence: high.

**m4 — the room report's own numbers and file list are stale, and two of its sentences are wrong
about the code (r11 m4, open and wider).**
- §9 jest `7656` (measured 7670), vitest `1335` (measured 1337), `people-crm-w3.test.ts` `29`
  (measured 31); §1's per-file counts are all low (`compare-merge-sheet` 15/16,
  `household-band` 29/34, `rolodex-picker` 35/37, `roster-row` 40/45, `compliance-notice` 9/10).
- §2 says "each of `merge_studio_contacts()`'s **eleven** refusals"; there are **twelve**
  (`MERGE_REFUSAL_SENTENCES`, `use-studio-contacts.ts:1930-1958` — r11 added
  `merge_seat_on_studioless_project`).
- §5 and §9 both say `add_household_member` "writes `money` and `change_order` grants at
  `250000`". 00632 writes **one** row and its scope is `money` (00632:433-438); `grep -n
  change_order supabase/migrations/00632_client_households.sql` returns nothing. The component's
  own comment (`household-band.tsx:139-153`, B2R-1) settled this deliberately, so the report
  contradicts the code it describes.
- §1 lists `carriedConsentNotice` as an export of `lib/document/bring-forward.ts`; it was deleted
  (the file's closing comment at `:144-158` says so) and nothing references it.
- §1's Changed table omits `lib/document/write-error.ts` (+37, eight new 00624/00629/00631
  refusal sentences) and `lib/document/people-derivation.ts` (M2R-6, the duplicate-pair
  predicate), both of which this wave edited.
Confidence: high.

**m5 — "the earliest seat wins" is claimed and not implemented (r11 m5, open).**
`use-households.ts:322-340`: `seatRows` is sorted by `created_at` (`:289-290`) and the comment at
`:326` says "The earliest seat wins, because that is the one the RPC reuses", but the loop
iterates `grantRows` in PostgREST's arbitrary order and the `already` guard keeps the FIRST grant
seen rather than the one hanging off the earliest seat. A card holding two seats of one kind on
one job, each with an open money grant, can feed `householdMemberConsequence` the wrong standing
figure — r10 BLOCKING-1 one step in. Fix: iterate `seatRows` and look each seat's grant up.
Confidence: high on the code, low on reachability.

**m6 — the household band resolves its studio through the resolver R-BD retires (r11 m6, open).**
`call-sheet.tsx:109` `useProjectConsentOrg` → `roster-groups.tsx:204` `organizationId={consentOrg}`
→ `household-band.tsx:243-248` (`isPrincipal`), `:250-253` (the candidate rolodex) and `:342-353`
(the `organization_id` a new `client_households` row is minted with). `useProjectConsentOrg`
(`use-consent.ts:379-394`) calls `project_consent_org()` =
`COALESCE(p.studio_id, _primary_studio_for(p.designer_id))`; `add_household_member()` gates PR-n
on `project_party_recorded_studio(seat)`, i.e. `project_tenant_org()`, and the picker in the same
sheet already uses `useProjectRecordedStudio`. Same file, two resolvers. Not cross-tenant (both
are the caller's own studios) but the household can be minted in one book while PR-n is judged
against another. Confidence: high that the retired resolver is used, medium that a divergence is
reachable on the seed.

**m7 — native `disabled` where the unavailability is not a policy hold (r11 m8, open).**
`DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:305`), so an act
passed `disabled` without `held` leaves the tab order. Three W3 call sites:
`household-band.tsx:719` (`disabled={addHeld || !personId || addMember.isPending}` with
`held={addHeld}` — "nothing chosen yet" is a native disable, under a consequence sentence that
reads "This person joins the household…"), `compare-merge-sheet.tsx:584`
(`disabled={!canMerge || merge.isPending}`), and the picker's per-row checkbox and its sibling
Add, `rolodex-picker.tsx:959` / `:970`, where SPEC §5.7 #6 says the checkboxes are "never
`aria-disabled`, never the `disabled` attribute". Confidence: high.

**m8 — `CompareMergeSheet`'s survivor pre-pick is guarded on the id, not on the pair (r11 m9,
open).** `compare-merge-sheet.tsx:282-291`: `if (survivorId || !left || !right) return;`, with
deps `[open, left, right, survivorId, matchedOnDefault]`. If `leftId`/`rightId` change while
`open` stays true, the stale `survivorId` survives, `canMerge` (`:420`) is still true, and
`merge.mutateAsync({ survivorId, mergedId })` would name a card from the previous pair while the
columns show the new one. Not reachable through `directory-view.tsx` today (`setComparing` is the
only non-null writer and the sheet is modal), so a latent guard. Reset on `[leftId, rightId]`.
Confidence: high on the guard, low on reachability.

**m9 (new) — three of this wave's new catch handlers bypass `writeErrorMessage`'s schema-word
guard.** M2R-3, MAJOR-3 and CR5-1 each closed this hole on a different surface, and
`write-error.ts:78-88` is the one place a constraint name, an index name, a relation or a column
is kept off a face (SPEC §8 #3). Three new W3 surfaces catch raw:
`compare-merge-sheet.tsx:445-449` (`setError(e instanceof Error ? e.message : …)` — and
`asMergeError`'s own fallback at `use-studio-contacts.ts:1975` returns the PostgREST message
verbatim for anything outside its twelve tokens, e.g. an RLS rejection on
`studio_contact_merges`, or 00592/R-AP's `designated_person_is_self` fired by the survivor
UPDATE), `archive-card-door.tsx:70-72`, and `close-seat-act.tsx:115-119`. Every other write path
in the wave routes through the translator. Fix: `writeErrorMessage(e, "The merge did not go
through.")` etc. Confidence: high on the code path, medium on which strings are reachable.

**m10 (new) — the roster row's held clause is the one paper sentence with no
`partyKindOwesPaper` gate, and this wave widened the population that reaches it.**
`roster-row.tsx:746` gates the paper WORD on `partyKindOwesPaper(contactKind ?? row.partyKind)`
and `:694` gates the expiry NOTICE on the same predicate (R-A: no paper word for a lender or an
inspector), but `:683` renders `held` — the terracotta blocking clause — ungated. Before this
wave `blocking` read the firm's documents only; r11's fix widened its source to
`[companyId, personId]` (`:273-280`), so an inspector or lender PERSON holding a lapsed gating
document now prints a blocking clause on a row that deliberately prints no paper word. Either
gate `held` the way its two siblings are gated, or record why the clause is categorical where the
word is not. Confidence: high on the asymmetry, low on reachability (the fixture's one
person-held document expires 2029-05-01).

**m11 (new) — `useBringForward` does not invalidate the household resolver.**
`use-coordination.ts:2669-2675` invalidates `project-parties`, `project-roster`,
`partyBidKeys.list`, `peopleKeys.all` and `peopleSeatKeys.all`. `useProjectHousehold`'s key
(`use-households.ts:218`) reads `project_parties` for the job's `client` / `client_rep` seats and
is not among them, and `toPartyKind` (`rolodex-picker.tsx:152-155`) admits `client_rep` — it is
in `DEFAULT_SCOPE_KINDS` (`:137`). So bringing a client rep forward can leave the Call Sheet's
household band reading "No household is on file for this client, so there is nowhere to record
who else may sign." over a client side it has just seated, until the band remounts. Add
`['client-households','project', input.projectId]` (or `clientHouseholdKeys.all`) to the fanout —
`useAddHouseholdMember` already does (`use-households.ts:536-538`). Confidence: high on the gap,
medium on reachability.

---

## What was checked and found sound

- **The travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2621-2634`) names `project_id, party_kind, display_name, company_name,
  company_id, trade, phone, email, studio_contact_id` and nothing else — no consent column, no
  bid column, no `show_to_client`, no pricing, no note. `show_to_client` lands at the column
  default `false` and `sms_consent_status` at `'not_asked'` (measured on the local catalog), which
  is PD-11's opt-in and R-AY's frozen column respectively. `stage` is left at the column default
  `'active'`, which is what the shipped single-add path (`useAddProjectParty`, `:522-548`) also
  does — not a W3 change.
- **Consent is never copied per seat.** `git diff 3d65f81e4..HEAD | grep '^+.*sms_consent'` over
  both trees returns only test fixtures and an assertion sweep. No `record_channel_consent`
  bypass, no `studio_channel_consent` write anywhere in the wave. R-AY holds.
- **The survivor flip, and a consequence sentence that now matches the write.**
  `preferredSurvivorId` pre-picks the older card with an id tiebreak (`:64-72`), both column heads
  are `aria-pressed` buttons (`:452-489`), the pre-pick is taken once, `survivor_flipped` is
  measured (`:429`), and the split clause was checked line-by-line against 00629:1730-1778 —
  `studio_verdict`, `legal_name`, `dba_name`, `company_kind`, `remit_to`, `retainage_bps`,
  `tax_id_last4`, `w9_on_file_at`, `warranty_until`, `notes` and the three designations are
  COALESCE; `is_sole_proprietor` is OR'd and `trades` / `specialties` are UNIONed, which is
  exactly what the sentence and the three `data-compare-kept` rows now say.
- **PR-n.** `householdAddIsHeld` (`household-band.tsx:219-225`) mirrors 00632:389
  (`co_threshold_cents IS NOT NULL AND p_role = 'client_rep'`) exactly. "Set the figure" and
  "Take the figure away" are `aria-disabled` with `aria-describedby` at a reason line that is on
  the face whether or not the act can be pressed (`:564-639`); the RLS refusal is translated
  (`HOUSEHOLD_REFUSAL_SENTENCES.household_threshold_forbidden`); R-BO's two-step clear and
  `parseThresholdEntry`'s refusal are intact.
- **Close this seat replaced every hard delete.** Exactly one `.delete()` against
  `project_parties` in the repo (`use-coordination.ts:992`), one call site
  (`roster-row.tsx:1031-1059`, "Added by mistake"), held behind `seatDeleteRefusal` whose `hasBid`
  now reads the bid COLUMNS as well as the stage list (`:946-951`, `roster-row.tsx:540-547`). The
  only other `.delete()` in the changed hooks is `useClearContactRule` on
  `studio_contact_rules` (pre-existing). No "Remove" word on a party or a seat.
- **The bid write and its four sentences.** `bidStageOutcome` (`use-coordination.ts:2356-2374`) is
  the one reckoning the mutation writes from (`:2489-2503`) and the face branches on
  (`roster-row.tsx:452-489`); `off_job_at` is stamped on the transition only; every stage in
  `SEAT_BID_OUTCOME_STAGE` is admitted by `project_parties_stage_check` (checked against the live
  catalog) and `rosterBandFor`'s `BIDDING_STAGES` / `DONE_STAGES` (`use-coordination.ts:1699-1711`)
  band `declined` / `no_response` into Bidding and `off_job` into Done, as §3.4 requires.
  All twelve merge refusals, six bid refusals and eight household refusals have a sentence, and no
  key is shadowed by a substring of another.
- **Document grammar.** No `box-shadow` and no `shadow-` utility in any added line. Every token
  the new components use — `--ink`, `--ink-subtle`, `--ink-faint`, `--paper`, `--rail`,
  `--hairline-strong`, `--terracotta-ink`, `--color-terracotta-ink`, `--color-clay-ink`,
  `--color-aged-oak`, `--color-mocha`, `--color-pearl`, `--color-sage`, `--doc-ink-border` — is
  defined on bare `:root` in `globals.css` (`:11-74`, `:1975-2002`), so a portaled DocSheet
  resolves them. `.t-*` steps are used on the `--ink` family surfaces. Every sheet is a `DocSheet`
  (`compare-merge-sheet.tsx:492`, `rolodex-picker.tsx:827`).
- **Hooks above early returns.** `HouseholdBand` returns at `:433` after every hook;
  `CloseSeatAct` at `:59` with none after; `CompareMergeSheet`, `ArchiveCardDoor`,
  `RolodexPicker`, `TravelListPane` and `RosterRow` have no early return before their hooks.
- **Types.** `merged_into` is on `studio_contacts` in `database.types.ts:25336`, and
  `studio_contact_merges`, `client_households`, `studio_compliance_notices` and the bid columns are
  all generated. `@patina/supabase` ships source (`package.json` `main: ./src/index.ts`), so there
  is no dist to stale; `admin-portal build` is green after the shared edits.
- **`aria-disabled` grammar** on the four acts where the hold is a policy hold: `Open a
  household`, `Set the figure`, `Take the figure away` (raw buttons with `aria-disabled` +
  `aria-describedby` + a standing reason), and `Add to the household` / `Put this card away` /
  `Added by mistake` (`DocumentAction` with `held`). m7 lists the three that are not.
- **No trade or homeowner writing surface** was added: every new act is a studio-member act inside
  the designer portal.
- **e2e.** `e2e/people/bring-forward.spec.ts` and `merge.spec.ts` are chromium-pinned
  (`test.skip(({browserName}) => browserName !== 'chromium')`), use web-first `expect` with
  `expect.poll` over `e2e/helpers/supabase-admin`, mint and tear down their own project / cards,
  and run `sweep_compliance_expiries()` in `beforeAll` so the notice clause has a row behind it.
  Not run, per the brief.
