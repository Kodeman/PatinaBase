# 00588 — pay-page household name hotfix

**Shipped to Strata (`bkvcixdmuyejfzcijpdg`) 2026-09-09.** Database-only: no edge
function, service, or portal was redeployed, and none needed to be — the client
portal calls `resolve_invoice_link` per request, so replacing the function was
the whole cutover.

## Root cause

Every Middle West Studio **studio invoice** (`invoices.project_id IS NULL`)
rendered `for Jodi Kurhn and Terri Kalscheur` at
`client.patina.cloud/pay/<token>` — an unrelated, email-only lead from the
studio's roster.

00574's name derivation was:

1. `profiles.full_name` / `display_name` of `coalesce(invoices.client_id, projects.client_id)`
2. if that is NULL — `min(designer_clients.client_name)` `WHERE designer_id = invoice.designer_id AND client_id IS NULL … HAVING count(*) = 1`

Step 2 is keyed on the **designer**, and explicitly on `client_id IS NULL`, so by
construction it can never describe a payer who exists. Middle West's households
all sit on the roster with `client_name` NULL and only `client_email` set, and
their profiles carry no `full_name`, so step 1 returned NULL and every one of
those invoices fell into step 2 and printed whichever single email-only row the
roster happened to hold.

The same derivation was inlined in `resolve_invoice_link_for_checkout`, so the
Stripe customer was given the same wrong name (the F14 contract — page and
checkout must name the payer identically — held, but held on a wrong value).

## The fix

`CREATE OR REPLACE` on both resolvers (never DROP/CREATE — the ACL posture is
pinned by `supabase/tests/billing/invoice_links_test.sql` and
`supabase/tests/edge_api/platform_acl_compatibility_test.sql`). One shared
order, term for term in both functions:

1. `profiles.full_name` → `display_name` of the payer
2. **new** — `designer_clients.client_name` for the payer's **own** row
   (`dc.client_id = v_payer`)
3. **new** — the address the studio entered: `designer_clients.client_email` for
   that same row, else `profiles.email` of the payer
4. the designer-wide email-only fallback, **gated to the payer-less branch** and
   unreachable whenever a payer exists

Row choice in steps 2/3 is `ORDER BY (dc.status <> 'lead') DESC, dc.created_at,
dc.id LIMIT 1`, with the value test (`nullif(btrim(...), '') IS NOT NULL`) in the
`WHERE` ahead of the `LIMIT`. 00331 re-scoped
`idx_designer_clients_unique_profile` to `WHERE client_id IS NOT NULL AND status
<> 'lead'`, so a promoted household's lead row survives beside its active row and
is usually the older of the two; `created_at` is the transaction timestamp, so
`dc.id` breaks ties that would otherwise let the two resolvers diverge.

## Commits (branch `fix/invoice-link-household-name`)

| SHA | Message |
|---|---|
| `a315ff04c` | fix(invoices): name the pay page's household from the invoice's own payer, not the designer roster |
| `c7c67abb3` | fix(invoices): prefer the active roster row and check names before choosing it |
| `d940f224d` | test(invoices): pin roster row choice for the pay-page household name |
| `79fe6a4bc` | docs(invoices): correct the resolve_invoice_link grant note |

Fast-forwarded onto `main`: `48962a9b4..79fe6a4bc`.

## Strata ledger

| | head |
|---|---|
| before | `00586` (only pending local file: `00588`) |
| after | `00588` — `{'local': '00588', 'remote': '00588'}` |

ACL posture unchanged by the REPLACE, confirmed on prod after the push:

```
resolve_invoice_link              | prosecdef=t | search_path=public, pg_temp | {postgres=X/postgres,service_role=X/postgres}
resolve_invoice_link_for_checkout | prosecdef=t | search_path=public, pg_temp | {postgres=X/postgres,service_role=X/postgres}
```

`service_role` only; `anon` and `authenticated` absent, as J33 requires.

## Verification on prod

Every Middle West studio invoice, `resolve_invoice_link(token, false)` (no
view-count bump):

| Invoice | resolved `client_display_name` | roster `client_name` | roster `client_email` |
|---|---|---|---|
| INV-0001 | Leda Rawlins | — | ledarawlins@gmail.com |
| INV-0002 | hartjeslindsay@gmail.com | — | hartjeslindsay@gmail.com |
| INV-0003 | jami.chapman79@tds.net | — | jami.chapman79@tds.net |
| INV-0004 | gmbennett11@gmail.com | — | gmbennett11@gmail.com |
| INV-0005 | matt@kipcc.com | — | matt@kipcc.com |
| INV-0006 | j.enzenroth@gmail.com | — | j.enzenroth@gmail.com |

INV-0001's payer holds a real `profiles.full_name`, so it names her rather than
her address — step 1 still wins where a name exists. The seventh studio invoice
for this studio is `void` with `invoice_number` NULL and **zero** `invoice_links`
rows: it was voided before issue, so it has no public page and nothing to verify.

- `resolve_invoice_link_for_checkout` for INV-0006's token →
  `j.enzenroth@gmail.com`, `has_payer=true`, `balance_cents=60000` — F14 holds.
- Platform-wide sweep: `0` active links anywhere resolve to a name matching
  `%Kurhn%`.
- Live HTTP `GET https://client.patina.cloud/pay/0cf9983b…21517` → 200, and the
  rendered markup contains `for <!-- -->j.enzenroth@gmail.com`; zero occurrences
  of `Kurhn` or `Kalscheur`. No cache bypass was needed.

## Rollback

One file, both prior bodies verbatim as captured from prod immediately before the
push:

`artifacts/studio-invoices-2026-09-05/build/hotfix-00588/rollback-prod-bodies.sql`

Run it whole against Strata. Both statements are `CREATE OR REPLACE`, so owner,
`SECURITY DEFINER`, `search_path` and the service_role-only ACL survive. It
restores the bug, so it is a last resort.

## Follow-ups owed

- **`00587` on `studio-asks/2026-09-09` now needs `supabase db push --include-all`.**
  Strata's ledger jumped `00586 → 00588`, so 00587 is below the remote head and
  an ordinary push will skip it.
- `supabase/tests/edge_api/platform_acl_compatibility_test.sql:410` registers
  `('public.resolve_invoice_link(text,boolean)', 'authenticated')` as a required
  named EXECUTE grant. No such grant exists or should exist (00574:1731-1746 and
  J33). That assertion is currently masked because the file exits earlier at
  `:164` on the documented `KNOWN_FAILURES.md` Group 1 local-image residual — it
  will fail the moment that residual is fixed. Not touched here.
- `invoice_links_test.sql`'s comment "anon cannot even call the resolver;
  authenticated can" is stale for the same reason. Nothing asserts it.
- 00588 has never been replayed by a cold `supabase db reset`. Every local gate
  ran inside a rolled-back transaction because another session owned the local
  stack throughout. The prod push applied it cleanly from scratch, which is
  stronger evidence, but a local cold replay is still owed.
