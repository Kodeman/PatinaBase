# W4 fix log — round 7

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.

Scope of this pass: the ten findings named in the brief — `BLOCKING-1` / `M-3` (**R-BT** leg 1),
`MAJOR-1` (**R-BT** leg 2), `MAJOR-2` / `M-2` (**R-BU**), `MAJOR-3` / `M-1` (**R-BV**), `MAJOR-4`,
`MAJOR-5`, `M-4`. Nothing else was touched. 00636 and 00637 are unapplied on prod and were
edited in place; no migration number was minted.

---

## 1. `BLOCKING-1` / `M-3` — R-BT leg 1 — a cancel must not rotate the link

`invoiceCheckoutReturnBase` handed Stripe the `/pay/return/<nonce>` hop for **both** outcomes, and
`resolve_invoice_return_nonce` rotates the link row unconditionally. Pressing Back at Stripe
therefore re-addressed the link and killed the `/pay/<token>` in the client's inbox — for a
payment she had not made.

- `supabase/functions/_shared/invoice-checkout-driver.ts:211-223` — `invoiceCheckoutReturnBase`
  now returns `target.cancelUrl` for `'cancelled'` before the nonce branch is reached. The nonce
  hop is the success hop and only that.
- `supabase/functions/invoice-link-checkout/index.ts:248` — `cancelUrl: invoiceLinkUrl(CLIENT_PORTAL_URL, token)`,
  the `/pay/<token>` the guest actually opened (the raw token comes in on the request), so a
  cancel lands back on the sheet she came from rather than a letterbox she cannot reach.
  `create-checkout-session` already supplied a signed-in `cancelUrl`; it is unchanged.
- `supabase/migrations/00636_invoice_link_hardening.sql` banner — the "KNOWN HAZARD: two GETs …
  rotate twice" paragraph is gone; the nonce bullet now reads "ROTATES, ONCE, ON A SUCCESS ONLY
  (R-BT)" and names both legs.

Evidence: `supabase/functions/_shared/invoice-checkout-driver.test.ts` — the case is renamed
"the nonce address is the SUCCESS hop, and only that (R-BT)" and now asserts
`invoiceCheckoutReturnBase(claimed, target, 'cancelled') === target.cancelUrl`. 9/9 pass.

## 2. `MAJOR-1` — R-BT leg 2 — the nonce is spent by its first resolution

There was no consumed branch: a replayed GET (back button, prefetch, a mail client's link
scanner, a double tap) rotated again and killed the address the first redirect had just handed
the browser.

- `supabase/migrations/00636_invoice_link_hardening.sql` §2b — new
  `invoice_checkout_attempts.return_nonce_consumed_at timestamptz` (idempotent `ADD COLUMN IF NOT
  EXISTS`, with a `COMMENT`).
- Same file, §… — `DROP FUNCTION IF EXISTS public.resolve_invoice_return_nonce(text);` then
  `CREATE OR REPLACE … RETURNS jsonb` (the return type changed, so the drop is required).
  The claim is one statement — `UPDATE … SET return_nonce_consumed_at = now() WHERE return_nonce =
  p_nonce AND return_nonce_consumed_at IS NULL RETURNING id` — so two simultaneous GETs cannot
  both win it. Three answers: `{"state":"rotated","token":…}` on the first resolution,
  `{"state":"spent"}` on a replay of a nonce that really is on the books, `NULL` for malformed /
  unknown / revoked-link (00574's S2 silence, unchanged). SECURITY DEFINER with
  `SET search_path = public, extensions, pg_temp`; the grants block already named the function and
  is restated in §5, so the ACL is unchanged (service_role only).
- `apps/client-portal/src/app/pay/return/[nonce]/route.ts` — parses the jsonb into
  `ReturnNonceOutcome`; dead → `/pay/dead`, spent → 303 `/pay/used`, rotated → `/pay/<token>`
  with the carried params. A spent nonce has no readable address to give back (only the hash is
  stored), so R-BT's "never land on a dead page" needed a page of its own.
- `apps/client-portal/src/app/pay/used/page.tsx` (new) + `__tests__/page.test.tsx` (new) — one
  sentence, `data-testid="pay-return-used"`, `noindex`. `apps/client-portal/src/middleware.ts`
  now names `/pay/used` in the guest-route comment.
- `packages/supabase/src/database.types.ts` regenerated: `resolve_invoice_return_nonce` Returns
  `Json`, `invoice_checkout_attempts.return_nonce_consumed_at` on all three row shapes.

Evidence: `supabase/tests/billing/invoice_links_test.sql` — the five call sites now read the
jsonb, and a new block asserts the replay answers exactly `{"state":"spent"}`, that the rotated
address is still live after it, and that `return_nonce_consumed_at` was stamped by the first
resolution. `apps/client-portal/src/app/pay/return/[nonce]/__tests__/route.test.ts` covers the
spent → `/pay/used` hop and a shapeless answer reading dead.

## 3. `MAJOR-2` / `M-2` — R-BU — one row per doc type, and the state IS the word

`resolve_paperwork_link` computed each row's state from `expires_on` / `blocks` alone and carried
`awaiting_check` beside it as a flag, so an in-force certificate nobody had opened read `current`
on the firm's page while `compliance_state` read the same firm `not_on_file`. Two surfaces, one
fact, two answers.

- `supabase/migrations/00637_paperwork_upload_door.sql` — the documents aggregation is rebuilt as
  CTEs: `paper` (classifies every non-superseded row: `refused`, `unchecked`, `held_state`,
  `group_key` — `other_named` groups by lowercased label) → `held` (`DISTINCT ON (group_key)`,
  worst word first) → `unchecked_paper` → `refused_paper` → `keys` → `grouped` (three LEFT JOINs).
  `state` is the held state when the studio holds something, else `'awaiting_check'`, else
  `'refused'`. `awaiting_check` is kept as a derived boolean for the "Received" line, and
  `refusal_reason` is set only when nothing else stands. The `rejected_at IS NULL` filter is gone
  (see M-4). Still no ids, no file paths, no names.
- `apps/client-portal/src/components/paperwork/paperwork-model.ts` — `PaperworkDocument.state` and
  `PaperState` widened to include `'awaiting_check'` and `'refused'`, plus `refusal_reason`;
  `rowSentence` gained both sentences; `STATE_RANK` places `refused` between `lapsed` and
  `not_on_file`, `awaiting_check` between `not_on_file` and `lapses_soon`; `buildPaperworkRows`
  now trusts the RPC's per-type state instead of recomputing it.
- `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx` — `isReceived` no longer
  reads true for a refused row.
- A FULL OUTER JOIN was the first shape tried and Postgres refuses it here (the join condition is
  not merge/hash-joinable); the `keys` CTE + LEFT JOINs is the working form.

Evidence: `supabase/tests/people/w4_channels_touches_paperwork_test.sql` block 9b2 — coi_gl on a
firm that carries both a refusal and a later unchecked upload speaks exactly once, reads
`awaiting_check` rather than `current`, flips to `current`/`lapses_soon` the moment a member
confirms it. 154 + 8 client-portal paperwork/pay tests pass.

## 4. `M-4` — a refused document reaches the firm in the studio's own words

A rejected row was filtered out entirely, so the firm's page reverted from "Received. <Studio>
will confirm it." to "<Doc type> is not on file." and the refusal reached nobody — the chase is an
agent draft that lands `awaiting_review`, and Agent OS forbids automated external sends. The
reject act already promises the firm reads the reason.

- The `refused_paper` CTE above returns the most recent refusal, and it is the type's word only
  while nothing has replaced it.
- `paperwork-model.ts` — `reasonSentence(state, reason)`; `openByDefault: state === 'refused'`.
- `paperwork-sheet.tsx` — renders `row.reasonSentence` in terracotta with
  `data-paperwork-refusal={row.key}`.
- `artifacts/people-room-crm-2026-09-11/build/upload-door-spec.md` §3 copy table — two new rows,
  "Row, awaiting check (R-BU)" and "Row, refused (W4 r7 M-4)".

Evidence: block 9b2 (d) and (e) — a refused bond comes back with `state='refused'` and the typed
reason, and stops being the bond's word the moment the firm sends another.

## 5. `MAJOR-3` / `M-1` — R-BV — the minted address is component state, not cache

`invalidateInvoiceEffects` invalidated `['invoice-link', invoiceId]`, and four mutations call it
(`useIssueInvoice`, `useRecordPayment`, `useSendInvoice`, `useVoidInvoice`). Since 00636 froze
`invoice_links.token` at NULL, that refetch can only come back address-less — so any of those four
acts evicted the token one click after the folio printed "This address is shown once."

- `packages/supabase/src/hooks/use-invoices.ts` — the `['invoice-link', invoiceId]` invalidation is
  deleted (the parameter is kept and `void`-ed, with the reasoning written above the function).
  `useRegenerateInvoiceLink` no longer takes `useQueryClient()` and writes nothing to the cache.
- `apps/designer-portal/src/components/document/accounts/invoice-folio.tsx` — the mint's return
  value is held in `useState<{invoiceId, token}>`, keyed by invoice so a folio switch cannot show
  the wrong address; `clientInvoiceUrl` is built from that, never from the query.
- `apps/designer-portal/src/components/document/accounts/__tests__/invoice-folio-minted-address.test.tsx`
  (new) — this suite does **not** mock `@patina/supabase`. It mocks `@patina/supabase/client` (the
  same resolved module the package's own `../client` import reaches) and renders inside a real
  `QueryClientProvider`, so the real `useInvoiceLink` / `useRegenerateInvoiceLink` /
  `useSendInvoice` and the real cache are what the assertions see: `get_invoice_link` answers
  tokenless, the mint brings Copy up, Resend's real `invalidateInvoiceEffects` leaves the address
  on screen and fires no fresh `get_invoice_link`. That is the un-mocked coverage the finding asked
  for; the existing folio suite keeps its module mock for copy and act shape (13 sites rewritten
  onto a `mintAddress()` helper).
- `packages/supabase/src/hooks/__tests__/use-invoices.test.ts` — the F1 describe asserted the old
  contract and is rewritten to R-BV: each of the four acts leaves the link key alone while the rest
  of the fan-out still fires, and the regenerate test now asserts the hook has no `onSuccess` and
  calls no `setQueryData`.

## 6. `MAJOR-4` — a paid invoice is a receipt past the expiry

00636's backfill stamps a 30-day expiry on every link, paid invoices included, and
`resolve_invoice_link` refused an expired row before it reached the settled sheet — so on day 31
the address in the client's inbox, her only record of a bill she had already paid, went dead.

- `supabase/migrations/00636_invoice_link_hardening.sql` — the expiry test is now
  `IF NOT v_dead AND v_invoice.status <> 'paid' AND v_link.expires_at IS NOT NULL AND
  v_link.expires_at <= now() THEN RETURN NULL; END IF;`, with the reasoning and updated `COMMENT`s
  on both the function and `invoice_links.expires_at`. The pay door is untouched:
  `resolve_invoice_link_for_checkout` already refuses anything that is not `sent`/`partially_paid`
  with a positive balance, so the receipt is served and no Checkout opens.

Evidence: `supabase/tests/billing/invoice_links_test.sql` — a paid invoice's link pushed 31 days
past its expiry still answers its receipt and still buys nothing, while an **unpaid** invoice's
expired address is still dead.

## 7. `MAJOR-5` — `draw_certify` belongs to the money scope

`AUTHORITY_SCOPES.money` listed `money` and `change_order` only, so a certifier's texted approval
filed as `failed_no_authority` and the studio read "no authority on file" about the one party
holding exactly the grant that answers.

- `supabase/functions/sms-inbound/pipeline.ts:672` — `money: ["money", "change_order", "draw_certify"]`,
  with the reasoning (00624 gates `draw_certify` behind the same owner/admin PR-n test, and the act
  it names is the money act on `issue_agreement_draw_invoice`). `prepares_only` still decides
  within the class: F-03 and F-08 assemble the draw, they do not sign it.

Evidence: `supabase/functions/_tests/sms-inbound.test.ts` — two new cases on a `signoff`
(money-class) item: a `draw_certify` grant reads `passed`, a `prepares_only` one reads
`failed_no_authority`. `coordinationScenario` gained an optional `coordinationKind`.

---

## Gates run

| Gate | Result |
|---|---|
| `pnpm --dir <worktree> supabase:reset` | clean; 00636 + 00637 apply. Probes: `resolve_invoice_return_nonce` → `jsonb`, `resolve_paperwork_link` → `jsonb`, `invoice_checkout_attempts.return_nonce_consumed_at` present |
| `psql -v ON_ERROR_STOP=1` — `billing/invoice_links_test.sql`, `billing/invoice_checkout_integrity_test.sql`, `people/w4_channels_touches_paperwork_test.sql`, `people/w4_invoice_link_freeze_order_test.sql`, `people/w1b_compliance_authority_directory_test.sql`, `edge_api/public_rpc_authorization_contract_test.sql` | all green |
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/ supabase/functions/_tests/` | 771 passed, 1 pre-existing failure (below) |
| `pnpm --filter @patina/supabase type-check` / `test` | clean / 1435 passed |
| `pnpm --filter designer-portal type-check` / `test --testPathPattern document/accounts` | clean / 64 passed |
| `pnpm --filter client-portal type-check` / `test` | clean (see note) / 157 suites, 2563 passed |
| `pnpm --filter admin-portal build` (shared package edited) | clean |
| `python3 scripts/generate-legacy-grants.py` | regenerated (a function was dropped and recreated) |
| `supabase gen types typescript --db-url <local>` → `packages/supabase/src/database.types.ts` | regenerated |

No server was started; no prod mutation of any kind.

### Pre-existing / environmental, not introduced here

- `supabase/tests/edge_api/platform_acl_compatibility_test.sql` — the PUBLIC-residual assertion
  fails on two local-stack rows, `extensions.pg_stat_statements` and
  `extensions.pg_stat_statements_info` (SELECT to PUBLIC). Neither is touched by any migration in
  this wave; it is the local extension install, not a product finding.
- `supabase/functions/_tests/stripe-rail.test.ts` — its own seed fails at `insert projects` with
  `studio_id_not_designer_studio`, before any invoice-link code runs. `set_invoice_studio_id` comes
  from 00511/00571/00578 and neither it nor `projects` is touched by this pass.
- `apps/client-portal` type-check reports one error in the **generated** `.next/types/app/page.ts`
  (a stale build artifact from an earlier QA run, about the untouched root page). With
  `.next/types` moved aside, `tsc --noEmit` is clean; the artifact was restored afterwards.
