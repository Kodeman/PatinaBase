# W1-close DB lane — adversarial review, round 1 (re-run)

Reviewer: separate context; did not write this code. This step ran once before
(the earlier `db-review-r1.md` / `db-review-r2.md` in this folder, HEAD then
`ae06d2699` / `6160651e2`); the prior round-1 file is preserved beside this one as
`db-review-r1-run1.md`. Since the earlier round 2 only program docs moved
(`git diff --stat e3c6dc54c..HEAD` → `db-notes.md`, `w1/db-review-r2.md`,
`stack-reset-notice.md`; zero SQL). Everything below was re-derived on a fresh
stack, not copied.

```
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db rev-parse --show-toplevel
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db
git -C … branch --show-current            studio-invoices/w1-db
git -C … log --oneline 07bfdd55c..HEAD    15 commits (d7b9a302a … 5b2cfd777)
git -C … diff --stat 07bfdd55c...HEAD
  supabase/migrations/00571_studio_invoices.sql              | 124 ++++-
  supabase/tests/billing/studio_invoice_test.sql             | 345 +++++++++++-
  supabase/tests/edge_api/public_sd_hardening_contract_test.sql |  19 +-
  + 7 program docs                                          10 files, +2353/−122
```

**Verdict: fix** — one **major** (F1, confidence 0.55), no blocker. All four ruled
items are delivered exactly as briefed, every gate is green, every rewritten body
sits on its true head with the project path byte-identical, and the suite pins
each item. F1 is a parity gap the two earlier rounds saw and accepted as designed;
I am reporting it as major because the ruling's letter is "BOTH arms" and the
project path holds the same machine INSERT to its tuple. If Fable rules F1 a
carry, nothing else here is above minor and the lane is ship-ready.

---

## Gates (run by this reviewer, from the worktree; logs in the scratchpad)

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` (STACK OWNER; notice appended to `w1/stack-reset-notice.md` in both copies) | `RESET EXIT=0` · `Finished supabase db reset on branch main.` · 524 `Applying migration` lines, `:529 Applying migration 00571_studio_invoices.sql...`; no 00569/00570 on the ledger |
| `bash <wt>/scripts/run-sql-tests.sh` (unsandboxed) | `SQL SUITE EXIT=0` · `total 157 · green 136 · expected-fail 21 · unexpected-fail 0 · effective-green 157/157` |
| — `billing/studio_invoice_test.sql` | PASS (0s) |
| — `edge_api/public_sd_hardening_contract_test.sql` | PASS (1s) |
| — `billing/invoice_checkout_integrity_test.sql` · `commercial/multi_studio_signature_test.sql` · `rls/00563_proposal_signing_multi_studio.test.sql` | PASS · PASS · PASS |
| `pnpm --dir <wt> --filter @patina/supabase type-check` | `TC SUPABASE EXIT=0` (`tsc --noEmit`, no output) |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | `TC DESIGNER EXIT=0` (`tsc --noEmit`, no output) |

## True-head proof (anchored grep + `difflib.unified_diff`, n=0, run here)

```
set_invoice_studio_id          → 00318 / 00511 / 00571        head 00511
apply_invoice_payment_effects  → 00178 / 00277 / 00571        head 00277
resolve_studio_identity        → 00320 / 00571                head 00320
create_draft_studio_invoice    → 00571 only
(no CREATE FUNCTION-without-REPLACE or ALTER FUNCTION on any of the three)

set_invoice_studio_id:         00511 436 lines → 00571 635 lines; added=199 removed=0
                               hunks @@ -30,0 +31,103 @@ (UPDATE arm) and @@ -57,0 +161,96 @@ (INSERT arm)
                               → every project-path line byte-identical
apply_invoice_payment_effects: 138 → 139; added=3 removed=2 — exactly the two ruled hunks
                               (LEFT JOIN projects; COALESCE(pr.name, i.title, 'Studio invoice'))
resolve_studio_identity:       69 → 83; added=15 removed=1 — the guarded step-0 SELECT and
                               `IF v_studio_id IS NULL AND p_project_id IS NOT NULL`
```

Headers unchanged from the heads (00320: `STABLE SECURITY DEFINER SET search_path = public`;
00277: `SECURITY DEFINER SET search_path = public, pg_temp`). The 00511 trigger list
(`00511:3076-3085`) is reproduced verbatim in `00571:728-736` with `title` appended.

## Live catalog after the reset

```
set_invoice_studio_id  sha256 b6f0ab2a38d6bbbf286df30d115dac544dcae96ed494c3235692feafb9a3cc89 | 26272
                       = public_sd_hardening_contract_test.sql:1719
pg_get_triggerdef      … ar_last_chased_at, created_at, updated_at, title ON public.invoices FOR EACH ROW …
triggers on invoices   ae_invoice_sent_dispatch · ae_payment_received_dispatch · set_invoice_studio_id · set_invoices_updated_at
idx_invoices_client    CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id) WHERE (client_id IS NOT NULL)
chk_invoices_anchor    CHECK ((project_id IS NOT NULL) OR ((client_id IS NOT NULL) AND (studio_id IS NOT NULL)))
ACL create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb)  {postgres=X/postgres,authenticated=X/postgres}
ACL resolve_studio_identity(uuid,uuid,uuid)   {postgres,anon,authenticated,service_role}
ACL apply_invoice_payment_effects(uuid)       {postgres,service_role}
policies *_household_select on invoices / invoice_line_items / invoice_payments: {authenticated}, SELECT
seed/00-legacy-grants.sql carries the 3-arg resolver and the new RPC (12973-13003)
```

## The four ruled items — delivered?

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | R3-1 roster EXISTS on BOTH arms, the RPC's rule, same error family, project path untouched, hash re-pinned, r3 stranger-bill rejection + positive case in the suite | **DELIVERED** (see F1 for the machine exemption) | UPDATE arm `00571:173-182`, INSERT arm `:296-305`: `designer_clients ⋈ organization_members ON organization_id = NEW.studio_id AND user_id = dc.designer_id WHERE client_id = NEW.client_id AND status='active' AND role<>'guest'`, each `RAISE EXCEPTION 'studio_id_not_designer_studio'` (P0001); removed=0; pin `b6f0ab2a…`; suite `:540-567` (the r3 probe shape: authenticated owner, `project_id NULL`, stranger `client_id`, own studio → P0001, row never landed), `:596-611` positive, `:742-797` UPDATE arm |
| 2 | R3-2 resolver short-circuits only on `type='design_studio' AND status='active'`, else falls through; anon test manufacturer → fallback, active studio → itself | **DELIVERED** | `00571:1332-1338`; steps 1/2 gated on `v_studio_id IS NULL`; suite `:799-839` as `anon`. My probes: manufacturer → all-NULL; deactivated studio → all-NULL; deactivated + designer A → A's primary studio; manufacturer + project → the project's studio |
| 3 | R3-3 trigger recreated with `title` in `UPDATE OF`; `pg_get_triggerdef` contains `title` asserted | **DELIVERED** | `00571:727-736`; suite `:712-716`; contract test `:2379 / :2392 / :2396` re-pinned |
| 4 | R3-7 `idx_invoices_client` partial index, asserted | **DELIVERED** | `00571:1253-1255`; suite `:718-723`; live `pg_indexes` row above |

Close section: `w1/db-notes.md` has both Close sections (`:657`, `:912`) and the C-1 fix
round (`:802`); main-checkout and worktree copies are byte-identical (`diff` exit 0).
`deploySet = ['migration 00571_studio_invoices.sql']`.

Also on the branch beyond the four (both from the earlier close rounds, both re-verified):
`has_designer_domain_role(NEW.designer_id)` on the INSERT arm and in the RPC's roster
resolution (`aaf511c5a`), and the C-1 reorder on the UPDATE arm (`9576fa0b5`) — the
machine early return now precedes the membership/studio-active read, and the suite's
final section settles a claim → finalize → settle with the stamped designer suspended.

## Probes (this reviewer's; `scratchpad/probes.sql`, one transaction, rolled back)

```
P1a service_role  UPDATE invoices SET project_id=NULL (seeded cc01)   REFUSED P0001
P1b postgres      same                                                REFUSED P0001
P2  project-path control: manual check payment on cc01 → designer_earnings
      project_id=b0…c0d1  desc="Invoice INV-2026-0301 — Cedar Lane Study"  status=paid  net=1000
      invoice → partially_paid/1000                                    (00277 leg unchanged)
P3  RPC as A: negative cents 23514 · quantity 0 23514 · extra key 23514 · manufacturer studio 42501
      · deactivated studio A owns 42501 · bill self 42501 · tax 1.5 23514 · terms 400 23514
      · 100000 × 1e9 → 22003 "integer out of range" · three 1e9 lines → 22003   (F6)
      · lead-status roster household → ACCEPTED                                  (F2)
      · rounding: lines 333,500 / header 833/69/902, sum(lines)=subtotal
P4a service_role INSERT studio invoice for a STRANGER household          ACCEPTED   (F1)
P4b service_role INSERT stamped to non-designer co-member B              ACCEPTED   (F1)
P4c service_role INSERT into a deactivated studio                        REFUSED P0001
P5a A direct DML, lead-status roster                                     ACCEPTED   (F2)
P5b A direct DML, deactivated studio                                     REFUSED P0001
P5c A direct DML, title NULL                                             ACCEPTED   (F3)
P5d A direct DML under Studio Two (household on A's roster; A in Two)   ACCEPTED (by design)
P6  acts as A: issue → sent INV-0001 · chase → ar_last_chased_at stamped · record_invoice_payment(check 5000)
      → partially_paid/5000, earnings paid / project_id NULL / 5000 / "Invoice INV-0001 — Acts invoice"
      · issue → void → void
P7a/b household removed from every roster: authenticated chase / void   REFUSED P0001 (F4)
P7c/d same, service_role reminder write / void                           ACCEPTED
P9a household reads the issued row (internal_notes visible — F10); drafts 0; UPDATE memo → 0 rows (RLS)
P9b household get_invoice_payment_options → keys check_remit_to,card_surcharge_bps
P9d stranger rows/lines/payments 0/0/0 · P9e stranger pay options → P0001 invoice_not_found (no existence leak)
P9f co-member B reads 1 · P9g B title write on an issued row → 0 rows (RLS draft-only)
P10 anon: active studio by id → its name (C2-7, ruled) · manufacturer → NULL · deactivated → NULL
      · deactivated + designer A → RV Studio One (fall-through) · manufacturer + project → Local Dev Studio
      · household uuid as designer → NULL · create_draft_studio_invoice → 42501
      · SELECT invoices with claims cleared → 0 rows (a first read of 1 row was my leftover
        request.jwt.claims under the anon role matching 00178's PUBLIC-role policies — pre-existing, not 00571)
P11 numbering off studio_invoice_counters: INV-0001/0002/0003, next_number=3
```

---

## Findings

### F1 · MAJOR (0.55) — the INSERT arm exempts the machine from the roster and designer-domain checks the project path applies to it

`00571:268-270`: on the INSERT arm the `service_role OR v_postgres_migration` early
return sits **above** the roster `EXISTS` (`:296-305`) and `has_designer_domain_role`
(`:306`). On the project path the same `service_role` INSERT is held to the live
tuple: `:467-477` (`project.client_id IS NOT DISTINCT FROM NEW.client_id`, `status='active'`,
`FOR SHARE`) and `:488-490` (`has_designer_domain_role(NEW.designer_id)`) both run for
`service_role` — only `v_postgres_migration` skips them (`:463-465`). So the studio
branch is looser than the project branch exactly for the machine on INSERT:

```
P4a service_role INSERT, client_id = a profile on nobody's roster      ACCEPTED
P4b service_role INSERT, designer_id = co-member with no designer role ACCEPTED
```

The ruling reads "require the household to be on a designer_clients roster … in BOTH
the INSERT and UPDATE arms"; the delivered code requires it of *authenticated* actors
on both arms. No in-repo machine path inserts a studio invoice today, so the exposure
is a future edge-function bug or a service key, at which point RLS is already gone —
that is why I am at 0.55, and why the two earlier rounds treated it as the intended
"machine reconciles history" posture (the suite even relies on it at `:747-758`). But
"reconcile history" is the UPDATE arm's story; on INSERT there is no history, and the
project path does not extend it to the machine. **Fix (cheap):** on the INSERT arm only,
move the machine early return below the roster + `has_designer_domain_role` predicates
(keep the actor-membership `EXISTS` authenticated-only), re-pin the hash, and rewrite the
suite's UPDATE-arm fixture at `:747-758` as a `RESET ROLE` (postgres session) write.

### F2 · MINOR (0.9) — `designer_clients.status` is unfiltered in both the RPC and the trigger's roster gate (R3-10 / C2-3 carry, now pinned into the hash)

`P3 lead-status roster household via RPC: ACCEPTED` · `P5a lead-status roster direct DML: ACCEPTED`.
A household that is only a lead satisfies S4 at the row. Carry to W4 with R3-12/R3-13.

### F3 · MINOR (0.85) — S12 is still only the composer's law (C2-4 / M-1 carry)

`P5c NULL title direct DML: ACCEPTED`. The RPC refuses blank (`23514`, suite `:355-367`);
direct PostgREST DML writes a NULL-title studio invoice the ledger, folio, email
subject and Stripe product name all read. `title` is now watched by the trigger, so a
`title` clause in the studio branch's clean-draft predicate closes it. Not in the four.

### F4 · MINOR (0.8) — the ruled UPDATE-arm roster gate strands the authenticated acts the day the household leaves every roster (A-1 / A-1' carry)

`P7a chase … REFUSED P0001` · `P7b void … REFUSED P0001` · `P7c/P7d service_role ACCEPTED`.
The cost of "BOTH arms", already documented in `db-notes.md`. `issue_invoice`,
`void_invoice`, `chase_invoice`, `record_invoice_payment` all reach that arm as the actor.
Recorded so W4's roster-archive work knows the row is pinned to a *live* roster row.

### F5 · MINOR (0.8) — the C-1 comment's parity claim is inaccurate as written (C2-5 carry)

`00571:126-133` and the contract-test note (`:1712-1716`) say the UPDATE arm's
live-authority reads sit below the machine early return "exactly as the project path's
do". The project path re-reads the tuple (`:215-222`) and the `previous_lead`
provenance (`:224-234`) **before** its early return at `:236`; only membership/role
reads are absent there. Safe (the four identity columns are compared to OLD at
`:100-108`), but the next reader of a money-path gate will be misled.

### F6 · MINOR (0.7) — at-bounds payloads fail with `22003` instead of `23514` (R3-11 carry)

`100000 × 1e9` on one line, or three `1e9` lines, overflow `integer` in
`round(quantity * unit_amount_cents)::integer` / the `sum(...)::integer` subtotal →
`integer out of range`. The composer's R83 band will show an opaque error rather than
the payload message. Bound the sum (or the product) before casting.

### F7 · NIT (0.8) — the R3-3 comment overstates the hole it closes (C2-6 carry)

`00571:720-723` "could rewrite an issued studio invoice's title": both UPDATE policies
are draft-only; `P9g` co-member title write on an issued row → 0 rows. Item 3 is still
load-bearing (suite `:780-790` proves it on a draft whose authority is wrong).

### F8 · NIT (0.6) — lost wrap at `00571:1299-1300` (C2-9 carry)

### F9 · NIT (0.9) — `internal_notes` reaches the household through the whole-row policy (F-N3 carry)

`P9a … internal_notes=private studio note`. Pre-existing posture: 00178's project-keyed
client policy is also whole-row and `authenticated` holds SELECT on all 30 columns
(`information_schema.column_privileges`). Not new to 00571; a column-level REVOKE or a
view is a program-wide decision.

### F10 · NIT (0.6) — the "studio deactivated" leg of C-1 is proven by reading, not by a test

`P8 could not deactivate studio: P0001 organization_admin_column_protected` — a postgres
session cannot flip `organizations.status`, so neither the suite nor my probe exercises
the deactivated-studio replay the comment at `:126-133` names. The suspended-designer leg
is tested (`:841-905`) and the code path is the same early return.

### F11 · ADVISORY (ruled) — the 3-arg resolver now returns any active design studio's brand to anon by id (C2-7)

`P10a anon active studio by id → RV Studio One / studio`. Exactly what item 2 ruled;
brand columns only. On the record, not an objection.

### Carried unchanged from r3/r4 and the earlier close rounds (not re-litigated)

R3-4 no contract-test row for the new SD RPC · R3-6 unguarded `document ↗` in two ledger
files · R3-8 hook forces `kind:'adhoc'` · R3-9 unguarded `ADD CONSTRAINT` · R3-12
`ON DELETE SET NULL` vs the CHECK (latent) · F-N2 stripe-rail harness seed fails pre-lane ·
F-N5 narrower REVOKE list · bare `auth.uid()` in the three new policies (all `TO authenticated`).

## What probed clean

- Money: integer cents everywhere; the webhook still only flips `invoice_payments` and the
  00178/00277 trigger owns the rollup (suite `:189-239`; P2/P6 manual path); `refunded` posts
  the contra leg and drops the row to `sent` (suite `:242-262`); no ungated status write —
  the clean-draft bound holds on both arms (suite `:456-535`).
- Immutability: `project_id` cannot be nulled on a project invoice by `service_role` or a
  postgres session (P1a/P1b) — the CHECK cannot be reached around by UPDATE.
- RLS: household reads issued rows only, stranger 0/0/0 with no existence leak from
  `get_invoice_payment_options`, co-member reads; anon reads nothing with clean claims.
- Numbering: off `studio_invoice_counters` per studio (P11; suite `:301-332` two-studio).
- Grants: `create_draft_studio_invoice` executable by `authenticated` only (anon → 42501).
- Vision refusals: no homeowner-facing string was introduced on this branch (SQL comments and
  test assertion text only).
- Docs: `db-notes.md` Close sections mirrored byte-identical; `stack-reset-notice.md` appended
  in both copies for this reset.

`deploySet = ['migration 00571_studio_invoices.sql']`
