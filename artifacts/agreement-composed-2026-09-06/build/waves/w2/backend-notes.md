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

---

# Round 1 fixes — adversarial review (2026-09-07)

Five findings from `backend-review-r1.md`: two blockers, three majors. All five
addressed. Nothing else was touched.

## B1 · the fingerprint break — `00577` PART 1b

The four `ADD COLUMN`s on `proposal_service_terms` changed
`_commercial_document_fingerprint` for **every existing services document**,
and `_countersign_design_services_agreement_impl` raises `23514` when the
stored client signature's `evidence_fingerprint` disagrees. Every agreement
sitting in `client_signed` on Strata at push time would have become
permanently uncountersignable — and the signature table is immutable, so no
repair migration could have followed.

Fixed **in the same migration**, in the shape Wave 1 used for `parts`: 00577
now re-issues `_commercial_document_fingerprint` from **00575:503 verbatim**
(lineage `00412:704 → 00422:251 → 00423:1214 → 00575:503 → 00577`) with a
single delta — the `serviceTerms` leg drops `fee_basis`, `fee_amount_cents`,
`fee_schedule` and `retainer_credit_rule` from the hashed object while they
stand at their pre-W2 values (three NULL, `retainer_credit_rule = 'credited'`,
the column DEFAULT). Write any one of them and all four ride in the digest, so
a real fee-schedule change still invalidates a stale signature.

The banner's `WHAT THIS FILE DOES NOT DO` bullet asserted the opposite ("a new
COLUMN is covered automatically"). It has been replaced with the reasoning
above; the build sheet's §3.3 claim it inherited is **wrong** and integration
should not re-import it.

Proved by test case (15) in `agreement_fee_schedules_test.sql`, which carries
`pg_temp.fingerprint_00575(uuid, boolean)` — 00575's body with one switch —
and asserts, on a Wave-1-shaped agreement with the four columns unwritten:

- `_commercial_document_fingerprint = fingerprint_00575(id, drop_w2 => true)`
  (the digest a pre-00577 database produced), **and**
- `_commercial_document_fingerprint <> fingerprint_00575(id, drop_w2 => false)`
  (i.e. the unconditional fold really would have moved it — the assertion that
  fails on the un-fixed migration),
- then writes a flat fee and asserts the two comparisons swap,
- then runs the full parts-less rail send → client sign → countersign and
  asserts `newlyExecuted`.

## B2 · raw payload keys, raw cents, raw enum on the keepsake — `00577` PART 4

`_render_agreement_snapshot_html`'s record-only `ELSE` branch iterated
`jsonb_each(payload)` and printed keys and values verbatim
(`dayRateCents | 250000`), the retainer printed `payload->>'creditRule'`
unmapped (`$5,000.00 · non_refundable`), and the attestation branch did the
same. A database column name, a raw stored enum, and a raw integer cents
figure, all on the homeowner's permanent copy.

## M3 · and it drifted from the page she signed

Same function, same fix. The renderer is now leaf-for-leaf what
`apps/client-portal/src/components/agreement-parts-body.tsx` draws, and every
sentence that is not the document's own words is `AGREEMENT_PART_COPY`
(`packages/types/src/agreement-copy.ts`) duplicated as a SQL literal and
pinned by test case (13) — the same twinning the consent sentence already has.

| leaf | before | now |
|---|---|---|
| ceiling, no figure | rendered nothing | `ceilingUncapped` |
| ceiling / flat / retainer at zero | dropped | `notYetSet` |
| flat / retainer with no `cents` key | dropped | `recorded` |
| retainer with a figure | `$5,000.00 · non_refundable` | figure + `agreementRetainerActivation(activationPolicy)` |
| cadence | the bare stored word | word with the underscore opened + `cadenceNote` |
| procurement | `18%` | `18% deposit` + the three notes as a `<dl>` |
| rate card / per-phase with no rows | dropped | `recorded` |
| record-only variants (R9) | raw payload table | `recorded`, title kept |
| attestation | raw definition list | **not drawn** (the client body never draws one) |
| `phases` kind | a `<ul>` of fees | `recorded` (what `PartSection`'s fallback prints) |
| attachment asking acknowledgment | silent | `attachmentAcknowledgment` |

**This departs from build sheet §3.3's renderer sketch**, deliberately and on
the binding vocabulary rule, which outranks it. §3.3 specified the raw-key
record-only table and the attestation definition list that produced B2.

Two differences from the client body are left standing and are **not** drift
in substance — both noted here rather than silently:

- money prints as `$5,000.00` (the sheet's `FM999,999,990.00`) where the
  client body's `Intl` formatter prints `$5,000`. Same figure, different
  precision.
- a rate-card role with an unreadable rate prints `Not yet set` where the
  client body's `?? 0` prints `$0`. R21 forbids printing a zero nobody typed;
  the keepsake does not reproduce that.

## M1 · `compose_agreement_consent` had no authorization — `00577` PART 5

`SECURITY DEFINER`, granted to `authenticated`, and it read any agreement's
composed consent sentence for any signed-in caller. It now asks the **same
predicate `get_client_commercial_document_bundle` asks**, character for
character (`auth.uid()` present AND (`client_id` matches OR
`is_studio_comember(designer_id)`)) — never stricter, so the bundle's call
(the only caller in the tree) passes for exactly the readers it already
admitted. Test case (14): the lead, her co-member and the homeowner all read
the same sentence; a signed-in stranger and an unauthenticated caller both get
`insufficient_privilege`.

## M2 · cross-studio Template leak — `00576` PART 8 + the hook

Two halves, both closed:

- `materialize_agreement_template` now requires the Template's `studio_id` to
  be `NULL` (seeded) or one of the studios that **both** the actor and the
  agreement's lead designer actively belong to — resolved with
  `save_agreement_as_template`'s own query, except that belonging to more than
  one studio is not itself a refusal here; the Template merely has to be one of
  them.
- `useAgreementTemplates` gained `.or('studio_id.is.null,studio_id.eq.<id>')`.
  RLS answers "may this member see it", which for a two-studio designer is yes
  to both Libraries; the filter means the other studio's Templates are never
  offered.

Test case (11) in `agreement_library_test.sql` builds the 00566 two-studio
account — one designer, admin in studio A and studio B — and asserts she can
SEE studio B's Template, cannot materialize it into studio A's agreement, that
studio B's words never reach studio A's part rows, and that her own studio's
Template and a seeded Template both still compose. Verified to FAIL against
the pre-fix function body (reverted onto the scratch DB and re-run:
`ERROR: a Template from another studio must not compose into this agreement`).

## Gates re-run (round 1)

Scratch DB `patina_w2fix`, cloned from the shared stack (Wave 1 head, `00575`)
with `pg_dump --exclude-schema=cron`, rebuilt fresh before the final run.

```
00576 exit=0 errors=0
00577 exit=0 errors=0
exit=0 passes=12  agreement_library_test.sql
exit=0 passes=8   agreement_fee_schedules_test.sql
exit=0 passes=30  agreement_parts_test.sql
exit=0 passes=5   agreement_parts_projection_test.sql
exit=0 passes=13  design_services_paper_issue_test.sql
exit=0 passes=7   multi_studio_signature_test.sql
exit=0 passes=0   public_sd_hardening_contract_test.sql   (asserts silently)
```

`pnpm --filter @patina/supabase type-check` → `tsc --noEmit`, clean.
`pnpm --filter @patina/types type-check` → `tsc --noEmit`, clean.

`python3 scripts/generate-legacy-grants.py` → +6 lines, one new statement
(`REVOKE ALL ON FUNCTION public._commercial_document_fingerprint(uuid) …`
under 00577).

**Types were NOT regenerated this round, deliberately.** No fix changed the
public schema's shape — no column, no table, no function signature — so
`database.types.ts` is already correct. Regenerating from the scratch clone
would have *removed* 92 lines of `Relationships` entries, because several FK
constraints fail to restore into a clone (their data COPY fails first). The
regenerated file was diffed, seen to be a pure regression, and reverted.

**Both pinned hardening manifests are unchanged and still green.** Neither
`sign_design_services_agreement_with_trusted_ip` nor
`_countersign_design_services_agreement_impl` was touched this round, so no
re-pin was needed; `public_sd_hardening_contract_test.sql` exits 0 as proof.

### Pre-existing scratch-clone failures (NOT caused by these fixes)

Six commercial suites fail identically on a pristine Wave-1 clone with no W2
migration applied (`patina_w1base`, same dump, same errors, same line numbers):
`authorized_schedule_test`, `design_services_authority_test`,
`design_services_gap_hardening_test`, `executed_on_paper_test`,
`trade_rfq_test`, `trade_scope_test`. Cause is the clone, not the code — parts
of the dump's data COPY fail on FK order, so fixture-dependent suites cannot
find their seeded rows. The integration steward's `supabase:reset` replay is
the run that gates these.

### Still not verified by this lane

Everything under "Not verified by this lane" above still stands. Additionally:
`useAgreementTemplates`'s new filter has no unit test — `packages/supabase`
carries no jest/vitest harness — so it is covered by the SQL half (the RPC
refusal) plus the designer lane's picker walk.
