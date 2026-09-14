# W3 (P2) — adversarial code review, round 6

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `e7c60adaa`, W3 range `3d65f81e4..HEAD` (45 files, +7701/−155 under
`apps/designer-portal/src` and `packages/supabase/src`). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod, no server, no migration
minted, no file changed by this review.

**Verdict: not clean — 1 major, 11 minor, 0 blocking.**

Every r5 finding (B-1, M-1, M-2, M-3, M-4, and the duplicate ids folded into them) is **closed**,
verified in the shipped code and against the live local database, not from the fix log's prose.
The one major below is a *consequence of the r5 M-1 fix*: the threshold write now moves and closes
authority grants, and the face that calls it never says so and announces the opposite when the
figure is cleared.

---

## 1. Gates re-run (not taken on trust)

| Gate | Result, this round |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output |
| `pnpm --filter designer-portal type-check` | rc=0, no output |
| `pnpm --filter admin-portal build` | rc=0 (background task `bqt054avm`, exit 0) — the strictest gate after the shared `@patina/supabase` edits |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2876 tests, all passed** (7.5 s) — matches the fix log exactly |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 25 passed |
| `psql -f supabase/tests/people/w3_merge_sweep_household_test.sql` | `NOTICE: W3 SQL suite: all blocks passed`, ROLLBACK |

No e2e run (the brief forbids taking a port this round). Both specs read correctly: chromium-pinned
via `test.skip(({browserName}) => browserName !== "chromium")`, `adminDb` from
`e2e/helpers/supabase-admin`, `expect.poll` on every database assertion, web-first `expect` with
explicit timeouts, own fixtures created and torn down in `beforeAll`/`afterAll`
(`e2e/people/merge.spec.ts`, `e2e/people/bring-forward.spec.ts`).

## 2. Prior findings, re-checked

| r5 id | State | Evidence |
|---|---|---|
| B-1 typed facts travel | **fixed** | `merge_studio_contacts()` (live `pg_proc`) COALESCEs the eleven typed columns + the verdict/date pair in the SHARED path above the `v_cross` branch and UNIONs `trades`/`specialties`; `compare-merge-sheet.tsx:152-187` (`carriedRows`) prints them only where a card holds one; announcer at `:336-339` no longer claims "everything" |
| M-1 figure moves its grants | **fixed (with a new gap, finding 1)** | `set_household_threshold()` in `00632` §4 moves every open `money` grant sourced `client_households.co_threshold_cents` on a `client_rep` seat of a member, refuses per-seat on `project_party_recorded_studio()`, closes with `effective_to` on NULL; `use-households.ts:396-432` calls the RPC and invalidates `partyAuthorityKeys.all` / `peopleSeatKeys.all` / `peopleKeys.all` |
| M-2 rule gate = subsumption | **fixed** | the gate is now `channels_forbidden <@` plus route identity (`merge_studio_contacts`, live body), not `contact_rule_blocks_contact()` |
| M-3 corrected expiry re-announces | **fixed** | `studio_compliance_notices.expires_on` NOT NULL, `idx_studio_compliance_notices_doc_state_date UNIQUE (document_id, state, expires_on)`, `clear_compliance_notices_on_date_change` present in `pg_proc` |
| M-4 merge onto an archived survivor | **fixed** | `merge_survivor_archived` raised before any write; `asMergeError` sentence at `use-studio-contacts.ts` MERGE_REFUSAL_SENTENCES; the column head marks it (`compare-merge-sheet.tsx:376-383`, `data-survivor-archived`) |

## 3. The brief's own checklist

- **Travel list writes only the allowed facts** — `useBringForward` (`use-coordination.ts:2536+`)
  INSERTs exactly `project_id, party_kind, display_name, company_name, company_id, trade, phone,
  email, studio_contact_id`. No consent column, no bid column, no `show_to_client`, no note, no
  price. `show_to_client` lands at the table default `false`; `phone` is normalised to
  `phone_e164` by the shipped `normalize_phone_project_parties` BEFORE trigger, so the consent
  read the seat is born with is the record's, written by nothing. ✔
- **Consent never copied per seat** — no `studio_channel_consent` / `sms_consent_*` write anywhere
  in the W3 diff (grep over the whole range returns comments and test fixtures only). R-AY holds. ✔
- **Merge sheet survivor flip + a true consequence sentence** — `preferredSurvivorId` pre-picks the
  older card, both heads are `aria-pressed` buttons, the pre-pick is taken once
  (`compare-merge-sheet.tsx:216-225`) so a refetch cannot undo a flip; the sentence now matches what
  the RPC does, including "where both cards say something <survivor>'s own words stand". ✔
- **PR-n gating** — `set_household_threshold` refuses `household_threshold_forbidden` on the
  household's org and `household_grant_forbidden` per seat on the studio the project records; the
  face states the reason standing, `aria-disabled` + `aria-describedby`, never `disabled`
  (`household-band.tsx:356-404`). ✔ (but see finding 9 for the *other* PR-n act)
- **"Close this seat" replaced every hard delete** — one `.delete()` on `project_parties` in the
  whole data layer (`use-coordination.ts:992`), reached from one call site
  (`roster-row.tsx:232`), behind `seatDeleteRefusal` whose `hasBid` now reads the eight bid columns
  as well as `stage`. `CloseSeatAct` is mounted on the person card's live seats only
  (`person-profile.tsx:515-527`). No new delete path. ✔
- **aria rules** — `DocumentAction` renders `disabled={unavailable && !held}` and adds
  `aria-disabled` only when `held`, so every *permission-gated* act in this wave (archive door,
  "Set the figure", "Open a household") stays focusable with its reason on the face. The plain
  `disabled` that remains is the shipped idiom for empty-form / in-flight states (22 pre-existing
  call sites in the same two directories). ✔
- **Document grammar** — zero `box-shadow` / `shadow-*` in the added lines. See finding 10 for the
  two token dialects. ✔ with a note
- **SPEC vocabulary** — no schema token reaches a face: the outcome select prints
  `SEAT_BID_OUTCOME_ACTS`, the household roles print `HOUSEHOLD_MEMBER_ROLE_LABELS`, the merge
  evidence prints `MERGE_MATCHED_ON_LABELS`, and every raw refusal is routed through
  `writeErrorMessage`/`asMergeError`/`asHouseholdError`/`asBidError`. One refusal never reaches its
  sentence — finding 2.
- **RLS / grants** — the six new RPCs are `authenticated, service_role` only, no `anon`
  (`pg_proc.proacl`); `sweep_compliance_expiries` is `service_role` only. `client_households`
  carries four policies, both write paths narrowed on `is_org_admin_or_owner` when
  `co_threshold_cents` is non-NULL. No cross-tenant read found: the one unscoped query
  (`useProjectHousehold`'s `.overlaps(member_person_ids)`) is answered by an RLS policy requiring
  `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`, and card ids are
  per-studio. ✔

---

## 4. Findings

### MAJOR

**1 · Clearing the change-order figure revokes signing authority silently, and the room announces
the opposite.** — `apps/designer-portal/src/components/document/roster/household-band.tsx:223-240`
(confidence: high)

```ts
const digits = figure.replace(/[^0-9.]/g, "");
const dollars = digits ? Number(digits) : NaN;
await setThreshold.mutateAsync({
  id: household.id,
  coThresholdCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : null,
});
setEditingFigure(false);
onAnnounce?.("The change-order figure is on the record.");   // :236 — unconditional
```

Three faults stacked on one act, all of them new since r5 made the write consequential:

* **Any unparsable entry erases the figure.** An empty field, `abc`, a slipped `2.5.0` → `NaN` →
  `coThresholdCents: null`. There is no refusal and no confirm.
* **NULL is not a no-op any more.** `set_household_threshold()` (00632 §4) closes *every* open
  `money` grant the household sourced — `UPDATE project_party_authority SET effective_to =
  GREATEST(effective_from, CURRENT_DATE)`. So a typo in a money field takes Chidi Okonkwo's
  signing authority off the job. The r5 fix log measures exactly this ("AFTER: 0 open money
  grants") as the intended erase path; the face was never taught it.
* **The announcer then says the figure is on the record.** `:236` fires on every success, so the
  `role="status"` line (RosterGroups → CallSheet's announcer) reads "The change-order figure is on
  the record." while `data-household-threshold` two elements above re-renders as "No change-order
  figure is on file for this household." Two contradictory facts about the same household on one
  screen — the precise harm this component's own banner at `:57-70` was written to prevent.
* And the editor is the only act in W3 with **no consequence sentence at all**
  (`:318-353`: label, input, "Write the figure" / "Leave it"). "Add a household member" carries
  `data-household-consequence`; the money act carries nothing, so the studio is never told that
  raising the figure moves the members' grants or that clearing it ends them.

**Fix:** refuse a non-numeric entry rather than writing NULL; make "take the figure away" its own
named act; print a consequence sentence naming the grants that move or close
(`householdMemberConsequence`'s shape); branch the announcement on the value written.

---

### MINOR

**2 · One of the bid refusals can never render its sentence — the constraint name is wrong.** —
`packages/supabase/src/hooks/use-coordination.ts:2336-2337` (confidence: high)

`BID_REFUSAL_SENTENCES` keys the first entry on `project_parties_bid_valid_until_check`. The
shipped constraint is `project_parties_bid_window_check` (00631:86-90, confirmed on the live
`\d project_parties`), so `asBidError` never matches it, and `roster-row.tsx`'s catch hands the raw
Postgres text to `writeErrorMessage`, whose schema-word guard (`/violates|constraint/`) replaces it
with the fallback "Could not write the bid." A studio that types a "holds until" earlier than the
"answer was owed" is told nothing about why. The intended sentence — "A number cannot stop holding
before the day it was owed." — is dead code, and the w3 room report §4's claim that "each of its
four refusals renders as a sentence" is not true of this one.

**3 · The outcome write is one-directional: stage and `off_job_at` do not come back.** —
`packages/supabase/src/hooks/use-coordination.ts:2432-2442` (confidence: high)

`if (patch.bidOutcome)` guards the stage write, so choosing "Nothing recorded yet" clears
`bid_outcome` and leaves `stage` at `off_job` / `awarded` / `declined` where the previous pick put
it — while the editor's own sentence in that state reads "The outcome is what moves them out of the
bidding band. Nothing else on this row does." (`roster-row.tsx`, the `!bidDraft.outcome` branch).
And `off_job_at` is stamped on `withdrawn` but never cleared when the outcome is corrected to
`quoted`/`selected`, so a seat that is back in Bidding carries a date saying it left the job.
Invisible today (`rosterWindowClause` prints `offJobAt` only in the `done` band), but it is a false
date in the record on the one path MAJOR-7 existed to open.

**4 · The second surface that renders the roster gets none of W3's seat facts.** —
`apps/designer-portal/src/components/document/roster/project-team-roster.tsx:134` (confidence: high)

`<RosterGroups projection … consentOrg …>` is mounted with **no `projectId`**, so on the project
page's own roster: `useProjectPartyBids(null)` is disabled → no `data-bid-note` (R-R asks for it
wherever a row has a bid history), no bid editor, no `HouseholdBand` (gated on `projectId`), and
the row-level `hasBid` falls back to `stage` alone, so "Added by mistake" is offered on an
`awarded` seat carrying a bid. No data is lost — `useRemoveProjectParty` re-reads the eight bid
columns and throws the refusal sentence — but the act is offered before it is refused, which is
what `roster-row.tsx:442`'s own comment forbids. The same file mounts `<RolodexPicker>` with no
`projectName` (`:145`), so the bring-forward consequence sentence reads "Adds four seats." with no
job named (SPEC §5.7 #7 fixes the wording with the job).

**5 · The picker's paper clause can never speak for a person who holds their own paper.** —
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:364-373, 490-497`
(confidence: high)

`firmIds` is `hits.map(c => c.company_id)` — company cards only — and that is the only list handed
to `useComplianceDocumentsFor`. `paperClauseFor` and `pickedFacts` then pass
`[contact.company_id, contact.id]` as holders to `noticedPaperClause`, so the person-held leg is
asked of a document set that can never contain a person's document. A sole proprietor — the exact
population R-BA/`identity_paper_state` reduces over both legs for — carries a lapse the mini row
and the confirm sentence stay silent about. Latent on the fixture (one person-held document,
`other_named`, expiring 2029, no notice) and invisible in the e2e spec because Northgate's
certificate hangs off Dana's firm.

**6 · The merge's invalidation list misses two keys the merge itself repoints.** —
`packages/supabase/src/hooks/use-studio-contacts.ts:1987-2000` (confidence: high)

`merge_studio_contacts()` rewrites `client_households.member_person_ids` /
`primary_member_person_id` and `project_parties.bid_quoted_by_person_id` (live body, the "household
(00632)" and "the seat's FOURTH card pointer" blocks), but `onSuccess` invalidates neither
`clientHouseholdKeys.all` / `["client-households","project"]` nor `partyBidKeys.all`. An open Call
Sheet keeps the pre-merge household membership and keeps resolving "Priced by …" against a card id
that is no longer offered, so the clause disappears until a refetch. `resolvedContactKeys` is also
never invalidated, so a cached `resolve_merged_contact` answer for a just-merged id stays stale.

**7 · "Papers on file" asserts an absence while the query is still in flight.** —
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:278-282` (confidence:
medium)

`String((leftPaper ?? []).length || "None")` — `useComplianceDocuments` is `enabled` only once the
sheet is open, so on the first paint of every merge sheet both paper columns read **None** before
the fetch resolves, on a row the studio is using to choose which card keeps the record. Every other
unknown in the same table prints `—`. A loading-state "—" (or a count that waits for `isLoading`)
is the honest cell.

**8 · The notice clause can print a future tense over a past date.** —
`apps/designer-portal/src/lib/document/compliance-notice.ts:76-78` (confidence: medium)

The tense comes from the *notice's* state and the date from the *document's* `expires_on`, so
between a `lapses_soon` paper actually crossing its date and the next nightly sweep writing the
`lapsed` notice, the company card prints "Northgate Electric's insurance lapses on 6 October 2026."
on 7 October, directly beside a paper word that already says lapsed. A ≤24h window, and the
r5 M-3 trigger keeps the two dates in step, so this is only the tense.

**9 · The other PR-n act is offered live and refuses after the press.** —
`apps/designer-portal/src/components/document/roster/household-band.tsx:468-478` (confidence: high)

`add_household_member()` raises `household_grant_forbidden` for a plain member whenever the
household carries a figure and the role is `client_rep` — the whole act, not just the grant. "Add
to the household" is nonetheless rendered ungated (`disabled` only on an empty select) beside a
consequence sentence promising "They may sign money to $2,500.", and `isPrincipal` is already in
hand three lines up. The sibling act on the same band ("Set the figure") carries its reason on the
face; this one states it only after the refusal.

**10 · Two token dialects inside one wave.** — `household-band.tsx:39-42`,
`travel-list-pane.tsx:36-45` (confidence: low)

The people-side files this wave adds use the house tokens and the type steps
(`t-body-sm`, `var(--ink)`, `var(--hairline-strong)`); the roster-side files it adds use
`text-[0.74rem]` / `text-[0.72rem]`, `bg-white/40`, `var(--color-charcoal)`,
`var(--color-aged-oak)`, `var(--color-pearl)`. Both token sets are defined
(`globals.css:11-35`) and the new roster files match their shipped neighbours exactly, so this is
consistency with the surface rather than a regression — flagged only because the brief names the
`.t-*` steps as binding.

**11 · The household resolver picks an arbitrary row when two households share a member.** —
`packages/supabase/src/hooks/use-households.ts:308-313 (`.overlaps` at :311)` (confidence: medium)

`.overlaps("member_person_ids", memberCardIds).limit(1)` with no `ORDER BY` and no
`organization_id`/`designer_id` narrowing. 00632 has no uniqueness constraint on membership, so a
card in two households makes which figure the band prints a plan detail. (RLS makes the missing org
filter harmless; the missing order does not.)

**12 · The band's tenant comes from `project_consent_org()`, which R-BD retires.** —
`roster-groups.tsx:200-206` ← `call-sheet.tsx:109` (confidence: medium)

`HouseholdBand` takes `organizationId={consentOrg}`, i.e.
`COALESCE(projects.studio_id, _primary_studio_for(designer_id))`, and uses it as the
`organization_id` a new `client_households` row is **created** in. On the legacy `studio_id IS NULL`
population R-BI names, that resolves to a studio the job does not record, while
`add_household_member()`'s grant leg resolves through `project_party_recorded_studio()` (NULL) and
refuses. `useProjectRecordedStudio` — which the picker in the same wave already uses for exactly
this question (`rolodex-picker.tsx:233-236`) — is the resolver R-BD points at.

---

## 5. What I could not fault

- The merge's repoint list is complete against the live schema: channels (union + the legacy
  scalars minted as rows), affiliations, rule + route, every compliance document in three ordered
  statements with the supersede edge written last, the three designations, seats, `company_id`,
  `warranty_contact_person_id`, `bid_quoted_by_person_id`, the three trade-agreement pointers, the
  household array, then `merged_into` under a transaction-local guard and the append-only record.
  No column the room reads is left on the folded card. No data-loss path found.
- `directoryDuplicatePairs`' `row.role !== "contact"` narrowing is right, not a feature loss:
  `people_directory`'s party branch is `WHERE pp.studio_contact_id IS NULL`, so every carded human
  — seated or not — is emitted by the `'contact'` branch, and the pairs the band now offers are
  always two `studio_contacts` ids.
- `useRemoveProjectParty` asks the face's own question (`identity_paper_state`, both legs) and
  treats an unreadable answer as a refusal.
- Analytics are act-shaped, not engagement-shaped: `people_cards_merged` carries `survivor_flipped`
  (PR-o's own measure), `people_household_member_added` carries `with_threshold`/`seated`,
  `people_bid_recorded` carries the fields filled; `people_bring_forward_picked` finally fires.
- Hooks sit above every early return in all five new components, and no hook is called
  conditionally.
