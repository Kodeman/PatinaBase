# Wave 1 · lane `backend` — adversarial review (re-review after the R17–R21 fixes)

Reviewer: separate context, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
(`git rev-parse --show-toplevel` confirmed), branch `agreement/w1-backend`,
22 commits ahead of `main`, 20 files, +8917 / −27.

> **Note on this file.** This dispatch was labelled "round 2" and named this
> path, so this file is rewritten, following the precedent the previous
> dispatch set in `backend-review-r1.md`. The earlier round-2 review remains in
> git history (`469d1814d`); `-r1.md` and `-r3.md` are untouched on disk.
> Nothing below is copied from any of them — every claim is from a run on a
> scratch database in this session.

---

## Verdict

**fix** — no blocker, three majors, seven minors, eleven nits.

The migration is safe to apply to Strata. Every one of the ten redefined
function bodies was diffed line-by-line against its `grep | sort | tail -1`
winner and every delta is exactly the one §3 names (plus comments). The
fingerprint is byte-identical for parts-less documents, proved against the
00423 body installed side by side. Every `SECURITY DEFINER` pins `search_path`,
every extension function is schema-qualified, the ACLs are right, the ACL seed
regenerates to the committed bytes, the generated types match the schema, and
the file applies twice cleanly.

Round-2's blocker (R17 not implemented) and both of its money-shape majors are
**fixed and proved fixed**. What remains is one newly-found rule divergence
(the R4 DB floor does not read `client_visible`, which R21 requires), the
still-unresolved hook duplication, one cross-lane consequence of composing on
mount, and a tail of unfixed round-2 minors and nits.

---

## Gates run in this review

Scratch DB `patina_w1r`, built per `env.md` from a `pg_dump` of the shared
stack, with a pre-migration control DB `patina_w1base` from the same dump.

| Gate | Result |
|---|---|
| `psql -v ON_ERROR_STOP=1 -f 00575_agreement_parts.sql` | rc=0 |
| same file, applied a **second** time | rc=0 (idempotent) |
| `commercial/agreement_parts_test.sql` | **rc=0**, 19 PASS groups |
| `commercial/agreement_parts_projection_test.sql` | **rc=0**, 5 PASS groups |
| `commercial/multi_studio_signature_test.sql` | **rc=0**, 7 |
| `commercial/design_services_paper_issue_test.sql` | **rc=0**, 14 |
| `schedule/ceremony_hardening_test.sql` | **rc=0**, 15 |
| `edge_api/public_sd_hardening_contract_test.sql` | **rc=0** |
| `commercial/design_services_authority_test.sql` | rc=3 — **identical failure on the pre-00575 control** |
| `commercial/design_services_gap_hardening_test.sql` | rc=3 — identical on control |
| `commercial/authorized_schedule_test.sql` | rc=3 — identical on control |
| `commercial/executed_on_paper_test.sql` | rc=3 — identical on control |
| `commercial/trade_scope_test.sql` | rc=3 — identical on control |
| `pnpm --filter @patina/types type-check` | clean |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/supabase test` | 87 files, 1062 passed / 12 skipped — including `use-agreement-parts` (16) and `use-studio-agreement-defaults` (10) |
| `supabase gen types` from the scratch DB, diffed against the committed file | only the 5 FK-relationship blocks the degraded restore lost; **no schema drift** |
| `python3 scripts/generate-legacy-grants.py` | rewrote the file to the **committed bytes** (`git status` clean) |
| `git status --porcelain` | clean |
| pathspecs | all 20 files inside §2.1; nothing under `apps/` |

The five red suites are all listed in `supabase/tests/KNOWN_FAILURES.md`
(Group 3). I built `patina_w1base` from the identical dump **without** 00575
and each fails at the same line with the same message there, e.g.
`design_services_authority_test.sql:177 ERROR: design services agreement
d5300000-…-000000000001 not found or access denied` on both. No regression is
attributable to 00575 — but they are unproven for this wave and must be run
on a full `supabase db reset` stack before merge (m7).

---

## Probes

### The R17 wall, on a composed draft (round-2's blocker)

```
P2a composed ok partCount=4                      (ceiling 2 400 000 · biweekly · Lead Designer @22500)
P2b refused: sqlstate=23514
    msg=This agreement is composed from parts. Open it in the Contract Room with parts on to change it.
    detail=agreement_composed
P2c terms after: ceiling=2400000 cadence=biweekly rates=1     (untouched)
P3a co-member direct UPDATE proposal_service_terms → 42501 permission denied
P3b table-owner direct UPDATE                     → 23514 agreement_composed
```

All three walls stand: the typed refusal in `upsert_design_services_draft`
(R17 b), `guard_agreement_projection_write` (R17 a) and the withdrawn grant
(R17 c). `has_table_privilege('authenticated', …, 'UPDATE')` on both money
tables is now `f`. Verified no writer exists in `apps/`, `packages/` or
`supabase/functions/` — the three references are `.select()` reads
(`use-commercial-documents.ts:302,307`, `commercial-document-notify/index.ts:363`).

### The fingerprint (criteria A, B, C)

The 00423 body was installed as `public._fp_baseline_00423` and compared
against the live function for every seeded proposal:

```
b0000000-…-0000000cd001 design_services            identical=t has_parts=f
b0000000-…-00000000cb01 design_services            identical=t has_parts=f
b0000000-…-0000000cd002 furnishings_authorization  identical=t has_parts=f
d0c10000-…-0000000000b2 legacy                     identical=t has_parts=f
b0000000-…-0000000cd003 trade_scope                identical=t has_parts=f
   (11 of 11 identical)
```

Coverage, one column at a time on a composed document:

```
position moved · kind moved · variant moved · part_key moved · title moved
payload moved · required moved · client_visible moved
source_template_key moved · source_part_id moved · updated_at UNCHANGED
```

### Freeze, RLS, the client edge

```
Q2b owner UPDATE after send  → 23514 proposal_agreement_parts is immutable after its proposal leaves draft
Q2c owner DELETE after send  → 23514 (same)
Q3  client bundle: parts=2 of 3 saved   keys={id,kind,partKey,payload,position,required,title,variant}
Q4a outsider SELECT parts rows=0        Q4b client SELECT parts rows=0
Q5a outsider upsert_agreement_parts     → 42501 draft proposal … not found or access denied
Q5b outsider materialize_standard_parts → 42501 (same)
```

`sourceTemplateKey` / `sourcePartId` / `client_visible` / timestamps stay
behind the client edge, as §3.10 requires.

### Money typed at the door (round-2's second major)

```
Q7 huge (99 999 999 999) → 23514 that ceiling is larger than an agreement can carry
Q7 fractional (1.5)      → 23514 the ceiling needs an amount in dollars and cents
Q7 string ("2400000")    → 23514 the ceiling needs an amount in dollars and cents
```

The string case is the round-2 bug, now refused. Eight previously-leaking
constraint names are hand-worded and pinned by the suite's PASS 28.

### R5 holds

```
P9  kind='wormhole' variant='quantum' payload={cents:1}  → accepted, ceiling=NULL, no projection
P10 clause keyed patina.ceiling carrying cents=7777777   → ceiling stays NULL
    list keyed patina.deliverables carrying cadence      → cadence stays 'monthly'
```

### Head-body grafting (criterion P)

Every redefined body diffed against its head file. Deltas, in full:

| Function | Head | Delta |
|---|---|---|
| `guard_commercial_authored_child` | 00423 | one `WHEN 'proposal_agreement_parts'` arm |
| `_commercial_document_fingerprint` | 00423 | the conditional `parts` block, alias `ap` |
| `send_commercial_document` | 00423 | rate-card predicate + reworded message + the R4 floor call |
| `_sign_design_services_agreement_authorized` | 00412 | same, + floor call |
| `_issue_design_services_agreement_on_paper` | 00477 | same, + floor call |
| `_countersign_design_services_agreement_impl` | **00566** | one `IS NULL` disjunct |
| `get_project_authority_summary` | 00422 | two NULL-safe reads |
| `classify_project_time_entry_authority` | 00412 | one `IS NULL` disjunct |
| `upsert_design_services_draft` | 00422 | projection extracted + the `agreement_composed` refusal |
| `get_client_commercial_document_bundle` | **00425** | one `parts` key |

No stale graft. `sign_design_services_agreement_with_trusted_ip` (00511, the
one `body_sha256`-pinned public entry point that must not move) is **not**
redefined. The re-pinned hash `8995735d…36bc0b3` verifies: the file passes on
`patina_w1r` and, per the lane's own record, fails on the un-migrated control —
which is what a correct re-pin looks like.

---

## Findings

### Major

**M1 · The R4 DB floor ignores `client_visible`; R21 says it must not.**
R21: *"The R4 floor reads only client-visible money parts (R3-3)."*
`_agreement_floor_unmet` (`00575:304-332`) has no `client_visible` predicate.
Probe, straight through the granted RPC:

```
C1a  rate card clientVisible=true (Lead Designer @22500) + ceiling clientVisible=false (2 400 000)
     → _agreement_floor_unmet = f
C1b  → SENT
C1c  client bundle parts=2  variants={clause,rate_card}      ← no ceiling
C1d  client serviceTerms.billingCeilingCents = 2400000       ← not rendered: the
     composed body renders parts only (commercial-document-shell.tsx:205-207)
```

The homeowner signs a page that names an hourly rate and no cap; the studio
bills against an authority capped at 2 400 000. That is the same two-parties-two-numbers
harm R17 was ruled to close, arriving through the `client_visible` door.
The mirror is a false red: `C2` — a rate card marked `clientVisible=false`
with no ceiling → `23514 an agreement that bills time needs a ceiling`.

The designer lane implements R21 correctly and asks **both** questions
(`readiness.ts:222`, `:259-277`, with a comment naming the divergence), so the
room is safe today and W1's composer mints no `clientVisible:false` part
(`part-kinds.ts:247`). Exposure today is a hand-made RPC payload — which is
precisely what the migration's own comment says this floor exists to stop
("upsert_agreement_parts is GRANTed to authenticated, so this loop is the only
thing standing between a hand-made payload and the money row"). It becomes
UI-reachable the moment W2 adds a visibility toggle.
*Fix:* add `AND ap.client_visible` to both halves of `_agreement_floor_unmet`,
and keep the all-parts question as a second, separately-worded refusal if the
lane wants the stricter DB bar — the room already asks both. Pin C1 and C2 as
SQL cases.

**M2 · Two implementations of the same three hooks still ship.**
`packages/supabase/src/hooks/use-agreement-parts.ts` (228 lines) and
`use-studio-agreement-defaults.ts` (153) plus 542 lines of tests are
**unimported** — `grep` across both portal worktrees finds no import of
`useAgreementParts` / `useSaveAgreementParts` / `useMaterializeStandardParts` /
`useStudioAgreementDefaults` from `@patina/supabase`. The designer portal ships
its own (`use-commercial-documents.ts:561`, `:584`;
`use-studio-agreement-defaults.ts:135`). Round 3 aligned the signatures so this
is now an import swap, which is the right groundwork — but shipping both leaves
two bodies to drift and puts app-local Supabase hooks in a repo whose rule is
`@patina/supabase` hooks for Supabase data (CLAUDE.md). Orchestrator decision at
integration: delete one set, point the composer at the survivor.

**M3 · Opening the Contract Room composes the draft irreversibly, for everyone.**
`materialize_standard_parts` fires from a mount effect with no user action
(`agreement-composer.tsx:104-112`: `useEffect` → `materialize.mutate`). From
that instant the proposal has nine parts, and `upsert_design_services_draft`
refuses for every caller (probe P2b) with no un-compose path anywhere in W1.
The `agreement-parts` flag is a per-person PostHog rollout, so designer A
merely *opening* the room permanently disables Save in the seven-facet room for
co-member B, who never asked for anything. R17(b) ruled the sentence and the
disabled Save; it did not rule that a passive open is the trigger, nor that the
door is one-way. *Fix candidates:* materialize on the first edit rather than on
mount, or let the composer discard parts while the document is still draft.
Cross-lane — for the orchestrator, not the backend lane alone.

### Minor

**m1 · The bundle's `parts` key is still absent on the legacy early-return.**
Probe P6, a legacy `sent` document read by its client:
`keys={document} has_parts=f`. Contract §2.4 freezes it as *"a new top-level
`parts` key, always present, `[]` when the document has none"*, and the
migration's own comment (`:2977-2981`) repeats the claim. The client adapter
defends (`commercial-documents.ts:548` → `?? []`), so nothing breaks at
runtime. Either add `'parts', '[]'::jsonb` to the early return or amend §2.4
and the comment. (Round-2 R5, unfixed.)

**m2 · `materialize_standard_parts` still does not widen `legacy → design_services`.**
Probe P5: `kind BEFORE=legacy → materialized=true partCount=9 → kind AFTER=legacy`.
`upsert_agreement_parts` performs the widen (`:2470-2474`); materialize does
not. Combined with m1, those nine parts are hashed into the fingerprint and
invisible to the client, whose bundle takes the legacy early-return. Either
widen, or refuse to seed a kind outside the three. (Round-2 R6, unfixed.)

**m3 · `useUpdateStudioAgreementDefaults`'s doc comment is wrong about the failure shape.**
It says a non-admin write *"reaches no rows rather than erroring, so the caller
checks the returned row"* (`use-studio-agreement-defaults.ts:110-113`). Probe
P7: a plain active member's INSERT → `42501 new row violates row-level security
policy for table "studio_agreement_defaults"`; the UPDATE reaches 0 rows, and
`.select().single()` on 0 rows throws `PGRST116` — so **both** shapes throw. A
caller written to the comment will not catch it on a studio with no defaults
row yet. (Round-2 R7, unfixed.)

**m4 · A back-dated rate is lost the first time an agreement is composed.**
`v_rates` (`:2607-2620`) builds only `version` / `roleName` / `hourlyRateCents`
/ `sortOrder`, so `_project_agreement_terms` falls to
`COALESCE((v_rate->>'effectiveAt')::timestamptz, now())`. Probe P4 on a rate
seeded `effectiveAt = 2026-01-01` through the seven-facet door, then composed:
`Lead Designer@22500 eff=2026-09-07`. `classify_project_time_entry_authority`
filters authority rates on `effective_at <= NEW.started_at`. Bounded — parts
freeze at send, so no re-stamp after execution — but a studio that back-dates a
rate and then opens the composer loses it silently. (Round-2 R8, unfixed.)

**m5 · The parts table's write grant was withdrawn from `authenticated` — unruled.**
`:193-195` `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER … FROM
authenticated; GRANT SELECT …`. The reasoning in the comment is sound and the
code is stronger for it (verified: `has_table_privilege('authenticated', …,
'UPDATE') = f`, and both portals only `.select()` the table). But it contradicts
build-sheet §3.3 (`GRANT SELECT, INSERT, UPDATE, DELETE`), contract §2's
"RLS: studio read/write", SQL test case 13 ("as the second studio member,
`SELECT` and `UPDATE` a part → both succeed"), and review criterion D, which
expects `check_violation` where a caller now gets `42501`. R17(c) authorised the
revoke on `proposal_service_terms` / `proposal_service_rates`, not on this
table. Needs a ruling or a sheet amendment so the deviation is recorded, not
silent.

**m6 · Two raw casts still escape `upsert_agreement_parts` as `SQLERRM`.**
Probe P8: `sortOrder: "first"` → `22P02 invalid input syntax for type integer:
"first"`; `sourcePartId: "not-a-uuid"` → `22P02 invalid input syntax for type
uuid: "not-a-uuid"`. Neither names a constraint, column or table, so R7's letter
holds and the suite's PASS 28 regex passes — but the designer lane surfaces RPC
error text as the composer's `saveNote` (`agreement-composer.tsx:210-216`), so
these are raw Postgres sentences in the room. Validate `sortOrder` and
`sourcePartId` in the same loop that words the other refusals, or drop
`sourcePartId` from the accepted payload in W1 (it is a W2 column that ships
"nullable and unused" per §1's R1 row).

**m7 · Five of the eleven listed backend gate suites are unproven for this wave.**
`design_services_authority`, `design_services_gap_hardening`,
`authorized_schedule`, `executed_on_paper`, `trade_scope` fail on the scratch DB
— identically on a pre-00575 control built from the same dump, and all five are
in `KNOWN_FAILURES.md`. So nothing here is attributable to 00575, and two of
them (`trade_scope`, `executed_on_paper`) are in the gate list precisely because
they share the fingerprint and the bundle. Integration must run them on a full
`supabase db reset` stack before merge; do not merge on the scratch-DB result.

### Nit

**n1** `SET CONSTRAINTS uniq_agreement_part_position DEFERRED` (`:2477`) is a
no-op — `pg_constraint` shows `condeferrable=t, condeferred=t`. (Round-2 R9.)

**n2** `v_rate jsonb` is still declared and unused in
`upsert_design_services_draft` (`:2011`) after the loop moved into
`_project_agreement_terms`. (Round-2 R10.)

**n3** `REVOKE ALL ON FUNCTION upsert_agreement_parts / materialize_standard_parts
FROM PUBLIC, anon, service_role` (`:2665`, `:2870`) omits `authenticated`,
unlike the 00422 family. Applied ACLs verified identical
(`postgres=X/postgres,authenticated=X/postgres`) — style, not exposure.
(Round-2 R11.)

**n4** The freeze guard still prints the raw table name: probes Q1/Q2b/Q2c all
return `proposal_agreement_parts is immutable after its proposal leaves draft`.
Text inherited verbatim from `00423:440`, and unreachable by `authenticated`
now that the write grant is withheld. (Round-2 R12.)

**n5** Build-sheet criterion E ("deleting a draft proposal cascades cleanly")
does not describe the repo, before or after. On the pre-00575 control,
`DELETE FROM proposals` for a draft design-services proposal →
`23514 proposal_service_rates is immutable after its proposal leaves draft`;
with 00575 the same delete returns the parts-table sentence first. Same class
both sides. Correct the criterion at integration. (Round-2 R13.)

**n6** F-5 stands as ruled: `record_paper_client_signature` keeps its
unrelaxed rate-card refusal, so a composed flat-fee agreement can be sent,
signed, issued on paper and countersigned but its client signature cannot be
recorded from a printed copy. Dark behind the flag; relax in W2.
(Round-2 R14, ruled keep.)

**n7** R20's paperwork is still owed. Build sheet §3.7 step 6 still says
"Derive the projection **by `part_key`**, not by variant" and §6.2 case 7 still
says a second ceiling under a custom key "still no projection from it" — the
opposite of the ruled and implemented behaviour. §2.4 still does not declare
the duplicate-money refusal that R18 makes the composer enforce.
(Round-2 R15.)

**n8** `supabase/tests/commercial/design_services_paper_issue_test.sql` is
modified but is not in the lane's §2.1 pathspec table. Necessary — refusals B
and C were reworded — but the sheet should list it.

**n9** Frozen-interface deviations in the package hooks, all deliberate and
all unruled: `useSaveAgreementParts(proposalId)` / `useMaterializeStandardParts(proposalId)`
bind the proposal at construction where §2.4 froze no-arg factories, and both
invalidate `commercialKeys.all` where §2.4 names `commercialKeys.document(proposalId)`.
Broader invalidation is safe; the signature change is what makes M2's import
swap possible. Record it.

**n10** `CadencePayload` admits `'per_draw'` (contract §2.4) while
`upsert_agreement_parts` refuses it until W3 widens the CHECK
(`billing runs monthly, every two weeks, or at milestones`). Documented
in-migration; a type-legal value the database rejects.

**n11** Criterion O expected "exactly one hex string moved" in
`public_sd_hardening_contract_test.sql`. One hash moved — and the canonical
addendum fixture was also restructured (`RESET ROLE` around a hand-written
`UPDATE proposal_service_terms`, then `SET LOCAL ROLE authenticated` for the
send) because R17(c) took the grant the fixture used. It is a fixture, not a
door, and the pin's `arguments` / `result_type` / `final_config` /
`security_definer` are untouched — but it is more than one line, so name it
rather than letting the integration reviewer read a loosened pin.

**n12 (environment)** The shared local stack is **not** at `00574` as `env.md`
records: `schema_migrations` shows `00575`, `to_regclass('public.proposal_agreement_parts')`
resolves, and `has_table_privilege('authenticated','public.proposal_service_terms','UPDATE')`
is still `t` there — i.e. it carries a *stale* 00575 from before the R17 commit.
Any lane that dumped it for a scratch DB after that point inherited the stale
functions. The integration steward's reset will clear it; recorded so nobody
reads a green from that stack as a green for this branch.

---

## Criteria not exercised here

J, K (flag-off byte-identity snapshots), N's UI half, S, T's UI half, U' (the
Deno notify render) and the e2e criteria belong to the designer and client
lanes and their reviewers. T's DB half was exercised (probe P9: a
`kind='wormhole'` part is accepted, hashed and projects nothing). U (wave
leakage) is clean — the only match for a W2/W3 object name in the whole diff is
the `source_part_id` comment explaining why it has no FK yet. V (vocabulary) is
clean: every `RAISE EXCEPTION` string in the file was read; no "clause
library", no "contract builder", no "variant", no "AI", no column name in any
designer-facing sentence.
