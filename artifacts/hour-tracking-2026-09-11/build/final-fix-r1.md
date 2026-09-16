# Integration fix round 1 — hour tracking

Branch `hour-tracking/integration`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`.
Head `5ee33101f`, pushed. Five commits on `944e12a5c`.

Local DB throughout: the isolated **patina-hours** stack (Postgres
`127.0.0.1:54422`). `supabase --workdir …/agent-integration db reset` was run twice;
54321/54322 were never touched.

**No iOS work.** No finding names `apps/mobile`, so `hour-tracking/ios` was not
fast-forwarded, `generate_project.rb` / `capture-gate.sh` were not re-run, and no
`chore(time): merge ios fixes` commit exists. W6 is unchanged from the tip the W7
gate already measured.

---

## Disposition

| Finding | Disposition |
|---|---|
| MS-01 (blocker) | **FIXED** — new migration `00617`, hooks split, composer surface, test case (e) |
| MS-02 (blocker) | **FIXED** — gate in `00603` + `00615` (head body), contract test green, not allowlisted |
| MS-03 (blocker) | **FIXED** — manifest hash + paragraph, contract file green |
| MS-04 (major) | **FIXED** — both exporters |
| MS-05 (major) | **PARTLY CLOSED** — a verified read-only preflight exists and is wired into the checklist; the Strata numbers themselves could not be read this session |
| MS-06 / W7-R6-04 (major) | **NOT CLOSED** — PostHog MCP still refuses; the gate stands |
| S-1 (major) | **FIXED** — one choice, a switch, a count in the caption |
| S-2 (major) | **FIXED** — one studio identity across the three surfaces |
| S-3 (major) | **ALREADY RECORDED** — no code change needed |
| S-4 (major) | **ALREADY RECORDED** — no code change needed |
| n7-05 (major) | **FIXED** by S-1 + S-2 |

---

## MS-01 — an hour nothing priced never reaches an invoice

Commit `081a7242e`.

**It could not be fixed where the finding pointed.** The finding asks for
`te.rate_source` on `project_unbilled_time` (00596) and the claim predicate in
`claim_time_entries` (00595). Both migrations sit **below 00600**, which is where
`project_time_entries.rate_source` is added. Measured: folding the predicate into
00595 fails the reset with
`column "rate_source" does not exist (SQLSTATE 42703)` at 00595 statement 4. So the
delta moved to **`00617_rate_pending_never_invoiced.sql`** — a number this program
had deliberately left unused, the first free one after the whole rate chain
(00598-00601, 00615, 00616) exists. Both bodies are the head bodies verbatim with the
delta grafted, and 00596's four structural invariants (no `change_order_terms`, no
`profiles.default_hourly_rate_cents`, `profiles` not joined at all, `projects` join
kept) are re-asserted there because 00617 rewrites the body they were proved on.

Three changes, as asked:

1. **`project_unbilled_time` carries `rate_source` and `rate_role`**, appended last
   so `CREATE OR REPLACE VIEW` holds. Asserted on the catalog
   (`information_schema.columns`), not on the view text.
2. **The portal keeps them off the tickable set and says why.**
   `isRatePendingTimeEntry` is exported from `@patina/supabase`;
   `useUnbilledTime` now returns `{ entries, ratePendingEntries, … }` — the split is
   in the hook, not the component, so no caller can tick one. The composer prints the
   held-back rows disabled, `rate pending` in both the rate and the amount cells, with
   `set the studio rate →` beneath — the HT-26 shape, which is also the studio's cue
   to fill the rate card. Dropping them silently would have read as the hour going
   missing. `useStudioUnbilledTime` drops them too, so the Desk stops offering
   "hours to bill →" for a studio whose only unbilled hours are unpriced, and the ids
   `hours-ledger`'s `billingTargetRows` hands the composer can no longer be refused by
   the RPC (which would delete the draft it had just created).
3. **Server backstop:** `AND rate_source IS DISTINCT FROM 'none'` in
   `claim_time_entries`. `IS DISTINCT FROM`, not `<>`: a NULL `rate_source` is a
   pre-00600 legacy row carrying a real snapshot and stays claimable — the same line
   the ledger, the CSV export and `timeRateProvenance` already draw.

**The claim test's own fixture was measuring an unpriced hour.** Its project carried
no studio, so all three entries resolved `rate_source='none'` and cases (a)-(c) went
green on rows the RPC should never have claimed. The fixture now names a studio, seats
the designer as its owner and gives her a `studio_member_rates` row; new **case (e)**
logs an hour for a member the studio does not price and asserts the four preconditions
that matter (billable, `billing_state` admits it, `rate_source = 'none'`, rate NULL),
that `project_unbilled_time` still **shows** it carrying the provenance, and that the
claim returns nothing and stamps nothing.

## MS-02 — the studio stamp binds only a designer-domain lead

Commit `59927923f`. Confirmed exactly as reported: `public_rpc_authorization_
contract_test.sql` failed at `:171`.

The gate is `public.has_designer_domain_role(NEW.designer_id)` — 00511:2266's own
condition. **It had to go in two files.** 00603 is where the finding points, but
`grep -rln "CREATE OR REPLACE FUNCTION public.set_project_studio_id_owned"` returns
00602, 00603 **and 00615**; 00615 is the head and was serving the live body, so the
00603-only edit left the gate absent on the stack (measured: `pg_get_functiondef(…) ~
'has_designer_domain_role'` returned `f` after the reset). Both files now carry the
gate and both assert it in their postconditions. **The assertion was not moved and not
allowlisted.**

**Fixture cost, stated plainly.** `time_rate_resolution_test.sql` modelled a designer
with `is_designer` ALONE — no `user_roles` row — so under the repaired stamp every
project it creates stayed `studio_id` NULL and the suite failed at (a1). Its leads now
hold the designer-domain role production gives them. The grant is **not inert**:
`sync_is_designer_from_role` flips `profiles.is_designer`, which fires 00295's
`provision_studio_on_designer`, which provisions a workspace for a user with no
membership at all. So:

* where the lead is already seated, a plain `INSERT … ON CONFLICT DO NOTHING` — 00295
  early-exits and her tiers are untouched;
* where the case's whole point is an **empty tier** (case (y)'s "designer who owns no
  studio"), the new `pg_temp.grant_designer_role_no_workspace` grants the role with
  00295's trigger held off for that one statement, so the case keeps the standing it
  names instead of gaining an OWNED tier of one.

**Case (y4) moved from behaviour to the catalog, and this is worth reading.** It used
to clear 80e1's `studio_id` and assert the column stayed NULL. That only held because
the fixture's lead held no designer role: `set_project_studio_id` (00511 → 00563)
**does** fire on UPDATE and re-derives a NULL `studio_id` for a designer-domain lead in
exactly one studio. With the leads production-shaped, the clear is refilled — by
00511's trigger, not 00602's — and the old assertion would have blamed this program.
y4 now asserts the event mask (`tgtype & 16 = 0`), which is the honest statement of
"INSERT only" and the same assertion 00603's own postcondition makes.

**Out of scope, flagged not changed:** `00620`'s one-off legacy stamp calls
`designer_tier_pricing_studio` directly and asks the same question of nothing. The
finding scopes MS-02 to the INSERT trigger against 00511's INSERT-time refusal, and
changing 00620's predicate would move the very numbers MS-05 asks to be measured
first. **Orchestrator ruling wanted:** does "a non-designer lead is never auto-derived
a studio" bind the legacy backfill too?

## MS-03 — the countersign body is re-registered

Commit `bf382bd58`. Confirmed exactly as reported (`:2424`). Manifest row now pins the
live `33af21f76ae82453a95a5cbbf8908d07e9cc4df02e09f82dc69dcd2a5786dc6a` and carries
the paragraph in the established shape: what 00619 changed (the `roster_role` carry
into the one `project_billing_authority_rates` INSERT inside the client_signed branch),
that it takes **no new lock**, and that signature / arguments / result type /
proconfig / prosecdef / ACL and the `issue_invoice_for_actor` call site and
`'commercialDocumentId'` anchor are all unchanged.

## MS-04 — CSV formula injection

Commit `3385a683a`. Both `time-export.ts` and `qbo-export/index.ts`.

**One deliberate departure from the suggested one-liner.** The finding's
`/^[=+\-@\t]/.test(s)` would apostrophe-quote `-145.00`, turning a bookkeeper's money
cell into text — `qbo-export` puts `row.line_amount.toFixed(2)` through the same
function, and a credit line is a real shape. The guard therefore exempts a plain signed
number (`/^[+-]?\d+(\.\d+)?$/`). Every formula that starts with `-` needs an operator,
a function name or a cell reference beyond digits, so nothing is let through; there is
a test for the negative-number case beside the three injection cases.

## MS-05 — the legacy-stamp cost

**Partly closed, and I will not overstate it.** I could not run SQL against Strata:
the CLI's cached credential lives in the OS keychain and `supabase db` exposes no
query subcommand. `supabase migration list --linked` (read-only) does connect, which is
the only prod contact this session — no mutation of any kind.

What exists instead is
**`artifacts/hour-tracking-2026-09-11/build/ms-05-strata-legacy-stamp-preflight.sql`**:
one SELECT, no writes, no functions, pasteable into the Supabase SQL editor before the
push. It **cannot** call 00620's helpers, which do not exist on Strata until the push,
so `designer_tier_pricing_studio`, `project_author_books_elsewhere` and
`project_roster_books_elsewhere` are transcribed inline.

**The inlining is verified, not assumed.** Run on the isolated stack against the real
functions over a constructed fixture covering all four discriminating shapes
(employer / owned-clean / owned + roster-elsewhere / owned + author-elsewhere) plus an
ambiguous employer tier, both forms agreed exactly on all five counts
(`1 / 1 / 6 / 1 / 1`). On the untouched stack both read
`5 null · 0 employer · 0 owned · 5 ambiguous · 0 roster · 0 author` of 6 projects —
which reproduces the finding's own local measurement.

`ship-checklist.md` gains **§1②a** with the query, a blank table for the seven values,
and the instruction the finding asks for: read `left_null_ambiguous` first, and if it
is large tell Leah **before** the ship. MS-01's fix means such an hour can no longer
reach an invoice at $0.00 — but it still cannot be billed until somebody stamps the
project or fills the rate card, so the number still matters.

## MS-06 / W7-R6-04 — the two flags

**NOT CLOSED.** `mcp__plugin_posthog_posthog__exec` still answers
`MCP server "plugin:posthog:posthog" requires re-authorization (token expired)`,
matching the standing owed item in project memory. Neither `agreement-parts` nor
`studio-workspaces` has a live reading. The only repo evidence is a stale
field-companion device pass listing nine flags **not** including `agreement-parts`,
which predates the Agreement-Composed ship and proves nothing either way.

The checklist's §2.1 gate stands and is now marked **STILL OPEN after integration
round 1**. Do not push on the assumption either flag is live.

## S-1 / S-2 / n7-05 — one studio identity, and a door to the other one

Commit `5ee33101f`. Both measurements reproduced from the findings; the fix is one
mechanism, not three.

The pick is a **choice** now, held in a module-level store
(`useSyncExternalStore` + a wrapped `localStorage` key) rather than in any component,
because the three surfaces must answer the same question the same way:

* `useViewerStudio` — the Hours lens, the rollup, the member scope, the stamp door;
  now returns the ordered `candidates` and `selectStudio`.
* `useInternalTimeStudio` — an internal hour's **permanent** `studio_id`; follows the
  same choice when it names a studio she may log internal time in.
* `useAccountStudio` (new) — HT-3's rate card. `AccountStudioPage` consumed
  `orgs?.find(…) ?? orgs?.[0]`, an unordered read with no `.order()` at all; it now
  takes the owner/admin answer the Hours surfaces take, falling back — **ordered** —
  to the page's original resolution for a plain member, who chooses nothing.

A stale or absent choice falls back to `candidates[0]`, which is the pre-S-1 answer.
The rollup caption's studio name becomes a Scored-Ink word reading `<name> (1 of 2)`
that cycles; the Account page header carries `studio 1 of 2 · switch`. Both appear only
when there is more than one candidate, so a single-studio viewer sees exactly today's
caption. `localStorage` is wrapped in try/catch at every access.

No ruling is now required to ship. Kody's walk should still read the switch
(checklist §4.1 already asks for it).

## S-3 and S-4 — already recorded, verified

Both findings' fixes are documentation, and both were already written into
`ship-checklist.md` by the reviewer who raised them:

* **S-3** — §1③ deploys `client` before `designer`, with the raw-JSON reason stated.
* **S-4** — §1② requires ONE `supabase db push --include-all` in version order, with
  the two `pg_get_functiondef(…) like '%roster_role%'` probes immediately after.

I confirmed both are present and left them alone. §1② gains two more probes (MS-01's
view columns and claim predicate, MS-02's gate) and §1②a is inserted before it.

---

## Gates run, and what they said

All SQL on `127.0.0.1:54422`.

| Command | Result |
|---|---|
| `supabase --workdir …/agent-integration db reset` | clean, all migrations incl. `00617` |
| `psql … -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **exit 0** (was: ERROR at :171) |
| `psql … -f supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | **green** (was: ERROR at :2424) |
| `psql … -f supabase/tests/billing/time_claim_atomicity_test.sql` | **green**, cases (a)-(e), "All assertions passed" |
| `psql … -f supabase/tests/billing/time_rate_resolution_test.sql` | **green**, 41 cases, "All assertions passed" |
| `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422` | 188 total · 163 green · 22 expected-fail · **3 unexpected** (below) |
| `python3 scripts/generate-legacy-grants.py` | 2650 statements, seed regenerated and committed |
| `pnpm db:generate` | diff is `rate_role` + `rate_source` on `project_unbilled_time` and nothing else |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **581 suites / 7444 tests passed** |
| `pnpm --filter @patina/supabase test` | **102 files / 1259 passed**, 12 skipped |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 pre-existing warnings |
| `deno check … supabase/functions/qbo-export/index.ts` | clean |
| `git push origin hour-tracking/integration` | `944e12a5c..5ee33101f` |

### The three unexpected SQL failures are not this program's

Each was checked against the branch's own migration diff
(`git diff --name-only origin/main...HEAD -- supabase/migrations`), and none of
`00595-00620` defines any object they test.

1. **`edge_api/catalog_roles_remote_conformance_negative_test.sql`** — an *isolated-stack
   artifact, not a defect*. The file hard-refuses any port but the default:
   `:'PORT' = '54322'`, else `SELECT 1 / 0`. It will pass on the ordinary stack.
2. **`proposals/proposal_copy_immutability_test.sql`** — proposals column census drift on
   `subject`, added by `00590_engagement_subject.sql:37`, which is on `origin/main` and
   was merged in. Pre-existing on main.
3. **`capture_enrichment/target_type_visibility_test.sql`** — `capture_enrichment_runs`
   co-member visibility (policies from 00514/00515). No migration in this program
   defines a policy on those tables; the only `field_capture` string in the range is a
   jsonb payload inside 00613's grafted body.

I did **not** add any of these to `KNOWN_FAILURES.md` — that is the orchestrator's call,
and (1) in particular should simply be re-run on the default stack.

---

## Open, for the orchestrator

1. **MS-06 / W7-R6-04 is the one hard pre-ship gate still open.** `agreement-parts` and
   `studio-workspaces` rollout percentages, in the PostHog UI or with the MCP token
   restored. Do not push on an assumption.
2. **MS-05's seven Strata numbers** — the query is ready and verified; somebody with the
   SQL editor open must run it before `db push` and write them into §1②a.
3. **Does MS-02's rule bind `00620`?** The legacy backfill still applies the tier rule to
   any lead. Changing it moves MS-05's numbers, so it was left alone deliberately.
4. **The checklist's migration list changed:** `00617` is now applied and only `00609`
   is unused.
5. `run-sql-tests.sh` also notes *"1 known-failure file now passes — consider removing
   from KNOWN_FAILURES.md"*. Not touched.
