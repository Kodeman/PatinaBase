# Wave 2 — BACKEND lane notes

Date 2026-09-07. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-backend`,
branch `agreement/w2-backend`, base `a6584dbc5` (+ the T0 types commit `68532c2a1`
already on the branch when this lane started).

## Migration numbers

Re-swept every local ref (`git for-each-ref` × `git ls-tree -- supabase/migrations`)
before writing: the highest number anywhere is `00575_agreement_parts.sql`. So
**00576** and **00577**, exactly as `env.md` minted. The build sheet's §3.0
guess (00577/00578) assumed W1 would consume two numbers; it consumed one.

## Two deviations from the build sheet, both on a ruling that outranks it

1. **The seeded `patina.design_services` template seeds NO money the designer
   did not type.** The sheet's §3.2 inline bodies state `depositPercent: 50`
   and a retainer of `cents: 0`. R28 (and R3-5 before it) rules that nothing
   the designer did not type prints as a term, and says so of *every seeded
   money part* — W1 removed both from `materialize_standard_parts` for exactly
   that reason (00575:3244-3262). Both are seeded **unset** here, so the
   composed page prints "Not yet set" (R21) until she states them. The cadence
   stays `'monthly'`: R28 as amended calls a cadence chosen, because its editor
   shows Monthly preselected on every road in. Asserted in
   `agreement_library_test.sql` case 10.

2. **No FK from `proposal_agreement_parts.source_part_id` to
   `studio_agreement_parts(id)`**, although 00575's column comment anticipated
   one. That table carries `guard_commercial_authored_child`, which refuses
   every UPDATE once the proposal leaves draft — so `ON DELETE SET NULL` would
   make deleting a Library part *raise* on any studio that has ever sent an
   agreement composed from it, and `ON DELETE CASCADE` would silently remove a
   part from an executed instrument. It stays a soft pointer, the same shape
   `proposal_boards.source_board_id` keeps. Reasoned in the 00576 banner;
   `agreement_library_test.sql` case 8 pins the behaviour that replaces it (a
   deleted Library part is skipped, the template does not brick).

Two smaller completions, both named in the migrations:

- **List item ids are re-minted after the scrub.** The sanitizer's key list
  (binding, §3.2) includes `id`, and `ListItem.id` is required in
  `@patina/types` — W1's `materialize_standard_parts` mints one per seeded
  item. `_agreement_restore_list_item_ids` restores that invariant on the way
  out of `materialize_agreement_template`, so the room's list editor is never
  handed items without ids.
- **The sanitizer strips both spellings.** The sheet's list is snake_case;
  agreement payloads are camelCase domain objects (`proposalId`, `studioId`,
  `createdBy`). Both spellings of every key are stripped. Pinned at three
  depths in `agreement_library_test.sql` case 6.

## Grafts — every body from the grep winner, and W1 re-headed four of five

`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`:

| Function | Sheet said | grep winner | Grafted from |
|---|---|---|---|
| `upsert_agreement_parts` | W1's migration | `00575:2623` | 00575 |
| `_sign_design_services_agreement_authorized` | 00412 | `00575:915` | **00575** |
| `_countersign_design_services_agreement_impl` | **00566** | `00575:1302` | **00575** |
| `get_client_commercial_document_bundle` | W1's migration | `00575:3393` | 00575 |
| `sign_design_services_agreement_with_trusted_ip` | 00511 | `00511:1825` | 00511 |

**The countersign one matters.** Grafting from 00566, as the brief and the
sheet both said, would have silently reverted F-2's `IS NULL` disjunct in the
addendum promotion loop and parked every billable hour on an uncapped
agreement — the 00199-reverts-00185 failure mode the skill names. §3.4's rule
("every redefinition starts from the grep winner, not from memory") is what
settled it.

Mechanically grafted: `build_00577.py` (scratchpad) extracts each head body
verbatim by name, applies each delta as an exact anchored substring
replacement, and **hard-fails if an anchor matches anything but once** — so no
delta can silently no-op. It also asserts, before writing, that the countersign
body still contains `'commercialDocumentId'` and the verbatim
`app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date, v_actor )`
fragment the hardening test matches.

## The overload hazard

Three old arities DROPped before the wider bodies, ACLs re-issued after:

```
DROP FUNCTION IF EXISTS public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public._sign_design_services_agreement_authorized(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.upsert_agreement_parts(uuid, jsonb);
```

Probed after apply — exactly one row each:

```
_sign_design_services_agreement_authorized|1
sign_design_services_agreement_with_trusted_ip|1
upsert_agreement_parts|1
```

## The two pinned hashes, re-pinned in the same change

Recomputed on a single clean application (not on the twice-applied scratch DB —
confirmed identical on both):

| Row | Old | New |
|---|---|---|
| `sign_design_services_agreement_with_trusted_ip` → `(uuid,text,uuid,text,jsonb)` | `6c615ca4…f17d` | `8539825f7dc69971ae5ab3ec81c7e86d7b663f7beea5133fb4cbe010fd7f0288` |
| `_countersign_design_services_agreement_impl(uuid,text,jsonb)` | `8995735d…c0b3` (00575's) | `a5c8dfec6d6798dc7bc8c2ab0f0ac71f97b715536a33be466f65ab0840e9221b` |

Counts unchanged (17 public, 9 dependency). The bare signature literal in the
"sign/accept siblings" assertion moved to the widened arity — the sheet cites
`:2332`; W1's re-pin comments had pushed it to `:2341`. Each re-pin carries a
comment in the 00566 house style naming the previous hash and what moved.

The invoice-caller universe is unchanged — probed directly, six routines, all
pre-existing:
`_countersign_design_services_agreement_impl`, `_execute_furnishings_authorization_authorized`,
`_execute_furnishings_authorization_on_paper_authorized`, `_execute_trade_scope_authorized`,
`_execute_trade_scope_on_paper_authorized`, `issue_trade_draw_invoice`.

## One existing test amended, and why it is not a weakening

`supabase/tests/commercial/agreement_parts_projection_test.sql`'s
`pg_temp.terms_shape` now subtracts the four Wave-2 columns before comparing
the seven-facet room's terms row against a composed one.

R19 asks that both doors write one indistinguishable money row. The four new
columns are **parts-only**: `upsert_agreement_parts` is their only writer, the
seven-facet room has no field for any of them, and
`upsert_design_services_draft` passes none. So a rate-card composition writes
`fee_basis = 'hourly'` where the same seven facets leave it NULL — by
construction. Comparing them would ask the flag-off door to author a Wave-2
concept it cannot see, and **no** composition could satisfy it. All nine W1
columns are still compared, which is the fork that file exists to catch, and
the four are pinned on their own terms in `agreement_fee_schedules_test.sql`
cases 3 and 5. Reasoned in the test file itself, not only here.

## Not done, deliberately

- `supabase/functions/proposal-send/handler.ts` — **untouched.** The sheet
  (§10) and contract §5 both make the part-title email listing optional and
  assign it conditionally; nothing in the sheet requires it, so no edge
  function changes and no `_shared/*` edit. Deno tests not run because no Deno
  file moved.
- No `create_service_addendum` redefinition (P7 composes after it returns,
  through `copy_agreement_parts_from_authority`).
- No `per_draw`, no `design_build`, no `patina.design_build`, no attestation /
  jurisdiction / trade-agreement table, no new `issue_invoice_for_actor`
  caller, no PDF, no template composition editor. Grepped the diff for all of
  them.
- No fingerprint edit: `_commercial_document_fingerprint` hashes the terms row
  as `to_jsonb(t)`, so a new *column* is covered automatically. Neither new
  table is hashed — the history is the studio's own log, and the snapshot is
  written after the fingerprint it records.

## Gates

Validated on **scratch databases**, never the shared stack. Recipe: `pg_dump -Fc`
of the shared `postgres` (head 00575, Wave 1 applied) → `pg_restore` into
`patina_w1` / `patina_base` / `patina_final`. All three dropped at the end;
shared stack re-confirmed at head 00575 with `to_regclass('public.agreement_templates')`
returning NULL — untouched.

Final pass was a **clean single sequence** (`patina_final`): restore → apply
00576 → apply 00577 → run everything.

```
--- apply 00576 ---  exit=0   (only "policy … does not exist, skipping" notices)
--- apply 00577 ---  exit=0   (only "trigger/policy … does not exist, skipping" notices)

OK   commercial/agreement_library_test.sql                      11 PASS
OK   commercial/agreement_fee_schedules_test.sql                 5 PASS
OK   commercial/agreement_parts_test.sql                        30 PASS
OK   commercial/agreement_parts_projection_test.sql              5 PASS
OK   commercial/multi_studio_signature_test.sql                  7 PASS
OK   commercial/design_services_paper_issue_test.sql            13 PASS
OK   schedule/ceremony_hardening_test.sql                       15 PASS
OK   edge_api/public_sd_hardening_contract_test.sql              0 PASS   (assert-only file, exit 0)
```

(The two new files' "PASS notice" counts are lower than their case counts
because several numbered cases share one `RAISE NOTICE`; all 10 Library cases
and all 12 fee-schedule cases assert.)

```
pnpm --filter @patina/types    type-check   → clean, no output
pnpm turbo build --filter=@patina/types     → 1 successful, 1 total
pnpm --filter @patina/supabase type-check   → clean, no output
pnpm --filter @patina/supabase test         → 87 files, 1068 passed | 12 skipped
```

Types: regenerated with `supabase gen types typescript --db-url <scratch>`.
`packages/supabase/src/database.types.ts` — **334 insertions, 1 deletion**; the
single deletion is the dropped 2-arg `upsert_agreement_parts` overload. A fresh
regeneration against the clean `patina_final` is **byte-identical** to the
committed file (`diff -q` clean).

ACL seed: `python3 scripts/generate-legacy-grants.py` → baseline + 2262 replayed
statements, 212 insertions / 44 deletions. The deletions are the three stale
4-arg `sign_design_services_agreement_with_trusted_ip` /
`_sign_design_services_agreement_authorized` statements the DROPs retire.
⚠ The regeneration also picked up **Wave 1's** grants
(`materialize_standard_parts`, `discard_agreement_parts`,
`get_client_commercial_document_bundle`, the parts table) — meaning W1 shipped
without re-running the generator. Now correct on this branch; worth a note at
integration.

## Pre-existing reds, proven identical before and after

Four suites the sheet lists as "must still pass" fail on the **W1 baseline**
with byte-identical errors (`patina_base`, before either migration):

```
commercial/design_services_authority_test.sql       rc=3
commercial/design_services_gap_hardening_test.sql   rc=3
commercial/authorized_schedule_test.sql             rc=3
commercial/executed_on_paper_test.sql               rc=3
```

All four are already documented in `supabase/tests/KNOWN_FAILURES.md`
(lines 83-86) as Group 3 fixture drift. Not this wave's, unchanged by it.
Note their observed message here (`countersign … not found or access denied`)
differs from the message KNOWN_FAILURES records (`designDisposition`), because
the scratch DB carries the shared stack's seeded rows; the failure is the same
family either way, and identical on both sides of this change.

## Scratch-DB caveat, recorded

The shared stack's own data violates four of its FKs (a `profiles` row was
removed under a membership that survived), so `pg_restore` could not re-create
`organization_members_user_id_fkey`, `user_roles_user_id_fkey`,
`invoice_links_created_by_fkey`, `invoice_links_invoice_id_fkey` or
`engagement_events_user_id_fkey`. A guard trigger (`guard_org_membership_changes`,
`last_owner_protected`) refuses the orphan cleanup. They were re-added `NOT
VALID` on the scratch DBs so the generated types are faithful to a real
database — without that, the types diff wrongly *deleted* five Relationships
blocks. Worth a look on the shared stack at integration; it is not this
wave's to fix.

## Handoff — the frozen interfaces the other two lanes code against

All shipped exactly as §2 froze them. RPCs:

```sql
public.save_agreement_part(p_studio_id uuid, p_part jsonb)            -> studio_agreement_parts
public.save_agreement_as_template(p_proposal_id uuid, p_title text)   -> agreement_templates
public.materialize_agreement_template(p_proposal_id uuid, p_template_key text) -> integer
public.compose_agreement_consent(p_proposal_id uuid)                  -> text   (STABLE)
public.upsert_agreement_parts(p_proposal_id uuid, p_parts jsonb, p_why text DEFAULT NULL)
public.copy_agreement_parts_from_authority(p_proposal_id uuid, p_why text DEFAULT NULL) -> integer
public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid, p_signed_name text, p_client_id uuid,
  p_signed_ip text DEFAULT NULL, p_consent jsonb DEFAULT NULL)        -- service_role only
```

Hooks, in `@patina/supabase` (`main → ./src/…`, so edits are live):
`useAgreementTemplates(studioId)` `['agreement-templates', studioId]` ·
`useStudioAgreementParts(studioId)` `['studio-agreement-parts', studioId]` ·
`useSaveAgreementPart` · `useSaveAgreementAsTemplate` ·
`useMaterializeAgreementTemplate(proposalId)` · `useRenameAgreementTemplate(studioId)` ·
`useDeleteAgreementTemplate(studioId)` · `useDeleteStudioAgreementPart(studioId)` ·
`useCopyAgreementPartsFromAuthority(proposalId)` ·
`useAgreementPartEvents(proposalId)` `['agreement-part-events', proposalId]`.
Every mutation that moves a composition invalidates the parts key, the event
key, `commercialKeys.all` and `['proposal', proposalId]`.

Bundle additions, on the main return (the retired-`legacy` early return is
untouched):

```jsonc
"consentSentence": "…",                 // compose_agreement_consent at read time
"executionSnapshot": { "html": "…", "documentHash": "<64 hex>", "createdAt": "…" }
                                        // null until countersign
```

⚠ **For the client lane:** `executionSnapshot` deliberately does **not**
project `partSet` — the homeowner reads the HTML she was given, not the
studio's row shapes.

## Not verified by this lane

- No portal type-check, jest, e2e or admin build (no `apps/**` file touched;
  the designer and client lanes own those gates). `packages/**` changed, so
  `pnpm --filter @patina/admin-portal build` is still owed at integration.
- No `pnpm supabase:reset` — the shared stack belongs to the integration
  steward, and this lane validated on scratch clones instead. A reset replay
  including the regenerated ACL seed is owed there.
- Nothing applied to Strata. No `db push`, no `functions deploy`, no wrangler.
- The R12 snapshot HTML has been asserted for content (every client-visible
  title present, no studio-only title or body) but never *rendered in a
  browser*. The keepsake's appearance is the client lane's walk.
