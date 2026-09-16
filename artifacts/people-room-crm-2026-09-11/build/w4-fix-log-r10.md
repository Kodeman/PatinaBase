# W4 — fix log, round 10

Four findings from the r10 reviews, under rulings R-BZ, R-CA and R-CB
(rulings.md §3, Fable 2026-09-16). Nothing else was touched; the minors in all
three r10 review files stand unaddressed by design.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. No prod mutation of any kind: no
`db push`, no `functions deploy`, no secret set.

---

## 1. BLOCKING-1 — the guard read the actor column, not the fact

`00636`'s post-finalize leg was gated on `invoice_link_id IS NOT NULL`, but
`chk_invoice_attempt_actor` makes an attempt either link-borne or payer-borne
and never both. `create-checkout-session` claims with `payer_id` while still
handing Stripe a `nonceReturnOrigin` whenever a live invoice link exists, so a
signed-in payer's flight was payer-borne AND nonce-bearing — invisible to the
guard. The receipt letter rotated the token she was holding, `/pay/return/<nonce>`
303'd to `/pay/dead`, and the retry landed on `/pay/used` with a sentence that
was not true.

**R-BZ: one fact decides, and it is recorded in the database.**
`nonce_return_origin` did not exist as a column — it was a TypeScript field the
driver carried and threw away. It is now a column:

- `00636` §2c (`:284`–`:319`) — `ALTER TABLE … ADD COLUMN IF NOT EXISTS
  nonce_return_origin text`, `chk_invoice_attempt_nonce_origin CHECK
  (nonce_return_origin IS NULL OR return_nonce IS NOT NULL)`, plus a
  conservative backfill (`'legacy:pre-00636'` for every existing attempt that
  already carries a nonce) so no in-flight address dies at deploy.
- `00636` §2d (`:349`–`:381`) — `public.invoice_letter_must_hold(uuid)
  RETURNS boolean`, SECURITY DEFINER, `SET search_path = public, pg_temp`,
  `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO service_role,
  authenticated`. It is the only statement of "ensure_invoice_link will refuse
  for this invoice right now": `claimed/session_created/processing`, OR a
  nonce-origin-bearing attempt finalized `succeeded/failed/requires_refund`
  inside 24h. **The actor column is not read.**
- `00636` §2d (`:387`–`:405`) — `invoice_letters_must_hold(uuid[]) RETURNS
  SETOF uuid`, the same predicate batched, service_role only, so the reminder
  sweep asks once for a page of invoices rather than once per invoice.
- `00636` §2d (`:413`–`:444`) — `stamp_invoice_checkout_return_origin(uuid,
  text) RETURNS boolean`, service_role only. It stamps ONLY an attempt that
  already carries a nonce and is still `claimed/session_created/processing`, so
  a finished flight cannot be re-armed.
- `ensure_invoice_link`'s guard is now one line: `IF
  public.invoice_letter_must_hold(p_invoice_id) THEN RETURN NULL; END IF;`
- `resolve_invoice_return_nonce`'s claiming UPDATE gained `AND
  a.nonce_return_origin IS NOT NULL`, so the rotation and the hold read the
  same fact.

**The TypeScript side cannot disagree with the stamp.**
`_shared/invoice-checkout-driver.ts` now exports one predicate,
`ridesReturnNonce(attempt, target)`; `invoiceCheckoutReturnBase` derives the
address from it, and `claim()` stamps the same value through
`stamp_invoice_checkout_return_origin` at claim time — before any Stripe
session exists — throwing `checkout_return_origin_unrecorded` if the stamp
fails. The address handed to Stripe and the value in the row are the same
value, written in the same call.

`create-checkout-session/index.ts` needed no edit: it reaches both facts through
the driver.

**Deploy order (W7):** `00636` must be on Strata BEFORE the functions are
deployed — the driver calls an RPC that only exists after it.

## 2. MAJOR-1 — both letter rails learned the fourth leg, by not listing legs

`invoice-send` and `invoice-reminders` each held their own
`['claimed','session_created','processing']` array, so inside 24h of a
link-borne `failed`/`requires_refund` they shipped `letterFallbackUrl`'s
`${baseUrl}/?invoice=<id>` — a signed-in-only door — to a payer with no account.

Per R-BZ, **no TypeScript file lists attempt states any more.** Both arrays are
deleted. `_shared/invoice-links.ts` grew `invoiceLetterMustHold(invoiceId)` and
`invoiceLettersMustHold(ids)`, thin calls onto the two SQL predicates, both
failing CLOSED (an RPC error holds the letter and logs, it never ships one).
`invoice-send/index.ts` asks the single-invoice form; `invoice-reminders/index.ts`
asks the batched form once per sweep and skips the held invoices with one log
line each.

`grep -n "'claimed'" supabase/functions --include=index.ts` now returns nothing
in either rail.

## 3. MAJOR-2 — the paperwork door fails closed (R-CA)

Two holes, closed at both ends:

- **The address.** `callerIp()` (`paperwork-upload/core.ts`) passed
  `cf-connecting-ip` / `x-forwarded-for` straight into an `inet` parameter.
  `not-an-ip` and `1.2.3.4:5678` raised 22P02, and `withinRateLimit` caught any
  RPC error and returned `true` — an attacker-chosen header was an unlimited
  door. `normalizeCallerIp()` is now exported and validates to a real IPv4 or
  IPv6 address, stripping a `:port` from a forwarded-for value and rejecting
  everything else.
- **The bucket.** Rather than hardening the parse alone, `00637` §3 removes the
  22P02 class: the table is re-keyed `bucket_key text PRIMARY KEY CHECK
  (length(bucket_key) BETWEEN 1 AND 200)` (`:360`), the old signature is
  dropped (`:383`), and
  `paperwork_link_rate_limit_hit(p_ip text, p_token text DEFAULT NULL,
  p_limit integer DEFAULT 20)` (`:385`) builds `'ip:'||host(btrim(p_ip)::inet)`
  inside a BEGIN/EXCEPTION block, falling back to `'link:'||t.id` for a caller
  with no usable address and `'anon'` for one with neither. Every caller is
  bucketed; an unknown token is not an oracle.
- **The refusal.** `withinRateLimit` now always calls the RPC and returns
  `false` on any error — error is refusal, not a pass. The m-6 short-circuit
  (`if (!deps.ip) return true`) is gone.
- The client-portal door (`app/paperwork/[token]/page.tsx`) validates the same
  way through `lib/utils/client-ip.ts`'s `normalizeCallerIp`, passes
  `{ p_ip, p_token: token }`, and treats `limitError || withinLimit === false`
  as a refusal.

Four deno cases cover the malformed header, the `ip:port` header, the missing
header and the RPC error (`_tests/paperwork-upload.test.ts`); SQL block 14
covers the same four at the database.

## 4. M-1 — the studio's calendar names the day (R-CB)

`person-profile.tsx:652` (now `:664`) fed `formatSeatDate(person.last_touch_at?.slice(0, 10))`
— a DATE-only parser handed a sliced TIMESTAMPTZ, printing the UTC day. A touch
recorded at 21:00 CDT read as tomorrow.

`packages/supabase/src/hooks/use-touches.ts` gained `touchInstantIsoDay`, the
ISO-day sibling of `touchInstantDay`, both resolving on `STUDIO_TIME_ZONE`, and
`hooks/index.ts` exports it. The sweep R-CB demands (`grep .slice(0, 10)` /
`substring(0, 10)` on `*_at` fields across the People room and
`packages/supabase/src/hooks`) corrected every sibling in the same pass:

| Site | Column | Was | Now |
|---|---|---|---|
| `views/person-profile.tsx:664` | `last_touch_at` timestamptz | `formatSeatDate(…slice(0,10))` | `touchInstantDay(…)` |
| `reach-access.tsx` `heldChannelReason` | `status_at` timestamptz (00593:88) | `.slice(0,10)` | `touchInstantIsoDay(…)` |
| `reach-access.tsx` `channelRowParts` | `verified_at` timestamptz (00593:83) | `formatSeatDate(…slice(0,10))` | `touchInstantDay(…)` |
| `reach-access.tsx` `ruleSummary` | `set_at` timestamptz (00592:734) | `.slice(0,10)` | `touchInstantDay(…)` |
| `people-format.ts` `lastOpenDay` | `expires_at` timestamptz | `new Date(at-1000).toISOString().slice(0,10)` — the UTC day | `touchInstantIsoDay(…)` |
| `access-grant-list.tsx` `grantEndsSentence` | `expires_at` timestamptz, non-boundary tiers | `expiresAt.slice(0,10)` | `touchInstantIsoDay(…)` |

Left alone, deliberately: `on_site_to`, `warranty_until` and `to_date` are DATE
columns (00592:122, 00624:399/405), so `formatSeatDate` and a no-op `.slice`
are correct there; `new Date().toISOString().slice(0,10)` as *today* for a DATE
comparison is not a timestamptz print and is outside R-CB.

Six existing designer-portal expectations moved by a day because the fix
works — all six were written against the UTC day and all six had fixtures at
midnight UTC (e.g. a bounce at `2026-03-12T00:00:00Z` is 7pm on 11 March in
the studio). Each carries a comment saying so. Three new tests prove the
behaviour rather than the adjustment: the evening/midday pair in
`heldChannelReason`, the studio-day `verified` marker, and the mid-afternoon
`doc_share` control that reads the same on either calendar.

---

## 5. Gates

Full local reset replayed before the SQL suites (`pnpm --dir … supabase:reset`,
local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No server was
started on any port.

| Gate | Result |
|---|---|
| `supabase/tests/people/w4_channels_touches_paperwork_test.sql` | **PASS** — exit 0; blocks 1–14, the two NEW blocks included: "13. W4 r10 BLOCKING-1/MAJOR-1 — the mint guard reads nonce_return_origin, not the actor column … passed" and "14. W4 r10 MAJOR-2 — the paperwork bucket is keyed by text and never raises on a caller-written address … passed" |
| `supabase/tests/billing/invoice_links_test.sql` | **PASS** — exit 0 (the rotation gate now needs a stamped origin, so the four relevant claims call `stamp_invoice_checkout_return_origin` first) |
| the other six SQL suites (`w4_invoice_link_freeze_order`, `commercial/design_build`, `w1a`, `w1b`, `w3`, `rls/people_directory_scope`) | **PASS** |
| `deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions` | **1579 passed / 1 failed / 1 ignored** — the single failure is `_tests/stripe-rail.test.ts`, "supabaseKey is required" at top level, a pre-existing env-only failure on a file this round did not touch (`git status` clean for it) |
| `deno.lock` anywhere under the repo | **none** |
| `pnpm --filter @patina/supabase type-check` | **clean** |
| `pnpm --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --filter @patina/client-portal type-check` | **RED, pre-existing and unrelated** — the one error is generated output, `.next/types/app/page.ts(37,29) TS2344`, on the ROOT page, not on anything this round edited (r8 m-12 / r9 m-13, already on the books) |
| `pnpm --filter @patina/admin-portal build` | **PASS** (shared-package edits gate) |
| `pnpm --filter @patina/client-portal test` | **157 suites / 2572 tests passed** |
| `pnpm --filter @patina/client-portal test:coverage` | **PASS** — floor held; `app/paperwork/[token]` 95/100/100/100, `lib/utils/client-ip.ts` 100/100/100/100 |
| `pnpm --filter @patina/designer-portal test` | **598 of 599 suites, 7782 of 7783 tests passed** — see below |

**The one red designer-portal suite is a clock, not this round.**
`schedule/__tests__/schedule-region-head.test.tsx` › "prints head, count line,
leader and the sr-only state line" expects `/Install 15 September/` against a
fixture that hard-codes `start: "2026-09-15"` with no fake timers. Today is
2026-09-16, so `lib/document/lens-quiet-status.ts:108` takes its `days < 0`
branch and prints "Installed 15 September". The suite, its fixture and
`lens-quiet-status.ts` are all clean in `git status`; the test expired
overnight and belongs to the schedule wave, not to W4.

`@patina/supabase` is consumed from source (`"main": "./src/index.ts"`), so
there is no dist to rebuild.

## 6. `_shared` fan-out for W7

Three `_shared` modules were edited (`invoice-links.ts`,
`invoice-checkout-driver.ts`, and `paperwork-upload/core.ts`, which is
function-local). Every importing function must redeploy in W7:

- `_shared/invoice-links.ts` → `create-checkout-session`,
  `invoice-link-checkout`, `invoice-reminders`, `invoice-send`,
  `stripe-webhook`
- `_shared/invoice-checkout-driver.ts` → `create-checkout-session`,
  `invoice-link-checkout`
- `paperwork-upload/core.ts` → `paperwork-upload`

Union, in deploy order after `00636`/`00637` land: **create-checkout-session,
invoice-link-checkout, invoice-reminders, invoice-send, stripe-webhook,
paperwork-upload.**

## 7. Out of scope, deliberately

Every minor in `w4-review-r10-data-edge.md`, `-code.md` and `-qa.md` is
untouched — the brief named four findings. The client-portal type-check red and
the `stripe-rail` deno red are both pre-existing and recorded above rather than
fixed inside this round's pathspecs.
