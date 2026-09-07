# Wave 1 · lane `integration` — notes

Program: **The Agreement, Composed** · Wave 1 · 2026-09-06
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`)
Branch: `agreement/w1-integration` · base = tip of `origin/main` `4c0b7b17b`
Integration **code** head: **`679f087735c7db33d5adcefc753d0b9a07ca2e3a`** (the third
merge). The docs commit carrying this file sits directly on top of it and
touches nothing outside `artifacts/agreement-composed-2026-09-06/build/waves/w1/`.

No product code was written in this lane. The only non-doc edit is the one
conflict hunk in `packages/types/src/commercial.ts` (§2 below). No push, no
production mutation, no `.env`, no `.claude/`, no worktree created or removed
other than this lane's own.

---

## 1 · The tip, and the merges

`git fetch origin main` (unsandboxed) → `origin/main` = `main` =
`4c0b7b17ba48de3a87749f2ef85fb426214159e9`, and Wave 1's declared base
`4c0b7b17b` is that same commit. **The tip did not move during the build** —
no rebase, no drift, nothing to reconcile against a newer main.

Each lane branch had advanced by exactly one commit past the sha the lane
state names — in all three cases the round-3 adversarial review document and
nothing else (`git show --stat` on each: one file, `*-review-r3.md`). The
stated shas are ancestors of the heads that were merged, so the merged code is
the reviewed code.

| Order | Lane | Branch head merged | Merge commit | Result |
|---|---|---|---|---|
| 1 | backend | `b04a686ef` | `488391a8c` | clean |
| 2 | designer | `e9fd33141` | `e98964d20` | clean |
| 3 | client | `7a255ac33` | `679f08773` | **1 conflict**, resolved below |

Subjects are `chore(agreements): merge w1-<lane>` exactly; no `merge(...)`
subject, no trailers.

### File-overlap prediction, and what actually happened

Before merging, the three lanes' change sets were intersected:

```
backend  20 files   designer  44 files   client  16 files
be ∩ de = be ∩ cl = de ∩ cl = { packages/types/src/agreement.ts,
                                packages/types/src/commercial.ts,
                                packages/types/src/index.ts }
```

Those three are the T0 handshake files, cherry-picked onto each lane
(`13bc4445c` backend / `bab1b9b92` designer / `4c46fd97e` client — three shas,
one content). Everything else is disjoint: backend owns `supabase/**` +
`packages/supabase/**`, designer owns `apps/designer-portal/**`, client owns
`apps/client-portal/**`.

## 2 · The one conflict, and how it was resolved

`packages/types/src/commercial.ts`, `ProjectBillingAuthoritySummary.authorizedCents`:

```
<<<<<<< HEAD (backend)
  /** NULL = uncapped (F-2), mirrors `ceilingCents` — the RPC returns the same
   *  `billing_ceiling_cents` for both. Render as "No ceiling", never as `$0`. */
  authorizedCents: number | null;
=======
  authorizedCents: number;              (client)
>>>>>>> agreement/w1-client
```

**Resolved to HEAD (`number | null`).** This is not a preference: it is
round-1 finding **B4** on the backend lane, fixed there after the client lane
had already cherry-picked T0. `billing_ceiling_cents` drops `NOT NULL` in
00575 (architect finding F-2) and `get_project_authority_summary` returns the
same nullable column for both `ceilingCents` and `authorizedCents`; the client
branch simply never received the follow-up commit. Taking the client's
`number` would have re-opened B4 and put `$0` on the homeowner's page where the
agreement is uncapped.

`packages/types/src/index.ts` auto-merged: designer adds
`export * from "./agreement-copy";` at the end of the file, backend and client
leave it at the T0 shape.

Verification that the resolution is the right one, not merely the newer one:
`pnpm --filter @patina/client-portal type-check` is clean against
`number | null` (§4), so nothing in the client's tree was relying on
non-nullability.

## 3 · Migration numbering

Re-checked the tip immediately before merge, per program rule:

```
origin/main highest:  supabase/migrations/00574_invoice_links.sql
integration highest:  supabase/migrations/00575_agreement_parts.sql
duplicate 5-digit prefixes across the merged tree: (none)
```

**No collision. Nothing renumbered.** 00575 keeps its number and its banner;
no file on main was touched. Strata's applied head is `00574`, so 00575 is
still unapplied on production and remains editable-in-place if a ruling
requires it.

## 4 · Gates — every one run in this worktree, on the shared local stack

See `wave-report.md` in this directory for the full paste. Summary:

| Gate | Result |
|---|---|
| `supabase db reset` (shared stack, this steward) | clean through `00575`; head probed = `00575` |
| `scripts/run-sql-tests.sh` (162 files) | 140 green · 21 expected-fail · **1 unexpected**, proved pre-existing |
| `agreement_parts_test.sql` | rc=0, PASS groups 1–24 |
| `agreement_parts_projection_test.sql` | rc=0, PASS groups 1–9 |
| `public_sd_hardening_contract_test.sql` | rc=0 (its two "error" lines are its own sentinels) |
| `generate-legacy-grants.py` regen | byte-identical, `git diff --exit-code` rc=0 |
| `pnpm db:generate` + `git diff --exit-code database.types.ts` | **rc=0 — in sync** |
| `@patina/types` type-check · `@patina/supabase` type-check | clean · clean |
| `@patina/supabase` test | 87 files, 1060 passed \| 12 skipped |
| designer-portal type-check | clean |
| designer-portal lint | 2 errors, 203 warnings — **both errors byte-identical on `origin/main`** |
| designer-portal **full** jest | **523 suites / 6304 tests / 2 snapshots — all passed** |
| client-portal type-check | clean |
| client-portal jest (+`--coverage`) | 129 suites / 1978 tests passed; 73.94 / 69.25 / 73.98 / 76.26 vs floor 70/60/70/70 |
| admin-portal `build` (unsandboxed) | success, full route table emitted |
| deno `_shared` | **not run — no `supabase/functions/**` file changed** (`git diff --name-only origin/main HEAD -- supabase/functions/` is empty) |
| client-portal e2e `--workers=1` | 33 passed · 1 skipped · 4 failed — all four traced to main, §5 |

## 5 · The four e2e failures, and why none of them is Wave 1's

Two were named pre-existing by the orchestrator:

- `tests/plans-link.spec.ts:190` — plan transmittal guest link
- `tests/share-link.spec.ts:114` — guest share link with a board

Two were **not** named, so both were run to ground:

**(a) `threshold.spec.ts:158` "prints the five facts the seed put in the house".**
The spec computes `INVOICE_DUE_DAY` as JS-local `today + 7`; the seed dates the
invoice `CURRENT_DATE + 7` in the database. At the moment of the run the two
calendars disagreed:

```
db:  current_date = 2026-09-07   current_date + 7 = 2026-09-14
js:  Sun Sep 06 2026 20:59:23 GMT-0500 (CDT)     due = "September 13"
page prints: "… Balance $4,060, due September 14."
```

The stack's Postgres runs UTC; the runner's clock is CDT (UTC−5). Any run
after 19:00 CDT crosses the boundary and reds this assertion. Re-run with
`TZ=UTC` and it is green: `threshold.spec.ts` 13 passed, and this test among
them. A timezone artifact of the spec's own date math, not a Wave 1 defect —
and the spec's own comment already documents this failure class from a prior
occurrence.

**(b) `threshold.spec.ts:221` "names the other houses on the mat".**
`MULTI_OTHER_HOUSE_COUNT = 2`, the mat renders 7. Both inputs to that count
are untouched by Wave 1:

- The rendering path — `apps/client-portal/src/components/threshold/other-houses.tsx`
  — is **not** in this integration's client-portal diff (which is 8 files:
  `agreement-parts-body.tsx`, `commercial-document-shell.tsx`,
  `lib/commercial-documents.ts` and their tests/snapshots).
- The data — Wave 1's only change under `supabase/seed/` is the regenerated
  `00-legacy-grants.sql`, and every added line in that diff is a `GRANT`,
  a `REVOKE`, or the `DO $g$ … EXCEPTION … END $g$;` wrapper around one. No
  `INSERT`, so no project row.
- The failing test body itself is byte-identical to `origin/main`:
  `shasum -a 256` over lines 1–377 of `threshold.spec.ts` matches
  `git show origin/main:…` exactly (`192c4c93a355fa81…`).

The 7 houses come from seed files Wave 1 never opened (e.g.
`supabase/seed/schedule-extremes.sql` creates two of them). This is seed
accumulation drift on `main`, and it belongs in a `main`-side fix, not here.

**Also worth naming:** the third unexpected signal, SQL test
`commercial/direct_order_attribution_test.sql`, was proved pre-existing the
expensive way rather than argued. The stack was reset to a **00574 baseline**
(00575 moved aside, `00-legacy-grants.sql` restored from `origin/main`), head
probed = `00574`, and the file run there:

```
psql: … ERROR:  two roster designers on one day must file the order uncredited,
      got da000000-0000-4000-8000-0000000000d2
```

— identical message, identical line, on a tree with no Wave 1 content in it.
The stack was then restored to Wave 1 and reset back to `00575`; `git status`
on `supabase/` was clean before and after. The file is not in
`KNOWN_FAILURES.md` yet; a `main`-side entry or fix is owed.

## 6 · What this lane did NOT do

- Did not push any branch.
- Did not run `supabase db push`, `supabase functions deploy`, or `wrangler`.
- Did not touch `.claude/`, `.agents/`, hooks, settings, or any `.env` file.
- Did not create or remove a worktree other than this lane's own.
- Did not write product code. The single non-doc edit is the conflict hunk in
  §2.
- Did not run the designer-portal e2e (`playwright.agreement.config.ts`); the
  steward's gate list names the client suite only.
- Did not resolve the open findings the lanes carry — see `wave-report.md` §6.
  In particular, backend round-3 **R1 is a blocker and is not documented as
  accepted in `backend-notes.md`**; it needs an orchestrator ruling before this
  branch lands.
