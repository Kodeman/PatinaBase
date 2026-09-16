# W4 — round-9 fix log

Four findings from `w4-review-r9-data-edge.md` (BLOCKING-1, MAJOR-1),
`w4-review-r9-qa.md` (Finding 1 = W4R9-1) and `w4-review-r9-code.md` (M-1).
Nothing else was touched. Every ruling in `rulings.md` §3 treated as settled.

No prod call of any kind: no `db push`, no `functions deploy`, no `secrets set`.
No server was started, so no port was taken. All work against
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No migration was
minted — 00636 and 00637 are unapplied on Strata and were edited in place.

---

## 1. BLOCKING-1 — the receipt letter revoked the address the payer was returning to

**Files:** `supabase/migrations/00636_invoice_link_hardening.sql`
(`ensure_invoice_link`, `resolve_invoice_return_nonce`, banner),
`supabase/functions/stripe-webhook/index.ts` (both side-effect paths).

**What was true.** The mint guard held only while an attempt was
`claimed` / `session_created` / `processing`. `settle_invoice_checkout_payment`
flips `invoice_payments.status = 'succeeded'` and 00428's
`sync_invoice_checkout_attempt` mirrors that onto the attempt in the same
statement — so the guard was already down when `sendSuccessSideEffects` asked
for the receipt's address, and the letter revoked the link the payer was
standing on. Both orderings ended on the dead sheet, and the same statement sat
on the failure path, killing the `/pay` address a declined card was about to
retry from.

**The fix, in two parts and one deliberate refusal.**

1. `ensure_invoice_link`'s guard now also holds for **24 hours after a
   LINK-BORNE attempt finalizes** `succeeded` / `failed` / `requires_refund`
   (`invoice_link_id IS NOT NULL`, `COALESCE(finalized_at, updated_at,
   created_at) > now() - interval '24 hours'`). A signed-in payer's attempt
   carries no link and rotates exactly as before; the folio's own Regenerate
   act is untouched (R-BW — a member's deliberate press with the consequence
   written beside it). While the guard holds the letter falls back to
   `letterFallbackUrl`'s `/?invoice=<id>`, which is R-BY's ruled shape.
2. `resolve_invoice_return_nonce` now resolves the link by **the attempt's own
   `invoice_link_id`** when it names one, with 00574's date rule behind it for
   a payer-id attempt, so the attempt and its link can never be read apart.
3. **A rescue was written and then removed.** An earlier pass had the resolver
   fall back to the invoice's current active link when the claimed link was
   revoked. `supabase/tests/billing/invoice_links_test.sql` caught it:
   *"F2: an old nonce dies with the link it was minted under"* — a nonce in
   Stripe's retained logs may never become an alias for a token minted after
   its attempt, because Regenerate is the designer's revocation act. The rescue
   was reverted, the rule is now stated in the function body, and the letter is
   what had to stop revoking. Recorded because it is the reason the fix is
   shaped the way it is.

**Edge.** `ensureInvoiceLinkUrl` moved from above `resolveRecipient` to inside
`if (recipient.email)` on both paths, so an invoice with no reachable recipient
no longer rotates its address for a letter that is never sent (the finding's
second consequence). Comments corrected accordingly.

**Evidence.** `artifacts/people-room-crm-2026-09-11/build/probe-r9-b-return-window.sql`
/ `.out`, on the reset DB:

```
 old_guard_holds | fixed_guard_holds
-----------------+-------------------
 f               | t

 letter_falls_back_rather_than_rotating : t
 status | still_the_payers_address  ->  active | t
 pay_address_opens   : t
 return_state        : rotated
 replayed_state      : spent          (R-BT, unchanged)
```

Test block 12 in `supabase/tests/people/w4_channels_touches_paperwork_test.sql`
carries the whole sequence, plus two controls: a day later the letter rotates
again (the guard lifts), and a nonce whose link a later mint revoked still
answers NULL (F2 intact).

---

## 2. MAJOR-1 — an `other_named` confirm superseded by type, not by name

**File:** `supabase/migrations/00637_paperwork_upload_door.sql`
(`confirm_inbound_document`, `record_inbound_compliance_document`, banner).

Both predicates gained a case-folded, trimmed `doc_label` leg applied when the
type is `other_named`, matching `resolve_paperwork_link`'s
`'other_named:' || lower(btrim(doc_label))` grouping exactly:

```sql
AND (
  v_doc.doc_type <> 'other_named'
  OR lower(btrim(COALESCE(d.doc_label, '')))
       = lower(btrim(COALESCE(v_doc.doc_label, '')))
)
```

**Evidence.** `probe-r9-a-other-named-supersede.sql` / `.out` — the review's own
shape (a firm holding one verified `Resale certificate`, gates `{payment}`,
sent a `Safety plan` with no gates):

```
 old predicate picks | Resale certificate | {payment}     <- face 1 and face 2
 fixed predicate picks | (0 rows)

 confirm_landed : t                                       <- the act is no longer inert
     doc_label      | verified | retired
--------------------+----------+---------
 Resale certificate | t        | f                        <- not retired any more
 Safety plan        | t        | f
```

Test block 11 adds the positive legs: a renewal inherits the gates of the paper
of its **own** name (case-folded — `'SAFETY PLAN'` inherits from `Safety plan`),
each named paper supersedes only its own predecessor, and the firm's page then
reads two current named papers.

---

## 3. W4R9-1 — the notice-log checkbox said "picked" in colour alone

**File:** `apps/designer-portal/src/components/document/roster/notice-log.tsx`
(+ `__tests__/notice-log.test.tsx`).

The box now carries a **check glyph** when picked — the rolodex picker's own
stamp (square, 2px radius, a check), drawn in `var(--color-charcoal)` so it
carries at 13px, beside the unchanged sage border and tint. `data-picked`
rides for the test. `aria-hidden` on the span is kept, so the checkbox's
accessible name is still the person's name.

`jest src/components/document/roster/__tests__/notice-log.test.tsx` — 9 passed,
including the new case asserting the mark appears, clears, and is not the only
difference.

---

## 4. M-1 — a firm that re-sent a refused paper got no receipt

**Files:** `apps/client-portal/src/components/paperwork/paperwork-model.ts`
(`receivedReading`), `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx`
(`isReceived`), + both `__tests__`.

`receivedReading` now treats `refused` exactly as `not_on_file`: state
`awaiting_check`, `rowSentence('awaiting_check', title, null)`, `blocksSentence`
and `reasonSentence` cleared, `openByDefault` false — which is the reading
00637's `grouped` CTE hands back on the very next load. The sheet's
`row.state !== 'refused'` guard is gone, so the receipt prints and focus moves
as for every other type. A refused row the firm has **not** acted on is
untouched: it arrives as `refused` with no `awaitingCheck`, so it keeps its
refusal, its reason and its open form (r7 M-4 stands until the firm acts).

`jest src/components/paperwork` — 3 suites, 57 passed, including the new
"gives a re-sent refused paper the same receipt every other paper gets" and the
rewritten model case.

---

## 5. Gates

Run on this worktree after `pnpm --dir … supabase:reset` (twice — the first
reset predated the F2 revert, and the second is the one these results are from).

| Gate | Result |
|---|---|
| `supabase/tests/people/w4_channels_touches_paperwork_test.sql` | **PASS** (blocks 1–12, the two new ones included) |
| `supabase/tests/billing/invoice_links_test.sql` | **PASS** (F2 assertion is the one that vetoed the rescue) |
| `supabase/tests/people/w4_invoice_link_freeze_order_test.sql` | **PASS** |
| `supabase/tests/commercial/design_build_test.sql` | **PASS** |
| `supabase/tests/people/w1a_…`, `w1b_…`, `w3_…`, `rls/people_directory_scope_test.sql` | **PASS** |
| `deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions/stripe-webhook/invoice-checkout-integrity.test.ts supabase/functions/_shared/invoice-links.test.ts` | **29 passed / 0 failed** |
| `deno check --config supabase/functions/deno.json supabase/functions/stripe-webhook/index.ts` | **clean**; no `deno.lock` left anywhere |
| `pnpm --dir apps/client-portal test` | **157 suites / 2569 tests passed** |
| `pnpm --dir apps/designer-portal exec jest …/notice-log.test.tsx` | **9 passed** |
| `pnpm --dir apps/designer-portal type-check` | **clean** |
| `pnpm --dir apps/client-portal type-check` | **RED, pre-existing and unrelated** — the single error is generated output, `.next/types/app/page.ts(37,29) TS2344 … 'undefined' is not assignable to type 'PageProps'`, on a file byte-identical to `origin/main` (r8 m-12 / r9 m-13, already on the books) |
| `python3 scripts/generate-legacy-grants.py` + `git status` on `supabase/seed/00-legacy-grants.sql` and `packages/supabase/src/database.types.ts` | **no diff** — no GRANT/REVOKE and no signature changed |

No `_shared/*` module was edited, so the W7 redeploy set is unchanged except
that `stripe-webhook` itself must redeploy.

## 6. Out of scope, deliberately

The ten minors in the data+edge review, the nine in the code review and the
four in the QA review are untouched — this round's brief named four findings.
The one place a neighbouring rule was consulted rather than followed is §1.3
above (F2), and it is recorded there rather than silently obeyed.
