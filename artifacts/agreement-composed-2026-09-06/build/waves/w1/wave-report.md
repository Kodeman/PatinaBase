# Wave 1 — integration report

**The Agreement, Composed** · Wave 1 (*loosen the room*) · 2026-09-06
Steward: integration lane.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
Branch `agreement/w1-integration` · **code head
`679f087735c7db33d5adcefc753d0b9a07ca2e3a`** (the third merge; this docs commit
sits directly on top of it and changes nothing outside
`artifacts/agreement-composed-2026-09-06/build/waves/w1/`).
Base = tip of `origin/main` **`4c0b7b17ba48de3a87749f2ef85fb426214159e9`** (unmoved during the build).

**74 files changed, +19,257 / −213.**

> **This branch is gate-green and is NOT clear to land.** Every gate in the
> steward's list passes (§3–§4). One open **blocker** — backend round-3 **R1** —
> is not documented as accepted in `backend-notes.md`, and the program rule is
> that a blocker merges only when it is. It is merged here because the merge is
> what made the gates runnable; it needs an orchestrator ruling before a push,
> a `db push`, or a portal deploy. §6.

---

## 1 · The merges

| Order | Lane | Head merged | Merge commit | Conflicts |
|---|---|---|---|---|
| 1 | `agreement/w1-backend` | `b04a686ef` | `488391a8c` | none |
| 2 | `agreement/w1-designer` | `e9fd33141` | `e98964d20` | none |
| 3 | `agreement/w1-client` | `7a255ac33` | `679f08773` | 1 |

Each lane head is one commit past the sha the lane state names, and in all
three cases that commit is the round-3 review document alone — the merged code
is the reviewed code.

**The single conflict**, `packages/types/src/commercial.ts`:
`ProjectBillingAuthoritySummary.authorizedCents`, backend's `number | null`
against client's `number`. **Resolved to `number | null`** — that is backend
round-1 finding **B4**, fixed after the client lane cherry-picked T0.
`billing_ceiling_cents` loses `NOT NULL` in 00575 (architect finding F-2) and
`get_project_authority_summary` returns the same nullable column for both
fields; taking `number` would put `$0` where the agreement is uncapped.
`pnpm --filter @patina/client-portal type-check` is clean against the
resolution, so nothing in the client tree relied on non-nullability.

`packages/types/src/index.ts` auto-merged (designer's
`export * from "./agreement-copy";` appended to the T0 shape).

## 2 · Migrations

```
origin/main highest      00574_invoice_links.sql
integration highest      00575_agreement_parts.sql
duplicate 5-digit prefixes across the merged tree: none
```

**No collision, nothing renumbered.** 00575 keeps its number and banner; no
migration already on `main` was touched. Strata's applied head is `00574`, so
00575 remains unapplied and therefore still editable in place should a ruling
require it.

`python3 scripts/generate-legacy-grants.py` regenerates
`supabase/seed/00-legacy-grants.sql` **byte-identically**
(`git diff --exit-code` → rc=0), so the ACL seed the backend lane committed is
the one the generator produces from the merged migration set.

## 3 · Database gates

Shared local stack, reset by this steward (see `stack-notice.md`).

```
supabase db reset            → applied 00001 … 00575, all 33 seed files, clean
probe                        → schema_migrations head = 00575
probe                        → to_regclass('public.proposal_agreement_parts')  = proposal_agreement_parts
                               to_regclass('public.studio_agreement_defaults') = studio_agreement_defaults
                               pg_proc(upsert_agreement_parts, materialize_standard_parts) = 2
```

`scripts/run-sql-tests.sh` — the whole suite, not a subset:

```
================ summary ================
total:             162
green:             140
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:     1
effective-green:   161 / 162
===========================================
unexpected failures:
  - supabase/tests/commercial/direct_order_attribution_test.sql
```

The named Wave 1 suites, run individually on the reset stack:

```
commercial/agreement_parts_test.sql              rc=0
  PASS 1-2   nine standard parts, in order, seeded idempotently from the terms row
  PASS 3-6   the parts key is conditional, total, and blind to timestamps
  PASS 7-8   parts move freely while draft and freeze at send (R6)
  PASS 9-10  R4 holds at the DB floor, and an uncapped agreement is legal
  PASS 11    refusal A relaxed — a flat-fee agreement leaves the studio
  PASS 12    the legacy contract holds for every document authored before parts
  PASS 13-15 the studio composes through the RPC only, the outsider not at all
  PASS 16    the bundle projects client-visible parts, enumerated keys only (R8)
  PASS 17    studio agreement defaults — members read, owners and admins write (R3)
  PASS 18-19 NULL is uncapped end to end — countersign, authority, summary
  PASS 20    nothing in flight is broken by the conditional parts key
  PASS 21    studio defaults, then Patina literals — in that order (P3)
  PASS 22    money is read by shape — the composer's own keys project, and one of each
  PASS 23    an uncapped authority authorizes its hours; a cap still caps
  PASS 24    R4's floor stands at the save door and the send door, by either road in

commercial/agreement_parts_projection_test.sql   rc=0
  PASS 1-4   both doors write one indistinguishable money row
  PASS 5     a part the studio removed is absent from the money row, not sticky
  PASS 6-7   money reads by shape under any key, one of each, and only the five
             that have a column (R5/R9)
  PASS 8     a standard key only projects when the part has its shape (R5)
  PASS 9     the flag-off write path is byte-for-byte 00422

edge_api/public_sd_hardening_contract_test.sql   rc=0   (re-pinned body hash holds)
```

### The one unexpected SQL failure is `main`'s

`commercial/direct_order_attribution_test.sql` was not argued away — it was
reproduced on a baseline. 00575 was moved aside, `00-legacy-grants.sql` was
restored from `origin/main`, the stack was reset (head probed = `00574`), and
the file was run there:

```
psql: … ERROR:  two roster designers on one day must file the order uncredited,
      got da000000-0000-4000-8000-0000000000d2
CONTEXT:  PL/pgSQL function inline_code_block line 136 at ASSERT
```

Identical message, identical assertion, on a tree carrying no Wave 1 content.
00575 redefines 16 functions and not one of them is in the direct-order
attribution path. The stack was then restored to Wave 1 and reset back to
`00575`; `git status supabase/` was clean before and after. **Owed to `main`:**
a fix, or a `KNOWN_FAILURES.md` entry — it is in neither state today.

## 4 · Types, packages, portals

```
pnpm db:generate                                       (SUPABASE_DB_URL → local 54322)
git diff --exit-code packages/supabase/src/database.types.ts   → rc=0   IN SYNC

pnpm --filter @patina/types     type-check   → tsc --noEmit, clean
pnpm --filter @patina/supabase  type-check   → tsc --noEmit, clean
pnpm --filter @patina/supabase  test         → Test Files 87 passed (87)
                                               Tests 1060 passed | 12 skipped (1072)

pnpm --filter @patina/designer-portal type-check → tsc --noEmit, clean
pnpm --filter @patina/designer-portal lint      → 205 problems (2 errors, 203 warnings)
pnpm --filter @patina/designer-portal test      → Test Suites: 523 passed, 523 total
                                                  Tests:       6304 passed, 6304 total
                                                  Snapshots:     2 passed, 2 total

pnpm --filter @patina/client-portal type-check  → tsc --noEmit, clean
pnpm --filter @patina/client-portal test        → Test Suites: 129 passed, 129 total
                                                  Tests:      1978 passed, 1978 total
   with --coverage:  All files 73.94 | 69.25 | 73.98 | 76.26   (floor 70/60/70/70 — clears)

pnpm --filter @patina/admin-portal build (UNSANDBOXED) → success, full route table emitted

deno test … supabase/functions/_shared/  → NOT RUN, and correctly so:
   git diff --name-only origin/main HEAD -- supabase/functions/   → (empty)
   no edge-function file changed in Wave 1.
```

**The two lint errors are `main`'s, verified line by line, not assumed:**

- `…/piece/piece-room-save-gate.test.tsx:159` *Definition for rule 'import/first'
  was not found* — the file is not in Wave 1's diff at all, and
  `git show origin/main:<file>` puts the same `// eslint-disable-next-line
  import/first` at the same line.
- `…/hooks/__tests__/use-commercial-documents.test.ts:930`
  *react-hooks/rules-of-hooks* — this file **is** in Wave 1's diff (+189 lines
  of new cases), but `git show origin/main:<file>` puts the identical
  `mutationFnOf` block at lines 928–932. The offending code is main's, unmoved.

Per `patina-verification`, designer-portal is the only workspace whose lint
config actually resolves, so this is the one lint result worth reading — and it
is unchanged from main.

## 5 · Client e2e

```
SUPABASE_SERVICE_ROLE_KEY exported from `supabase status -o env`
NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true
pnpm --filter @patina/client-portal exec playwright test --workers=1 --reporter=list

  4 failed
    tests/plans-link.spec.ts:190     plan transmittal guest link
    tests/share-link.spec.ts:114     guest share link with a board
    tests/threshold.spec.ts:158      prints the five facts the seed put in the house
    tests/threshold.spec.ts:221      names the other houses on the mat
  1 skipped
 33 passed (3.5m)
```

The first two are the orchestrator's named pre-existing failures. The other two
were run to ground:

**`threshold.spec.ts:158` — a timezone artifact of the spec's own date math.**
The spec computes `INVOICE_DUE_DAY` in JS local time as `today + 7`; the seed
dates the invoice `CURRENT_DATE + 7` in the database, which runs UTC.

```
db:   current_date = 2026-09-07     current_date + 7 = 2026-09-14
js:   Sun Sep 06 2026 20:59:23 GMT-0500 (CDT)      due = "September 13"
page: "INV-2026-0301 · $4,060 total · $0 paid. Balance $4,060, due September 14."
```

Any run after 19:00 CDT crosses the boundary. Re-run under `TZ=UTC`:

```
TZ=UTC … playwright test tests/threshold.spec.ts --workers=1
  ✓ tests/threshold.spec.ts:158  prints the five facts the seed put in the house
  13 passed, 1 skipped, 1 failed  (only :221 remains)
```

The spec's own comment already records this failure class from a previous
occurrence. Not Wave 1's.

**`threshold.spec.ts:221` — seed drift on `main`.** `MULTI_OTHER_HOUSE_COUNT = 2`,
the mat renders 7. Neither input moved in Wave 1:

- the renderer, `apps/client-portal/src/components/threshold/other-houses.tsx`,
  is not in this integration's client-portal diff (8 files:
  `agreement-parts-body.tsx`, `commercial-document-shell.tsx`,
  `lib/commercial-documents.ts`, plus tests and one snapshot);
- Wave 1's only `supabase/seed/` change is the regenerated
  `00-legacy-grants.sql`, and every added line in it is a `GRANT`, a `REVOKE`,
  or the `DO $g$ … EXCEPTION … END $g$;` wrapper around one — no `INSERT`, so
  no project row;
- the failing test body is byte-identical to main:
  `shasum -a 256` over `threshold.spec.ts` lines 1–377 gives
  `192c4c93a355fa81cde692702fa02eec82569d83c6261e97191ef32114010f2` on both
  `HEAD` and `git show origin/main:…`.

The extra houses come from seed files Wave 1 never opened (two of them from
`supabase/seed/schedule-extremes.sql`). **Owed to `main`:** update the constant
or the seed.

**Wave 1's own new e2e passes**, on the flag: *"reads the agreement in full, and
carries no parts body on a stack with nothing composed"* (`threshold.spec.ts:396`).
The sibling case at `:449` is still a `test.fixme` — it needs a seeded composed
agreement, which no seed file creates. That fixture is owed (client F-12).

## 6 · Open findings carried into this merge

Merged as advisories; **none was fixed here** — this lane writes no product
code. Ranked by what they cost a person at the keyboard.

### BLOCKER — unruled, and the reason this branch is not clear to land

**backend R1 · the parts and the money row can part company, and only the parts
are guarded.** 00575 makes `proposal_service_terms` / `proposal_service_rates`
the *projection* of the parts, but `authenticated` still holds
INSERT/UPDATE/DELETE on those two tables (`proposal_service_terms_studio_rw`,
00412:318). A PostHog rollout is per person, so one studio member inside the
flag and one outside it is an ordinary state: A composes a $24,000 ceiling at
a biweekly cadence, B saves the seven-facet room, and the document goes to send
→ sign → countersign with the client's page saying $24,000 and the billing
authority saying $5,000. Nothing refuses; the fingerprint hashes both halves,
so the contradiction is exactly what the signature attests to. Reviewer's probe
`P16` in `backend-review-r3.md` §R1 walks it end to end.

**`backend-notes.md` carries no round-3 section and no acceptance of R1.** The
program rule — an open blocker merges only when its lane's notes document it as
accepted — is therefore **not** satisfied. The reviewer offers three fixes
(refuse `upsert_design_services_draft` when parts exist + withhold the write
grant; re-project at the send/sign doors; or move the floor to the terms row and
add a disagreement refusal). All three are rulings, not steward calls.

### Majors

| # | Lane | What it costs |
|---|---|---|
| backend R2 / designer DR20 | backend + designer | Two clicks from a materialized agreement reach a Save the server refuses: the Add menu offers a second Ceiling/Retainer/Cadence/Deposit/Role-rates part, readiness says ready, `upsert_agreement_parts` raises 23514 on the whole write. The refusal exists; the room that offers the act does not know about it. |
| backend R3 | backend | Money now reads by kind+variant, but **prose** still reads by `part_key`, and the composer mints `custom.<uuid>` for prose parts too — so a rail-composed agreement can write an empty scope, terms, deliverables and exclusions into the row `create_service_addendum` copies and both flag-off renderers read. |
| backend R4 | backend | The projection moved from `part_key` to kind+variant and the build sheet's own §6.2 cases 6 and 7 were rewritten to assert the opposite of what the sheet specifies, with no entry in `rulings-2026-09-06.md`. A sheet and its tests now disagree with the sheet's text; the ruling that reconciles them is missing. |
| client R3-1 | client | The composed body prints `$0` (retainer, ceiling) and `0% deposit` where today's body prints "Not yet set" — the protection main's own comment says exists, dropped on the homeowner's page. |
| client R3-2 | client | C2 is uncontained: the client-side guard was reverted on the condition that backend take containment (a) or (b), and neither landed. Same hole as R1, seen from the client's side. |

Designer's round-3 verdict adds a thirteen-finding backlog carried unfixed from
round 2 (`designer-review-r3.md`, N-DOC) — all minors and nits, all recorded.

### Advisories

- `env.md`'s scratch-DB recipe (plain `pg_dump | psql`) is unusable on the
  local pg 18 client; three reviewers independently used
  `pg_dump --no-owner -Fc` + `pg_restore`. The recipe should be corrected before
  Wave 2 hands it to another lane.
- `supabase/tests/commercial/direct_order_attribution_test.sql` (§3) and
  `threshold.spec.ts:221` (§5) are both red on `main` and in neither
  `KNOWN_FAILURES.md` nor a fix.
- `threshold.spec.ts:158` is timezone-fragile by construction and will red any
  evening run in a UTC−N zone.
- `scripts/run-sql-tests.sh` needs an unsandboxed shell (its `mktemp` lands in
  `/var/folders`, which the sandbox denies).
- backend F-5 (a fourth rate-card refusal the build sheet does not list) is
  still unruled from round 1.

## 7 · Deploy set (over `origin/main` `4c0b7b17b` … `679f08773`)

Nothing below has been executed. This is the chain a ship request would
authorize, in order.

**Migrations above the tip's highest (`00574`):**

- `supabase/migrations/00575_agreement_parts.sql` — the parts table, studio
  agreement defaults, the fingerprint fold, the R4 floor, the projection RPCs,
  the nullable ceiling, and 16 grafted function bodies.
  Confirm Strata's head unsandboxed (`supabase migration list --linked`) before
  any `db push`; it read `00574` at build time.

**Edge functions: none.** `git diff --name-only origin/main HEAD --
supabase/functions/` is empty — no function directory changed, no `_shared/*`
edit, so no importer needs redeploying.

**Portals:** `./infra/deploy-portal.sh designer-portal` and
`./infra/deploy-portal.sh client-portal`, from the **main checkout**, never a
raw `opennextjs-cloudflare build`.

**admin-portal / manufacturer-portal: not required.** They consume
`@patina/types`, and Wave 1's change there is type-only
(`authorizedCents` nullability, the new `agreement.ts` and `agreement-copy.ts`
modules) with no runtime delta for either. `admin-portal build` was run anyway
as the repo's strictest gate and is green.

**Services: none.** No `services/**` file changed.

**Flag:** `agreement-parts` does not exist in PostHog yet. The feature is dark
until Kody creates it, and it must be verified against `/flags` with a
real-browser UA **before** enabling
(`feedback_posthog_flag_verify_before_enable.md` — `threshold` matched everyone
on 2026-09-04). `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:false` is the
instant fail-closed lever.

## 8 · The walk

`walk-env.md` in this directory: boot recipes for designer `:3000` and client
`:3002` from the integration worktree with the flag override, the seeded
accounts and their password, how to read the local service-role key without
writing it to a file, which seeded agreements are frozen and why the composer
needs a fresh one, and the four things the open findings say a walker should
try to break.

The stack is left **running at `00575`** for that walk.
