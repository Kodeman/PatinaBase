# W4 (P3) — data + edge: channel status, touches, invoice-link hardening, the paperwork door

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only: no `db push`, no `functions deploy`, no secrets set.

Direction §8 P3, minus the Patina Field screens (W5, already landed). Four objects and
their tests:

| # | Ask | Where it lives |
|---|---|---|
| 1 | Email channel status, suppression and unsubscribe for people with no account (CRM-12) | `_shared/send-email.ts`, `resend-webhook/`, `packages/notifications`, 00635 |
| 2 | Touches with decision class and authority check (E13, CRM-22), notices (CRM-23) | 00635, `_shared/sms.ts`, `sms-inbound/pipeline.ts` |
| 3 | The pay link hashed, dated, regenerated on send (CRM-29) | 00636 |
| 4 | The trade-side compliance upload door (PR-a / VISION V10) | 00637, `supabase/functions/paperwork-upload/` |

---

## 1. Migrations

Minted above 00634, clear of the 00595–00620 block the hour-tracking program reserved.

| File | What |
|---|---|
| `00635_studio_touches_and_channel_refs.sql` | `notification_log.ref_type` gains `studio_contact_channel`; `studio_touches` (E13) + RLS; `record_touch()` (service_role); `record_notice()` (authenticated) |
| `00636_invoice_link_hardening.sql` | `invoice_links.token_hash` + `expires_at`, plaintext backfilled to NULL and frozen by CHECK; `invoice_link_token_hash()`, `invoice_link_is_live()`; seven re-headed functions |
| `00637_paperwork_upload_door.sql` | `paperwork_link_tokens`, `paperwork_link_rate_limits`, the `compliance-documents` bucket, the reject columns on `studio_compliance_documents`, six RPCs, `v_access_grants`' twelfth branch |

Grafts (the winner body copied verbatim, the named lines changed):
`resolve_invoice_link` and `resolve_invoice_link_for_checkout` from **00588**; `v_access_grants`
from **00627**. Each graft was cut programmatically from the winner and patched by anchor, so
no line was retyped.

`supabase/seed/00-legacy-grants.sql` regenerated (`python3 scripts/generate-legacy-grants.py`,
+336 lines).

## 2. Edge

New: **`paperwork-upload`** (`index.ts` + `core.ts`), `verify_jwt = false` with the token
checked in code, `[functions.paperwork-upload]` added to `config.toml`. It is
`fulfillment-evidence`'s shape exactly: CORS in the shell, all logic in an injectable core,
OPTIONS → 204, service-role client built only after the request is read.

Changed shared modules — **every importer must redeploy in W7** (§8 lists all 37).

- `_shared/send-email.ts` — resolves an account-less recipient to its `studio_contact_channels`
  row, refuses `dead`/`unsubscribed`, adds `List-Unsubscribe` with subject `channel:<id>`,
  stamps the log row with `ref_type = 'studio_contact_channel'`, writes one out touch.
- `_shared/sms.ts` — `sendPartySms` writes one out touch per text that actually went.
- `_shared/invoice-links.ts` — new `hasLiveInvoiceLink()`; the module's contract note rewritten
  for regenerate-on-send.
- `resend-webhook/index.ts` + new `channel-status.ts` — a bounce or complaint is written onto
  every channel row carrying the address, worst-first.
- `sms-inbound/pipeline.ts` — an in touch at every outcome that attributes a message to a seat,
  with CRM-22's authority check where a decision is filed.
- `create-checkout-session/index.ts` — repointed off `ensureInvoiceLinkUrl` (see §5).
- `packages/notifications/src/{tokens,unsubscribe}.ts` — the unsubscribe landing honours a
  `channel:<id>` subject.

## 3. Decisions taken here (each overrulable in one line)

| # | Decision | Why |
|---|---|---|
| D-1 | `studio_touches.subject_type` carries a fourth value, **`project`** | `record_notice`'s signature is fixed by Patina Field (`w5-build-report.md` §3) and names a **project**. Filing a job-level notice as `engagement` pointed at one of the told seats would say the notice was about that person. Additive; no reader of the other three changes |
| D-2 | `channel_kind` is **nullable** | `record_notice` carries no channel argument. A notice whose channel the record does not know says so rather than being stamped with a guess |
| D-3 | The studio is resolved **inside** `record_touch`, never passed in — `project_tenant_org()` for a seat or a job (R-BD), `studio_contact_org()` for a card. No studio ⇒ **no row**, and the RPC answers NULL | An unattributable touch is one no studio can ever read back. Same posture as R-AW. On R-BI's studio-less legacy population that is the whole population until W3's backfill lands |
| D-4 | `List-Unsubscribe` is added to an account-less recipient's letters in **every category**, not only non-transactional | She has no preferences page and no profile to opt out on; the header is her only door. **Consequence, intended:** one click stops the studio emailing that address at all, invoices included, and the Directory row says so |
| D-5 | A soft bounce writes `bounced`, a hard bounce `dead`, a complaint `unsubscribed`; only `dead`/`unsubscribed` refuse a send | Mirrors the profile side, where one soft bounce does not suppress. `bounced` is already in 00593's CHECK |
| D-6 | An unsubscribe or a bounce is applied to **every** channel row carrying the address, across cards and studios | A dead mailbox is dead for everyone. What differs per studio is CONSENT (`studio_channel_consent`), which none of this touches |
| D-7 | `record_inbound_compliance_document` copies the studio's `blocks` forward from the firm's current paper of the same type | What a lapse blocks is the studio's policy on the paper, and nothing on the upload form asks the trade. Without it every renewal lands gateless and R-AZ's successor guard refuses the confirm outright — the door would take renewals nobody could ever verify |
| D-8 | `confirm_inbound_document` checks R-AZ **before** stamping | Letting 00623's guard fire mid-function rolls the confirm back with a constraint name on the face. The studio gets a sentence; the firm's paper stays pending |
| D-9 | The rate limit is a **function**, `paperwork_link_rate_limit_hit(inet)`, not spec §2's BEFORE INSERT trigger | The door has no per-attempt table to hang a trigger on. Same atomic `ON CONFLICT` bucket as `qr_auth_rate_limits` (00427); one bucket covers both calls, which is the requirement |
| D-10 | The storage key's third segment is an **upload id**, not the document id | Spec §4 requires every segment before the filename to be a uuid, and the document does not exist until the RPC writes it |
| D-11 | The edge function refuses a dated doc_type (COI, licence, bond) with no `expires_on` | 00623's `dated_expiry` CHECK would refuse it anyway, with a constraint name. The firm reads a sentence and nothing is stored on the way |
| D-12 | sms-inbound's decision class comes from `client_decisions.coordination_kind`: `signoff` → money, `selection` → selection, `rfi`/`submittal`/`punch` → logistics; a task + `report_delay` → schedule | The brief names the money rule ("no money scope → failed_no_authority"); the rail can file four other kinds of item and stamping all of them `money` would be false |
| D-13 | `failed_unknown_sender` is written when a decision is filed from a seat that is **not** the decision's own court party | That is the only place in this rail where "the approval came from someone it was never put to" is real. A message from a phone that resolves to no seat at all writes **no touch** — there is no subject and no studio, and `record_touch` answers NULL by design |

## 4. CRM-29: what the hardening costs, in full

The store is now a hash, so **no address can be re-emitted by anyone, Patina included**. Every
place that re-reads the token had to change, and each change is a behaviour change on a live
money rail. **This list was incomplete when it was written** (round-1 review B-1 / QA-B2): two
shipped readers were missed and are re-headed in `00638_pay_link_readers_reheaded.sql` — they are
the last two rows of the table:

| Path | Before | Now |
|---|---|---|
| `ensure_invoice_link` | returned the invoice's stable address | **mints a fresh one per call** and returns it once — CRM-29's "regenerate on send". Every caller is a letter. Returns NULL while a Checkout attempt is live, so a payer's address is never pulled out from under them (M11's rule, extended to the send path) |
| `get_invoice_link` | `{token, status}` | `{token: NULL, status, expires_at}` |
| `resolve_invoice_return_nonce` | read the bound link's token | **rotates** it: the same link row (same id, Stripe customer, payer email — F2 still holds) is re-addressed and the raw value returned once to the holder who just came back from Checkout. Now VOLATILE |
| `create-checkout-session` | called `ensureInvoiceLinkUrl` for a boolean | calls the new `invoice_link_is_live` — minting for a boolean would have revoked the payer's own address mid-payment |
| `resolve_invoice_link` / `_for_checkout` | matched the plaintext | match `token_hash`, and an expired link dies into the same silence a revoked one does |
| `issue_agreement_draw_invoice` (00578 → **00638**) | `SELECT link.token` after the issue trigger fired | **mints**: `ensure_invoice_link(v_invoice_id)` inside the issuing transaction returns the raw value once. Nobody holds the address it revokes — it was written three statements earlier in this same transaction. The client-portal sign route's deposit offer carries a live `/pay/<token>` again |
| `get_client_commercial_document_bundle` (00578 → **00638**) | `SELECT link.token` in the depositOffer | **carries no address**: `payToken` is `NULL::text`. It is STABLE and read on every page load, so it may not call the revoking minter. The door gate's reload path points at the deposit letter in the homeowner's own letterbox (`/?invoice=<id>`) instead, and `adaptDesignBuildDepositOffer` no longer requires a token for the offer to exist |

**Backfill:** every link already live got a full 30 days **from the migration**, not from its own
`created_at`. Dating a shipped link from creation would have killed, at deploy, every pay address
a client is already holding — a silent money-rail outage dressed as a hardening. Dead rows keep
the date they died on.

**The pay page needed no change**: it passes the raw token to `resolve_invoice_link`, which
hashes it. Same for `invoice-send` (`letterPortalUrl` → `ensure_invoice_link`) and
`invoice-link-checkout`.

**Known hazard, named:** two GETs of `/pay/return/<nonce>` rotate twice and the first redirect's
address is dead. The route is a single 303 with `Cache-Control: private, no-store`; a prefetch of
it would flake.

**Owed to the portals (not done here, W6/portal scope):** the designer folio's copy-the-address
act and the client letterbox's `/pay/<token>` href both read `get_invoice_link`, whose token is
now always NULL. Neither crashes — `useInvoiceLink`'s existing parser rejects a null token and
both surfaces already draw a "no link" state, and the folio's copy reads *"this invoice has no
link yet. Resend the invoice to try again"*, which is now the literal truth. But the designer's
only route to a copyable address is `Regenerate`, and `useRegenerateInvoiceLink`'s `onSuccess`
invalidates the query straight after writing the fresh token into the cache — so the address
disappears on the refetch. **DONE in round 1 (M-5): the invalidate is dropped; the mint is the
authority on the address and the cache keeps what it minted.** The client letterbox's
`/pay/<token>` href still reads `get_invoice_link` and still draws its "no link" state — no
finding named it, and it is recorded here so the next round can rule on it.

## 5. Gates

| Gate | Command | Result |
|---|---|---|
| Reset clean | `pnpm supabase:reset` | green; ledger head `00637` |
| People SQL | `w1a`, `w1b`, `w3`, `w4` suites | **all four pass** |
| Billing SQL | `supabase/tests/billing/invoice_links_test.sql` | passes — reworked for 00636 (see §6) |
| Notification SQL | `00591_notification_log_ref_rls`, `client_attention`, `she_sets_the_pace`, `00562_notification_log_owner_opened` | pass |
| Deno | `deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions/_tests/ _shared/ resend-webhook/ paperwork-upload/` | **777 passed, 1 failed** — the 1 is `_tests/stripe-rail.test.ts`, which needs a live `functions serve` + keys (`_tests/run.sh`) and fails on `supabaseKey is required` before any assertion. Untouched by this wave |
| Deno type-check | `deno check` on all nine changed edge files | clean |
| `db:generate` diff | `packages/supabase/src/database.types.ts` | +317 / −13. Every addition is a new object; the only removals are `invoice_links.token`'s three non-null shapes, now nullable |
| Type-check | `pnpm --filter @patina/notifications --filter @patina/supabase type-check` | clean |
| Package tests | `pnpm --filter @patina/notifications test` | 89 pass |

**Two pre-existing red suites, both already in `supabase/tests/KNOWN_FAILURES.md`, neither caused
here:** `edge_api/platform_acl_compatibility_test.sql` (its findings are
`extensions.pg_stat_statements*`, which this wave does not touch; the file's own header says 8 of
14 blocks are expected-red on a fresh local reset) and
`notifications/unconfirmed_analytics_test.sql`.

`deno.lock` was deleted before every Deno run and is absent from the repo root.

## 6. Two existing test files this wave had to change

- `supabase/tests/people/w1b_compliance_authority_directory_test.sql` — two `invoice_links`
  fixtures wrote a plaintext token. Rewritten to `token_hash` + `expires_at`.
- `supabase/tests/billing/invoice_links_test.sql` — the 1,721-line suite encodes 00574's
  "permanent, re-emitted address" contract, which CRM-29 reverses. Reworked: the suite now
  captures every address from a **mint** (there is no plaintext in a row to capture), asserts
  that `ensure_invoice_link` **regenerates** and that the superseded address is dead, asserts
  `get_invoice_link` hands back state and no address, and follows the nonce **rotation**. Row
  lookups moved onto `token_hash`; assertions that counted rows per invoice were scoped past
  the rows a regenerate now leaves revoked.

## 7. What the SQL suite proves (`supabase/tests/people/w4_channels_touches_paperwork_test.sql`)

Eight blocks, one transaction, rolled back, fixture id space `fa…`:

1. `notification_log` takes `studio_contact_channel` as a ref and still refuses an unknown kind.
2. `record_touch` resolves the studio from the subject, refuses to file an unattributable touch,
   and holds `decision_class` and `authority_check` together; 2b — the studio reads its own
   touches, a stranger reads none, and no member may write one through PostgREST.
3. `record_notice` writes a project notice in Field's exact wire shape, drops told refs that
   resolve to nothing so `notified_refs` and `told_names` can never disagree; 3b — an empty
   notice and a stranger get the same refusal, naming no facts.
4. CRM-29: sha256 at rest, a 30-day clock, a fresh address per send, the superseded address dead,
   one silence for revoked and expired alike, the stored hash useless as a bearer token; 4b —
   `get_invoice_link` reports state and end date and no address.
5. R-AD: a firm with no open engagement must be given a date or the mint is refused; an open seat
   dates the link from the window; one silence for every dead token; 5b — a person card and a
   stranger get the same refusal.
6. An upload always INSERTs unverified paper on the **token's** firm, inherits the studio's gates,
   never touches the verified document, tells the studio, and dies with its token.
7. Confirm stamps and supersedes without deleting; a lapsed paper cannot retire a live one and
   says so before anything is stamped; reject needs a reason and drafts exactly one
   `awaiting_review` chase; both acts are idempotent.
8. `v_access_grants` carries the paperwork link as its twelfth tier with its end date, revoke and
   reason, and no credential.

Deno: `_tests/paperwork-upload.test.ts` (12 — token verification, expiry, the forged-scope walk,
never-overwrite, the mime/size/label/date refusals, the shared rate bucket, filename safety) and
`_tests/email-channel-status.test.ts` (11 — worst-status resolution, the dead/unsubscribed
refusal, the soft-bounce pass, the channel-subject unsubscribe token, the untouched account path,
the deliverability ref, the out touch, and the webhook's write-back).

## 8. W7 redeploy set — every function importing a changed `_shared` module

Closure over `_shared/send-email.ts`, `_shared/sms.ts`, `_shared/invoice-links.ts` **and the
`_shared` modules that import them** (`decision-notify.ts`, `invoice-emails.ts`,
`invoice-check-intent-core.ts`, `po-emails.ts`, `quote-request-emails.ts`,
`trade-agreement-emails.ts`, `trade-rfq-emails.ts`, `project-approval-notification.ts`), plus the
three functions whose own code changed. **37 functions:**

```
apns-send                 designer-invite           invoice-send              resend-webhook
client-invite             digest-dispatcher         morning-brief             review-requests
commercial-document-notify expire-decisions         notification-digest       selection-review-send
create-checkout-session   field-daily               notification-dispatch     site-request-dispatch
decision-first-notice     fulfillment-notify        paperwork-upload          sms-dispatch
decision-reminders        fulfillment-po            po-send                   sms-inbound
decision-resolved-notify  invoice-check-intent      proposal-nudge            stripe-webhook
                          invoice-link-checkout     proposal-send             trade-agreement-send
                          invoice-reminders         proposal-sign-confirmation trade-rfq-send
                                                    quote-request-send        waitlist-notify
                                                                              workspace-member-invite
```

`resend-webhook` deploys `--no-verify-jwt`, as the email-deliverability checklist already says.
`paperwork-upload` is new and needs its `config.toml` entry deployed with it.

## 9. Owed, and not done

- **The folio hook change** (§4, last paragraph) — DONE in round 1 (M-5). The client letterbox's
  `/pay/<token>` href is still fed by `get_invoice_link` and still draws its "no link" state; no
  round-1 finding named it, so it is left standing and recorded.
- **The `/paperwork/[token]` page** (spec §3) and the company card's inbound-queue band
  (spec §6) — portal work, W6.
- **`flushDeferredMessages` writes no out touch.** The brief named `sendPartySms`; the flush is a
  second send path and was left alone rather than widened unasked.
- **`proposal-send` writes no out touch either.** It calls `prepareCompliantEmail` +
  `sendPreparedResendRequest` directly, so the channel refusal gate runs but
  `sendCompliantEmail`'s touch and channel-ref logging do not (round-1 review minor 11). Named
  here so §2's claim is not read wider than it is.
- **Three sms-inbound branches that attributed a message to a seat and wrote no touch** — the
  inbound STOP, HELP, and the project-chooser pick — were closed in round 1 (M-4). An inbound
  STOP is recorded as a contact as well as a consent act; nothing is excluded.
- **A letter that cannot name its studio writes no out touch and no channel ref** (round-1 B-2,
  the R-AW posture). All five account-less senders name theirs — `invoice-send`, `po-send`,
  `quote-request-send`, `trade-rfq-send`, `trade-agreement-send`.
- **A message from a phone that resolves to no seat writes no touch** (D-3/D-13). It is already
  marked `needs_review`, which is where it is visible.
- **Patina Field's site-access screen** builds its change log from the card's own
  `changed_at`/`told_refs` (00625) and does not read `studio_touches`, so a notice recorded by
  `record_notice` will not appear in that log until a reader is pointed at the touch. A W5/iOS
  reader gap, not a write gap: the write now exists and matches the wire shape Field sends.
- **No prod anything**: no `db push`, no `functions deploy`, no secrets.
