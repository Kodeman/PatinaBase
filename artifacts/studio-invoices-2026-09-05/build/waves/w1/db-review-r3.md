# W1 DB lane — adversarial review, round 3

Reviewer: separate context, did not write the code and did not review it before.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`
(`git rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`),
branch `studio-invoices/w1-db`, base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`,
HEAD `5b2cfd777`, 12 commits.

> **File name.** The brief said to write `db-review-r2.md`, but `db-review-r1.md`
> and `db-review-r2.md` already exist on the branch as two earlier, distinct
> reviews. Overwriting one would destroy program history, so this is
> `db-review-r3.md`.

**Verdict: fix.** One **blocker** — the studio branch of the trigger will accept
a studio invoice addressed to *any* profile in the database, with no
`designer_clients` relationship at all, and it can be issued and delivered into
that person's letterbox (proven end to end). Ruling **S4** says the household
must be on a studio member's roster; the RPC enforces it, the trigger — which
the plan (§9 B1) and the lane's own suite call "the last word" — does not. One
**major** (the same branch lets a member stamp any co-member as the earner).
Everything else is polish. Every gate is green; every function body was rebased
on its true head; the money arithmetic, the Checkout rail, the earnings row, the
counter, and the household/co-member/stranger read boundary all probe clean.

---

## Gates run (all green)

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` | clean; ledger tip `00571, 00568, 00567` |
| `bash <wt>/scripts/run-sql-tests.sh` | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0 · effective-green 157/157` |
| — `billing/studio_invoice_test.sql` | PASS |
| — `edge_api/public_sd_hardening_contract_test.sql` | PASS |
| — `billing/invoice_checkout_integrity_test.sql` | PASS |
| — `commercial/multi_studio_signature_test.sql` | PASS |
| — `rls/00563_proposal_signing_multi_studio.test.sql` | PASS |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`) |
| `pnpm --filter @patina/supabase test -- use-invoices` | 48 passed (1 file) |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- accounts desk-receivables` | 3 suites, 12 tests passed |
| extra — `... test -- use-desk-engagements desk-derivation command-bar` | 3 suites, 142 passed |
| extra — `pnpm --filter @patina/client-portal test -- threshold letterbox earlier-invoices active-project` | 49 suites, 951 passed |
| extra — `deno check --config supabase/functions/deno.json supabase/functions/_tests/stripe-rail.test.ts` | `Check … stripe-rail.test.ts` (clean; the suite itself is integration-only) |

## Rebase proof — every body came off its TRUE head

```
grep -rln "CREATE OR REPLACE FUNCTION[^(]*set_invoice_studio_id" supabase/migrations/*.sql | sort | tail -3
  00318_studio_invoice_numbering_and_ops.sql / 00511_public_sd_hardening.sql / 00571_studio_invoices.sql
grep -rln "…apply_invoice_payment_effects…"  → 00178 / 00277_refund_reconciliation.sql / 00571
grep -rln "…resolve_studio_identity…"        → 00320_studio_branding_read_and_logos.sql / 00571
```

Body diff, 00511 head → 00571 (`difflib.unified_diff`, n=0):
**`added 145  removed 0`** — every project-path line byte-identical.
`apply_invoice_payment_effects`: exactly two hunks (LEFT JOIN, `COALESCE(pr.name, i.title, 'Studio invoice')`); refund-contra leg untouched.
`resolve_studio_identity`: exactly two hunks (the third arg, the step-0 short-circuit).

Deployed hash matches the pin:
```
SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex'), octet_length(prosrc) FROM pg_proc WHERE proname='set_invoice_studio_id';
99100c8e3832adf7d7a27a22eab3651f3154d28be28dfeabe8d1dbd3f7ed2878 | 23106
```
= `public_sd_hardening_contract_test.sql:1708`. One overload each; ACLs:
`create_draft_studio_invoice → postgres=X/postgres,authenticated=X/postgres` (anon and PUBLIC revoked),
`resolve_studio_identity → postgres,anon,authenticated,service_role`.

## Prior-round findings — status

| id | was | now | evidence |
|---|---|---|---|
| F1 ungated status write | blocker | **FIXED** | both studio branches now carry the project path's clean-draft predicate; suite `studio_invoice_test.sql:418-497` pins INSERT + UPDATE refusals; trigger fire order (`set_invoice_studio_id` < `set_invoices_updated_at`) makes the `updated_at` term safe |
| F2 Checkout rail unproven | major | **FIXED** | `studio_invoice_test.sql:156-217` drives claim → finalize → settle and asserts paid + earnings `project_id IS NULL` |
| R2-1 migration-number collision | major | **FIXED** | `00569` = `approvals/w2-backend`, `00570` = `approvals/w2-web`, lane holds `00571` — free |
| F3 stack-reset log | minor | **PARTLY** | see R3-7: the log has now *forked* into two divergent copies |
| F4 no contract pin for the new SD RPC | minor | **UNCHANGED** | `grep -rn create_draft_studio_invoice supabase/tests/` → only `billing/studio_invoice_test.sql` |
| F5 bogus `p_studio_id` short-circuits | minor | **UNCHANGED** | `00571:1225-1230` sets `v_studio_id` before the FOUND test |
| F6 no `has_designer_domain_role` | minor | **UNCHANGED → escalated** | see R3-2, now with the earnings consequence proven |
| F7 hook forces `kind:'adhoc'` | nit | **UNCHANGED** | `use-invoices.ts:786` |
| F8 unguarded ADD CONSTRAINT / no title length CHECK | nit | **UNCHANGED** | `00571:47-55` |

---

## R3-1 · BLOCKER — a studio invoice can be addressed to anyone, and delivered

`00571` PART 2, both studio branches (`:104-118` UPDATE arm, `:213-227` INSERT arm).
The branch requires `NEW.client_id IS NOT NULL` and nothing more. Ruling **S4**:
"addressed to a household on a studio member's `designer_clients` roster, never
an email-only recipient." `create_draft_studio_invoice` enforces that
(`00571:730-746`, `42501` on a foreign household — suite `:358-371`). The
trigger, which the plan §9 B1 and `studio_invoice_test.sql:389` both call the
last word, does not. On the project path this is structurally impossible: the
row must match `projects.client_id`.

Probe, as an authenticated active owner of an active `design_studio`, against a
profile with **no** `designer_clients` row to anyone:

```
P1 → INSERT invoices(project_id NULL, client_id <stranger>, studio_id <mine>, status 'draft')
     id 445b3850-… | client_id a1110000-…0003 | P1 STRANGER HOUSEHOLD ACCEPTED
P2 → issue_invoice(…) → number=INV-0001 status=sent      (a real number off studio_invoice_counters)
P3 → read back as the stranger (request.jwt.claims sub = stranger):
       P3 stranger letterbox rows = 1
       P3 stranger line rows     = 1
```

So any designer with a studio can put a $2,500 invoice, correctly numbered and
branded, into an arbitrary Patina account's letterbox, where `invoices_household_select`
(PART 5) shows it and the Checkout rail will take the money.

**Fix (both branches, mirroring what the RPC already does).** After the
actor-membership `EXISTS`, require the household to sit on the stamped
designer's roster:

```sql
OR NOT EXISTS (
  SELECT 1
  FROM public.designer_clients AS roster
  WHERE roster.designer_id = NEW.designer_id
    AND roster.client_id  = NEW.client_id
)
```

Non-locking, reads no project, so the pinned lock order is untouched — but the
body hash must be re-pinned at `public_sd_hardening_contract_test.sql:1708`.
Add to `studio_invoice_test.sql`: a direct INSERT with a household on nobody's
roster → `P0001`, and the existing roster case still accepted.

## R3-2 · MAJOR — a member can stamp any co-member as the earner

Same branches. `NEW.designer_id` need only be an active non-guest member of the
studio: no `has_designer_domain_role` (the project path requires it at
`:432`, `:514`), and no roster relationship. RLS does not close it —
`invoices_studio_insert WITH CHECK is_studio_comember(designer_id)`.

```
P6 → as member A, INSERT invoices(designer_id = B, client_id = A's household, project_id NULL)
     P6 A stamped B as designer_id: ACCEPTED, invoice c47c35f6-…
```
B has `is_designer = false` and no `designer_clients` row. Once that invoice
settles, `apply_invoice_payment_effects` writes B the `design_fee`
`designer_earnings` credit. Intra-studio, so lower blast radius than R3-1, but
it is an authority-model delta the plan never ruled on. The R3-1 fix above (keyed
on `NEW.designer_id`) closes the roster half; adding
`AND public.has_designer_domain_role(NEW.designer_id)` closes the rest — an
orchestrator ruling, since a studio invoice genuinely has no project lead.

## R3-3 · MINOR — the household read path has no index behind it

`invoices_household_select` filters `client_id = auth.uid()`, and
`useClientInvoices()` (`use-invoices.ts:497`) is a deliberately unscoped
`select('*, line_items:invoice_line_items(*)')` that leans entirely on it. There
is no index on `invoices.client_id`:

```
idx_invoices_designer_status | idx_invoices_due_date_live | idx_invoices_project |
idx_invoices_studio | invoices_pkey | uniq_invoices_designer_number_studioless |
uniq_invoices_studio_number
```

Every homeowner letterbox load seq-scans `invoices`. Also, the three new policies
call bare `auth.uid()` (per-row) rather than `(select auth.uid())` (one InitPlan)
— parity with 00178, but the new policy is the one that will run unscoped.
Fix: `CREATE INDEX idx_invoices_client ON public.invoices (client_id) WHERE client_id IS NOT NULL;`

## R3-4 · MINOR — nothing in the test tree pins the new SD RPC

Brief item 3 said "register it in the SD roster the way 00511 (~:7189) registers
`create_draft_invoice`". The migration carries a one-shot `DO $studio_draft_roster$`
(`00571:940-1004`) asserting overload count, SECURITY DEFINER, proconfig, result,
lock order and the exact ACL tuple — sound, and `db-notes.md` explains why it could
not join 00511's closed VALUES roster. But a one-shot runs once, at apply time; the
contract test pins `create_draft_invoice` forever (`:2085-2115`: count, prosecdef,
proconfig, args, result, sha256, octet_length). The studio sibling can drift silently
after merge. Add a sibling row/DO block to the contract test.

## R3-5 · MINOR — `resolve_studio_identity` on a bogus studio id

`00571:1225-1230` sets `v_studio_id := p_studio_id` before the organizations read,
so a non-NULL id that matches no row skips steps 1 and 2 and lands on the profile
identity. Unreachable from a real invoice (`studio_id` is FK-checked), so an
edge-case note: only short-circuit when the organizations read `FOUND`.

## R3-6 · MINOR — a dead "document ↗" on the ledger row

`invoice-folio.tsx:355` hides the doorway on a studio invoice
(`documentProjectId && invoice.project && onOpenDocument`). `accounts-ledger-page.tsx:143-148`
still renders its own `document ↗` button unconditionally; the null is swallowed
in `accounts-book.tsx:89` (`if (!projectId) return;`). Type-safe, but the designer
gets a control that silently does nothing. Two treatments of the same case.

## R3-7 · MINOR — the stack-reset log has forked; db-notes is stale

`artifacts/.../w1/stack-reset-notice.md` exists in **two divergent copies**: the
lane branch's (fix rounds 1 and 2) and the main checkout's (review rounds 1–3),
which is the one every reviewer brief points at. `diff` shows each is missing the
other's last two lines. Also `db-notes.md:38` still says the trigger diff is
"96 lines added, 0 removed (48 per arm)"; the fix-round section and the migration
banner correctly say 145.

## Nits

- **R3-8** (F7) `useCreateDraftStudioInvoice` forces `kind: 'adhoc'` on every
  line (`use-invoices.ts:786`), so a mis-typed milestone line becomes a silent
  adhoc line instead of surfacing the RPC's explicit `check_violation`.
- **R3-9** (F8) `ADD CONSTRAINT chk_invoices_anchor` is unguarded while
  `ADD COLUMN title` is `IF NOT EXISTS`; `title` is bounded to 200 chars only
  inside the RPC — direct DML is unbounded.
- **R3-10** `create_draft_studio_invoice` does not filter `designer_clients.status`
  (`lead | proposal | active | completed | nurture`), so a `lead`-state roster row
  bills exactly like an active client. Deliberate or not, it is unstated.
- **R3-11** A single line at the documented bounds (`quantity 100000`,
  `unit_amount_cents 1000000000`) raises `22003 integer out of range` rather than
  the clean `23514`. Exact parity with `create_draft_invoice`'s bounds, so not a
  lane regression.
- **R3-12** Deleting a household profile that owns a studio invoice fails with the
  opaque `P0001 studio_id_not_designer_studio` (FK `ON DELETE SET NULL` trips the
  identity-immutability check) rather than a named constraint. `db-notes.md`
  documents it as latent; parity confirmed — deleting a *project* client is
  already blocked today (`23514 proposal client identity may only change through
  set_document_client`).

## What probed clean

- Money: `round(quantity * unit_amount_cents)::integer` then `round(subtotal * tax_rate)::integer`,
  byte-identical to `create_draft_invoice`. `1.5 × 3333 @ 8%` → `subtotal 5000, total 5400`.
  Integer cents throughout; no ungated status write outside R3-1's authority gap;
  webhook and rollup trigger untouched; `refunded` handling untouched.
- Payload rejections, all `23514` except where noted: negative cents, zero quantity,
  quantity > 100000, missing `kind`, `kind:'ffe'`, an extra `milestone_id` key,
  reserved `metadata.drawId`, blank description, non-array `p_lines`; foreign
  household and non-member studio → `42501`.
- Immutability: `UPDATE invoices SET project_id = NULL` on a project invoice →
  `P0001 studio_id_not_designer_studio`. The anchor CHECK cannot be reached
  around.
- Numbering off `studio_invoice_counters` (`INV-0001`), and a two-studio designer
  draws off the studio named, not the primary (suite `:278-311`, `:561-575`).
- Read boundary: household reads the issued invoice + lines + payment, not the
  draft; co-member reads; stranger gets **zero rows**, never an error that
  confirms existence.
- Generated types, hooks exports, and portal null-safety match brief items 8–10;
  every invoice `select` is `*`, so `title` arrives without select changes.
