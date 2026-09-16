# W4 (P3) — round-4 adversarial migration + edge review

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `4730eb0b1`. Local only: no `db push`, no `functions deploy`, no secrets.
`rulings.md` §3 treated as settled throughout.

**Verdict: NOT clean — zero blocking, three major, twenty-five minor.**

Read in full: `00635_studio_touches_and_channel_refs.sql`,
`00636_invoice_link_hardening.sql`, `00637_paperwork_upload_door.sql`,
`00638_pay_link_readers_reheaded.sql`, `supabase/functions/paperwork-upload/{index,core}.ts`,
`_shared/send-email.ts`, `_shared/sms.ts`, `_shared/invoice-links.ts`,
`resend-webhook/{index,channel-status}.ts`, `sms-inbound/pipeline.ts`,
`packages/notifications/src/{tokens,unsubscribe}.ts`,
`packages/supabase/src/hooks/use-invoices.ts`,
`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx` (+ its suite),
`apps/admin-portal/src/{middleware.ts,app/api/unsubscribe/route.ts,app/preferences/unsubscribe/page.tsx}`,
`apps/client-portal/src/components/threshold/letterbox.tsx`,
`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts`,
`build/upload-door-spec.md` §5–§9, plus `00574`, `00592`, `00593`, `00623`, `00624`, `00629`.

---

## 0. Gates run at HEAD

| Gate | Command | Result |
|---|---|---|
| Reset | `pnpm --dir <worktree> supabase:reset` | **green**, `Finished supabase db reset on branch main.` |
| Ledger head | `supabase_migrations.schema_migrations` | `00638` (then `20260910152111`) |
| People SQL | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/{w1a,w1b,w3,w4}_*.sql` | **4/4 pass, exit 0** — `All W1a assertions passed.` / `All W1b assertions passed.` / `W3 SQL suite: all blocks passed` / `W4 SQL suite: all blocks passed` (blocks 1–10b green) |
| Billing SQL | `billing/invoice_links_test.sql` | **exit 0**, no ERROR/FAIL |
| Billing SQL | `billing/invoice_checkout_integrity_test.sql` | **exit 0** |
| Commercial SQL | `commercial/design_build_test.sql` | **exit 0**, T12/T17–T21 pass |
| Notification SQL | `notifications/00591_notification_log_ref_rls_test.sql` | **exit 0**, `ALL PASSED` |
| Deno | `deno test --no-check --allow-all --config supabase/functions/deno.json _shared/ paperwork-upload/ resend-webhook/` | **460 passed, 0 failed** |
| Deno | `… supabase/functions/_tests/` | **334 passed, 1 failed** — `_tests/stripe-rail.test.ts`, uncaught `supabaseKey is required` at module top level (needs a live `functions serve` + keys). Pre-existing, untouched by this wave |
| `deno.lock` | deleted before and after every run | absent from the worktree root and the repo root |
| Legacy grants | `python3 scripts/generate-legacy-grants.py` | regenerated, **zero diff** (`git status --short` clean on `supabase/seed/00-legacy-grants.sql`) |
| Generated types | every new object present in `packages/supabase/src/database.types.ts` | `studio_touches`, `paperwork_link_tokens`, `paperwork_link_rate_limits`, `invoice_links.token_hash`, and all eleven new RPCs present |
| `_primary_studio_for` in edge code | `grep -rn` over `supabase/functions` | **comments only** — R-AM holds |
| `config.toml` | `[functions.paperwork-upload] verify_jwt = false` | present, beside the ten existing in-code-verified functions |

### Probes run this round (`build/` + `$TMPDIR`)

| Probe | What it measured |
|---|---|
| `probe-r4-a` (backfill) | a pre-00636 plaintext row put through 00636 §2's four statements verbatim: `resolve_invoice_link(<the token the client already holds>)` → `kind=invoice`; `resolve_invoice_link_for_checkout` → 1 row; the plaintext column reads `<null>`; the stored hash used as a bearer → NULL; a 400-day-old link got **30 days**. **No live `/pay` link is broken by the backfill** |
| `probe-r4-b` (door) | a 50-year caller date is accepted by `mint_paperwork_link`; malformed / unknown / truncated tokens all answer one NULL; a non-inet address raises `invalid input syntax for type inet` (the edge catches → **opens**); an unknown `doc_type` dies on `studio_compliance_documents_doc_type_check`; a forged cross-tenant `p_file_path` is stored verbatim on a correctly-scoped row; an expired token gives `resolve=NULL`, `storage_ctx_rows=0`, `paperwork_token_invalid` on the write |
| storage posture | `pg_policy` over `storage.objects`: exactly one `compliance-documents` policy, `SELECT` / `authenticated` / segment-1 org cast. No INSERT, UPDATE or DELETE policy. Bucket private, 15 MB, three mime types |
| `notification_log` policies | `notification_log_ref_studio_select` names `invoice` / `proposal` / `client_invitation` / `client_review` — **no `studio_contact_channel` leg** |
| W7 closure | recomputed the import closure over the seven `_shared` modules this branch changes: **17 modules, 40 importing functions** (+ `resend-webhook`, whose own code changed) |

---

## 1. Round-3 findings, re-measured at HEAD

| # | Round-3 finding | Verdict |
|---|---|---|
| R3-MAJOR-1 | the channel gate was skipped on every letter carrying a `userId` | **FIXED.** `send-email.ts:436-458` — the gate resolves the channel unconditionally; `recordChannel = options.userId ? undefined : channel` keeps the RECORD narrow. 19 Deno cases |
| R3-MAJOR-2 | the unsubscribe landing had no test anywhere | **FIXED.** `packages/notifications/src/__tests__/unsubscribe.test.ts` exists (14 cases) |
| R3-MAJOR-3 | a firm merge stranded the paperwork door | **FIXED.** 00629 carries a sixth card-pointer block; W4 suite blocks 10 / 10b green on a fresh reset |
| R3-MAJOR-4 | the room printed the UTC calendar day | **FIXED.** `touchInstantDay` + `STUDIO_TIME_ZONE` in `use-touches.ts` |
| R3-MAJOR-5 | `flushDeferredMessages` sent real texts and wrote no touch | **FIXED.** `_shared/sms.ts:1224-1240` |
| R3-MAJOR-6 | the account-less unsubscribe landed on an admin sign-in wall | **FIXED.** `admin-portal/src/middleware.ts:35-37` — `/preferences/unsubscribe` is a public page. (But see MAJOR 2 below: the page it now reaches names the wrong scope) |
| MINOR 1 | §5's gate table says ledger head `00637` | **STILL OPEN** — head is `00638`. Third round |
| MINOR 2 | §7 says `email-channel-status.test.ts` holds 11 cases | **STILL OPEN, and further out of date** — `grep -c '^Deno.test'` → **19** |
| MINOR 3 | the W7 redeploy set is wrong in both directions | **STILL OPEN, re-measured** — see MINOR 3 below |
| MINOR 4 | `invoice_links_test.sql`'s wall-clock `job_runs` assertion | **STILL OPEN** (latent; green today) |
| MINOR 5 | the inbound notice carries no `deep_link` | **STILL OPEN** — 00637 §8's metadata is unchanged |
| MINOR 6 | the storage read policy is org-scoped, not (org, company) | **STILL OPEN, re-measured** |
| MINOR 7 | a refused RPC leaves an orphan object in the bucket | **STILL OPEN** — `core.ts:225-250` uploads before the RPC and never deletes on a 4xx |
| MINOR 8 | `p_file_path` is not checked against the token's prefix | **STILL OPEN, re-measured** (probe-r4-b §B5) |
| MINOR 9 | the nonce rotates and re-dates a `closed` link | **STILL OPEN** — `resolve_invoice_return_nonce` selects `status <> 'revoked'` and stamps unconditionally |
| MINOR 10 | `get_invoice_link` calls an expired link `active` | **STILL OPEN** — the reader has no `expires_at > now()` leg |
| MINOR 11 | `campaign-dispatch` bypasses the channel gate | **STILL OPEN** — `grep -rln "api.resend.com"` → `_shared/send-email.ts`, its test, `campaign-dispatch/index.ts` |
| MINOR 12 | the reject trail and the retention rule are conventions | **STILL OPEN** — 00623's member UPDATE/DELETE policies are untouched |
| MINOR 13 | the new storage policy re-uses the uuid-cast idiom | **STILL OPEN** — `NULLIF((storage.foldername(name))[1], '')::uuid` |
| MINOR 14 | `record_notice` does not refuse a studio-less job, and its COMMENT says it does | **STILL OPEN** — 00635:404 unchanged |
| MINOR 15 | 00637's rate-limit comment is false | **STILL OPEN** — `core.ts:127` `if (!deps.ip) return true;` |
| MINOR 16 | §2 mis-describes the edge shell's order | **STILL OPEN** — `paperwork-upload/index.ts:52` builds the client before `handlePaperwork` |
| MINOR 17 | the paperwork hash rule is stated four times | **STILL OPEN** |
| MINOR 18 | `AUTHORITY_SCOPES` omits `draw_certify` | **STILL OPEN** — `pipeline.ts:661-666` |
| MINOR 19 | the new `ref_type` has no leg in `notification_log`'s studio read policy | **STILL OPEN, re-measured** |
| MINOR 20 | `paperwork_link_tokens.company_id` is `ON DELETE CASCADE` | **STILL OPEN** |

Six of six majors fixed; nineteen of twenty minors carried unchanged. Nothing regressed.

---

## 2. Findings

### MAJOR 1 — the folio's two pay-link acts are unreachable on every invoice, and the suite that covers them models a behaviour 00636 removed (confidence: high, traced end to end)

`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx`,
`packages/supabase/src/hooks/use-invoices.ts`

The chain, at HEAD:

```
get_invoice_link            00636:337  →  jsonb_build_object('token', NULL, 'status', …, 'expires_at', …)
useInvoiceLink              use-invoices.ts:1308  →  parseInvoiceLink(data)
parseInvoiceLink            :1293  →  if (!isLikelyInvoiceLinkToken(row.token)) return null;   // NULL → null
invoice-folio.tsx:296       const clientInvoiceUrl = invoiceLink ? … : null;                    // always null
invoice-folio.tsx:672       {canShareLink && clientInvoiceUrl && <… "Copy link" …>}             // never renders
invoice-folio.tsx:686       {canShareLink && clientInvoiceUrl && <… "Regenerate link" …>}       // never renders
invoice-folio.tsx:691       onClick={() => openPanel('regenerate-link')}                        // the ONLY entry
```

`grep -n "regenerate-link\|openPanel(" invoice-folio.tsx` returns exactly one `openPanel('regenerate-link')`,
at `:691`, inside the block gated on `clientInvoiceUrl`. And `grep -n "invoice-link" use-invoices.ts`
returns exactly one writer of a token into that cache key —
`useRegenerateInvoiceLink.onSuccess` (`:1405`). The other touch (`:393`) is an
`invalidateQueries` on issue/send, which refetches `get_invoice_link` and parses back to null.

So: **the only act that can produce a copyable `/pay` address is rendered only when that
address is already in the cache, and the only thing that puts it in the cache is that act.**
On every load of every issued invoice, both `Copy link` and `Regenerate link` are absent from
the folio, with no sentence — which `:668`'s own R51/R83 comment says is the one thing the
folio must not do. The recovery band's fallback branch (`:773-777`) is then the branch always
taken when a send fails, and it reads *"Email did not reach the client, and this invoice has
no link yet. Resend the invoice to try again."* — an instruction that cannot work: resending
calls `ensure_invoice_link`, which mints and emits the raw token to the letter and stores only
its hash, so the folio reads NULL again.

**Why no gate caught it.** `invoice-folio.test.tsx:85` mocks the hook —
`useInvoiceLink: () => ({ data: mockInvoiceLink })` — and `:534-554`
("shows a live Copy link as soon as the invoice is issued") sets
`mockInvoiceLink = { token: LINK_TOKEN, status: 'active' }` inside the issue mock, with the
comment *"What the real acts do: issue_invoice mints the link"*. That was true under 00574 and
is false under 00636. Eleven folio cases assert against a shape `get_invoice_link` can no
longer return.

**The report says the opposite.** §4's *"the designer's only route to a copyable address is
`Regenerate`"* and §9's *"DONE in round 1 (M-5): the invalidate is dropped; the mint is the
authority"* both describe a route that cannot be entered. M-5's fix is correct and necessary;
it is just downstream of a gate that never opens.

**The smallest fix.** Gate the two acts on `canShareLink` alone (the invoice's own status,
which is what `:218-220`'s comment says they should follow), and let `Copy link` render
disabled-with-a-reason or, better, let `Regenerate link` stand on its own so the designer can
mint one — the copy act then appears once `setQueryData` has landed the fresh token. The
fallback sentence should name `Regenerate link`, not "Resend the invoice". The suite's
`useInvoiceLink` mock should return `null` for the default case, which is the only thing the
real hook can answer.

---

### MAJOR 2 — the account-less unsubscribe tells the recipient she stopped one kind of letter while the record stops them all (confidence: high, traced end to end)

`supabase/functions/_shared/send-email.ts`, `packages/notifications/src/unsubscribe.ts`,
`apps/admin-portal/src/app/preferences/unsubscribe/page.tsx`

The token's `type` claim is the LETTER's own notification type:

```ts
// send-email.ts:505-510
const unsubscribeUrl = await generateChannelUnsubscribeUrl(
  recordChannel.id,
  options.notificationType ?? "all_studio_mail",   // ← the letter's type
  …);
```

and every one of the five account-less senders names a narrow one —
`invoice-send/index.ts:311` `invoice_sent` / `invoice_reminder`,
`po-send/index.ts:550` `po_sent`, `quote-request-send/index.ts:206` `quote_request`,
`trade-rfq-send/index.ts:218` `trade_rfq`, `trade-agreement-send/index.ts:256` `trade_agreement`.
`all_studio_mail` is the default and is never reached from any of them.

The write ignores that claim entirely:

```ts
// unsubscribe.ts:129-154 — applyChannelUnsubscribe(supabase, channelId, type)
//   `type` is accepted and never read.
.update({ status: 'unsubscribed', status_at: … })
.eq('value', channel.value)
.in('channel_kind', ['email', 'ap_email'])
```

and `channelRefusesSend('unsubscribed') === true` (`send-email.ts:124`) then refuses **every
category, every studio, invoices included** — D-4 and D-6's intended consequence, stated in
the RPC comment and in the report's D-4.

The reader says something else. `applyChannelUnsubscribe` returns `{ok: true, type}` with the
narrow type, and the landing (`page.tsx:41-43`) branches only on `all_marketing`:

```
outcome.type === 'all_marketing'
  ? "We've turned off all marketing emails… You'll still receive essential account
     notifications (receipts, security alerts)."
  : `We've unsubscribed you from ${humanizeType(outcome.type)} emails.`
```

`humanizeType('po_sent')` → `"po sent"`. A subcontractor's office manager who clicks the
unsubscribe on a purchase order is told *"We've unsubscribed you from po sent emails."* while
the studio's book has just stopped her invoices, her RFQs, her trade agreements, and every
other studio's letters to that mailbox. That is the reader disagreeing with the record on the
one act whose whole purpose is telling her what she just did — and D-4 names that consequence
as intended precisely because it needs to be said out loud.

(The `all_marketing` branch is worse if it is ever reached, because it promises receipts will
keep arriving, which for a channel unsubscribe is false.)

**The smallest fix.** `applyChannelUnsubscribe` returns a subject-aware outcome — e.g.
`{ok: true, status: 'applied', scope: 'address'}` — and the page renders one sentence for it:
*"We've stopped all email from this studio to this address, including invoices and purchase
orders."* No token change, no migration.

---

### MAJOR 3 — sms-inbound's START and YES branches attribute the message to a seat, write a consent grant, and write no touch (confidence: medium-high)

`supabase/functions/sms-inbound/pipeline.ts`

`grep -n recordInboundTouch` names nine call sites; the two re-subscription keywords are not
among them.

* **START / UNSTOP** (`:1000-1026`). `studiosHoldingRecord` → `withRecordOnlyStudios` →
  `writeChannelConsent(… 'granted' …)`, then `return { status: 200, … disposition:
  "resubscribed" }`. `conv.party_id` is in scope throughout.
* **YES / Y over a pending invite** (`:1044-1095`). Same write, and the branch goes further:
  it resolves `answered` (a seat), names the project and the studio in the reply, and passes
  `answered?.id ?? conv.party_id` to `reply()` — so the message is attributed to a seat by the
  rail's own reckoning, twice, before it returns without a touch.

This is the same defect class the wave has already closed twice, for the same reason. Round 1
M-4 closed the inbound **STOP** with *"An inbound STOP is recorded as a contact as well as a
consent act"* (`pipeline.ts:967-971`), and round 3 MAJOR-5 closed `flushDeferredMessages`
because *"the card's derived 'Last touch' then showed the PREVIOUS contact: the room saying
the studio has not reached someone it reached this morning"*. A START is the answer to a
standing refusal and a YES is the answer to an invite — the two most consequential inbound
messages after STOP — and after either one the seat line, the roster row and `touchSentence`
still print the older contact.

The report's §9 states the opposite: *"Three sms-inbound branches that attributed a message to
a seat and wrote no touch — the inbound STOP, HELP, and the project-chooser pick — were closed
in round 1 (M-4) … **nothing is excluded**."* Two branches are excluded.

**The smallest fix.** The six-line `recordInboundTouch(supabase, conv.party_id, messageId,
{ decisionClass: "none", authorityCheck: "n/a" }, nowIso)` the STOP branch already carries,
before each of the two returns — best effort, `record_touch` answers NULL for a studio-less
seat, exactly as everywhere else.

---

## 3. Minor findings

**MINOR 1 — §5's gate table is stale, third round running.** *"Reset clean … ledger head
`00637`"*. Head is `00638`; §1's migration table still lists three files.

**MINOR 2 — §7 undercounts the Deno suite, and is further out than it was.**
`grep -c '^Deno.test' _tests/email-channel-status.test.ts` → **19**; §7 says 11.
`paperwork-upload.test.ts`'s 12 is right.

**MINOR 3 — the W7 redeploy set is still wrong in both directions.** Recomputed at HEAD over
the seven `_shared` modules `git diff --name-only main...HEAD -- supabase/functions/_shared/`
names (`branded-email.ts`, `client-letter.ts`, `email-assets.ts`, `html-to-text.ts`,
`invoice-links.ts`, `send-email.ts`, `sms.ts`), closed over the `_shared` graph: **17 modules,
40 importing functions**, plus `resend-webhook` whose own code changed = **41**. §8 lists 37.
It **over-includes** `apns-send` (which mentions `send-email.ts` in comments and imports
nothing from it) and **omits five**: `back-in-stock-check`, `campaign-dispatch`,
`comms-notification-dispatch`, `price-drop-check`, `spec-pdf`. A deployer who copies §8 ships
five functions with a stale bundled `_shared`. Report accuracy by the brief's rule; the deploy
consequence is real, and `build/email-deliverability-checklist.md` item 1 names no function,
so §8 is still the only concrete list on the branch.

**MINOR 4 — §9's standing item about the client letterbox is stale.** *"The client letterbox's
`/pay/<token>` href is still fed by `get_invoice_link` and still draws its 'no link' state."*
`letterbox.tsx` no longer imports `useInvoiceLink` at all (its `:126-135` comment records the
removal, W4 r2 MAJOR-3), and the grep over `apps` + `packages` finds exactly one live consumer
of the hook: the designer folio. The sentence should be struck or rewritten as MAJOR 1.

**MINOR 5 — `record_notice` does not refuse a studio-less job, and its COMMENT and banner both
say it does.** 00635:404 — *"a studio-less job and a stranger both get `notice_not_authorized`"*.
`project_tenant_org()`'s second leg resolves the CALLER's own design studio when the project
records none (R-BD), so `is_active_studio_member(v_org)` over it is self-satisfying on that
population — which is precisely what 00624's own banner warns about (*"the caller-relative leg
makes `is_active_studio_member()` over this function self-satisfying on the studio-less
population"*). The behaviour is R-BD-compliant; the sentence is not. It is also the exact
opposite of `record_touch`'s D-3 posture on the same rows ("No studio ⇒ no row"), and the
divergence between the two doors deserves a line in §3.

**MINOR 6 — 00637's rate-limit body comment is false.** *"The edge function refuses a missing
address in production."* `core.ts:127` — `if (!deps.ip) return true;` — allows it, and there is
no other refusal.

**MINOR 7 — the paperwork rate limiter fails open three ways, two of them caller-controlled.**
Measured (probe-r4-b §B3): `paperwork_link_rate_limit_hit('not-an-ip'::inet)` raises
`invalid input syntax for type inet`, which `withinRateLimit`'s `if (error) … return true`
turns into a pass. `callerIp` (`index.ts:41-46`) takes `x-forwarded-for`'s first hop when
`cf-connecting-ip` is absent, so a caller can hand it garbage (no bucket, and no bucket for
anyone else either since each distinct string is its own row) or omit both headers. The module
comment names the posture ("friction on guessing, not the credential") and the token is a
64-hex unique-index lookup, so nothing is exposed — but spec §2's "volume cannot be split" is
weaker than it reads.

**MINOR 8 — §2 mis-describes the edge shell's order.** *"the service-role client built only
after the request is read"*. `paperwork-upload/index.ts:52` builds it before
`handlePaperwork(deps, req)` reads the body. Harmless (`createClient` does no I/O), but it is
the sentence a reviewer checks the `verify_jwt = false` posture against, and `resend-webhook`
(`index.ts:176`) really does build its client only after the Svix HMAC clears — that is where
the claim belongs.

**MINOR 9 — `p_file_path` is stored verbatim, not re-derived.** Re-measured (probe-r4-b §B5):
`record_inbound_compliance_document(…, p_file_path => '<other org uuid>/<other firm
uuid>/x/forged.pdf')` stores that string on a row whose `holder_id` and `organization_id` are
correctly the token's. Service-role only and the edge function always builds the key from
`paperwork_link_storage_context`, so it is unreachable today and leaks nothing. One line
closes it: `p_file_path LIKE v_row.organization_id || '/' || v_row.company_id || '/%'`.

**MINOR 10 — a refused RPC leaves an orphan object in `compliance-documents`.** `core.ts`
uploads (`upsert:false`) at `:225` and returns 400/403 at `:245-250` with no delete. Acceptance
10 is about a partial *row*, which holds. Nothing sweeps the bucket.

**MINOR 11 — the storage read policy is org-scoped, not (org, company).** Spec §8 says
`storage.objects` policies keyed on `(organization_id, company_id)` path segments;
`compliance_documents_member_read` reads segment 1 only (verified against `pg_policy`). The
effect is right — a studio member reads every firm's paper their studio holds — but the file
does not say it deviated, and the second segment's uuid shape then carries no load.

**MINOR 12 — the new storage policy re-uses the `NULLIF(…)::uuid` idiom.** Every segment the
policy casts is a real uuid by construction here, so the bucket itself is clean; but this is a
second instance of the shape that raises 22P02 on a full `storage.objects` scan (00170/00430,
`project-documents`), which means the trap cannot be closed by patching the first one alone.
A regex-guarded cast would cost nothing.

**MINOR 13 — `get_invoice_link` calls an expired link `active`.** The reader selects
`status <> 'revoked'` with no `expires_at` leg, while `resolve_invoice_link`,
`resolve_invoice_link_for_checkout` and `invoice_link_is_live` all refuse it. Nothing acts on
it because the token is always NULL — and since MAJOR 1 nothing renders from it at all.

**MINOR 14 — `resolve_invoice_return_nonce` rotates and re-dates a `closed` link.** The
selection is `l.status <> 'revoked'`, which admits `closed`, and the UPDATE stamps a fresh
`token_hash` and `expires_at` unconditionally. Nothing is exposed (`resolve_invoice_link`
answers the `withdrawn` sheet on a closed link) but a dead grant is re-addressed and re-dated.

**MINOR 15 — the `compliance_document_inbound` notice carries no `deep_link`.** 00637 §8's
metadata is `document_id / company_id / company_name / doc_type / entity_type / entity_id /
title / body`; `InboxNotificationMetadata` reads `deep_link` / `url` for the bell row's
destination, so the owner reads the notice and cannot follow it to the firm's card.

**MINOR 16 — the new `ref_type` has no leg in `notification_log`'s studio read policy.**
Re-measured: `notification_log_ref_studio_select` names `invoice`, `proposal`,
`client_invitation`, `client_review`. A channel-addressed letter's row has `user_id NULL` and a
ref no policy matches, so it is invisible to every authenticated reader — only the admin read
and `service_role` reach it. Nothing breaks today (`EmailDeliveryRefType` does not carry the
value); recorded so the ref is not later assumed studio-readable.

**MINOR 17 — the send chokepoint has two live exceptions, one of them new to this reviewer's
sweep.** `grep -rln "api.resend.com"` over the whole tree: `_shared/send-email.ts`, its test,
`campaign-dispatch/index.ts` (posts `/emails/batch`, never calls `prepareCompliantEmail`), and
`apps/designer-portal/src/app/api/pulse/send-email/route.ts`, which sends the Weekly Pulse
through `@patina/email`'s own `sendEmail` — a portal rail outside `supabase/functions` that
consults neither `channelRefusesSend` nor `profiles.email_suppressed`. Both pre-date this wave
and neither is one of its functions; recorded because the binding rule is "all email through
`_shared/send-email.ts` `sendCompliantEmail`", and because CRM-12's whole promise is that the
address's verdict is honoured everywhere.

**MINOR 18 — `failClosedPolicyReads` is not honoured by the new channel gate.**
`resolveContactChannel` logs and returns `null` on a read error (`send-email.ts:158-161`), so a
caller that opted into fail-closed suppression — `selection-review-send:38`,
`commercial-document-notify:462`, `proposal-send:259` — gets a fail-closed profile check beside
a fail-open channel check. For an account-less recipient the channel row is the *only*
suppression record, so a table outage means those three functions send to an address whose row
may read `dead`. The posture is documented in the function's own comment and is the right
default for the many recipients with no row at all; the inconsistency with the flag's contract
is the finding.

**MINOR 19 — `mint_paperwork_link` puts no ceiling on a caller-named date, and since W4R3-11
the face always names one.** Measured (probe-r4-b §B1): `mint_paperwork_link(firm, now() + 50
years)` is accepted and `v_access_grants` prints `Ends … 2076`. W4R3-11 changed
`paperwork-link-act.tsx` so **every** branch sends `chosenDay`, which means the RPC's own R-AD
derivation (`max(on_site_to, warranty_until)` over open seats) no longer runs on the portal
path at all — the door's end date is now whatever the browser sends, bounded only by
`> now()`. The refusal (`paperwork_link_window_required`) still fires when the face has no
window to offer and the member picks none, so R-AD's *no silent fallback clock* holds; what is
gone is the RPC's own opinion about the ceiling.

**MINOR 20 — releasing an unsubscribed channel is a per-row act while the unsubscribe is
address-wide, and the gate reads the worst row.** `applyChannelUnsubscribe` marks **every**
`email`/`ap_email` row carrying the value, across cards and studios (D-6);
`useSetStudioContactChannelStatus` releases **one row by id**. `resolveContactChannel` then
takes the worst status across all of them, so a studio that releases its own row still cannot
send while any other row on the address — another card in the same studio, an `ap_email` on the
firm, another studio's card entirely — is still `unsubscribed`, and no surface says why. The
same address on a person card and on its firm's `ap_email` is the ordinary shape, so this bites
inside one studio, not only across two.

**MINOR 21 — `/api/unsubscribe` applies the opt-out on a plain GET, and the opt-out is now
total.** `route.ts:32-45` writes on GET, and D-4 puts `List-Unsubscribe` on every category for
an account-less recipient. The header is not a body link, so ordinary link-scanners do not
follow it, and RFC 8058 clients POST — but any agent that does fetch the header URL silently
stops every studio letter to that mailbox, invoices included, with no confirmation step.

**MINOR 22 — the reject trail and the retention rule are conventions, not constraints.** Spec
§7's *"No document row is ever deleted by this door"* is enforced only by the door: 00623's
`studio_compliance_documents_member_{update,delete}` policies still let an ordinary member
UPDATE `rejected_at`/`rejection_reason` directly (a refusal with no `compliance_chase` draft,
which is acceptance 7's whole content) and DELETE the row. `paperwork_link_tokens` is correctly
closed — both refused.

**MINOR 23 — `AUTHORITY_SCOPES` omits `draw_certify` from the money class.**
`pipeline.ts:661-666` maps `money → ['money','change_order']`, but
`project_party_authority.scope`'s CHECK also carries `draw_certify`. A seat holding only
`draw_certify` who texts a `signoff` answer is stamped `failed_no_authority` and lands in
`idx_studio_touches_failed_authority` — the index r1 M-1 cleared of false accusations. Whether
certifying a draw is money authority is a ruling, not a bug; it should be one or the other on
purpose.

**MINOR 24 — the paperwork hash rule is inlined four times.** `mint_paperwork_link`,
`resolve_paperwork_link`, `record_inbound_compliance_document` and
`paperwork_link_storage_context` each write
`encode(extensions.digest(…, 'sha256'), 'hex')`. The pay rail learned this one file earlier:
`invoice_link_token_hash(text)` exists as *"the ONE statement of the lookup rule, so the
resolvers and the producers cannot drift"*. A `paperwork_link_token_hash(text)` would make the
four agree by construction.

**MINOR 25 — `paperwork_link_tokens.company_id` is `ON DELETE CASCADE`** against spec §7's
"token rows are kept indefinitely as an audit trail", and `invoice_links_test.sql`'s wall-clock
`job_runs` assertion (unchanged from `main`, green today) will flake again in the minute the
`invoice-checkout-attempts-expire` cron fires.

---

## 4. Checked and clean (no finding)

- **The paperwork token is verified before any read.** `resolve_paperwork_link`,
  `paperwork_link_storage_context` and `record_inbound_compliance_document` each shape-check
  `^[0-9a-f]{64}$`, re-derive `sha256(p_token)` and require `status = 'active' AND expires_at >
  now()` before touching anything. Re-measured (probe-r4-b §B2/§B6): malformed, unknown,
  truncated, and expired all give one NULL from the read and one
  `paperwork_token_invalid` from the write — never a distinguishable answer. The compare is a
  unique-index lookup on the hash, not a string compare of the secret (the `field_link_tokens`
  / `fulfillment_evidence_upload_tokens` precedent). The edge function reads the token from the
  request and never trusts a `company_id` in the body.
- **`resend-webhook` reads the raw body before parsing.** `index.ts:122` `await req.text()`,
  then the Svix HMAC over `${svixId}.${svixTimestamp}.${body}` with a length-guarded
  constant-time compare (`timingSafeEqual`, `:92-100`), a replay-window check, `JSON.parse`
  only after, and the service-role client only after that (`:176`). An unset
  `RESEND_WEBHOOK_SECRET` rejects every delivery. OPTIONS answers with `corsHeaders`.
- **`paperwork-upload` answers OPTIONS with `corsHeaders`** (`index.ts:49`, 204), layers them
  on every response including errors, and refuses every method but POST and OPTIONS.
  `verify_jwt = false` is declared in `config.toml:564` beside the ten existing in-code-verified
  functions, and the credential really is checked in code.
- **Uploads never overwrite a verified row.** Storage `upsert: false`; the RPC only ever
  INSERTs; the supersede is `confirm_inbound_document`'s and is preceded by all four of R-AZ's
  time-varying legs so the studio reads a sentence rather than a constraint name. W4 SQL blocks
  6, 7 and 9c green.
- **Storage policies allow only the token's company path on the write side.** The only writer is
  the edge function's service-role client, which builds
  `{org}/{company}/{upload}/{filename}` from `paperwork_link_storage_context`. `pg_policy` over
  `storage.objects` shows exactly one `compliance-documents` policy — SELECT, `authenticated` —
  so authenticated INSERT/UPDATE/DELETE reach nothing.
- **The key scheme avoids the uuid-cast trap for this bucket.** Every segment before the
  filename is a real uuid by construction; `sanitizeFilename` strips path separators and
  leading dots and floors to `document`.
- **R-AC recipients.** `record_inbound_compliance_document`'s `FOR … IN (owners+admins UNION
  created_by)` gives one row each, no duplicates, no new role.
- **Cross-tenant, everywhere I could reach it.** Mint and revoke are gated on
  `is_active_studio_member` of the firm's own studio; `assert_paperwork_token_company` refuses a
  person card, a missing card and a card in another studio by name; confirm and reject refuse a
  document in another studio with one name; `studio_touches` has a SELECT policy and no write
  policy and `record_touch` is `service_role` only, resolving the org server-side through
  `project_tenant_org()` (R-BD) / `studio_contact_org()`; `paperwork_link_tokens` has SELECT
  only. Every `SECURITY DEFINER` in the four files pins `search_path`, every one is REVOKEd from
  `PUBLIC` and `anon`, and `seed/00-legacy-grants.sql` regenerates with zero diff.
- **The email rail refuses dead and unsubscribed channels in every branch of the chokepoint.**
  `prepareCompliantEmail` resolves the channel unconditionally and returns
  `{state:"suppressed", reason:"channel_<status>"}` before any provider call, so
  `sendCompliantEmail`, the durable `prepareCompliantEmail` + `sendPreparedResendRequest` pair
  (`proposal-send`) and every one of the 34 `send-email.ts` importers are gated by one
  statement. `bounced` deliberately does not refuse. The two exceptions outside the chokepoint
  are MINOR 17.
- **Unsubscribe tokens cannot cross subjects.** The subject is signed (HS256, issuer
  `patina:notifications`, 72h) and `parseUnsubscribeSubject` splits on a `channel:` prefix a
  uuid can never carry; the channel branch reads that row's `value` and writes only rows sharing
  it; the account branch writes `notification_preferences` for that uuid and touches no channel.
  A channel token cannot reach a profile and a profile token cannot reach a channel.
- **`record_notice` matches Patina Field.** `SupabasePeopleRoomService.swift:337-346` sends
  `RecordNoticeParams` (`p_project_id` / `p_what` / `p_told`, `PeopleRoomWire.swift:413-423`)
  and decodes one row of `id, what, recorded_at, recorded_by, told_names`
  (`PeopleRoomWire.swift:390-410`, via `.single()`). 00635's signature and `RETURNS TABLE`
  match term for term, and the RPC returns exactly one row on success.
- **`invoice_links`' backfill keeps every live `/pay` link working.** Measured end to end
  (probe-r4-a) by replaying 00636 §2's four statements over a hand-written pre-00636 plaintext
  row: the token the client already holds resolves to `kind=invoice`, the checkout resolver
  returns its one row, the plaintext column reads `<null>`, the stored hash is useless as a
  bearer token, and a 400-day-old link is given a full 30 days from the migration rather than
  from its own `created_at`. `chk_invoice_links_token` (00574:87) guaranteed every pre-existing
  token was 64-hex, so `token_hash SET NOT NULL` cannot fail on a live book.
- **`issue_agreement_draw_invoice` revokes nobody's address.** It raises
  *"the draw … is already billed on a live invoice"* before minting, so the invoice
  `ensure_invoice_link` is called on is always the one created three statements earlier in the
  same transaction; the sign route's `payToken` → `/pay/<token>` offer is live again.
  `get_client_commercial_document_bundle` stays STABLE and carries `payToken NULL`.
- **`record_touch`'s CHECK pair cannot drift.** `authority_check = 'n/a' OR decision_class <>
  'none'` holds on every one of `sms-inbound`'s nine call sites and on both `_shared/sms.ts`
  writes.
- **R-AM holds.** No edge code calls `_primary_studio_for`; the four hits are comments and two
  test headers.
- **`deno.lock` never appears** at the worktree root or the repo root, before or after any run.

---

## 5. What I would fix before the next round

1. MAJOR 1 — ungate `Copy link` / `Regenerate link` from the address they exist to produce, fix
   the recovery band's sentence, and make the folio suite's default `useInvoiceLink` mock
   return `null`.
2. MAJOR 2 — one subject-aware sentence on the unsubscribe landing.
3. MAJOR 3 — the six-line `recordInboundTouch` on START and on YES.
4. The four report-accuracy minors (1, 2, 3, 4) — §8's list in particular, because it is the
   only concrete redeploy set on the branch and it is wrong by six functions.
