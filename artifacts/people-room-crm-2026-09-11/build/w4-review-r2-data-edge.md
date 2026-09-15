# W4 (P3) — round-2 adversarial migration + edge review

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `322538551`. Local only: no `db push`, no `functions deploy`, no secrets.
`rulings.md` §3 treated as settled throughout.

Read in full: `00635_studio_touches_and_channel_refs.sql`, `00636_invoice_link_hardening.sql`,
`00637_paperwork_upload_door.sql`, `00638_pay_link_readers_reheaded.sql`,
`supabase/functions/paperwork-upload/{index,core}.ts`, `_shared/send-email.ts`,
`_shared/sms.ts`, `_shared/invoice-links.ts`, `resend-webhook/{index,channel-status}.ts`,
`sms-inbound/pipeline.ts`, `create-checkout-session/index.ts`,
`packages/notifications/src/{tokens,unsubscribe}.ts`, `build/upload-door-spec.md` §5–§9,
plus the readers the migrations feed (`use-touches.ts`, `use-inbound-documents.ts`,
`use-invoices.ts`, `letterbox.tsx`, `inbound-queue-band.tsx`, `paperwork/[token]/page.tsx`,
`paperwork-upload-form.tsx`, `middleware.ts`).

---

## 0. Gates re-run at HEAD

| Gate | Command | Result |
|---|---|---|
| Reset | `pnpm --dir <worktree> supabase:reset` | **green**, exit 0; 566 migrations, ledger head `00638` |
| People SQL | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/{w1a,w1b,w3,w4}_*.sql` | **4/4 pass** — `All W1a assertions passed.` / `All W1b assertions passed.` / `W3 SQL suite: all blocks passed` / `W4 SQL suite: all blocks passed` (blocks 9, 9b, 9c, 9d present and green) |
| Commercial SQL | `supabase/tests/commercial/design_build_test.sql` | clean, no error |
| Billing SQL | `supabase/tests/billing/invoice_checkout_integrity_test.sql` | clean |
| Billing SQL | `supabase/tests/billing/invoice_links_test.sql` | **failed twice, then passed** — see minor 7; the failure is a pre-existing pg_cron/wall-clock race, identical on `main` |
| Deno | `deno test --no-check --allow-all --config supabase/functions/deno.json _tests/paperwork-upload.test.ts` | **12 passed, 0 failed** |
| Deno | `… _tests/email-channel-status.test.ts` | **15 passed, 0 failed** |
| Deno | `… _tests/sms-inbound.test.ts` | **56 passed, 0 failed** |
| Deno | `… _shared/ paperwork-upload/ resend-webhook/ trade-rfq-send/ trade-agreement-send/` | **530 passed, 0 failed** |
| Deno | `… supabase/functions/_tests/` | **330 passed, 1 failed** — the 1 is `_tests/stripe-rail.test.ts`, which needs a live `functions serve` + keys; untouched by this wave |
| `deno.lock` | deleted before and after every run | absent from the repo root |
| Legacy grants | `python3 scripts/generate-legacy-grants.py` | regenerated, **zero diff** — the committed seed is current |
| Function posture | `pg_proc` audit over all 24 objects this wave creates or re-heads | every `SECURITY DEFINER` pins `search_path`; **no `anon` EXECUTE anywhere**; `record_touch`, `resolve_invoice_link`, `resolve_invoice_link_for_checkout`, `resolve_invoice_return_nonce`, `ensure_invoice_link`, `invoice_link_is_live`, `invoice_link_token_hash`, `resolve_paperwork_link`, `record_inbound_compliance_document`, `paperwork_link_storage_context`, `paperwork_link_rate_limit_hit` are service_role only |

### Probes run (files under `build/`, scratch copies in `$TMPDIR`)

| Probe | What it proved |
|---|---|
| A — backfill | A pre-00636 plaintext row put through 00636 §2's three statements verbatim: `resolve_invoice_link(<the token the client already holds>)` **still resolves**, and the plaintext column answers nothing. **No live /pay link is broken by the backfill.** |
| B — paperwork door | mint by an owner of the firm's own studio succeeds; **a member of another studio is refused** (`paperwork_link_not_authorized`); `paperwork_link_storage_context` returns exactly the token's `(organization_id, company_id)`; an upload **leaves the verified row untouched** (`verified_at`, `superseded_by` unchanged) and lands `inbound=true, verified_at NULL, source='field_link'` on the **token's** firm; D-7's gate inheritance holds; **recipients match R-AC exactly**; after `revoke_paperwork_link` the same raw token gives NULL from `resolve_paperwork_link`, an empty `paperwork_link_storage_context`, and `paperwork_token_invalid` from `record_inbound_compliance_document`. |
| C — storage 22P02 | The `compliance_documents_member_read` policy's `::uuid` cast, **alone**, does not raise 22P02 on another bucket's non-uuid key (the planner orders the cheap `bucket_id =` qual first): 2 rows, no error. The 22P02 that does reproduce on an authenticated `storage.objects` scan **persists with the new policy dropped** — it is 00170/00430's, pre-existing, not this wave's. |
| D — `_shared` closure | Computed the full import closure of `send-email.ts`, `sms.ts`, `invoice-links.ts` over every non-test `.ts` under `supabase/functions`: **36 functions**, each one present in §8's list. See minor 6 for the one over-inclusion. |
| E — `record_notice` wire shape | `apps/mobile/Capture/.../PeopleRoomWire.swift:413` sends `p_project_id` / `p_what` / `p_told` and decodes `id, what, recorded_at, recorded_by, told_names`. **00635's signature and RETURNS TABLE match term for term.** |

---

## 1. Round-1 findings, re-measured at HEAD

| # | Round-1 finding | Verdict |
|---|---|---|
| B-1 / QA-B2 | two shipped readers still SELECTed `invoice_links.token` | **FIXED.** 00638 re-heads both; a `pg_proc`/`pg_views` sweep finds no remaining reader of the frozen column. `design_build_test.sql` clean. |
| B-2 | the out touch filed into whichever studio held the worst copy | **FIXED for the write; the write-back claim beside it is not true — see major 3.** `studioRow` gates both the touch and the ref; all four account-less senders now pass `organizationId`. |
| M-1 | every coordination decision stamped `failed_unknown_sender` | **FIXED.** `filedDecisionFacts` reserves it for `court_party_id IS NOT NULL AND <> partyId`; two Deno cases cover both halves. |
| M-2 | `v_access_grants`' invoice_pay tier said the pay link never expires | **FIXED.** 00637 §9b returns `il.expires_at`; W4 SQL block 9d green. |
| M-3 | `confirm_inbound_document`'s R-AZ pre-check incomplete | **HALF FIXED.** All four legs are answered in SQL before the first UPDATE (block 9c green). The portal half claimed in the fix log is **not done — major 1.** |
| M-4 | three sms-inbound branches attributed and wrote no touch | **FIXED.** `recordInboundTouch` at STOP (`pipeline.ts:974`), HELP (`:1113`) and the chooser pick (`:1208`). |
| M-5 | the folio's regenerate destroyed what it minted | **FIXED.** `useRegenerateInvoiceLink.onSuccess` keeps `setQueryData` and no longer invalidates. |
| QA-B1 / MAJOR-2 | unverified AND rejected paper read as current | **FIXED.** 00637 §1b carries both predicates, named separately; W4 block 9 green. |
| QA-M1 | client-portal production CSP had no Supabase origin | **FIXED.** `next.config.js:135` derives http+ws from `NEXT_PUBLIC_SUPABASE_URL` and appends to both `connect-src` branches. |
| MAJOR-1 | the firm told "Received" about paper it never sent | **FIXED.** `awaiting_check = doc.inbound AND verified_at IS NULL AND rejected_at IS NULL`; block 9b green. |
| MAJOR-3 | revoking the door left the mint band claiming it open | **FIXED.** `use-access-grants.ts:333` invalidates `['paperwork-links']`. |
| MAJOR-4 | a ruling id on the studio's face | **FIXED.** `paperwork-link-act.tsx:257` reads "Name the day it closes. There is no clock to fall back on."; no `R-x` token in the rendered copy. |
| MAJOR-5 | twelve authored surfaceKeys in neither registry | **FIXED.** All 17 authored keys resolve in both `packages/help-system/src/surfaceKeys.ts` and `apps/designer-portal/src/lib/help-system/document-surface-keys.ts` (script-checked); the wiring is a named follow-up with W6 as owner in `w4-help-report.md` §7. |
| MAJOR-6 | 26 em-dashes in the help copy | **FIXED.** `grep -c '—\|–' people-help-content.json` → 0. |

---

## 2. Findings

### MAJOR 1 — M-3's two new refusals reach the studio as raw Postgres tokens (confidence: high)

`00637` §9 raises two tokens that did not exist before this wave:

```sql
RAISE EXCEPTION 'compliance_confirm_already_lapsed' …
RAISE EXCEPTION 'compliance_confirm_ends_sooner'   …
```

`packages/supabase/src/hooks/use-inbound-documents.ts` maps refusals to sentences in
`INBOUND_REFUSAL_SENTENCES` and falls through to `return message` — the bare token —
for anything unmapped. The map holds six entries; **neither new token is one of them**:

```
$ grep -rn "compliance_confirm_already_lapsed\|compliance_confirm_ends_sooner" supabase packages apps
supabase/migrations/00637_paperwork_upload_door.sql:856
supabase/migrations/00637_paperwork_upload_door.sql:866
supabase/tests/people/w4_channels_touches_paperwork_test.sql:808
supabase/tests/people/w4_channels_touches_paperwork_test.sql:833
```

`inbound-queue-band.tsx:223` renders `asInboundDocumentError(...)`'s answer in a
`role="alert"` region, so a studio confirming a renewal that ends sooner than the paper on
file — the single most ordinary case M-3 names ("the firm renews a certificate and leaves
the expiry blank" is the *other* one, which IS mapped) — reads
`compliance_confirm_ends_sooner`, announced aloud.

This is the exact harm D-8 and M-3 say the pre-check exists to prevent ("the studio gets a
sentence instead of a constraint name"), and `w4-fix-log-r1.md` M-3 states it was closed:
*"Both new tokens get their sentence in `packages/supabase/src/hooks/use-inbound-documents.ts`."*
They do not.

**Fix.** Add both to `INBOUND_REFUSAL_SENTENCES`, e.g.
`compliance_confirm_ends_sooner: 'This paper ends before the one it would retire. Ask the firm for a renewal that runs at least as long.'` and
`compliance_confirm_already_lapsed: 'This paper has already lapsed, so it cannot retire the paper on file.'`
Add a vitest case asserting `asInboundDocumentError` returns a sentence, not the token, for
each of the six SQL tokens 00637 can raise.

---

### MAJOR 2 — the client letterbox's "Pay" act is unreachable for every invoice since 00636 (confidence: high)

`apps/client-portal/src/components/threshold/letterbox.tsx:131` reads
`useInvoiceLink(invoice.id)`, and lines 290 and 297–311 gate both the consequence sentence
("This opens payment. Nothing is charged until you choose how to pay.") and the terminal
`Pay ${balance}` action on `invoiceLink` being non-null.

`useInvoiceLink` calls `get_invoice_link`, whose token key 00636 pinned at `NULL::text` for
every invoice, and `parseInvoiceLink` rejects a null token. So `invoiceLink` is `null`
always, and the household's top-level Pay act and its consequence sentence are gone from
the letterbox permanently — not for a state, for every invoice, forever.

The settle-in-place inside the unfold (`<Settlement>` at line 353) still works, so this is
a degraded route rather than a dead till. But K1 ruled the guest `/pay/<token>` sheet the
pay surface, and the letterbox's shortcut to it is now unreachable with no visible reason:
the surface silently drops an act rather than saying anything.

`w4-data-edge-report.md` §4 and §9 both name this and leave it standing ("no finding named
it, so it is left standing and recorded"). Round 2 names it.

**Fix (one of):** feed the href from a mint the same way the folio does
(`useRegenerateInvoiceLink`'s cached answer) — but that revokes on every letterbox render
and must not be a page-load call; or, the cheaper and more honest one, point the act at
`/?invoice=<id>` + open the letterbox, the same move `door-gate.tsx` already took for the
deposit offer in B-1; or drop the act deliberately and say so in a ruling rather than
leaving §9's "owed" with no owner.

---

### MAJOR 3 — B-2's narrowing drops the bounce write-back for any letter the sending studio's own card does not carry (confidence: medium-high)

`send-email.ts` (post-B-2):

```ts
const ref = options.ref ??
  (prepared.channel?.studioRow ? { type: "studio_contact_channel", id: … } : undefined);
const shouldLog = !options.skipLog && Boolean(options.userId || ref);
```

`resend-webhook/index.ts:207` bails with `{ matched: false }` when no `notification_log`
row carries the event's `provider_id`, and `writeChannelStatus(...)` is called **only
inside the `email.bounced` and `email.complained` case bodies, after that early return**.

So for a letter with no `userId`, no explicit `ref`, and no `studioRow` — no log row is
written, no `provider_id` ever lands, the bounce never matches, and
`applyChannelStatus` never runs. The address's channel rows, in **every** studio, stay
`active`.

`w4-fix-log-r1.md` B-2 asserts the opposite: *"a bounce is written back by ADDRESS in
`resend-webhook/channel-status.ts`, so an unattributable letter loses its log row, never
its write-back."* The write-back is reached only through the log row.

Reachability: `po-send`, `quote-request-send`, `trade-rfq-send` and `trade-agreement-send`
pass **no `ref`** (only `invoice-send` does — `index.ts:314`), so for those four the log row
exists exactly when the sending studio's own `studio_contact_channels` carries the address.
A vendor or trade address held on another studio's card, or on no card at all, is the gap —
and that is precisely the population D-6 ("a dead mailbox is dead for everyone") is written
for: the FIRST bounce, arriving on studio A's letter, is the one that would have told
studio B, and it is dropped.

**Fix.** Keep B-2's narrowing for the *touch* (that part is right — the subject of a record
is one studio's) and restore the log row for the deliverability case: either give the four
senders an explicit `ref` of their own business record (`po`, `quote_request`,
`trade_rfq`, `trade_agreement` — each needs a `notification_log_ref_type_chk` value), or
write back by address independently of the match, e.g. call `writeChannelStatus` before the
`if (!logEntry)` return in `handleResendEvent`. Then correct the fix-log sentence.

---

### MINOR 4 — `w4-data-edge-report.md` §5's gate table is stale (confidence: high)

§5 says *"Reset clean … green; ledger head `00637`"*. HEAD is `00638` (the fix log's own
table says so). §1's migration table also lists three files; 00638 appears only in §4's
prose. Report accuracy only.

### MINOR 5 — §7 undercounts the Deno suite (confidence: high)

§7 says `_tests/email-channel-status.test.ts` holds **11** cases. It holds **15** (measured:
`ok | 15 passed | 0 failed`); the fix log's B-2 entry already says 15. Report accuracy only.

### MINOR 6 — the W7 redeploy set over-includes `apns-send` (confidence: high)

§8 names 37 functions. The computed closure over `_shared/send-email.ts`, `_shared/sms.ts`,
`_shared/invoice-links.ts` and every `_shared` module importing them is **36**; every one of
the 36 is in §8's list. `apns-send/index.ts` references `send-email.ts` only in two comments
(`:29`, `:335`) and imports nothing from it. Redeploying it costs nothing, so this holds
no gate — but the set should say 36, so a future reader does not treat the list as measured
when one row is not.

### MINOR 7 — `invoice_links_test.sql` carries a wall-clock assertion that flaked twice at HEAD (confidence: high)

```sql
ASSERT (SELECT count(*) = 2 FROM public.job_runs
        WHERE job_name = 'invoice-checkout-attempts-expire' AND status = 'succeeded'
          AND started_at > now() - interval '1 minute'),
  'each sweep writes one succeeded job_runs row';
```

`cron.job` schedules `invoice-checkout-attempts-expire` at `17 * * * *` on the local stack.
A cron firing inside the suite's window makes the count 3 and the file aborts at line 1732 —
which it did on my first two runs immediately after the reset, and did not on the third.
The lines are **byte-identical on `main`** (`git show main:… | grep -n` → 1517-1520), so this
is pre-existing and not the wave's. It is recorded because §5 reports the suite green with
no caveat, and the next reviewer will otherwise rediscover it as a W4 regression.

**Fix (cheap):** scope the assertion to rows written by this transaction (`started_at >=
<a timestamp captured at the top of the block>` and `detail->>'expired' = '1'`), or drop the
window and count rows whose `id` exceeds a captured high-water mark.

### MINOR 8 — the `compliance_document_inbound` notice carries no `deep_link` (confidence: high)

00637 §8's `metadata` holds `document_id`, `company_id`, `company_name`, `doc_type`,
`entity_type`, `entity_id`, `title`, `body`. `InboxNotificationMetadata`
(`use-inbox.ts:18`) reads `deep_link` / `url` for the bell row's destination and neither is
set, so the owner/admin who receives the notice can read it and cannot follow it to the
firm's card. Acceptance 9 asks only that the row be readable, which it is (probed: 2 rows,
matching R-AC exactly).

### MINOR 9 — the storage read policy is org-scoped, not (org, company) as spec §8 states (confidence: high)

Spec §8: *"`storage.objects` policies keyed on `(organization_id, company_id)` path
segments"*. `compliance_documents_member_read` reads only segment 1. The effect is correct —
a studio member may read every firm's paper their studio holds, which is what the company
card shows anyway — but the file does not say it deviated, and the second segment's uuid
shape is then load-bearing for nothing.

### MINOR 10 — a refused RPC leaves an orphan object in `compliance-documents` (confidence: high)

`core.ts` uploads (`upsert: false`) **before** calling
`record_inbound_compliance_document`, and returns 400/403 on an RPC error with no delete of
the object just written. Acceptance 10 is about a partial *row*, which is satisfied. The
reachable cases are the TOCTOU window the comment names, a `doc_type` the edge allowlist and
00623's CHECK disagree on, and 00623's `dated_expiry` CHECK. Nothing sweeps the bucket.

### MINOR 11 — `record_inbound_compliance_document` does not check `p_file_path` against the token's own prefix (confidence: high)

The holder comes from the token row (correct, acceptance 3) but `p_file_path` is stored
verbatim from the caller. Only `service_role` holds EXECUTE and the edge function always
builds the key from `paperwork_link_storage_context`, so this is not reachable today; it is
the one field on the write that is not re-derived, and a one-line
`p_file_path LIKE v_row.organization_id || '/' || v_row.company_id || '/%'` guard would
close it.

### MINOR 12 — `resolve_invoice_return_nonce` rotates a `closed` link and gives it a fresh 30 days (confidence: high)

Its selection is `l.status <> 'revoked'` (00574's rule, kept verbatim), so a **closed** link
is eligible. Under 00636 the function now WRITES: it stamps a new `token_hash` and
`expires_at = now() + 30 days` onto a link the rail had closed. `resolve_invoice_link`
answers the `withdrawn` sheet for it, so nothing is exposed — but a dead grant's row is
re-addressed and re-dated, and `v_access_grants` will report the closed tier with a
30-day future `expires_at`.

### MINOR 13 — `get_invoice_link` does not exclude an expired link (confidence: high)

`WHERE l.status <> 'revoked' ORDER BY (l.status = 'active') DESC, l.created_at DESC` — an
`active` row past `expires_at` is returned with `status: 'active'`, while every resolver
treats it as dead. The reader disagrees with the rail by one word; the surface has no token
to act on either way, so nothing breaks today.

### MINOR 14 — a channel unsubscribe does not reach `profiles.email_suppressed` (confidence: medium)

`applyChannelUnsubscribe` marks every email-kind row on the address `unsubscribed`.
`prepareCompliantEmail` consults the channel **only when `options.userId` is absent**. If the
same human is later reached on a rail that knows a `userId` for her, the channel's
`unsubscribed` is never read and the letter goes. D-4 says the header is her only door; the
door holds only while nobody knows her user id. (The bounce path is safe: `handleBounce`
suppresses the profile whenever `logEntry.user_id` is set.)

### MINOR 15 — `campaign-dispatch` bypasses the channel gate (confidence: high)

`campaign-dispatch/index.ts:468` posts to `https://api.resend.com/emails/batch` directly and
never calls `prepareCompliantEmail`, so `channelRefusesSend` is not consulted for its
recipients. Pre-existing and outside the wave's own functions; recorded because the binding
rule is "all email through `_shared/send-email.ts` `sendCompliantEmail`" and this is the one
live exception.

### MINOR 16 — the retention rule is a convention, not a constraint (confidence: high)

`studio_compliance_documents` keeps `studio_compliance_documents_member_{insert,update,delete}`
policies for `authenticated`. Spec §7 says no document row is ever deleted by this door, and
the door does not delete — but any active studio member can `DELETE` a rejected or
superseded row, or `UPDATE` `rejected_at` + `rejection_reason` without the chase
`reject_inbound_document` enqueues (acceptance 7). Pre-existing table posture that the new
reject columns join; named so the audit claim in §7 is read at its real strength.

### MINOR 17 — `touchDay` slices the UTC date out of a timestamptz (confidence: high)

`use-touches.ts:151` regexes `^(\d{4})-(\d{2})-(\d{2})` out of the ISO string PostgREST
returns in UTC, so a touch made at 8pm CDT prints as the next day. The comment says the
room's other dates share this spelling; the other dates are `date` columns, which carry no
zone. `studio_touches.occurred_at` is `timestamptz`.

### MINOR 18 — the new storage policy re-uses the uuid-cast idiom (confidence: high, no harm today)

`compliance_documents_member_read` casts `NULLIF((storage.foldername(name))[1],'')::uuid`,
the same shape that put 22P02 on `project-documents` (00170/00430). Probed both ways: the
new policy **alone** does not raise on another bucket's non-uuid key (the planner orders the
cheap `bucket_id =` qual first), and the 22P02 that does reproduce persists with the new
policy dropped — it is pre-existing. The file's banner claim ("Here EVERY segment a policy
casts is a real uuid") is true of this bucket's own keys. Recorded as a shape note, not a
defect.

---

## 3. Checked and clean (no finding)

- **Token verification before any read.** `resolve_paperwork_link`,
  `paperwork_link_storage_context` and `record_inbound_compliance_document` each re-derive
  `sha256(p_token)` and require `status='active' AND expires_at > now()` before touching
  anything; a malformed, unknown, revoked or expired token gives one NULL / one
  `paperwork_token_invalid`, never a distinguishable answer. The compare is a unique-index
  lookup on the hash, not a string compare of the secret — the `field_link_tokens` /
  `fulfillment_evidence_upload_tokens` precedent. `resend-webhook` reads the **raw body
  first**, verifies the Svix HMAC with `timingSafeEqual`, and builds the service client only
  after the signature clears (`index.ts:176`).
- **Uploads never overwrite a verified row.** Storage `upsert: false`; the RPC only ever
  INSERTs; the supersede is `confirm_inbound_document`'s. Probed (B4).
- **Cross-tenant.** Mint and revoke are gated on `is_active_studio_member` of the *firm's
  own* studio (probed, refused for a true stranger); the write takes the holder from the
  token row and has no company parameter; `assert_paperwork_token_company` refuses a
  person card, a missing card and a card in another studio; `studio_touches` has a SELECT
  policy and no write policy, and `record_touch` resolves the org server-side through
  `project_tenant_org()` (R-BD) / `studio_contact_org()` and writes nothing when it cannot.
- **Key scheme.** `{org uuid}/{company uuid}/{upload uuid}/{sanitised filename}` — every
  segment a policy casts is a uuid, the free text is last, `sanitizeFilename` strips path
  separators and leading dots.
- **R-AC recipients.** Probed: owners + admins of the studio, plus the minter, exactly, one
  row each, no duplicates.
- **`record_notice` vs Patina Field.** Signature and return shape match term for term
  (probe E); only told refs that resolve to a seat on this job or a card in this studio are
  stored, so `notified_refs` and `told_names` cannot disagree.
- **`invoice_links` backfill.** Probe A: a token a client is already holding still resolves;
  the plaintext column answers nothing; `chk_invoice_links_token` in 00574 guaranteed every
  stored token was 64-hex, so `SET NOT NULL` on `token_hash` cannot abort on a legacy row.
- **Unsubscribe subjects.** `parseUnsubscribeSubject` splits on the `channel:` prefix; a
  profile subject is always a uuid, so no account token can be read as a channel and no
  channel token as an account; both need the HS256 secret; `applyChannelUnsubscribe` leaves
  a `dead` row alone and matches only `email`/`ap_email` kinds.
- **`_shared` fan-out.** 36 importing functions, all present in §8. `config.toml` carries
  `[functions.paperwork-upload] verify_jwt = false` with the token checked in code, matching
  the `fulfillment-evidence` precedent; `index.ts` answers OPTIONS with 204 + `corsHeaders`
  and merges them onto every response; the service client is built per request, and the
  token is carried in the multipart body, never the URL.
- **`_primary_studio_for`** (R-AM): `grep` finds no call in any edge file this wave touches.
- **Money in cents, CHECK over enum, hand-numbered above the branch head and clear of the
  reserved 00595–00620 block**, banner + lineage on every file, RLS in the same file, explicit
  `REVOKE … FROM PUBLIC, anon` beside every grant, `extensions.digest` / `extensions.gen_random_bytes`
  schema-qualified throughout.
