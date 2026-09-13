# W3 (P2) — adversarial code review, round 3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `fa199109d`
("fix(people-crm): W3 round-2 review — 14 findings closed").
Reviewed surface: every changed file under `apps/designer-portal/src` and
`packages/supabase/src` in `git diff b3f3907fd..HEAD` (43 files, +6733/−133),
plus the two new Playwright specs under `apps/designer-portal/e2e/people/`.
Working tree clean for those paths.

**No prod touched. No server started. No migration minted. No `.env.local`
created.** The local Postgres at `127.0.0.1:54322` is currently at migration
**00403** (no `studio_contacts`, no `project_parties`), i.e. another program has
reset it out from under this branch — so every claim below is grounded in the
source and in the migration SQL on the branch, never in a live probe. That is
stated as a limitation, not a finding.

**Verdict: NOT clean.** Four **major**, zero **blocking**, eleven **minor**.

---

## 0. Gates, re-run in this worktree

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **rc=0**, no output |
| `pnpm --filter @patina/supabase type-check` | **rc=0**, no output |
| `pnpm --filter @patina/admin-portal build` | **rc=0** (next 16.2.10, webpack) |
| `npx jest src/components/document/{people,roster} …bring-forward …compliance-notice …write-error` | **41 suites, 577 tests, all green** (6.2 s) |
| `npx vitest run people-crm-w3.test.ts people-crm-foundation.test.ts` | **60 passed** (25 + 35) |

The report's gate table reproduces. The admin build printed no route table in
this run (8 lines of output, rc=0); the exit code is the gate.

## 1. Prior findings, re-checked

Every r2 finding is closed in the tree.

| Id | State | Evidence |
|---|---|---|
| B2-1 | fixed | `assert_merged_into_write` appears 6× in `00629_studio_contact_merges.sql`; the RPC opens `app.contact_merge_in_progress` around its two pointer statements (`00629:1163-1172`) |
| B2-2 | fixed | `v_retiring` appears 5× in 00629; the compliance block is three statements |
| B2-3 | fixed | `bid_selected_at` is declared and COMMENTed as never backfilled (`00631:62`, `00631:119`, `00631:245`); no `selected_bid` CTE remains |
| B2-4 | fixed | `AND sc.merged_into IS NULL` in the sweep scan (`00630:257`) |
| F1 | fixed **for display only** | `firmNameFor()` resolves through `directoryFirmOf` (`rolodex-picker.tsx:~400`), `rosterMetaLine` takes a 4th `company` argument (`party-mini-row.tsx:57-74`). **See MAJOR-1: the same defect is still live on the WRITE path.** |
| F3 | fixed | `client_id: seed.data.client_id ?? null` (`e2e/people/bring-forward.spec.ts:69`) |
| B2R-1 | fixed | `householdMemberConsequence` reads " They may sign money to $2,500." (`household-band.tsx:104`), matching `00632:403-407`'s single `money` grant, which is written only for `client_rep` (`00632:386`) |
| M2R-1 | fixed | `expiryNoticeClause` prints "lapses on <date>." with no interval (`compliance-notice.ts:73-83`) |
| M2R-2 | fixed | `mergeConsequenceSentence` drops "paper" from what moves (`compare-merge-sheet.tsx:92-102`) |
| M2R-3 | fixed | the refusal routes through `writeErrorMessage` (`rolodex-picker.tsx:560-570`) |
| M2R-4 | fixed | both tokens in `write-error.ts:41-50`; `write-error.test.ts` covers them |
| M2R-5 | fixed | `.is('merged_into', null)` unless `includeMerged` (`use-studio-contacts.ts:214-216`); all three selectors read this one hook |
| M2R-6 | fixed | `if (row.role !== "contact") continue;` (`people-derivation.ts:1358-1370`) |
| M2R-7 | fixed | `useComplianceDocumentsFor` runs `retainedComplianceDocuments` (`use-studio-contacts.ts:1634-1640`) |

## 2. The brief's own checklist

| Check | Answer |
|---|---|
| travel list writes only the allowed facts | **PASS.** `useBringForward`'s INSERT names exactly `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id` (`use-coordination.ts:2528-2540`). No pricing column, no notes column, no `show_to_client`, no bid column. |
| consent never copied per seat | **PASS.** `git diff b3f3907fd..HEAD -- apps packages | grep '^+'` shows no write to any `sms_consent_*` column, no `record_channel_consent` call, no `studio_channel_consent` write. R-AY holds. |
| merge survivor flip | **PASS.** `preferredSurvivorId` pre-picks the older card, both heads are `aria-pressed` buttons, the pre-pick is taken once (`compare-merge-sheet.tsx:60-70`, `:135-146`). |
| a true consequence sentence | **PARTIAL** — see MAJOR-4. |
| PR-n gating | **PASS.** "Set the figure" is `aria-disabled` + `aria-describedby` with the reason line rendered unconditionally (`household-band.tsx:320-372`); `add_household_member` refuses `household_grant_forbidden` and the hook renders it as a sentence (`use-households.ts:110-112`). |
| Close this seat replaced every hard delete | **PASS.** `grep "useRemoveProjectParty\|removeParty"` over `apps/designer-portal/src` returns exactly one call site, `roster-row.tsx:931`, held behind `seatDeleteRefusal`; the mutation re-derives the refusal server-side from a fresh read (`use-coordination.ts:915-991`), so a stale `bid` prop cannot open the door. |
| invalidations complete | **NO** — minors 1–2. |
| aria rules | **PASS.** `ArchiveCardDoor` uses `held` + `aria-describedby` (`archive-card-door.tsx:97-99`); the household figure uses `aria-disabled` on a plain button with a live handler. The three remaining `disabled=` without `held` are form-validity/pending gates and match the shipped room's own idiom (`party-profile-sheet.tsx:801,866,989`; `reach-access.tsx:1262`). |
| Document grammar | **PASS** on shadows and tokens — no `box-shadow`/`shadow-*` added; every `var(--…)` used by the new files resolves in `globals.css` (`:root`). One typographic deviation, minor 8. |
| SPEC vocabulary | **PASS** on the new faces — no schema token reaches a string literal. **FAIL** on refusals — MAJOR-3. |
| DocSheet for every sheet | **PASS.** `CompareMergeSheet` and `RolodexPicker` both mount `DocSheet`; the bid editor and the household band are inline regions, not sheets. |
| hooks above early returns | **PASS.** `CloseSeatAct` (`:57`) and `HouseholdBand` (`:239`) both take every hook before their single early return; `CompareMergeSheet`, `ArchiveCardDoor`, `RolodexPicker` and `RosterRow` have none. |
| Playwright | **PASS on form.** Both specs are chromium-pinned via `test.skip(({browserName}) => …)`, assert through `e2e/helpers/supabase-admin`'s `adminDb` with `expect.poll`, and use web-first `expect(locator)`. Minor 10 on content. |

---

## 3. Findings

### MAJOR-1 · Bring forward writes a NULL firm onto every seat it creates

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:536-545`

```ts
const picks: BringForwardPick[] = rows.map((c) => ({
  …
  companyId: c.company_id,
  companyName: c.company_name,      // ← the raw legacy column
```

F1's own measurement, recorded in `w3-fix-log-r2.md`, is that **all 22 carded
humans with a `company_id` carry NULL in `studio_contacts.company_name`** — the
affiliation model (00592) stopped populating it. That is precisely why the same
component resolves the firm through `firmNameFor()` (`directoryFirmOf` over
`people_directory.meta.company_name`) for the mini row, for `paperClauseFor` and
for `pickedFacts`. The INSERT is the one reader of the column that F1 did not
repoint.

`people_directory_seats.company_name` is `pp.company_name` verbatim
(`00626:2090`) — no firm-card fallback — and `callSheetRowFromSeat` reads
`seat.company_name ?? roster?.company_name ?? null`
(`roster-derivation.ts:634`), where `v_project_roster.company_name` is the same
column again.

**Failure scenario.** Leah searches "Lindqvist", ticks Dana Kowalski, whose
picker row reads `Subcontractor · Northgate Electric · electrical`, and presses
"Add one to the roster". Her new Call Sheet row prints **no firm at all**
(`roster-row.tsx:510-512` renders `row.companyName &&`), and because Northgate's
COI is lapsed the held clause degrades from "Site access held. Northgate
Electric's insurance lapsed 31 March 2026." to **"Site access held. insurance
lapsed 31 March 2026."** (`heldClause` drops the possessive when the name is
blank, `roster-derivation.ts:948`). The `data-expiry-notice` clause on the same
row loses its holder the same way (`roster-row.tsx:274-284` passes
`row.companyName` as `holderName`). The picker named the firm; the seat it wrote
does not. This also makes bring-forward the first writer to break the invariant
F1's fix log measured and relied on ("31 seats, 26 with a `company_id`, **0**
with a company_id and no name").

**Fix.** Hand `firmNameFor(c)` (with `c.company_name?.trim() || null` as the
fallback it already is) into `picks[].companyName`, not `c.company_name`. One
line; `firmNameFor` is already in scope on line 536.

---

### MAJOR-2 · "Open a household" mints an unfindable household, and another on every press

`apps/designer-portal/src/components/document/roster/household-band.tsx:172-194`
· `packages/supabase/src/hooks/use-households.ts:290-316`

r1 BLOCKING-1 was closed with "two ways in, pointer first". Both ways can be
absent at once, and the band offers the door anyway:

* the **pointer** is written only when `input.designerClientId` is truthy
  (`use-households.ts:359-364`), and `designerClientId` resolves through
  `projects.client_profile_id → designer_clients` — NULL on the seeded Okonkwo
  residence by the room report's own §5, and NULL for every no-login household,
  which is the population PR-c exists for;
* the **overlap** needs `memberCardIds`, which is
  `project_parties` rows of kind `client`/`client_rep` **carrying a
  `studio_contact_id`** (`use-households.ts:277-288`).

`RosterGroups` renders `HouseholdBand` unconditionally under the Client side
band, and Client side is an always-print band (`roster-groups.tsx:43-47`,
`:197-205`). The door's own guard is only `resolved?.designerId &&
organizationId` (`household-band.tsx:245`) — it never asks whether the row it is
about to write will be findable.

**Failure scenario.** Any job with no client-side seat yet — a new project, the
ordinary state before anybody adds the client — with `client_profile_id` NULL.
The band prints "No household is on file for this client, so there is nowhere to
record who else may sign." and offers **Open a household**. The press inserts
`client_households` with `member_person_ids = '{}'` and writes no pointer.
`useProjectHousehold` re-runs: no pointer, `memberCardIds.length === 0`, early
return with `household: null` (`use-households.ts:298-306`). The band prints the
same sentence and the same door. Every further press mints another orphan —
there is no uniqueness constraint on `(designer_id, display_name)` in 00632, and
no RPC to delete a household from the room. The face denies the record it has
just written, which is the exact shape r1 BLOCKING-1 named.

**Fix.** Refuse the act, in words, when `memberCardIds.length === 0 &&
!designerClientId` ("Seat the client on this job first, then open the
household."), or seat the household's first member in the same act. Either is a
behaviour change, not a wording change.

---

### MAJOR-3 · The household band and the bid editor print raw refusal tokens

`packages/supabase/src/hooks/use-households.ts:120-131` ·
`use-coordination.ts:2330-2340` · call sites
`household-band.tsx:191,211,235` and `roster-row.tsx:435`

`asHouseholdError` and `asBidError` both end `return message || "…"`. Neither
knows 00624's seat-card guard vocabulary, and neither call site wraps the result
in `writeErrorMessage` — the translator `rolodex-picker.tsx` was made to use in
M2R-3 for exactly this reason, and which `write-error.ts` was extended for in
M2R-4.

`add_household_member()` INSERTs into `project_parties`
(`00632:371-378`), which fires `assert_project_party_cards()`. That trigger
raises bare tokens: `party_card_project_has_no_studio`,
`party_card_other_studio`, `party_company_other_studio`,
`party_card_merged_away` (`00624:600-683`). None is in
`HOUSEHOLD_REFUSAL_SENTENCES`.

**Failure scenario.** A project whose `studio_id` is NULL — R-BI names this an
active legacy population that W3 backfills and that keeps ambiguous rows NULL.
`project_consent_org()` still answers (it falls back to
`_primary_studio_for(designer_id)`, `00594:1133`), so the band is live and a
household can be opened. Leah picks a person, picks "decides the work"
(`client`, so the translated `household_grant_project_has_no_studio` leg is
skipped entirely), presses **Add to the household**, and the face reads
`party_card_project_has_no_studio`. Same door on the bid editor: `useSetPartyBid`
UPDATEs `project_parties`, the trigger is `BEFORE INSERT OR UPDATE`, and
`roster-row.tsx:435` prints `e.message` verbatim. An RLS rejection on either
table reaches the face as `new row violates row-level security policy for table
"project_parties"` — a relation name on a face, which SPEC §8 #3 forbids by name.

**Fix.** Wrap each catch in `writeErrorMessage(e, <fallback>)` at the three
portal call sites, as `rolodex-picker.tsx` already does.

---

### MAJOR-4 · The merge sentence's last clause promises a reachability the merge does not carry

`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:92-102`

> "…`${mergedName}`'s card is kept as a record of the merge, **and both ways of
> reaching this person still work**."

`merge_studio_contacts()` unions `studio_contact_channels`
(`00629:895-906`) and repoints seats, rules, affiliations, designations,
documents and the household — but it never touches `studio_contacts.phone` or
`studio_contacts.email` on either card. For any card created after 00593 those
scalar columns are the **only** place a number lives: 00593's channel population
is a one-time backfill (`00593:414-467`), not a trigger, and
`useAddStudioContact` writes `studio_contacts` alone with no channel row. The
sheet itself concedes this — its Mobile and Email rows fall back to
`card.phone` / `card.email` when no channel exists
(`compare-merge-sheet.tsx:186-194`).

**Failure scenario.** Two cards for one estimator, matched on `email` (or on
`company_name`, or on `profile`) with two different mobile numbers, both typed
straight onto the card and neither ever pushed through the Reach editor. The
sheet shows both numbers side by side in the Mobile row. The studio presses
"Merge into …". The merged card's number is now on a card `people_directory`
skips (`00629 §6`), reachable from no surface in the room — while the sentence
the studio just read said both ways of reaching this person still work.

**Fix.** Either say what is true ("Both card ids still resolve, so an old link
still opens this person."), or carry the scalar columns forward in the RPC
(`COALESCE(survivor.phone, merged.phone)`) so the sentence becomes true. The
wording fix is the W3-scoped one.

---

### minor-1 · `useMergeStudioContacts` misses three keys the RPC writes

`packages/supabase/src/hooks/use-studio-contacts.ts:1941-1955`. The RPC repoints
`client_households.member_person_ids` / `primary_member_person_id`
(`00629:1147-1156`), `project_parties.bid_quoted_by_person_id`
(`00629:1127-1130`) and every seat's `studio_contact_id` (`00629:1093`). The
mutation invalidates neither `clientHouseholdKeys.all` (so the Call Sheet's
household band keeps the dead member id), nor `partyBidKeys.all` (so the Bidding
band's "Priced by …" keeps the dead name), nor `['studio-contact-history']` (so
the picker's history line keeps the pre-merge counts). Confidence high.

### minor-2 · `useBringForward` and `useRemoveProjectParty` miss their neighbours

`use-coordination.ts:2563-2570` writes seats but never invalidates
`['studio-contact-history', …]`, so a card just brought forward still reads
"Never on a job yet" in the picker until a remount.
`useRemoveProjectParty` (`:993-1000`) and `useCloseProjectPartySeat`
(`:849-855`) never invalidate `partyBidKeys`, so `RosterGroups`' one bid read
keeps a row for a seat that is gone. Confidence high.

### minor-3 · `withdrawn` stamps `off_job_at` and nothing ever clears it

`use-coordination.ts:2436-2442`. Correcting a mis-picked "They withdrew" to
"Selected" moves `stage` to `awarded` but leaves the dated `off_job_at` on the
row. Nothing on a face reads it while the stage is not `off_job`
(`rosterWindowClause` gates on `band === 'done'`, `person-profile.tsx` splits on
`DONE_STAGES`), so this is a record-hygiene defect rather than a wrong face
today — but the next reader that keys on the date will disagree with the stage.
Confidence high.

### minor-4 · The household's studio is resolved with `project_consent_org()`, against R-BD

`roster-groups.tsx:206` passes `organizationId={consentOrg ?? null}`, and
`consentOrg` is `useProjectConsentOrg` (`call-sheet.tsx:109`). R-BD rules that
every tenant resolution for a project uses `project_tenant_org()`;
`useProjectRecordedStudio` is already in the file next door for exactly this
(CR5-1, `rolodex-picker.tsx:~215`). `project_consent_org()` adds a
`_primary_studio_for(designer_id)` fallback (`00594:1133`) that
`assert_project_party_cards()`'s `project_tenant_org()` does not share
(`00624:600`). On a `studio_id IS NULL` project held by a designer who belongs
to two studios — the condition QA-R3-1 recorded as real for
`designer@patina.dev` — the household is born in one org while the seat guard
checks another, and the act dies with the raw token of MAJOR-3. Confidence
medium.

### minor-5 · An unparseable figure silently erases the record and announces success

`household-band.tsx:196-213`. `figure.replace(/[^0-9.]/g,"")` then `Number(…)`:
"2.5.0", "twenty-five hundred", or an emptied field all yield `NaN` →
`coThresholdCents: null` → the household's change-order figure is taken off the
record, and the announcer says "The change-order figure is on the record." while
`data-household-threshold` flips to "No change-order figure is on file for this
household." Confidence high.

### minor-6 · One already-seated pick costs the whole batch

`rolodex-picker.tsx:521-535`. The pre-check refuses the entire confirm when ANY
ticked row is already on the sheet and writes nothing; the room report's "one
pick refused does not cost the others" (§3) is true only of database refusals.
The sentence names who is already there so the studio can untick, so this is a
friction finding, not a correctness one. Confidence high.

### minor-7 · A partial success reports only the half that failed

`rolodex-picker.tsx:560-572`. When some picks land and some are refused, the
face says "<names> did not go on the call sheet. <reason>" and never says the
others DID; `result.refused[0].reason` is used as the one sentence for every
refusal even when they differ. Confidence high.

### minor-8 · `useSetHouseholdThreshold`'s zero-row branch mis-attributes the refusal

`use-households.ts:395-402` treats a zero-row UPDATE as "the WITH CHECK refusing
the figure". 00632 enforces PR-n two other ways: the UPDATE policy's WITH CHECK,
which raises 42501 rather than returning zero rows (`00632:252-257`), and
`assert_household_threshold_principal()`, which raises
`household_threshold_forbidden` (`00632:182-218`). A zero-row answer therefore
means the row is not visible under the USING clause, not that the figure was
refused. The 42501 path also falls through `asHouseholdError` to the raw
Postgres string — currently unreachable only because the button is
`aria-disabled` for non-principals. Confidence medium.

### minor-9 · The household overlap read is non-deterministic

`use-households.ts:308-313`: `.overlaps("member_person_ids", memberCardIds)
.limit(1)` with no `ORDER BY` and no `organization_id` filter (RLS scopes the
tenant, so this is not a hole). Two households in one studio overlapping the
same client card make which one the band prints — and which one "Add a household
member" writes into — vary between refetches. Confidence medium.

### minor-10 · Both e2e specs assert less than they claim

`e2e/people/merge.spec.ts:186-196`: `onMerged` navigates to the survivor's
person card (`directory-view.tsx:530-534`), so the closing "the Directory now
shows one card" assertions (`data-duplicate-band` count 0, `NEWER_NAME` count 0)
run on the person card and pass vacuously.
`e2e/people/bring-forward.spec.ts:151-153` pins the exact hit count
("4 of 5 …"), which any new seeded card matching "Lindqvist" breaks. Neither has
been executed — the brief forbade it this round. Confidence high.

### minor-11 · `CloseSeatAct` is mounted on one surface, not two

`grep CloseSeatAct` returns `person-profile.tsx:521` and nothing else; the Call
Sheet row keeps its own inline copy of the same confirm sentence, the same
`useCloseProjectPartySeat` call and the same `peopleEvents.seatClosed`
(`roster-row.tsx:860-915`). The strings are byte-identical today, so nothing on
a face is wrong — but the room report's §6 claim that the wording "cannot drift
between the two surfaces" is not what the code does. Confidence high.

### minor-12 · `CompareMergeSheet`'s head is off the room's type scale

`compare-merge-sheet.tsx:301` — `font-heading text-[1.35rem]`, where every other
sheet in the room heads at `font-heading text-[1.6rem] font-medium`
(`add-person-sheet.tsx:1085`, `rolodex-seed-sheet.tsx:194`,
`party-profile-sheet.tsx:583`, `view-shell.tsx:333`). 1.35rem is neither the
house step nor a `.t-*` step. Confidence high.

### minor-13 · The merge consequence sentence omits two things that do move

`compare-merge-sheet.tsx:92-102` names seats, channels, contact rule and firm
designations. `merge_studio_contacts()` also moves `studio_person_affiliations`
(`00629:911-935`) and the merged card's **household membership**
(`00629:1147-1156`). Neither is false; both are silent. Confidence high.

### minor-14 · `mergeCardName`'s kind fallback can print a schema token

`compare-merge-sheet.tsx:177-179`: `getPartyKindLabel(card.contact_kind) ||
card.contact_kind`. PR-f widened the kind vocabulary; any kind without a label
prints the raw column value in the "What they are" row. Same shape as the
shipped `rosterMetaLine` fallback, so pre-existing idiom rather than a W3
regression. Confidence medium.

---

## 4. What I checked and found nothing

* **Consent.** No new code reads or writes a consent table, a consent RPC or a
  frozen `project_parties.sms_consent_*` column. `useBringForward`'s INSERT
  names no consent column, so a seat is born reading the record (R-AY, R-AS).
* **Cross-tenant.** Every new read is either `.eq('organization_id', …)` or
  RLS-scoped; every new write goes through an RPC that restates its gate in the
  body (`merge_studio_contacts`, `archive_studio_contact`,
  `add_household_member`) or through a policy-gated table. No grant or REVOKE is
  touched by this wave's portal code.
* **Data loss on merge.** The merged card is neither deleted nor archived; the
  RPC's own document block moves a certificate only where the survivor already
  holds a qualifying successor. The one loss I found is the scalar
  phone/email — MAJOR-4.
* **`seatDeleteRefusal`.** The face's predicate now reads the bid columns
  (`roster-row.tsx:439-444`) AND the mutation re-derives all three facts from a
  fresh server read before deleting (`use-coordination.ts:915-991`), so a
  loading `bid` prop cannot open the hard-delete door.
* **`includeMerged`.** All three selectors the M2R-5 finding named
  (bring-forward picker, "who priced it", household member) read
  `useStudioContacts` and take the default, so a folded card is offered by none.
