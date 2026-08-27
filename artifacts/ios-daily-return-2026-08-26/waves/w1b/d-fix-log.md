# W1b · lane D — fix round against `d-review.md`

Branch `daily-return/w1b-d`, worktree `.codex/worktrees/agent-dr-w1b-d`.
Review verdict was **3 blocking, 6 major, 11 minor**. Every blocking and major item is addressed in
code; the minors are taken except three that are recorded with evidence instead. Five new commits:

```
020106f9e fix(functions): an invoice due date is stated in its own timezone
0666e6938 fix(client-portal): the shared piece opens bare, and the money links are the ones the portal serves
01c75daa9 style(functions): prettier the delete-account gateway signature
708d19621 fix(db): 00536 — the roster leaks no CRM row, and an erasure cannot take a designer with it
2e52fe39f fix(db): 00534 — the bell hears the decision a designer actually sends
```

---

## BLOCKING

### B-D1 · every attention renders twice in the bell — **ACCEPTED, fixed on the only side that can**
The reviewer is right, including that the no-token case is today's default. The fix cannot land in
lane D: `notification_status` (00041:14-23) has no value that is both a truthful delivery state and
outside `visibleStatusFilter`, and the bell row must never be the id handed to `apns-send` (that is
what critique B6 bought). What lane D owed and had not delivered was the instruction. Three things
landed:

- **`d-notes.md` §2(d)** — new, marked BLOCKING FOR LANE C, with the exact one-line diff
  (`channel` → `eq.in_app`) and the alternative (client-side de-dup on `metadata.entity_id`).
- **`00534` banner** — a ⚠ SEAM block naming the mechanism, the file:line on both sides, and where
  the fix lives.
- **`client_attention_test.sql` §4b** — restores the push row to `queued` (the *default*, not the
  forced-`failed` state assertion 4 used) and asserts that exactly **one** `in_app` row is visible
  per entity, and that the envelope IS visible under the current client filter. The test now states
  the contract in both directions instead of proving only the case that happens to be safe.

### B-D2 · the roster policy hands over the designer's CRM row — **ACCEPTED, fixed**
Policy deleted. `public.client_designer_roster` replaces it: a `security_invoker = false` view over
`designer_clients` exposing `designer_id, client_id, status, created_at`, filtered on
`client_id = auth.uid() AND status = 'active'` in the view body, `SELECT` to `authenticated`, nothing
to `anon`. The base table keeps only its two designer-side policies (00014:110, 00316:39).

One trap found while proving it: `REVOKE ALL … FROM PUBLIC, anon` was **not enough**.
`seed/00-legacy-grants.sql` re-grants `ALL` on every public relation to anon *and authenticated*
before replaying the migrations' GRANT/REVOKE history, so the view was writable by every signed-in
user on a fresh local stack — the first test run failed with
`new row for relation "designer_clients" violates check constraint "designer_clients_status_check"`,
i.e. the UPDATE was permitted and only the value stopped it. The REVOKE now names `authenticated`
explicitly and the seed is regenerated. Final ACL, from the reset stack:

```
client_designer_roster | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}
```

`designer_clients_client_read_test.sql` rewritten: the client reads one row through the view, **zero**
from the base table, the view is exactly those four columns, `anon` has no privilege and
`authenticated` has no `UPDATE`. Lane C's one-identifier re-point is `d-notes.md` §8.

### B-D3 · `delete-account` would erase a designer's book of business — **ACCEPTED, fixed in both halves**
- **SQL**: `purge_client_account` raises `insufficient_privilege` when the id owns designer-side rows
  (`profiles.is_designer`, or any `projects.designer_id` / `proposals.designer_id` /
  `designer_clients.designer_id`). This is the half a direct service-key RPC call cannot bypass.
- **Handler**: a new `gateway.isDesigner` runs before anything is written and returns
  `403 designer_account`. It **fails closed** — a read error returns `500 designer_check_failed`
  rather than proceeding.
- Tests: `account_purge_test.sql` assertion 7 (refusal + nothing touched on the way out);
  `handler.test.ts` gains *"a designer caller is refused before anything is written"* and *"an
  unreadable designer check fails CLOSED"*.

---

## MAJOR

### M-D1 · the decision trigger fired on the wrong event — **ACCEPTED, fixed**
Trigger is now `AFTER INSERT OR UPDATE OF status`, and the function returns early on the UPDATE leg
unless `OLD.status IS DISTINCT FROM NEW.status`. Plan-conformance was not worth a half-delivered
plank. `client_attention_test.sql` §6b publishes a draft to `pending` by UPDATE and asserts both rows
appear, then re-UPDATEs `pending → pending` and asserts no second bell row.

### M-D2 · the AASA money paths do not exist on the host — **ACCEPTED, fixed to plural**
Plural wins: they are the routes the portal serves (`ls apps/client-portal/src/app` → `invoices`,
`proposals`, `decisions`, `piece`) and the spelling 00534 writes into every `deep_link`
(`00534:105-108`). AASA now serves `/piece/*, /invoices/*, /proposals/*, /decisions/*`. A new test
asserts the singular forms are **absent** and the plural present, so the two halves cannot drift
apart again. `d-notes.md` §4 now tells lane C which spelling `DeepLinkHandler` must match.

### M-D3 · the shared piece renders inside the portal chrome — **ACCEPTED, fixed**
`'/piece'` added to `PUBLIC_PREFIXES` in `app-chrome.tsx`, plus a case in that file's existing
`it.each` of login-less guest paths. Declared as owned-file deviation **(a2)** in `d-notes.md` §6,
same category and reasoning as the `middleware.ts` deviation the review credited. Prettier
deliberately not run: `prettier --check` warns on the copy from `main` too, so the drift is
pre-existing and `--write` would rewrite the file.

### M-D4 · purge and auth-delete have no compensation — **ACCEPTED, fixed**
The two cannot be one transaction (the delete goes through GoTrue's admin API), so the fix is a
durable record rather than atomicity:

- new table `client_account_purges` (service_role only, RLS on with **no** policies) written **inside
  the purge's own transaction**, carrying `user_id`, `email`, `purged_at`, `auth_deleted_at`, and a
  `detached` jsonb naming every unlinked id per table;
- `purge_client_account` returns that row's id; `mark_client_account_purge_complete(uuid)` stamps
  `auth_deleted_at` after the auth user is gone;
- `auth_delete_failed` now returns `purgeRef` so an operator has the handle, and the false comment at
  `handler.ts:15-17` is replaced with what is actually true — plus the support query
  (`select * from client_account_purges where auth_deleted_at is null`).
- A stamp that throws does **not** fail a completed deletion (tested).

### M-D5 · ACCESS EXCLUSIVE on the five busiest tables — **ACCEPTED, mitigated and stated**
Not removable without redefining five guard functions, which is a larger change than this wave
should carry. What landed:

- **`SET LOCAL lock_timeout = '5s'`** — the purge gives up rather than queueing behind a long
  designer transaction and building a convoy of ACCESS SHARE waiters behind its own lock request.
  A closure retries; a portal-wide stall does not get to happen.
- **Per-trigger disable/restore**, each one's prior `tgenabled` remembered and replayed
  (`ENABLE ALWAYS` / `ENABLE REPLICA` survive; already-disabled triggers stay disabled). The blanket
  `ENABLE TRIGGER USER` downgrade the reviewer named is gone. `account_purge_test.sql` promotes
  `set_invoices_updated_at` to `ENABLE ALWAYS` before the purge and asserts `tgenabled = 'A'` after.
- **The banner says it is maintenance-window-shaped**, and says the silenced `updated_at`/audit
  triggers are why the journal exists.

### M-D6 · the purge test claimed coverage it did not have — **ACCEPTED, fixed, and the ruling surfaced**
- The **issued invoice** the header always claimed is now a real fixture (`AP-INV-0001`, status
  `sent`, with `studio_id`), so `set_invoice_studio_id` is actually exercised and
  `UPDATE invoices SET client_id = NULL` is asserted — including that `studio_id` survives.
- Assertion 3's changed meaning is no longer a test comment: the file now asserts outright that the
  decision **and its options cascade away** with the roster row, and `d-notes.md` §6(c) raises it as
  a ⚠ RULING OWED with the two ways to preserve the decision if Fable wants it preserved.

---

## MINOR — 8 taken, 3 recorded

| # | Disposition |
|---|---|
| 1 · punch items announced as decisions | **Taken.** Copy follows `coordination_kind`: rfi → "A question needs you", submittal → "A submittal needs your review", signoff → "A sign-off needs you", punch → "A punch item needs you", else/NULL → "A decision needs you". Asserted in `client_attention_test.sql` §6c. |
| 2 · `price_cents_at_save` has no writer | **Taken as an instruction** — it is lane A's write path, not lane D's. `d-notes.md` §5 now opens with it as a numbered instruction to lane A, out of the "facts" paragraph as the reviewer asked. |
| 3 · generated types mis-state nullability | **Recorded, not fixed.** The block is emitted by `supabase gen types typescript`; hand-editing it is reverted by the next regeneration and would make the file lie about its provenance. Real but a generator bug — worth an upstream note, not a local patch. |
| 4 · "Open in Patina" dead-ends without the app | **Recorded, not fixed** — needs a fact that does not exist yet. Grepped `apps/`, `packages/`, `supabase/` for `apps.apple.com`, `itms-apps`, `APP_STORE_ID`, `appStoreId`: **zero hits**, so there is no App Store id for `cloud.patina.app` to fall back to. Linking the page at its own universal link does not help either — a same-host navigation from Safari does not trigger universal-link handling. Raised as an open item in `d-notes.md` §4. |
| 5 · unreachable `?? ""` in `pieceMetadata` | **Taken.** Removed. |
| 6 · timezone-dependent due date | **Taken.** `timeZone: 'UTC'` on the `toLocaleDateString` in `invoice-send/index.ts` — a DATE parsed as UTC midnight printed the previous day in any runtime behind UTC. Only occurrence in the three call sites (grepped). |
| 7 · shim test's "5b" sits above section 5 | **Taken.** Renumbered 6 and moved below section 5; the header's Covers list gains its entry. |
| 8 · double labelling on the piece page | **Taken.** Lead time reads as its own sentence; the `<dl>` keeps Size alone. |
| 9 · final commit subject under-describes | **Recorded, not fixed.** `400a3a2c6` is already on the branch and rewriting a published subject would rewrite five commits of history for a wording nit. Named here so the merge summary is accurate: it also carries `supabase/seed/products.sql`. |
| 10 · no server-side uniqueness on `saved_items` | **Taken as an instruction**, not as an index. A partial unique index over live rows is a behaviour change to a table whose write path lane A owns, and the reviewer agrees it is out of scope as written. `d-notes.md` §5 states plainly that the server does not hold the line, and offers to add it on Fable's word. |
| 11 · `purge_client_account` guards nothing about a client | **Taken** — same fix as B-D3. |

---

## Gate — re-run in full after the fixes

**`supabase db reset` (unsandboxed, from `supabase/`)** — clean replay, no errors:

```
Applying migration 00533_piece_detail_contract.sql...
Applying migration 00534_client_attention_notifications.sql...
Applying migration 00535_saved_items_price_snapshot.sql...
Applying migration 00536_client_side_server_gaps.sql...
Finished supabase db reset on branch main.
```

**`./scripts/run-sql-tests.sh`** — unchanged from the pre-fix baseline the reviewer accepted:

```
================ summary ================
total:             131
green:              109
expected-fail:      22  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:    131 / 131  (green + expected-fail)
===========================================
```

The three changed suites individually:

```
psql … -f supabase/tests/rls/designer_clients_client_read_test.sql
  NOTICE:  designer_clients_client_read_test: ALL ASSERTIONS PASSED
psql … -f supabase/tests/notifications/client_attention_test.sql
  NOTICE:  client_attention_test: ALL ASSERTIONS PASSED
psql … -f supabase/tests/auth/account_purge_test.sql
  NOTICE:  account_purge_test: ALL ASSERTIONS PASSED
psql … -f supabase/tests/aesthete/shim_contract_test.sql
  NOTICE:  shim_contract_test: ALL ASSERTIONS PASSED
```

**Deno** (`--config supabase/functions/deno.json`, per the repo hook; root `deno.lock` removed after
each run):

```
deno test … supabase/functions/delete-account/ supabase/functions/_shared/client-attention.test.ts
  ok | 17 passed | 0 failed (83ms)
deno test … supabase/functions/proposal-send/
  ok | 22 passed | 0 failed (114ms)
deno check … invoice-send/index.ts invoice-reminders/index.ts proposal-send/index.ts delete-account/index.ts
  Check supabase/functions/invoice-send/index.ts
  Check supabase/functions/invoice-reminders/index.ts
  Check supabase/functions/proposal-send/index.ts
  Check supabase/functions/delete-account/index.ts
```

**`pnpm turbo type-check --filter=@patina/client-portal`**:

```
 Tasks:    9 successful, 9 total
```

**Client-portal jest** (`pnpm test` in `apps/client-portal`):

```
Test Suites: 2 failed, 105 passed, 107 total
Tests:       1 failed, 985 passed, 986 total
```

Both failures are the pre-existing ones the reviewer verified as untouched by this lane
(`portal-access.test.ts`'s `foreignPortalFromDomain('manufacturer')` assertion, and
`orders.test.ts` failing to load a module that does not exist on `main`). 985 vs the pre-fix 983 is
the two cases added here. Lane D's own three suites:

```
PASS src/components/layout/__tests__/app-chrome.test.tsx
PASS src/app/piece/[id]/__tests__/piece-content.test.ts
PASS src/app/.well-known/apple-app-site-association/__tests__/route.test.ts
Tests: 26 passed, 26 total
```

**Migration numbering re-checked before the final commit** — `ls supabase/migrations | tail`:
`00531_restore_extension_execute_authenticated.sql`, then `00533`–`00536`. No collision, no
renumbering needed.
