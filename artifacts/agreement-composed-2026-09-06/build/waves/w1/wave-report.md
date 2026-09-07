# Wave 1 — integration report (round 2)

**The Agreement, Composed** · Wave 1 (*loosen the room*) · 2026-09-06
Steward: integration lane.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`)
Branch `agreement/w1-integration` · **code head
`b2a9e68f94cc590ec77c218dc3ca992d4c498303`** (the docs commit carrying this
file sits directly on top of it and touches nothing outside
`artifacts/agreement-composed-2026-09-06/build/waves/w1/`).
Merged over `origin/main` **`3a9472f92d6fd3348e7257c95a8042c1c007447c`**.

**81 files changed, +24,327 / −225** (61 files / +16,568 / −225 excluding the
program docs under `artifacts/`).

> **Gate-green. Every gate in §4 and §5 passes**, including the two e2e reds the
> first integration could not clear: `direct_order_attribution_test.sql` is now
> PASS on a correctly-reset stack, and `threshold.spec.ts:158` is green under
> `TZ=UTC`. The only red left in the whole run is `threshold.spec.ts:221`, and
> it fails **identically on a `origin/main` checkout** (§5.2) — demonstrated,
> not argued.
>
> **No open blocker.** All three lanes' latest adversarial reviews return
> *fix — no blocker* (backend r4 line 17, client r5 line 347, designer r3 line
> 327). The majors ride as advisories (§7) per the program rule.

---

## 1 · Why there is a round 2

The first integration (`3fbe506a6`) merged each lane's **round-3** head. All
three lanes then advanced: backend through round 4 (the R17 walls,
`discard_agreement_parts`, the adopted package hooks), designer through its
independent adversarial review (R18's Add-menu rule, readiness reporting the
duplicate, "a money field left empty stays empty"), client through rounds 4 and
5 (`composed` on the bundle, "an amount nobody wrote is unwritten"). `main` also
moved one docs commit, `4c0b7b17b → 3a9472f92`.

So this branch re-merges: `main`'s new tip first, then the three current lane
heads on top of the round-3 merges already in the branch.

## 2 · The merges

| Order | What | Head merged | Merge commit | Conflicts |
|---|---|---|---|---|
| 0 | `origin/main` tip | `3a9472f92` | `834b273cc` | none |
| 1 | `agreement/w1-backend` | `74b5f2dec` | `1d7e97907` | none |
| 2 | `agreement/w1-designer` | `0bcf667bb` | `64175f977` | none |
| 3 | `agreement/w1-client` | `5071a3cd7` | `0e7465846` | none |

Subjects are `chore(agreements): merge w1-<lane>` exactly (and
`chore(agreements): merge main into w1-integration` for the tip). No `merge(...)`
subject, no trailers.

The lane-state shas are ancestors of the heads merged
(`git merge-base --is-ancestor` → yes for both named shas), so the merged code
is the reviewed code. Each lane head is one docs commit past its named sha —
`backend-review-r4.md` and `client-review-r5.md` respectively; the designer lane
was not given a sha in the lane state and was merged at its branch head.

## 3 · The one thing integration had to fix, and why it counts as a conflict

`git merge` reported zero textual conflicts. It also produced a tree that did
not compile:

```
@patina/types:build: src/index.ts(138,15): error TS2307:
  Cannot find module './agreement-copy' or its corresponding type declarations.
```

**Cause.** The designer lane's `e8ce0e27c` ("the Add menu offers no second
ceiling…") carries an incidental 100 %-similarity rename that nothing else in
that commit is about:

```
R100  packages/types/src/agreement-copy.ts
   →  apps/designer-portal/src/components/document/commercial/agreement-copy.ts
```

It moved the file without touching either the barrel export
(`packages/types/src/index.ts:138`) or the importer
(`components/document/commercial/agreement-parts-body.tsx:23-26`, which reads
`AGREEMENT_PART_COPY`, `agreementCadenceText`, `agreementDepositLine`,
`agreementRetainerActivation` **from `@patina/types`**). The designer branch is
broken on its own account, not by the merge — and the lane's own notes still
place the module in `packages/types` (`designer-notes.md` D5, lines 255 / 274 /
438), so the move contradicts the lane's declared design.

**Resolution — restore, do not re-point.** `git mv` back to
`packages/types/src/agreement-copy.ts`; the barrel export and every importer are
then untouched. The two copies were byte-identical (`diff` against
`679f08773:packages/types/src/agreement-copy.ts` → no output), so this restores
exactly the reviewed content. Commit `b2a9e68f9`,
*"fix(types): put the agreement's shared sentences back where the barrel exports
them"* — one file, a pure rename, zero content lines changed.

That is the whole of this steward's product-code footprint. Nothing else outside
`artifacts/…/build/waves/w1/` was edited.

## 4 · Migration numbering

Re-checked against the tip immediately before merge:

```
origin/main highest:   supabase/migrations/00574_invoice_links.sql
integration highest:   supabase/migrations/00575_agreement_parts.sql
duplicate 5-digit prefixes across the merged tree:  (none)
new vs main:           supabase/migrations/00575_agreement_parts.sql   (one file)
```

**No collision. Nothing renumbered**, and no file on `main` was touched. Strata's
applied head is `00574`, so `00575` remains unapplied on production and editable
in place if a ruling requires it.

## 5 · Gates

All run from the integration worktree, against the shared local stack this
steward reset (see `stack-notice.md`, round-2 entry).

### 5.1 · The stack

```
supabase db reset --workdir …/agent-agr-w1-integration
  → Applying migration 00575_agreement_parts.sql...
  → 33 seed files replayed, "Finished supabase db reset on branch main."

select version from supabase_migrations.schema_migrations order by version desc limit 3
  → 00575 / 00574 / 00573

new tables:  proposal_agreement_parts · studio_agreement_defaults
new fns:     _agreement_assert_cents · _agreement_floor_unmet ·
             _agreement_requires_rate_card · _project_agreement_terms ·
             discard_agreement_parts · guard_agreement_projection_write ·
             upsert_agreement_parts   (+ the re-grafted sign/countersign impls)
```

`discard_agreement_parts` and `guard_agreement_projection_write` being present is
the probe that the **round-4** body of `00575` is what applied — the body the
first reset left behind had neither.

| Gate | Command | Result |
|---|---|---|
| SQL suite | `scripts/run-sql-tests.sh` | **162 total · 141 green · 21 expected-fail · 0 unexpected** |
| — agreement floor | `commercial/agreement_parts_test.sql` | PASS |
| — projection | `commercial/agreement_parts_projection_test.sql` | PASS |
| — hardening contract | `edge_api/public_sd_hardening_contract_test.sql` | PASS (2s) |
| — paper issue | `commercial/design_services_paper_issue_test.sql` | PASS |
| — round-1's mystery red | `commercial/direct_order_attribution_test.sql` | **PASS** |
| ACL seed | `python3 scripts/generate-legacy-grants.py` then `git diff --exit-code` | byte-identical, rc=0 (2232 replayed statements) |
| Generated types | `pnpm db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **rc=0 — in sync** |
| `@patina/types` | `type-check` | clean |
| `@patina/supabase` | `type-check` | clean |
| `@patina/supabase` | `test` (vitest) | **87 files · 1068 passed \| 12 skipped** |
| designer-portal | `type-check` | clean |
| designer-portal | `lint` | 2 errors, 203 warnings — **both errors proved pre-existing**, §5.3 |
| designer-portal | **full** `test` (jest) | **523 suites · 6319 tests · 2 snapshots — all passed** |
| client-portal | `type-check` | clean |
| client-portal | `test` (jest) | **129 suites · 1995 tests · 1 snapshot — all passed** |
| client-portal | `test:coverage` (floor 70/60/70/70) | **73.96 / 69.30 / 74.01 / 76.28 — over floor** |
| admin-portal | `build` (unsandboxed; the repo's strictest gate) | success, full route table emitted |
| deno `_shared` | — | **not run: no `supabase/functions/**` file changed.** `git diff --name-only origin/main HEAD -- supabase/functions/` is empty |

`direct_order_attribution_test.sql` is worth naming. The first integration ran it
to ground and reported it a pre-existing red on `main`; it is **green here**. The
difference is the stack, not the code: that run was made against a database whose
`00575` body was the stale pre-R17 copy. On a stack reset from this merged tree
the file passes, and `KNOWN_FAILURES.md` needs no entry for it.

### 5.2 · Client e2e

```bash
cd .../agent-agr-w1-integration/apps/client-portal
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=//p')"   # 164 chars
export NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true
npx playwright test --workers=1
```

```
4 failed
  tests/plans-link.spec.ts:190      plan transmittal guest link
  tests/share-link.spec.ts:114      guest share link with a board
  tests/threshold.spec.ts:158       prints the five facts the seed put in the house
  tests/threshold.spec.ts:221       names the other houses on the mat
33 passed (3.4m)
```

The first two are the orchestrator's named pre-existing reds. The other two:

**`threshold.spec.ts:158` — a timezone artifact of the spec's own date math.**
The spec computes the due date as JS-local `today + 7`; the seed dates the
invoice `CURRENT_DATE + 7` in a Postgres running UTC. Any run after 19:00 CDT
crosses the boundary. Re-run under `TZ=UTC`:

```
TZ=UTC npx playwright test tests/threshold.spec.ts --workers=1
  → 1 failed (:221)   13 passed          ← :158 is green
```

**`threshold.spec.ts:221` — seed accumulation on `main`.** `MULTI_OTHER_HOUSE_COUNT`
is 2, the mat renders 7. Proved pre-existing three ways:

- lines 200–245 of `threshold.spec.ts` (the whole failing test) are byte-identical
  to `origin/main`, and `MULTI_OTHER_HOUSE_COUNT = 2` sits on line 31 in both;
- the rendering path is untouched — `git diff --name-only origin/main HEAD --
  apps/client-portal/src/components/threshold/` returns only a **test** file;
- Wave 1's only `supabase/seed/` change is the regenerated `00-legacy-grants.sql`,
  and every added line in it is a `GRANT`, a `REVOKE`, or the `DO $g$ … EXCEPTION
  … END $g$;` wrapper around one (verb census over the added lines: 22 REVOKE,
  13 GRANT, 35 DO/EXCEPTION/END, 35 comments — **no INSERT, no data row**).

And then demonstrated rather than argued: the same test, run from the **`main`
checkout** at `3a9472f92` against the same stack, fails identically —
`Expected 2, Received 7`. It belongs on the `main` backlog, as ruling R21's last
bullet already records.

### 5.3 · The two lint errors

```
piece-room-save-gate.test.tsx:159:1  error  Definition for rule 'import/first' was not found
use-commercial-documents.test.ts:930:8  error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …
```

`piece-room-save-gate.test.tsx` is unchanged by this wave. `use-commercial-documents.test.ts`
gained 189 lines, but all of them land after the error site — lines 925–935 are
byte-identical to `origin/main`, so the construct is at line 930 in both. Proof
by execution: `npx eslint` on those two files **in the `main` checkout** at
`3a9472f92` reports `✖ 2 problems (2 errors, 0 warnings)` — the same two, same
lines, same rules. Ruled pre-existing in R21.

## 6 · Deploy set (over `3a9472f92 … b2a9e68f9`)

| Kind | Item | Note |
|---|---|---|
| Migration | `supabase/migrations/00575_agreement_parts.sql` | the only file above the tip's `00574`; unapplied on Strata |
| Edge functions | **none** | `git diff --name-only origin/main HEAD -- supabase/functions/` is empty, so no `_shared` importer set to compute |
| Portals | `designer-portal`, `client-portal` | both via `./infra/deploy-portal.sh <name>` from the **main** checkout |
| Services / workers | none | nothing under `services/` or `infra/` changed |

Nothing in this report authorizes any of it. No push, no `supabase db push`, no
`supabase functions deploy`, no `wrangler` ran in this lane.

`agreement-parts` must exist as a fail-closed PostHog flag before the designer
portal is useful in production, and must be verified against `/flags` with a
real-browser UA before it is enabled (project memory,
`feedback_posthog_flag_verify_before_enable.md`). Until then the feature is dark
and flag-off byte-identity is the only thing production sees.

## 7 · What lands as an advisory, not a fix

Every one of these is a **major** from a lane's own reviewer, carried into the
branch under the program rule that majors ride as advisories. None is a blocker;
all three reviews say so explicitly.

**Backend (round 4).**

- **M1-new** (0.90) — R4's "one typed money part for a class that bills" is a
  designer-UI rule only. The DB floor asks the ceiling question and nothing else,
  so an agreement composed with no money on the homeowner's page can send, sign
  and countersign into an hourly authority.
- **M2** (1.00) — two implementations of the same hooks ship: the package hooks
  plus their tests are imported by nothing, and the designer portal still uses
  its own copies.
- **M3** (0.85) — the database can un-compose a draft (`discard_agreement_parts`)
  but no product surface calls it, and merely opening the Contract Room composes
  the draft irreversibly for every co-member the per-person flag has not reached.

**Client (round 5).**

- **F-1 / F-2** (0.90) — the `composed` key the shell now branches on has no
  producer anywhere in the stack (grep over `apps/`, `packages/`, `supabase/`
  finds only the client's own adapter, its test, and the unrelated
  `agreement_composed` refusal DETAIL in `00575`). The `??` falls through to
  `parts.length > 0`, so behaviour is today's — but the kill switch is inert and
  "hide every part" cannot be made to stop disclosure through it.
- **F-4** (0.95) — build-sheet §6.6's named client e2e assertion became a
  conditional that cannot fail on any stack that exists.
- **F-5** (0.90) — the designer's live client-preview prints `$0` where the
  homeowner's page prints "Not yet set" (R21) on the first composed agreement.
- **F-6** (0.85) — a 50 % furnishings deposit nobody typed can print as a money
  term of the design-services agreement the homeowner signs.

**Designer (independent review).**

- **N1** — a two-click path from a materialized agreement to a save the server
  cannot accept, readiness green and untested. Rounds 4–5 narrowed this (the Add
  menu no longer offers a duplicate money variant, and readiness reports the
  duplicate), so re-walk it rather than assume it stands as written.

Walk targets for all of the above are written up in `walk-env.md` §5.

## 8 · What this lane did NOT do

- Did not push any branch.
- Did not run `supabase db push`, `supabase functions deploy`, or `wrangler`.
- Did not touch `.claude/`, `.agents/`, hooks, settings, or any `.env` file.
- Did not create or remove a worktree — `agent-agr-w1-integration` already
  existed from the first integration and was reused in place.
- Did not write product code beyond the §3 rename.
- Did not run the designer-portal agreement e2e (`playwright.agreement.config.ts`);
  the steward's gate list names the client suite only.
- Did not resolve any lane finding. The majors in §7 are open.
- Did not verify anything in production. Strata was not contacted.


---

## 9 · Carry fixes (round 4, 2026-09-06)

Added by the carry-fix lane on this same branch, after the round-2 report
above. Head at the start: `51edd76c71445a18d6decd23c2d4f080c9a8ef39`. Full
detail in `carry-fix-notes.md`; the short of it:

**Already closed on arrival, verified rather than rebuilt:** R17 (all three
walls in `00575`, with reviewer probes P16 and P3b reproduced as
`agreement_parts_test.sql` case 25), R18 (the Add menu filters, readiness
reports the duplicate, the save refuses), R19 (standard parts keep their
`patina.*` keys; projection parity is `agreement_parts_projection_test.sql`
cases 1-4), and the readiness/renderer half of R21.

**Closed by this lane:**

| Item | What moved |
|---|---|
| **R21** (client F-5) | The designer's live preview printed `$0` where the homeowner's page prints "Not yet set" — and printed the retainer's activation sentence under a retainer that does not exist. Ceiling, retainer and flat now print the room's own unwritten treatment; a 0 % deposit draws no term. The sentence lives in `AGREEMENT_PART_COPY.notYetSet`, read by both surfaces. |
| **R20** | `build-sheet.md` §3.7 step 6 and §6.2 cases 6-7 amended to kind + variant, each carrying the sentence it replaced; the projection test's header cites the ruling. |
| **B-7** | `materialize_standard_parts` widens `'legacy'` → `'design_services'`. |
| **B-8** | The bundle's `parts` key is present on the retired early-return too. |
| **B-9** | A rate carries `effectiveAt` through the parts door — seeded beside the rate, read back by `v_rates`, carried through the designer's `readRoles`. |
| **B11 / N6 / R5 (m6)** | The last three raw casts (`required`, `clientVisible`, `sourcePartId`, the rate card's `sortOrder`, the new `effectiveAt`) answer in the designer's words. |
| **client R3-5 (F-6)** | The furnishings deposit is seeded only from a percent somebody set. The literal `50` is gone. |
| **DR5** | The rail no longer chips `flat` / `per_phase` "creates authority" against their own editors' words; `PerPhaseEditor` gained the record-only sentence. |
| **DR13** | `AgreementComposer` loads through `next/dynamic`, out of the flag-off chunk. |
| **DR21 / DR7 / M2** | One studio-defaults data layer: the `@patina/supabase` hooks, writing `updated_by`. The app-local duplicate is deleted. |

### 9.1 · Gates, all re-run at the final tree

| Gate | Command | Result |
|---|---|---|
| Stack | `supabase db reset --workdir <worktree>` (unsandboxed) | applied clean through `00575`; 33 seed files replayed; "Finished supabase db reset on branch main." |
| SQL | `psql -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_parts_test.sql` | **rc=0** — PASS 1-35, including the new 32 (B-7), 33 (B-8), 34 (B-9), 35 (R3-5) and refusal probes (i)-(l) |
| SQL | `… agreement_parts_projection_test.sql` | **rc=0** — PASS 1-9, now comparing `effective_at` as well |
| SQL | `… edge_api/public_sd_hardening_contract_test.sql` | **rc=0** — no pinned body was touched, so no hash was re-pinned |
| SQL | `… commercial/design_services_paper_issue_test.sql` | **rc=0** |
| ACL seed | `python3 scripts/generate-legacy-grants.py` + `git status` | byte-identical (2232 replayed statements); no GRANT/REVOKE changed |
| Types | `pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts` | **rc=0, in sync** — the edits are function bodies, no schema change |
| `@patina/types` | `type-check` | clean |
| `@patina/supabase` | `type-check` | clean |
| `@patina/supabase` | `test` (vitest) | **87 files · 1068 passed | 12 skipped** |
| designer-portal | `type-check` | clean |
| designer-portal | **full** `test` (jest) | **523 suites · 6326 tests · 2 snapshots — all passed** (round 2 was 6319; +7 from this lane) |
| client-portal | `type-check` | clean |
| client-portal | `test:coverage` (floor 70/60/70/70) | **129 suites · 1995 tests** · 73.96 / 69.30 / 74.01 / 76.28 — over floor |
| admin-portal | `build` (unsandboxed) | **Compiled successfully in 19.1s**, full route table emitted |

### 9.2 · Deploy set, unchanged in shape

Still one migration (`supabase/migrations/00575_agreement_parts.sql`, edited in
place and still unapplied on Strata), no edge functions
(`git diff --name-only origin/main HEAD -- supabase/functions/` is empty), and
the two portals. §6's table stands.

### 9.3 · What §7's advisories look like now

`client R3-5 / F-6` and `client F-5` are **closed** (they were majors). The
rest of §7 stands as written: backend **M1-new**, **M2** is closed for the
studio-defaults half and open for the agreement-parts hooks (the package's
`use-agreement-parts.ts` is still unimported — the ruled item named the
studio-defaults layer only), **M3**, client **F-1/F-2**, **F-4**, and designer
**N1**.
