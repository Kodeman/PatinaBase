# W4 (P3) — round-3 adversarial migration + edge review

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `36148de9b`. Local only: no `db push`, no `functions deploy`, no secrets.
`rulings.md` §3 treated as settled throughout.

**Verdict: NOT clean — zero blocking, six major, twenty minor.**

Read in full: `00635_studio_touches_and_channel_refs.sql`,
`00636_invoice_link_hardening.sql`, `00637_paperwork_upload_door.sql`,
`00638_pay_link_readers_reheaded.sql`,
`supabase/functions/paperwork-upload/{index,core}.ts`, `_shared/send-email.ts`,
`_shared/sms.ts`, `resend-webhook/{index,channel-status}.ts`,
`sms-inbound/pipeline.ts`, `packages/notifications/src/{tokens,unsubscribe}.ts`,
`packages/supabase/src/hooks/{use-touches,use-inbound-documents,use-studio-contacts}.ts`,
`apps/client-portal/src/app/paperwork/[token]/page.tsx`,
`apps/client-portal/src/components/paperwork/paperwork-upload-form.tsx`,
`build/upload-door-spec.md` §5–§9, plus `00629_studio_contact_merges.sql`'s repoint
block and `00591_notification_log_delivery.sql`'s ref policy.

---

## 0. Gates re-run at HEAD

| Gate | Command | Result |
|---|---|---|
| Reset | `pnpm --dir <worktree> supabase:reset` | **green, exit 0**; ledger head `00638` |
| People SQL | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/{w1a,w1b,w3,w4}_*.sql` | **4/4 pass** (`All W1a assertions passed.` / `All W1b assertions passed.` / `W3 SQL suite: all blocks passed` / `W4 SQL suite: all blocks passed`, blocks 9/9b/9c/9d green) |
| Billing SQL | `supabase/tests/billing/invoice_links_test.sql` | **pass**, run 4× today (once in the sweep, then 3 back-to-back) — no flake in this window; r2's MINOR 7 wall-clock hazard is latent, not fixed |
| Billing SQL | `supabase/tests/billing/invoice_checkout_integrity_test.sql` | pass |
| Commercial SQL | `supabase/tests/commercial/design_build_test.sql` | pass (incl. T8(b) payToken 64-hex and T23 payToken NULL) |
| Notification SQL | `supabase/tests/notifications/00591_notification_log_ref_rls_test.sql` | pass |
| Deno | `deno test --no-check --allow-all --config supabase/functions/deno.json _shared/ paperwork-upload/ resend-webhook/` | **458 passed, 0 failed** |
| Deno | `… supabase/functions/_tests/` | **332 passed, 1 failed** — the 1 is `_tests/stripe-rail.test.ts` (`supabaseKey is required` at module top level; needs a live `functions serve` + keys). Pre-existing, untouched by this wave |
| `deno.lock` | deleted before and after every run | absent from the repo root |
| Legacy grants | `python3 scripts/generate-legacy-grants.py` | regenerated, **zero diff** |
| `db:generate` | `supabase gen types typescript --local` diffed against the committed file | **NO DRIFT** (38,838 lines identical). NB `pnpm db:generate` itself fails in this worktree — `packages/supabase`'s `generate` script needs `$SUPABASE_DB_URL` and silently writes an EMPTY `database.types.ts` when it is unset |
| Function posture | `pg_proc` audit over all 24 objects the wave creates or re-heads | every `SECURITY DEFINER` pins `search_path`; **no `anon` EXECUTE anywhere**; `record_touch`, `invoice_link_token_hash`, `invoice_link_is_live`, `ensure_invoice_link`, the three invoice resolvers, `resolve_paperwork_link`, `record_inbound_compliance_document`, `paperwork_link_storage_context`, `paperwork_link_rate_limit_hit` are service_role only |

### Probes run this round (files under `build/`)

| Probe | What it measured |
|---|---|
| `probe600-w4-r3-paperwork-authority.sql` | mint by the firm's own studio; a member of another studio refused (`paperwork_link_not_authorized`); a PERSON card refused; a no-window mint and a past-dated mint both refused (`paperwork_link_window_required`); a plain member may mint; R-AF holds one active token per firm |
| `probe601-w4-r3-upload-write.sql` | storage context comes from the token; the write lands on the token's firm, `inbound/verified_at NULL/source field_link`, gates inherited (D-7); **the verified row is untouched**; R-AC recipients exactly owner+admin+minter, one row each; a forged `p_file_path` is stored verbatim; revoke ⇒ one NULL from `resolve_paperwork_link`, zero rows from `paperwork_link_storage_context`, `paperwork_token_invalid` from the write |
| `probe602-w4-r3-storage-policy.sql` | studio A reads only A's objects, B only B's; `authenticated` INSERT refused; UPDATE/DELETE reach 0 rows; bucket posture private / 15 MB / 3 mime types |
| `probe603-w4-r3-22p02-attribution.sql` | a bucket-scoped scan is clean; a FULL authenticated `storage.objects` scan raises 22P02 on `fulfillment` — **and still does with `compliance_documents_member_read` dropped**, so it is 00170/00430's, not this wave's |
| `probe604-w4-r3-invoice-backfill.sql` | a pre-00636 plaintext row put through 00636 §2's three statements verbatim: `resolve_invoice_link(<the token the client already holds>)` → `kind: invoice`, `resolve_invoice_link_for_checkout` → 1 row, plaintext column answers nothing, a 400-day-old link got a FULL 30 days, the stored hash is useless as a bearer token. **No live /pay link is broken by the backfill** |
| `probe605-w4-r3-paylink-rail.sql` | mint → resolve; a second call regenerates and the first address is dead; `get_invoice_link` = `{token: null, status, expires_at}`; an expired link is refused by both resolvers and by `invoice_link_is_live` while `get_invoice_link` still calls it `active`; the nonce rotates a **closed** link |
| `probe606-w4-r3-touches.sql` | `record_touch` resolves the org from the subject; a studio-less job, an unknown card and a NULL subject each write nothing and answer NULL; authority-without-class refused by the CHECK; the studio reads its 2 touches, a stranger 0, a direct INSERT is `insufficient_privilege`, `record_touch` is not executable by `authenticated`; `record_notice` returns Field's exact five columns and drops unresolvable told refs; a stranger is refused |
| `probe607-w4-r3-confirm-reject-retention.sql` | cross-tenant confirm and reject both refused (`compliance_document_not_found`); `paperwork_link_tokens` UPDATE/DELETE refused to a member; **`studio_compliance_documents` direct UPDATE and DELETE both succeed for an active member** |
| `probe608-w4-r3-merge-vs-paperwork-door.sql` | a firm merge strands the live paperwork door — see MAJOR 3 |

---

## 1. Round-2 findings, re-measured at HEAD

| # | Round-2 finding | Verdict |
|---|---|---|
| W4R2-1 BLOCKING | the suppression gate selected a non-existent `organization_id` | **FIXED.** `resolveContactChannel` embeds `studio_contacts!inner(organization_id)` and normalises object-or-array; 17 Deno cases, one pinning the real column list |
| BLOCKING-1 | the paperwork bearer token reached PostHog in the clear | **FIXED.** `paperwork` (and `trade`) added to `HEX_BEARER_IN_URL` in both portals |
| MAJOR 1 | two confirm refusals reached the studio as raw Postgres tokens | **FIXED.** `INBOUND_REFUSAL_SENTENCES` now names all eight `compliance_*` tokens 00637 raises (`grep -c 'RAISE EXCEPTION' 00637` → 9 sites, 8 distinct tokens) |
| MAJOR 2 | the letterbox's Pay act was unreachable | **FIXED.** `letterbox.tsx` no longer imports `useInvoiceLink`; the terminal act opens the letter and `Settlement` |
| MAJOR 3 | the bounce write-back sat after `handleResendEvent`'s early return | **FIXED.** `writeChannelStatus(supabase, event, null, …)` is called **before** `if (!logEntry) return { matched: false }` (`index.ts:229`) |
| R2-MAJOR-2 (code) | a live paperwork grant never reached Access grants | **FIXED.** `FIRM_SCOPED_ACCESS_GRANT_TIERS` |
| MAJOR-2 (qa) | the mint band offered a lapsed window | **FIXED.** `firmEngagementWindowEnd` drops days not still ahead |
| MAJOR-4 (qa) | a dead paperwork link rendered the homeowner's 404 | **FIXED.** `DeadLink()` sheet, no act, four misses indistinguishable |
| MAJOR-5 (qa) | the upload receipt was silent to AT | **FIXED.** polite live region + focus target |
| MINOR 4 | §5's gate table says ledger head `00637` | **STILL OPEN** — head is `00638` |
| MINOR 5 | §7 says `email-channel-status.test.ts` holds 11 cases | **STILL OPEN** — it holds **17** (`grep -c Deno.test`) |
| MINOR 6 | the W7 set over-includes `apns-send` | **STILL OPEN**, and now understated — see MINOR 3 below |
| MINOR 7 | `invoice_links_test.sql`'s wall-clock `job_runs` assertion | **STILL OPEN** (latent; 4/4 green today, the cron fires at `:17`) |
| MINOR 8 | the inbound notice carries no `deep_link` | **STILL OPEN** — 00637 §8's metadata has `document_id/company_id/company_name/doc_type/entity_type/entity_id/title/body` and neither `deep_link` nor `url` |
| MINOR 9 | the storage read policy is org-scoped, not (org, company) | **STILL OPEN** |
| MINOR 10 | a refused RPC leaves an orphan object in the bucket | **STILL OPEN** — `core.ts` uploads before the RPC and never deletes on a 4xx |
| MINOR 11 | `p_file_path` is not checked against the token's prefix | **STILL OPEN, measured** (probe 601 §5) |
| MINOR 12 | the nonce rotates and re-dates a `closed` link | **STILL OPEN, measured** (probe 605 §5) |
| MINOR 13 | `get_invoice_link` calls an expired link `active` | **STILL OPEN, measured** (probe 605 §4) |
| MINOR 14 | a channel unsubscribe does not reach an account-holder rail | **STILL OPEN — re-graded MAJOR 1** |
| MINOR 15 | `campaign-dispatch` bypasses the channel gate | **STILL OPEN** — it is the only `api.resend.com` caller outside `_shared/send-email.ts` |
| MINOR 16 | the retention rule is a convention, not a constraint | **STILL OPEN, measured** (probe 607 §2: direct UPDATE 1 row, direct DELETE 1 row) |
| MINOR 17 | `touchDay` slices the UTC date out of a timestamptz | **STILL OPEN — re-graded MAJOR 4** |
| MINOR 18 | the new storage policy re-uses the uuid-cast idiom | **STILL OPEN, re-measured both ways** (probe 603) — pre-existing, bucket-scoped scans clean |

---

## 2. Findings

### MAJOR 1 — the dead/unsubscribed channel gate is skipped on every letter that carries a `userId` (confidence: high on the mechanism, medium on the population)

`_shared/send-email.ts`, `prepareCompliantEmail`:

```ts
const channel = options.userId
  ? undefined
  : (await resolveContactChannel(supabase, options.to, options.organizationId)) ?? undefined;
if (channel && channelRefusesSend(channel.status)) { … }
```

A letter that names a `userId` never looks at `studio_contact_channels` at all. Its only
suppression record is `profiles.email_suppressed`. The two records are written by
**different** halves of `resend-webhook`:

- `handleBounce(supabase, logEntry.user_id, …)` runs only `if (logEntry.user_id)`;
- `writeChannelStatus(...)` runs by ADDRESS, matched or not (the r2 MAJOR-3 fix).

So the reachable sequence is the one D-6 exists for:

1. Studio B's account-less letter (`po-send` / `trade-rfq-send` / …) hard-bounces.
   `applyChannelStatus` marks **every** row on the address `dead`; `logEntry.user_id` is
   NULL, so no profile is suppressed.
2. Any rail that knows a `userId` for the same human — `invoice-send`, `client-invite`,
   `notification-dispatch` — reads `profiles.email_suppressed = false` and **sends to the
   dead mailbox.**

The same holds for `unsubscribed`: `applyChannelUnsubscribe` marks the address
unsubscribed, `notification_preferences` is untouched, and D-4's stated consequence —
*"one click stops the studio emailing that address at all, invoices included, and the
Directory row says so"* — is false on that branch. The Directory row says stopped; the
rail keeps writing.

**Reachability measured on the local seed after a clean reset:**

```
select count(*) from (select distinct lower(btrim(value)) v from studio_contact_channels
                       where channel_kind in ('email','ap_email')) c
join (select distinct lower(btrim(email)) v from profiles where email is not null) p using (v);
 → 1        (designer@patina.dev)
```

One overlap exists in a seed of a dozen fixture people; on a real book — a designer who is
also a vendor contact, a homeowner whose address the studio typed on a card, a GC PM with
a client account — it is ordinary.

**Note on grading.** This meets the letter of the brief's blocking bar ("email sent to a
dead/unsubscribed channel"). I am filing it MAJOR because the branch in question addresses
a person whose own record (`profiles.email_suppressed`) IS consulted correctly, and closing
it is a widening of the gate rather than a hole in what was built. Fable should re-grade if
the blocking bar is meant literally.

**Fix.** Consult the channel whenever the address resolves to one, `userId` or not — the
verdict is address-wide by D-6, so there is no tenant question — and either suppress on
`channelRefusesSend` or, narrower, have `applyChannelUnsubscribe` / `applyChannelStatus`
also stamp `profiles.email_suppressed` (bounce) and the matching preference (unsubscribe)
for any profile carrying that address. Then a Deno case: an address that is `dead` on a
card and belongs to a profile with `email_suppressed = false` must not send.

---

### MAJOR 2 — the unsubscribe LANDING has no test anywhere, in either package or portal (confidence: high)

The wave added two exports that decide where a signed one-click token lands:

- `packages/notifications/src/tokens.ts` → `parseUnsubscribeSubject(sub)` — the whole
  "a channel token cannot be read as an account token" rule;
- `packages/notifications/src/unsubscribe.ts` → `applyChannelUnsubscribe(...)` — the
  cross-card, cross-studio `status = 'unsubscribed'` write, the `dead`-row skip, and the
  "unknown channel is `invalid`, not `error`" answer.

Neither is exercised:

```
$ ls packages/notifications/src/__tests__/
audience.test.ts  automation-engine.test.ts  notify.test.ts
preferences.test.ts  reminder-cadence.test.ts  tokens.test.ts
$ grep -rn "applyChannelUnsubscribe\|parseUnsubscribeSubject" packages/notifications/src/__tests__/
(nothing)
$ grep -rln "applyUnsubscribeToken" packages apps --include='*.test.ts' --include='*.test.tsx'
(nothing)
```

`pnpm --filter @patina/notifications test` → 89 passed, and none of them touch this path.

`w4-data-edge-report.md` §7 lists *"the channel-subject unsubscribe token"* among the
eleven (now seventeen) Deno cases. That case is
`_tests/email-channel-status.test.ts:285` — *"a channel letter carries List-Unsubscribe
with a channel subject, in every category"* — which asserts the MINT. The half that reads
the token back and writes to the database has no coverage of any kind.

That is the coverage floor broken on the one path the brief asks to be proved
("unsubscribe tokens cannot cross subjects"): I can only assert by reading that a profile
subject is a bare uuid and can never begin with `channel:`, and that
`applyChannelUnsubscribe` requires the prefix. Nothing pins it.

**Fix.** A vitest for `unsubscribe.ts`: a `channel:<id>` token marks every email-kind row
on the address and leaves a `dead` row alone; a plain-uuid token still writes
`notification_preferences` and touches no channel; an unknown channel id answers `invalid`,
not `error`; a token whose subject is a uuid that happens to be a channel id does NOT reach
the channel branch. Plus a `parseUnsubscribeSubject` table case.

---

### MAJOR 3 — a firm merge strands the paperwork door: the trade's live link empties, and its next upload lands where the studio never looks (confidence: high, measured)

`00629_studio_contact_merges.sql` repoints every firm-scoped object it knew about —
`studio_contact_channels`, `studio_person_affiliations`, `studio_contact_rules`,
`studio_compliance_documents` (holder_id → survivor, heads then lineage),
`project_parties`, `client_households`, and the analogous token table
`studio_trade_agreement_tokens` (`:2706-2707`). `paperwork_link_tokens` is 00637's table,
minted **after** 00629, and nothing was added to the repoint block for it.

Measured end to end (`probe608`, one studio, two duplicate firm cards, the door minted on
the duplicate — which is the card a studio merges away):

```
before the merge   documents: [ coi_gl, current, blocks site_access ]

merge c9 → c1      merged: t

the token          company_id = c9   status active   live t     ← still the absorbed card
the documents      holder_id  = c1                             ← moved to the survivor

what the firm now reads on its live link:
  { "documents": [], "company_name": "Northgate Electric LLC", … }

a new upload through that same live link:
  holder_id = c9, holder_type = company
  pending_on_survivor  = 0
  pending_on_absorbed  = 1

and after minting the survivor's own door:
  two ACTIVE paperwork tokens for one firm identity          ← R-AF broken
```

Three harms, each on its own:

1. **The firm is told the studio holds none of its paper.** `resolve_paperwork_link` reads
   `WHERE doc.holder_id = v_row.company_id`, which is now the absorbed card the documents
   left. The trade's page goes from "COI, current" to an empty table — a reader flatly
   disagreeing with the record. Spec §3's whole point is telling the firm what is owed.
2. **Inbound paper is lost.** `record_inbound_compliance_document` takes the holder from
   the token row, so the upload lands on the absorbed card. The survivor's inbound queue
   band (`holder_id = survivor`) shows nothing; `compliance_state(survivor)` counts nothing;
   the R-AC notice names `company_id = c9`, a card the People room now resolves forward.
   Acceptance 8 ("the studio member sees the band with the correct count") fails silently.
3. **R-AF is broken.** `uniq_paperwork_link_tokens_active_company` keys on `company_id`, so
   after a merge one firm identity holds two live doors.

Reachable from the portal today: `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:301`
calls `useMergeStudioContacts()` → `merge_studio_contacts` (granted to `authenticated`).

**Fix (00639, or 00637 edited in place before it ships).** Repoint in the merge, the way
`studio_trade_agreement_tokens` is repointed, and resolve R-AF across the move:

```sql
UPDATE public.paperwork_link_tokens
   SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
       revoke_reason = 'The firm was merged into another card.', updated_at = now()
 WHERE company_id = p_merged AND status = 'active'
   AND EXISTS (SELECT 1 FROM public.paperwork_link_tokens s
                WHERE s.company_id = p_survivor AND s.status = 'active');
UPDATE public.paperwork_link_tokens
   SET company_id = p_survivor, organization_id = v_survivor.organization_id,
       updated_at = now()
 WHERE company_id = p_merged;
```

(the `assert_paperwork_token_company` trigger fires on `UPDATE OF company_id,
organization_id` and will hold the survivor to a company card in the same studio, which is
the check you want). A SQL block: merge a firm holding a live door and assert the token
names the survivor, the firm's page still lists the moved paper, an upload lands on the
survivor's queue, and exactly one door is live.

---

### MAJOR 4 — every touch and every inbound upload prints the UTC calendar day, so an evening contact reads as tomorrow (confidence: high)

`packages/supabase/src/hooks/use-touches.ts:151`:

```ts
export function touchDay(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);   // …the UTC date PostgREST returned
```

`studio_touches.occurred_at` is `timestamptz`; PostgREST serialises it in UTC
(`2026-09-12T02:30:00+00:00`). A text sent at 9:30pm CDT on 11 Sep prints **12 Sep**. The
comment says the room's other dates share this spelling — they do not: the seat line, the
roster row and the compliance table read `date` columns, which carry no zone.

Two live readers:

- `apps/designer-portal/src/components/document/people/touch-line.tsx:49`
  (`touchSentence` → "Last touch 12 Sep 2026, by text.") and
  `roster/roster-row.tsx:393` (`useTouches`);
- `packages/supabase/src/hooks/use-inbound-documents.ts:98` —
  `const date = touchDay(doc.created_at)` — which is spec §6's per-row copy,
  *"{Doc type}, uploaded {date} by {firm name}."* `studio_compliance_documents.created_at`
  is `timestamptz` too.

The studio is in `FIELD_TZ` (`America/Chicago`), so everything after 7pm CDT / 6pm CST is
off by one, which is most of the field rail's evening traffic.

**Fix.** Format in the studio's zone rather than slicing the string — the same
`FIELD_TZ`-aware formatting the SMS rail already uses for quiet hours — or have the query
return a zone-resolved day. Keep `touchDay`'s `YYYY-MM-DD` fast path for the true `date`
columns and give the timestamptz callers their own function, so the two cannot be confused
again.

---

### MAJOR 5 — `flushDeferredMessages` sends real texts and writes no touch, so E13 misses the field rail's most ordinary send (confidence: high)

`_shared/sms.ts`: `sendPartySms` writes its out touch at `:991`. `flushDeferredMessages`
(`:1046`) is the second send path — it takes every `sms_messages` row parked
`twilio_status = 'deferred'` by quiet hours, re-checks consent through
`channelConsentVerdict`, and sends through Twilio. It has `row.party_id` in hand, so the
subject `record_touch` needs is right there, and it writes nothing.

`field-daily/core.ts:193` calls it on every run, so the digest that goes out after 8pm —
the normal shape of the field rail — is deferred to the next morning's flush and never
appears in `studio_touches`. The card's "Last touch" then shows the previous contact, which
is the room saying the studio has not reached someone it reached this morning. E13's own
table comment is "one row per contact a rail actually made, in either direction".

`w4-data-edge-report.md` §9 names it (*"The brief named `sendPartySms`; the flush is a
second send path and was left alone rather than widened unasked"*). Naming an omission does
not make the derived reading correct.

**Fix.** The same six-line `record_touch` call at the point the flush marks a row sent,
with `p_actor_ref: 'sms-dispatch-flush'` and `p_message_ref: row.id`. A Deno case in
`_shared/sms.test.ts` (the fake already records rpc calls) asserting one touch per flushed
row and none per skipped/suppressed/expired row.

`proposal-send` is the email twin — it calls `prepareCompliantEmail` +
`sendPreparedResendRequest` directly, so the channel refusal gate runs but
`sendCompliantEmail`'s touch does not. Lower impact (its recipients carry accounts and its
log row is written by `_sync_proposal_send_email_log`, so the bounce still matches), and
§9 names it too; folded here rather than filed separately.

---

### MAJOR 6 — the account-less recipient's unsubscribe confirmation lands on an admin sign-in wall (confidence: medium)

`generateChannelUnsubscribeUrl(channel.id, type, options.unsubscribeBaseUrl || DEFAULT_BASE_URL)`
and `DEFAULT_BASE_URL = "https://admin.patina.cloud"` (`send-email.ts:227`). None of the
five account-less senders passes `unsubscribeBaseUrl` (checked: `invoice-send`, `po-send`,
`quote-request-send`, `trade-rfq-send`, `trade-agreement-send` all pass `organizationId`
and nothing else). So the trade's only opt-out door is
`https://admin.patina.cloud/api/unsubscribe?token=…`.

- The RFC 8058 one-click **POST** works: `apps/admin-portal/src/middleware.ts` passes
  `/api` straight through and the route uses `getServiceClient()`, so the write lands and
  the client gets `200`, empty body. Good.
- The **GET** path — a mail client that opens the `List-Unsubscribe` URL in a browser, or a
  human who copies it — applies the unsubscribe and then
  `NextResponse.redirect('/preferences/unsubscribe?status=applied')`. That path is not
  `/api`, not `/auth`, not `/`, so the middleware's
  `if (!isAuthenticated && !isAuthPage && !isPublicPage)` redirects it to
  `/auth/signin?callbackUrl=/preferences/unsubscribe…`.

A subcontractor's office manager with no Patina account, and no way to get one, is shown an
**admin portal** sign-in form as the answer to "stop emailing me". She is never told the
opt-out worked. This is r2 MAJOR-4's harm on a different door — the same population, the
same wall — and D-4 makes this door load-bearing for the first time, since it is the ONLY
opt-out an account-less recipient has.

Confidence is medium only on how often clients take the GET path; the mechanism is certain.

**Fix (cheapest).** Make `/preferences/unsubscribe` public in the admin middleware's
`isPublicPage` test (it already renders from a query string and holds no account data), or
point `unsubscribeBaseUrl` for the channel branch at the client portal, which has the guest
prefix family and the calm-sheet precedent. Either way, a case in the portal's middleware
test that an unauthenticated GET of that path renders rather than redirects.

---

## 3. Minor findings

**MINOR 1 — §5's gate table is stale.** *"Reset clean … green; ledger head `00637`"*. Head
is `00638`; §1's migration table still lists three files and 00638 appears only in §4's
prose. (r2 MINOR 4, unfixed.)

**MINOR 2 — §7 undercounts the Deno suite.** `_tests/email-channel-status.test.ts` holds
**17** `Deno.test` blocks, not 11 (`paperwork-upload.test.ts`'s 12 is right). (r2 MINOR 5.)

**MINOR 3 — the W7 redeploy set is wrong in both directions.** Recomputed at HEAD:

- Closure over the three modules §8 names (`send-email.ts`, `sms.ts`, `invoice-links.ts`)
  plus the `_shared` modules importing them = **6 modules, 36 functions** (34 importers +
  `paperwork-upload` + `resend-webhook`). §8 says 37 and lists `apns-send`, which mentions
  `send-email.ts` in two comments and imports nothing from it. (r2 MINOR 6.)
- §8's own heading is wider than what it computed: *"every function importing a changed
  `_shared` module"*. This **branch** changes seven `_shared` modules, not three —
  `git diff --name-only main...HEAD -- supabase/functions/_shared/` also lists
  `branded-email.ts`, `client-letter.ts`, `email-assets.ts` and the new `html-to-text.ts`
  (commits `50e4ec687`, `6d6ba092c`; neither is an ancestor of `main`). Closing over all
  seven gives **17 modules and 39 importers**, and five are absent from §8's list:
  `back-in-stock-check`, `campaign-dispatch`, `comms-notification-dispatch`,
  `price-drop-check`, `spec-pdf`. A deployer who copies §8's 37 ships five functions with a
  stale bundled `_shared`. `build/email-deliverability-checklist.md` item 1 covers them in
  principle ("enumerate with grep at ship time") but names no function, so §8 is the only
  concrete list on the branch. Report accuracy per the brief's rule — but the deploy
  consequence is real.

**MINOR 4 — `invoice_links_test.sql`'s wall-clock `job_runs` assertion.** Unchanged from
`main` (`git show main:… | grep -n` → 1517-1520); green 4/4 today; the cron
`invoice-checkout-attempts-expire` fires at `:17`, so it will flake again in that minute.
(r2 MINOR 7.)

**MINOR 5 — the `compliance_document_inbound` notice carries no `deep_link`.** 00637 §8's
metadata has `document_id`, `company_id`, `company_name`, `doc_type`, `entity_type`,
`entity_id`, `title`, `body`; `InboxNotificationMetadata` reads `deep_link` / `url` for the
bell row's destination, so the owner reads the notice and cannot follow it to the firm's
card. (r2 MINOR 8.)

**MINOR 6 — the storage read policy is org-scoped, not (org, company).** Spec §8 says
`storage.objects` policies keyed on `(organization_id, company_id)` path segments;
`compliance_documents_member_read` reads segment 1 only. The effect is right (a studio
member reads every firm's paper their studio holds) but the file does not say it deviated,
and the second segment's uuid shape then carries no load. (r2 MINOR 9.)

**MINOR 7 — a refused RPC leaves an orphan object in `compliance-documents`.** `core.ts`
uploads (`upsert: false`) before calling `record_inbound_compliance_document` and returns
400/403 on an RPC error with no delete. Acceptance 10 is about a partial *row*, which holds.
Nothing sweeps the bucket. (r2 MINOR 10.)

**MINOR 8 — `p_file_path` is stored verbatim, not re-derived.** Measured (probe 601 §5): a
call with `p_file_path = '<other studio org>/<other studio firm>/x/forged.pdf'` stores that
string on a row whose `holder_id`/`organization_id` are correctly the token's. Not reachable
today (service_role only; the edge function always builds the key from
`paperwork_link_storage_context`), and it leaks nothing — a studio member cannot read that
prefix. It is the one field on the write that is not re-derived; a one-line
`p_file_path LIKE v_row.organization_id || '/' || v_row.company_id || '/%'` guard closes it.
(r2 MINOR 11.)

**MINOR 9 — `resolve_invoice_return_nonce` rotates and re-dates a `closed` link.** Measured
(probe 605 §5): with every link on the invoice `closed`, the nonce still returns a fresh
64-hex token and stamps a new `token_hash` + `expires_at` on the dead row. Nothing is
exposed — `resolve_invoice_link` answers the `withdrawn` sheet — but a closed grant is
re-addressed. (r2 MINOR 12.)

**MINOR 10 — `get_invoice_link` calls an expired link `active`.** Measured (probe 605 §4):
with `expires_at` in the past, `resolve_invoice_link` → NULL, `resolve_invoice_link_for_checkout`
→ 0 rows, `invoice_link_is_live` → `f`, and `get_invoice_link` →
`{"token": null, "status": "active", "expires_at": "<yesterday>"}`. The reader disagrees
with the rail by one word; no surface acts on it because the token is always NULL. (r2 MINOR 13.)

**MINOR 11 — `campaign-dispatch` is the one live exception to the send chokepoint.**
`grep -rln "api.resend.com" supabase/functions` → `_shared/send-email.ts`, its test, and
`campaign-dispatch/index.ts`, which posts to `/emails/batch` and never calls
`prepareCompliantEmail`, so `channelRefusesSend` is not consulted for its recipients.
Pre-existing and outside the wave's own functions; recorded because the binding rule is
"all email through `_shared/send-email.ts` `sendCompliantEmail`". (r2 MINOR 15.)

**MINOR 12 — the reject trail and the retention rule are conventions, not constraints.**
Measured (probe 607 §2), as an ordinary active member of the studio through PostgREST's
role: `UPDATE studio_compliance_documents SET rejected_at = now(), rejection_reason = '…'`
writes **1 row** — a refusal with no `compliance_chase` draft, which is acceptance 7's whole
content — and `DELETE FROM studio_compliance_documents` removes **1 row**, against spec §7's
"No document row is ever deleted". `studio_compliance_documents_member_{update,delete}` are
00623's policies; the new reject columns join them. `paperwork_link_tokens` is correctly
closed (both refused). (r2 MINOR 16.)

**MINOR 13 — the new storage policy re-uses the uuid-cast idiom.** Re-measured both ways
(probe 603): a bucket-scoped scan is clean (1 row, no error); a FULL authenticated
`storage.objects` scan with a `project-documents` object named
`fulfillment/po/PO-2026-00001-A.pdf` raises `22P02 invalid input syntax for type uuid:
"fulfillment"` — **and raises it identically with `compliance_documents_member_read`
dropped**. Pre-existing 00170/00430. Recorded as a shape note: a second policy of the same
form means the trap cannot be closed by patching the first one alone, and
`NULLIF(...,'')::uuid` could be written as a regex-guarded cast here for free. (r2 MINOR 18.)

**MINOR 14 — `record_notice` does NOT refuse a studio-less job, and its own COMMENT says it
does.** 00635's banner and the function comment both claim *"a studio-less job and a
stranger both get `notice_not_authorized`, so the door names no facts."* Measured (probe
606 §5b): as the designer of a project with `studio_id IS NULL`, `record_notice` **succeeds**
and files the touch. The reason is correct and deliberate — `project_tenant_org()`'s second
leg resolves the CALLER's own design studio when the project records none (R-BD) — but it
means the gate `is_active_studio_member(v_org)` is vacuous for that population (v_org was
derived from the caller), and it is the exact opposite of `record_touch`'s D-3 posture on
the same rows ("No studio ⇒ no row"). Comment accuracy per the brief's rule; the divergence
between the two doors is worth a sentence in §3 of the report either way.

**MINOR 15 — 00637's rate-limit comment is false.** `paperwork_link_rate_limit_hit`'s body
comment: *"No trusted proxy address (local dev, an internal caller): nothing to bucket. The
edge function refuses a missing address in production."* `core.ts:127` —
`if (!deps.ip) return true;` — allows it, and there is no other refusal. (The trust order
itself matches the house precedent in
`apps/client-portal/src/lib/utils/client-ip.ts`, so this is the comment, not the code.)

**MINOR 16 — §2 mis-describes the edge shell's order.** *"the service-role client built only
after the request is read"*. `paperwork-upload/index.ts:52` builds it before
`handlePaperwork(deps, req)` reads the body. Harmless (`createClient` does no I/O) but it is
the sentence a reviewer checks the `verify_jwt = false` posture against; `resend-webhook`
really does build its client after the signature clears (`index.ts:176`) and that is where
the claim belongs.

**MINOR 17 — the paperwork hash rule is stated three times.** `resolve_paperwork_link`,
`record_inbound_compliance_document` and `paperwork_link_storage_context` each inline
`encode(extensions.digest(p_token, 'sha256'), 'hex')`. The pay rail learned this lesson one
file earlier: `invoice_link_token_hash(text)` exists as *"the ONE statement of the lookup
rule, so the resolvers and the producers cannot drift"*. `mint_paperwork_link` inlines it a
fourth time. A `paperwork_link_token_hash(text)` helper would make the four agree by
construction.

**MINOR 18 — `AUTHORITY_SCOPES` omits `draw_certify` from the money class.**
`sms-inbound/pipeline.ts` maps `money → ['money','change_order']`, but
`project_party_authority.scope`'s CHECK is
`money | change_order | selections | schedule | site_access | key | draw_certify`. A seat
holding only `draw_certify` that texts a `signoff` answer is stamped `failed_no_authority`
and lands in `idx_studio_touches_failed_authority` — the index r1 M-1 cleared of false
accusations. Whether certifying a draw is money authority is a ruling, not a bug; it should
be one or the other on purpose rather than by omission.

**MINOR 19 — the new `ref_type` has no leg in `notification_log`'s studio read policy.**
00635 widens `notification_log_ref_type_chk` with `studio_contact_channel`, but
`notification_log_ref_studio_select` (00591) names only `invoice`, `proposal`,
`client_invitation`, `client_review`. A channel-addressed letter's row has `user_id NULL`
and a ref no policy matches, so it is invisible to every authenticated reader — only the
admin read and `service_role` reach it. Nothing breaks today: `EmailDeliveryRefType`
(`use-email-delivery.ts:19`) does not carry the new value and no surface asks for it.
Recorded so the ref is not later assumed studio-readable.

**MINOR 20 — `paperwork_link_tokens.company_id` is `ON DELETE CASCADE`.** Spec §7 says token
rows are kept indefinitely as an audit trail, matching `field_link_tokens`. A hard-deleted
company card takes its token rows — and the record of who had a live door and when — with
it. Not reachable through PostgREST (`studio_contacts` carries SELECT/INSERT/UPDATE policies
and no DELETE policy, verified), so this is a shape note against a service-role or hand-SQL
path only.

---

## 4. Checked and clean (no finding)

- **The paperwork token is verified before any read.** `resolve_paperwork_link`,
  `paperwork_link_storage_context` and `record_inbound_compliance_document` each shape-check
  `^[0-9a-f]{64}$`, re-derive `sha256(p_token)` and require `status = 'active' AND
  expires_at > now()` before touching anything; malformed / unknown / revoked / expired give
  one NULL or one `paperwork_token_invalid`, never a distinguishable answer (probe 601 §7).
  The compare is a unique-index lookup on the hash, not a string compare of the secret —
  the `field_link_tokens` / `fulfillment_evidence_upload_tokens` precedent. `resend-webhook`
  reads the **raw body first** (`index.ts:122`), verifies the Svix HMAC with
  `timingSafeEqual` over a length-guarded compare, checks the replay window, and builds the
  service client only after (`:176`).
- **Uploads never overwrite a verified row.** Storage `upsert: false`; the RPC only ever
  INSERTs; the supersede is `confirm_inbound_document`'s. Measured (probe 601 §2/§3): the
  prior verified row keeps `verified_at`, `superseded_by NULL`, `rejected_at NULL`.
- **Storage policies allow only the token's company path on the write side.** The only
  writer is the edge function's service-role client, which builds
  `{org}/{company}/{upload}/{filename}` from `paperwork_link_storage_context`. Authenticated
  INSERT/UPDATE/DELETE reach nothing (probe 602); the read is studio-scoped and cross-studio
  reads return zero rows.
- **The key scheme avoids the uuid-cast trap for this bucket.** Every segment before the
  filename is a real uuid by construction; `sanitizeFilename` strips path separators and
  leading dots and floors to `document`.
- **R-AC recipients.** Measured exactly: owner + admin + the plain member who minted the
  link, one row each, 3 rows / 3 distinct users, no duplicates (probe 601 §4).
- **Cross-tenant, everywhere I could reach it.** Mint and revoke are gated on
  `is_active_studio_member` of the firm's own studio; a person card, a missing card and a
  card in another studio are all refused by `assert_paperwork_token_company`; confirm and
  reject refuse a document in another studio with one name; `studio_touches` has a SELECT
  policy and no write policy, `record_touch` is `service_role` only and resolves the org
  server-side through `project_tenant_org()` (R-BD) / `studio_contact_org()`; a stranger
  reads 0 touches and cannot INSERT one (probes 600, 601, 606, 607).
- **`record_notice` vs Patina Field.** `SupabasePeopleRoomService.swift:336-345` sends
  `p_project_id` / `p_what` / `p_told` (`RecordNoticeParams`) and decodes one row of
  `id, what, recorded_at, recorded_by, told_names` (`PeopleRoomWire.swift:393-410`, via
  `.single()`). 00635's signature and `RETURNS TABLE` match term for term, and the RPC
  always returns exactly one row on success, which is what `.single()` requires. Only told
  refs that resolve to a seat on this job or a card in this studio are stored, so
  `notified_refs` and `told_names` cannot disagree (measured: a random uuid in `p_told` is
  dropped).
- **The `invoice_links` backfill keeps every /pay link working.** Probe 604 replays 00636
  §2's three statements verbatim over a reconstructed pre-00636 row: the token a client is
  already holding still resolves (`kind: invoice`) and still opens Checkout; the plaintext
  column answers nothing; the stored hash is not a bearer token; a 400-day-old link got a
  full 30 days from the migration rather than from its own `created_at`. 00574's
  `chk_invoice_links_token CHECK (token ~ '^[0-9a-f]{64}$')` on a `NOT NULL` column
  guarantees the backfill cannot leave a NULL `token_hash`, so `SET NOT NULL` cannot abort
  on a legacy row. `mint_invoice_link_on_issue`, `ensure_invoice_link` and
  `regenerate_invoice_link` all store only the hash; `issue_agreement_draw_invoice` mints
  inside the issuing transaction and `design_build_test.sql` T8(b) pins the 64-hex shape,
  T23 pins the bundle's `payToken IS NULL`.
- **Unsubscribe subjects cannot cross.** A profile subject is a bare uuid and can never
  begin with `channel:`; `applyChannelUnsubscribe` is reached only through the prefix; both
  need the HS256 secret, and the edge (`UNSUBSCRIBE_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY`)
  and the portal (`packages/notifications/src/tokens.ts` `getSecretKey`) read the same two
  env names in the same order. Every unsubscribe route uses a service client
  (`createServiceClient()` / `getServiceClient()`), so the write is not silently zero-rows
  under RLS. `applyChannelUnsubscribe` leaves a `dead` row alone and matches only
  `email`/`ap_email`. **Asserted by reading only — see MAJOR 2.**
- **Channel values are normalised.** `normalize_studio_contact_channel()` lowercases the two
  email kinds on write (00593), and `select count(*) … where value <> lower(value)` → 0, so
  `applyChannelStatus` / `applyChannelUnsubscribe` matching on a lowercased address cannot
  miss a row.
- **The email rail's refusal, on the branch it covers.** `channelRefusesSend` refuses `dead`
  and `unsubscribed` and lets a soft `bounced` through, mirroring the profile side; the
  verdict is worst-first across every card (D-6) while the touch subject and the
  deliverability ref are the sending studio's own row only (B-2); a suppressed send still
  writes its `suppressed` log row with the same ref. All five account-less senders pass
  `organizationId`. `writeChannelStatus` now runs before the unmatched early return.
- **The bounce never walks a verdict backwards.** `CHANNEL_STATUS_RANK` filters to rows
  strictly below the target before the update, in both the edge module and `send-email.ts`.
- **Touches on the inbound rail.** `recordInboundTouch` fires at STOP (`:974`), HELP
  (`:1113`), the project-chooser pick (`:1208`) and every filing outcome (`:1250`, `:1291`,
  `:1364`, `:1396`, `:1410`). `filedDecisionFacts` reserves `failed_unknown_sender` for
  `court_party_id IS NOT NULL AND <> partyId` (r1 M-1's fix, still in place) and for an
  unreadable item; `authorityVerdictFor` reads `project_party_authority` with both date
  legs and treats a failed read as no grant, which is CRM-22's posture; `prepares_only` is
  decisive on money (PR-n). The `studio_touches_authority_needs_class_check` CHECK refuses
  a checked touch with no class, measured.
- **`_primary_studio_for` (R-AM).** No `.rpc("_primary_studio_for")` anywhere under
  `supabase/functions`; the nine hits are comments explaining why it is never called.
- **`verify_jwt = false` declared with an in-code check.** `[functions.paperwork-upload]
  verify_jwt = false` is in `config.toml` with a comment naming the in-code token check;
  `index.ts` answers `OPTIONS` with `204` + `corsHeaders` and merges them onto every
  response; the token travels in the multipart body, never the URL; `POST` is a
  CORS-safelisted method so the absent `Access-Control-Allow-Methods` does not fail the
  preflight, and `Access-Control-Allow-Headers` covers the `apikey` + `Authorization` the
  form sends.
- **No bearer in a URL that leaves the page.** The client portal sets
  `Referrer-Policy: strict-origin-when-cross-origin` (`next.config.js:198`), so the
  `/paperwork/<token>` URL is not carried to Supabase on the upload POST, and r2's PostHog
  redaction covers the analytics path.
- **Migration rules.** Hand-numbered `00635`–`00638`, above the branch head and clear of the
  reserved `00595`–`00620` block; banner + lineage on every file with the winner named and
  the grep that found it; `CREATE … IF NOT EXISTS` plus named `DROP CONSTRAINT IF EXISTS` /
  `ADD CONSTRAINT` so a rerun really widens; RLS in the same file as the table; explicit
  `REVOKE … FROM PUBLIC, anon` beside every grant and no `anon` EXECUTE anywhere (audited);
  every `SECURITY DEFINER` pins `search_path`; `extensions.digest` and
  `extensions.gen_random_bytes` schema-qualified throughout; CHECK over enum on every new
  vocabulary; money in cents; `00-legacy-grants.sql` regenerates to zero diff; generated
  types show no drift.
