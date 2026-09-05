# W1 DB lane — adversarial review, round 2

Reviewer: separate context, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`, branch
`studio-invoices/w1-db`, diff `36b4b539e..HEAD` (25 commits, 24 files).

> This file supersedes the earlier `db-review-r2.md` written at this path
> (commit `31fd3b89d`); that text is unchanged in git history.

**Verdict: SHIP.** No blocker, no major. Every numbered brief item is delivered,
every function body is rebased on its true head with the project path
byte-identical, the re-pinned trigger hash matches the deployed body exactly,
and all listed gates are green. Four minors/nits carry forward or are new.

---

## 1. Head-rebase proof (a stale head would be a blocker — none found)

Anchored greps, run in the worktree:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*set_invoice_studio_id" supabase/migrations/*.sql | sort | tail -3
supabase/migrations/00318_studio_invoice_numbering_and_ops.sql
supabase/migrations/00511_public_sd_hardening.sql
supabase/migrations/00571_studio_invoices.sql
--- apply_invoice_payment_effects ---   00178 / 00277 / 00571
--- resolve_studio_identity ---         00320 / 00571
--- create_draft_invoice ---            00511 (untouched)
```

**`set_invoice_studio_id()` — 00511 is the head, project path byte-identical:**

```
$ wc -l head_trigger.sql new_trigger.sql
     442 head_trigger.sql
     641 new_trigger.sql
$ diff head_trigger.sql new_trigger.sql | grep -c '^<'
0
```

Zero removed lines; 199 pure insertions across the two arms, exactly as the
banner claims.

**`apply_invoice_payment_effects` — 00277 is the head, two lines changed:**

```
68c68,69
<     'Invoice ' || COALESCE(i.invoice_number, '(draft)') || ' — ' || pr.name,
---
>     'Invoice ' || COALESCE(i.invoice_number, '(draft)') || ' — '
>       || COALESCE(pr.name, i.title, 'Studio invoice'),
77c78
<   JOIN projects pr ON pr.id = i.project_id
---
>   LEFT JOIN projects pr ON pr.id = i.project_id
```

The refund-contra leg is untouched (`refunded` still neither held nor owed).
`designer_earnings.project_id` stays `i.project_id` rather than the brief's
`pr.id` — identical under a LEFT JOIN on that key, and the column has been
nullable since 00178:183.

**`resolve_studio_identity` — 00320 is the head; drop + create of the 3-arg
form; the only body delta is step 0 plus `v_studio_id IS NULL AND` on step 1.**

**Contract-test hash re-pin verified, not trusted:**

```
$ psql … -c "select encode(sha256(convert_to(prosrc,'UTF8')),'hex')
             from pg_proc where oid = to_regprocedure('public.set_invoice_studio_id()');"
b6f0ab2a38d6bbbf286df30d115dac544dcae96ed494c3235692feafb9a3cc89
```

which is byte-for-byte the value pinned at
`supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1719`.

---

## 2. Gates (run by the reviewer, pasted)

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` | clean — `Finished supabase db reset`, `{"target":"local","message":"Reset local database."}`; logged in `stack-reset-notice.md` |
| `scripts/run-sql-tests.sh` | `total: 157 · green: 136 · expected-fail: 21 · unexpected-fail: 0 · effective-green: 157/157` |
| named suites | `PASS billing/invoice_checkout_integrity_test.sql`, `PASS billing/studio_invoice_test.sql`, `PASS commercial/multi_studio_signature_test.sql`, `PASS edge_api/public_sd_hardening_contract_test.sql`, `PASS rls/00563_proposal_signing_multi_studio.test.sql` |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/supabase test -- use-invoices` | `1 passed (1) · 48 passed (48)` |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- accounts desk-receivables` | `3 passed, 3 total · 12 passed` |
| `… test -- use-desk-engagements desk-derivation command-bar` (blast-radius §8 extras) | `3 passed, 3 total · 142 passed` |
| `supabase/functions/_tests/stripe-rail.test.ts` | not runnable in this lane (integration runtime) — the null-project case is written and documented as deferred |

---

## 3. Adversarial probes (all as the real roles, on the reset stack)

Seeded: studio One + Two (member A, owner, `studio_designer` role), co-member B
(no designer-domain role), household on A's roster, a stranger profile.

**Direct DML (F1's hole):**

```
A1 spoofed paid studio INSERT      => REFUSED P0001 (studio_id_not_designer_studio)
A2 direct money UPDATE             => REFUSED P0001
A3 direct status UPDATE            => REFUSED P0001
A4 memo edit on clean draft        => ACCEPTED
A5 stranger household INSERT       => REFUSED P0001
A6 non-designer co-member as designer => REFUSED P0001
A7 studioless anchor               => REFUSED P0001
```

**Immutability:**

```
C1 postgres nulls project_id on a project invoice        => REFUSED P0001
C2 service_role nulls project_id on a project invoice    => REFUSED P0001
C3 service_role reparents a studio invoice onto a project=> REFUSED P0001
```

**`create_draft_studio_invoice` rejections:**

```
B1 milestone kind  => 23514 "ad-hoc lines only; milestone, time, and ffe lines are project-bound"
B2 time kind       => 23514 (same)          B3 ffe kind => 23514 (same)
B4 blank title     => 23514                 B5 null title => 23514
B6 stranger household => 42501 "studio invoice household not found or access denied"
B7 empty lines     => 23514                 B8 negative cents => 23514
B9 quantity 999999999 => 23514              B10 fractional cents => 22P02
B11 tax_rate 2.0   => 23514                 B12 tax_rate -0.1 => 23514
B13 non-member studio => 42501              B14 second studio draw => ACCEPTED
B15 co-member B draws => ACCEPTED, designer stamped = A (7a00…0001)
B16 household calls it => 42501             B17 anon => 42501 permission denied
B18 service_role => 42501 permission denied
```

ACL: `postgres=X/postgres | authenticated=X/postgres`. `resolve_studio_identity`
overload count = 1.

**Money rail, end to end on a project-less invoice:**

```
D1 issue    => INV-0001
D2 counter  => studio_invoice_counters(7a11…0001).next_number = 1  (last assigned)
D3 row      => INV-0001 | sent | houseless=t
D4 claim    => {"state":"claimed","amount_cents":50000,"surcharge_cents":1500,…}
D5 finalize => cs_rv_probe_1
D6 settle   => succeeded
D7 invoice  => paid | 50000 / 50000 | paid_at set
D8 earnings => design_fee | project_id NULL | 50000 | confirmed
               | "Invoice INV-0001 — Reviewer probe"
```

**Project-invoice earnings regression (must be unchanged):**

```
E1 invoice b0000000-…-cc01 project "Cedar Lane Study"
E2 project earnings: Invoice INV-2026-0301 — Cedar Lane Study | project_id=b0000000-…-c0d1
```

**RLS boundary:**

```
F1 household invoices  => 1  ("Reviewer probe" — the issued one; the draft is invisible)
F2 household lines     => 1        F3 household payments => 1
F4 co-member invoices  => 2        F5 stranger invoices  => 0
F6 stranger lines      => 0        F7 anon invoices      => 0
```

Zero rows, never an error that confirms existence.

**PostgREST overload resolution after the drop + create** (the real risk of
`resolve_studio_identity`), against the local REST endpoint:

```
2 named args (every existing caller) => [{"studio_id":"…0001","name":"RV Studio One","source":"studio"}]
3 named args (the new studio path)   => [{"studio_id":"…0002","name":"RV Studio Two","source":"studio"}]
1 named arg  (iOS designer-only)     => [{"studio_id":"…0001","name":"RV Studio One","source":"studio"}]
anon POST /rpc/create_draft_studio_invoice => 401
```

All in-repo SQL callers pass two positional arguments
(`00330:133`, `00331:294`, `00334:93`, `00388:278`, `00412:1545`, `00423:1781`)
and resolve against the default third.

---

## 4. Prior-round findings — verification

| id | was | now |
|---|---|---|
| F1 | blocker | **FIXED** — probes A1–A3 refused, A4 still accepted; clean-draft predicate on both arms |
| F2 | major | **FIXED** — `studio_invoice_test.sql:179-240` drives claim → finalize → settle; suite green |
| F3 | minor | **ADDRESSED** — `stack-reset-notice.md` now records the main-checkout reset and the peer 00569 drop; `db-notes.md` §Stack states it plainly |
| F4 | minor | **OPEN** (see R2-1) |
| F5 | minor | **FIXED** — the org read must FIND an active `design_studio` or the resolver falls through to the project/primary derivations; asserted at `studio_invoice_test.sql:799-840` |
| F6 | minor | **FIXED** — `OR NOT public.has_designer_domain_role(NEW.designer_id)` on the INSERT arm; probe A6 refused |
| F7 | nit | **OPEN** (see R2-2) |
| F8 | nit | **PARTLY OPEN** (see R2-3) |

---

## 5. Findings this round

### R2-1 · minor (carried F4) · no ongoing pin on `create_draft_studio_invoice`

`supabase/migrations/00571_studio_invoices.sql:1007-1071` registers the new SD
RPC in a `DO $studio_draft_roster$` block: overload universe = 1, owner,
`prosecdef`, `proconfig`, result `uuid`, lock order (`PERFORM membership.id`
before `PERFORM studio.id`), and the exact ACL tuple. That is a good
registration, but it lives in the migration, so it only ever runs *at its own
position* in the ledger — a later migration that redefines the function is not
caught. `grep -rn create_draft_studio_invoice supabase/tests/` returns
`billing/studio_invoice_test.sql` only; the 17-row `_00511_expected_public`
manifest is a fixed list, not an SD enumeration, so nothing fails if the
function drifts after merge. `db-notes.md` documents the deviation and the
lock-order reason (sound). Fix if wanted: one manifest row (or a sibling DO
block) in `public_sd_hardening_contract_test.sql` pinning args, result, ACL and
body sha.

### R2-2 · nit (carried F7) · the hook rewrites the caller's line kind

`packages/supabase/src/hooks/use-invoices.ts:786` maps every line to
`{ kind: 'adhoc', … }` regardless of `buildLineRow`'s kind, and the test
`'forces kind adhoc even when the caller names another kind'` pins it. A
mis-typed milestone line therefore becomes a silent ad-hoc line instead of
surfacing the RPC's explicit `check_violation` message (which is a good one:
"a studio invoice carries ad-hoc lines only; milestone, time, and ffe lines are
project-bound"). Wave 2's composer is the surface that would show it.

### R2-3 · nit (carried F8) · `title` is bounded only by the RPC

`00571:47-58`: `ADD COLUMN IF NOT EXISTS title` is guarded, `ADD CONSTRAINT
chk_invoices_anchor` is not (immaterial — migrations do not replay), and there
is no `CHECK (char_length(title) <= 200)`. The 200-char bound lives only in
`create_draft_studio_invoice`; a service-role write is unbounded. Related:
ruling **S12** ("the title is required") is likewise enforced only in the RPC —
a service-role INSERT can create a titleless studio invoice, after which the
earnings description falls back to `'Studio invoice'` and the ledger to
`'Studio'`. Both the `stripe-rail.test.ts` fixture and the machine-written rows
in `studio_invoice_test.sql:742-798` are exactly that shape, so the fallback is
load-bearing, not dead. Not a brief violation; a note for the orchestrator.

### R2-4 · minor (new) · an issued studio invoice re-judges live roster
### authority on every authenticated write

`00571:151-186` (UPDATE arm). After the machine early return, an authenticated
caller — including the SECURITY DEFINER billing RPCs, which arrive as
`v_active_role='authenticated'`, `current_user='postgres'` — must satisfy, on
*every* state write to an already-issued studio invoice:

* the actor is an active non-guest member of `NEW.studio_id`, **and**
* `NEW.client_id` still sits on the `designer_clients` roster of *some* active
  non-guest member of that studio.

The project path's analogue is a `projects` tuple that cannot change (the four
identity columns are immutable). A roster *can* change. So if the designer
tidies the household off their roster, or the only roster-holding member goes
inactive, `record_invoice_payment`, `void_invoice` and `chase_invoice` on an
outstanding studio invoice all start raising `studio_id_not_designer_studio` —
an opaque error on the money path, with no copy anywhere that explains it. The
Stripe/service-role rail is exempt (the early return sits above these reads, by
design, commit `9576fa0b5`), so the household can still pay; it is the studio
side that seizes.

This is deliberate and documented (the branch comment calls S4 "the row's law
on both arms", and `studio_invoice_test.sql:742-798` asserts it), so it is a
design ruling to confirm rather than a defect to fix. Confidence 0.75: derived
by reading the deployed body and the RPC call shapes. I could not run the probe
— see the environment note below — so the orchestrator should treat the
*consequence* as reasoned, not executed. If it is unwanted, the fix is to gate
the roster read on `TG_OP = 'INSERT'` the way the designer-domain check already
is, since `client_id`/`designer_id`/`studio_id` are immutable on UPDATE anyway.

### R2-5 · nit (new) · two small additions the brief did not ask for

Both are justified and documented, listed for scope accounting only:

* `title` appended to the trigger's `UPDATE OF` list (`00571:728-737`). Without
  it a direct `UPDATE … SET title = …` on an issued studio invoice never fires
  the gate. The normalized trigger definition is re-pinned at
  `public_sd_hardening_contract_test.sql:2379-2396` and the suite is green.
* `CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices (client_id)
  WHERE client_id IS NOT NULL` (`00571:1253`), behind the new household policy,
  which filters on `client_id` and nothing else.

### R2-6 · advisory · the `stripe-rail.test.ts` fixture bills the designer

`supabase/functions/_tests/stripe-rail.test.ts:255-266` seeds the studio invoice
with `client_id: ids.designerA` and no `designer_clients` row. It passes only
because the INSERT arm's service-role early return precedes the roster and
designer-domain checks. It proves the webhook/earnings leg on a null project,
which is what it is for; it does not exercise S4. Fine as written — worth
knowing when reading a green run.

---

## 6. Environment note (does not block anything)

My `db reset` and every gate above ran on this branch's ledger, tip **00571**.
Immediately after the gates, while I was cleaning up probe rows, a **peer session
reset the shared local stack to a 00569 ledger** (`approvals/w2-backend`):

```
$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 5;"
00569 / 00568 / 00567 / 00566 / 00565
$ psql … -c "select count(*) … proname='create_draft_studio_invoice';"
0
```

All the output above was captured before that. My probe rows (`7a00…`, `7a11…`)
went with the peer's reset, so nothing of mine is left on the stack. I did not
reset again — the peer is mid-work and the rule is explicit.

## 7. Brief coverage

Items 1–10 all delivered. Item 3's "register it in the SD roster the way 00511
registers `create_draft_invoice`" is met in the migration but not in the
contract test (R2-1). Item 7's Deno case is written and documented as
un-runnable in this lane. Item 4's `designer_earnings.project_id` uses
`i.project_id` rather than `pr.id` — equivalent. Nothing outside the lane is
touched: 24 files, all under `supabase/`, `packages/supabase/`,
`apps/designer-portal/src/…/accounts|document`, and the program's `build/`
folder.
