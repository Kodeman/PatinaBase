# W3 (P2) — fix log, round 4

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `b5af75f3e`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Migration **00629** edited in place (the 00621–00633 block
is unapplied on Strata). **No migration minted** — nothing here needs a number above 00633, and
00595–00620 stay reserved to the hour-tracking program.

Eight findings handed back, three of them the same defect reached twice
(`B-3` = QA `1`; code `MAJOR-1` = QA `2`), so **six distinct fixes**: B-1, B-2, B-3, M-1, M-2,
M-3. All closed; nothing else changed. Rulings re-read and named where they bear: **PR-o**,
**PR-k**, **R-BL**, **R-Q**, **R-S**, **R-AY**, **R-BD**, **R-BM**, **R-BA**, **PR-e**.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, head `00633` (the CLI telemetry `EPERM` needed `dangerouslyDisableSandbox`, as every round before — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (now with **block 8**) | rc=0 — "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` | rc=0 each |
| `artifacts/…/build/probe60-r4-merge-fixes.sql` | run 4× on a fresh reset; same answer every run (below) |
| `python3 scripts/generate-legacy-grants.py` | +12 lines — the one new function's REVOKE/GRANT pair; regenerated and committed |
| `SUPABASE_DB_URL=… pnpm db:generate` | +4 lines — `contact_rule_blocks_contact` only; no table or column shape moved |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter @patina/designer-portal type-check` | rc=0 |
| `pnpm --filter @patina/admin-portal build` | rc=0 (shared-package edit) |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2874 tests, all green** (2868 before; +6 new) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 25 passed |
| `npx eslint` on the four touched designer files | clean |

No e2e run: the brief forbids starting a server this round. `e2e/people/bring-forward.spec.ts:146`
(`[data-carried-consent]` → "Opted out by text, 3 Dec 2025") is the assertion QA reported FAILING
against the shipped picker; the fix below is what makes it true, and it is owed an execution in
the next round that may run one.

---

## B-1 · a merge threw away the person's Patina account, and the reach word lied

**Blocking. Closed.** `supabase/migrations/00629_studio_contact_merges.sql`.

Two statements and one refusal:

* The absorbed card's `profile_id` and `email` move onto the survivor **where the survivor has
  none** (COALESCE, never overwrite). `people_directory`'s CONTACTS branch reads both off the
  survivor's own columns — `reach_state_for_identity()`'s first leg is
  `profile_id IS NOT NULL THEN 'account'` — and PR-o pre-picks the OLDER card, which is exactly
  the card that predates the account. Direction §3.8 makes `Account` a word the studio acts on and
  PR-k makes an account additive: a merge may not subtract one.
* Two cards naming two **different** logins now refuse by name, `merge_two_logins`: that is not
  one person carded twice, it is two people the studio believes share a number, and it is the
  studio's ruling, not the RPC's.

The number is deliberately **not** carried across as a scalar — it already travels as a channel
row (r3 W3-R3-4), and writing `phone`/`phone_e164` here would fire
`link_rolodex_card_to_parties()` mid-merge, which is a seat claim and not this statement's
business.

**Measured** (`probe60`, fresh reset):

```
BEFORE  Chidi Old | on_paper | (blank)   ·  Chidi New | account | chidi@example.invalid
AFTER   one row:  Chidi Old | account | chidi@example.invalid | profile a6…0002
negative control (two different logins) → refused: merge_two_logins
```

Pinned in the suite: **block 8** asserts the pre-merge row reads `account`, the post-merge
survivor reads `account` with both the login and the address on it, the absorbed card emits no
row, and the two-login pair refuses.

## B-2 · a merge silently dropped a "do not contact" block, and the sheet said it moved

**Blocking. Closed.** `00629`; `components/document/people/compare-merge-sheet.tsx`.

`idx_studio_contact_rules_subject` is UNIQUE on `(subject_type, subject_id)`, so only one of the
two rules can stand on the survivor and the repoint has to be conditional. The harm was the case
where the rule left behind BLOCKS: `contact_rule_summary()` then read "Use: email, mobile." for a
human the studio recorded as do-not-contact, on the Directory row, the roster row, the person card
and the company-card crew line at once (R-S), with the block sitting on a card no surface opens —
Leah task 4's acceptance criterion inverted, and C30's class of harm.

Taken: **the named refusal**, `merge_contact_rule_conflict`, raised when the absorbed card's rule
blocks and the survivor's rule does not. Both cards are still live and openable at that moment, so
the studio settles the rule on the card it is keeping and merges. Where the survivor's rule ALSO
blocks, nothing is lost and the merge proceeds.

"Blocks" is **R-BL's** formula and nothing else, stated once as
`public.contact_rule_blocks_contact(channels_forbidden, route_to_person_id)` — every direct
channel forbidden (`sms, mobile, office, email`), or contact routed to another person. It is the
portal's `contactRuleIsHardBlock()` in SQL, so F-15 Frank Bauer blocks while F-27 Ray Thao (never
text; email and phone open) and F-11 Dana Kowalski (text only) do not. The alternative —
carrying the stricter rule forward — was rejected: with a unique index and no free slot, "stricter
wins" means either deleting the studio's own typed sentence or inventing a union rule the studio
never wrote.

**The face follows**: `mergeConsequenceSentence()` takes `survivorHasRule` and, when the survivor
carries a rule, reads "…seats, channels and firm designations move onto <survivor> … <survivor>'s
own contact rule stands, and <merged>'s stays on the folded card as a record." It no longer claims
the rule moves when it does not.

**Measured** (`probe60`): survivor "Use: email, mobile." + duplicate "Never text. Do not use:
after_hours, dispatch, email, mobile, office. Write Rosa Delgado instead." →
`merge_contact_rule_conflict`, and the block is still on the duplicate afterwards. Both negative
controls merge: two blocking rules, and a never-text rule beside a permissive one.

## B-3 (= QA finding 1) · "…so an old link still opens this person" was false

**Blocking. Closed by wiring the promise, not by deleting it.**
`packages/supabase/src/hooks/use-studio-contacts.ts`, `hooks/index.ts`,
`components/document/people/people-room.tsx`.

`resolve_merged_contact()` had **zero callers** in the repo. New hook `useResolvedContactId(id)`
is the first, and the People room's deep-link effect is where PR-o's "both ids stay resolvable"
is actually kept:

* `?person=<id>` that matches no `people_directory` row once `all` has loaded no longer gives up
  quietly — it parks the id and asks the RPC. A survivor that IS in the book opens exactly as the
  link's own id would have (`openDirectoryPerson()`, one opening for both paths), and the address
  sync then rewrites `?person=` to the survivor.
* `?firm=<id>` takes the same wait and the same forward resolution — it opened blind before.
* Anything else — the RPC answering the same id, a `null` (no card this member may read; the RPC
  is SECURITY INVOKER, so `studio_contacts`' member-only SELECT policy is the whole access rule),
  or a survivor the directory does not carry — leaves the Directory standing exactly as it did.

Pinned: three new cases in `people-room-address.test.tsx` (merged person id → survivor's card;
merged firm id → surviving firm's card; unresolvable id → Directory stands, no card).

## M-1 · the sole-proprietor fold aborted on any firm that had renewed its paper

**Major. Closed.** `00629`, the cross-kind `ELSE` branch.

It was ONE unordered `UPDATE … WHERE holder_id = p_merged`, while the same-kind branch was split
into three ordered statements for exactly this reason (r2 B2-2).
`assert_compliance_holder()`'s STRUCTURAL leg `compliance_successor_other_holder` always runs —
`v_retiring` suppresses only the two time-varying legs — so a retired row reached before its own
successor found `superseded_by` naming a document still held by the firm, and the fold aborted
with a schema token naming nothing the studio did. Order-dependent: it passed a suite and would
fail on a real book. F-11 Dana Kowalski — owner-operator, sole proprietor, the fixture's only
renewed certificate — is the motivating pair.

The branch now takes the same-kind branch's shape: every head (`superseded_by IS NULL`) moves
first carrying nothing, then the lineage behind each one follows outermost-first in the same
depth-16 loop, each row's own successor already on the survivor when the trigger reads it. The
`holder_type` rewrite rides along unchanged. No supersede-edge pass is added — the firm IS the
person, and R-BA already reduces one paper word over both.

**Measured** (`probe60`, a three-deep chain, run 4×): `M-1: MERGE OK` every time, all three
certificates on the person with `holder_type = 'person'` and the chain intact. Pinned in block 8.

## M-2 · the wave report told Fable a change was deferred that had shipped

**Major. Closed on the record.** `artifacts/…/build/w3-data-report.md` §3, §7, §10.1, §10.4;
`00629` §6 banner.

* **00629 §6 banner** now names **two** deltas against 00626's view body, not one: the CONTACTS
  branch's `AND sc.merged_into IS NULL` **and** the TEAM branch's tenant leg (`00629:1758-1768`),
  stated as a narrowing of who reads a studio's teammate names, job titles, staff roles and
  project ids.
* **§7** is retitled "The finding that WAS fixed, corrected on the record" and hands Fable the
  narrowing **as a change made**, with the predicate quoted. What is owed is a ruling on whether
  narrowing that read is the product answer — not whether it is in the build. It is.
* **§10.1** says MADE, not owed.
* **§10.4**: R-BM rules the bring-forward travel list **W3 scope**; it and the merge sheet shipped
  in this wave's portal lane (`travel-list-pane.tsx:44-56`, `rolodex-picker.tsx`,
  `compare-merge-sheet.tsx`), so they are struck from the "owed to W4" list.
* **§3** lists all **eight** bid columns (`00631:53-62`) — `bid_asked_at`, `bid_quoted_at`,
  `bid_selected_at` were absent — and the backfill table now names the two that ARE written and
  says why `bid_selected_at` is not (r2 B2-3).

## M-3 · a merge stranded the absorbed firm's live agreement links

**Major. Closed.** `00629`.

The three FK columns into `studio_contacts` no repoint reached. Two move unconditionally:

* `studio_trade_agreement_tokens.contact_id` — the one that matters.
  `access_grants_trade_agreement_links()` (00627:199) keys the `agreement_link` grant on it, and
  the company card hands `ReachAccess` exactly one subject id, the survivor's (CR7-2). Unrepointed,
  the survivor's card listed none of the absorbed firm's live links and the card that did key them
  emits no Directory row, so Revoke could not close a door that is still open.
* `agreement_draw_lien_waivers.contact_id` — a pointer beside its own `contact_display_name`
  snapshot, so the record still reads the name it was filed under.

`studio_trade_agreements.contact_id` moves **only while the agreement is a draft**, and the banner
says so. `guard_trade_agreement_authored()` (00579:240-270) freezes it the moment the agreement
leaves `draft`, because the sent paper records who it was sent to and the signature's fingerprint
is computed over those essentials — repointing it would abort every merge of a firm that has ever
sent an agreement, with a refusal in the agreements room's voice on a face in the People room. The
frozen pointer strands nothing: it resolves forward through `resolve_merged_contact()` and still
answers `studio_contact_org()` for the link reader's gate.

**Measured** (`probe60`): token → survivor; draft agreement → survivor; sent agreement → frozen;
`access_grants_trade_agreement_links()` returns the grant with `subject_id` = the survivor; the
merge does not abort. Pinned in block 8.

## QA finding 2 (= code MAJOR-1) · the picker printed the wrong refusal channel and dropped R-Q's job clause

**Major. Closed by deleting the second composer.**
`lib/document/bring-forward.ts`, `components/document/roster/rolodex-picker.tsx`.

`carriedConsentNotice` branched on `optOutSource === "inbound_stop"`, a value
`studio_channel_consent`'s own CHECK can never produce (`verbal | written | web_form |
inbound_sms | other`), so the "by text" branch was dead code and a real inbound STOP fell to the
else: F-12 Pete Rusk's mini row read "Opted out to the studio, 3 Dec 2025." while the Directory
row, the collapsed roster row (R-T) and his person card read "Opted out by text, 3 Dec 2025, on
the Lindqvist kitchen." off the SAME record. R-Q fixes one wording everywhere; W3 had minted a
second composer that disagreed with the first about how a human refused — the fact that decides
whether the studio may ask again.

The function is gone. The picker calls `consentSentence()` — R-Q's one composer — and resolves the
job name off `record.origin_project_id` through `useProjects()`, the same read `roster-row.tsx`
already makes; `originProjectName: null` was hardcoded at the call site.

**The tests that pinned the bug are rewritten**: `bring-forward.test.ts:146,156` asserted against
`"inbound_stop"` and `"studio_recorded"`, neither of which the constraint admits, so both passed
vacuously. They now read every real `ConsentSource` — `inbound_sms`, `verbal`, `written`,
`web_form`, `other` — plus the no-job and no-date cases. `rolodex-picker.test.tsx`'s fixture
carried the same invented token; it now uses `inbound_sms` with an `origin_project_id` and asserts
the full sentence, with a second case for a record naming no job.

---

## Not changed, and why

* **QA finding 2 (MINOR, two "Put back" controls)**, and every other MINOR in the three reviews
  (`m-1`…`m-8`, `m1`…`m10`) — not in the handed-back list.
* **`resolve_merged_contact()` pins no `search_path`** (m-3) — not in the list; every relation in
  it is schema-qualified.
* **No consent table, RPC or frozen `project_parties.sms_consent_*` column is read or written by
  anything in this round** (R-AY): the picker fix reads the RECORD's own
  `opt_out_source` / `opt_out_at` / `origin_project_id` and composes words from them.
* **No new migration number.** 00629 is unapplied on Strata and the whole change belongs inside
  it.

## Files touched

```
supabase/migrations/00629_studio_contact_merges.sql
supabase/tests/people/w3_merge_sweep_household_test.sql          (+ block 8)
supabase/seed/00-legacy-grants.sql                               (regenerated)
packages/supabase/src/database.types.ts                          (regenerated)
packages/supabase/src/hooks/use-studio-contacts.ts
packages/supabase/src/hooks/index.ts
packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts
apps/designer-portal/src/components/document/people/people-room.tsx
apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx
apps/designer-portal/src/components/document/people/__tests__/compare-merge-sheet.test.tsx
apps/designer-portal/src/components/document/people/__tests__/people-room-address.test.tsx
apps/designer-portal/src/components/document/people/__tests__/people-room-nudge-scope.test.tsx
apps/designer-portal/src/components/document/roster/rolodex-picker.tsx
apps/designer-portal/src/components/document/roster/__tests__/rolodex-picker.test.tsx
apps/designer-portal/src/lib/document/bring-forward.ts
apps/designer-portal/src/lib/document/__tests__/bring-forward.test.ts
artifacts/people-room-crm-2026-09-11/build/w3-data-report.md
artifacts/people-room-crm-2026-09-11/build/probe60-r4-merge-fixes.sql
artifacts/people-room-crm-2026-09-11/build/w3-fix-log-r4.md
```
