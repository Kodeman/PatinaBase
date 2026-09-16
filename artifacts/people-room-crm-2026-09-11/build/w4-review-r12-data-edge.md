# W4 — adversarial migration + edge review, round 12 (data / edge)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod anything: no `db push`,
no `functions deploy`, no secrets. No server started on 3000 or 3002. No migration minted
(R-BZ holds W4 at 00638; the branch head is `00638_pay_link_readers_reheaded.sql`).

Read in full: `w4-data-edge-report.md`; migrations `00635`, `00636`, `00637`, `00638`;
`supabase/functions/paperwork-upload/{index,core}.ts`,
`_shared/{send-email,sms,invoice-links,invoice-checkout-driver}.ts`,
`resend-webhook/{index,channel-status}.ts`, `sms-inbound/pipeline.ts`,
`packages/notifications/src/{tokens,unsubscribe}.ts`; `upload-door-spec.md` §5–§9;
`rulings.md` §3; `w4-fix-log-r11.md`.

**Verdict: not clean — 3 major, 0 blocking, 11 minor.**

---

## 0. The three r11 findings, re-checked

| r11 finding | Status | Evidence |
|---|---|---|
| **MAJOR-1** — the Playwright spec poisoned the seeded studio | **FIXED** | `apps/client-portal/tests/paperwork-link.spec.ts` now carries `mintedDoors`, `removeDoor()` (objects → `notification_log` → `studio_compliance_documents` → `paperwork_link_tokens` → `studio_contacts`, each leg explicit), and a `test.afterAll` that removes this worker's doors then sweeps `Paperwork E2E %` cards **older than an hour** (the age filter is what makes it safe under `fullyParallel`). `w1b_compliance_authority_directory_test.sql` → exit 0 this round. |
| **MAJOR-2** — the rate bucket was an existence oracle | **FIXED** | `paperwork_link_rate_limit_hit`'s `link:` branch now carries `status = 'active' AND expires_at > now()`, and a well-formed token resolving to no live link is keyed `tok:<sha256>`. Block 15 of `w4_channels_touches_paperwork_test.sql` (12 assertions) passes. **But the fix is the direct cause of MAJOR-1 below** — see that finding. |
| **M-1** — the seat window claimed it re-dates open doors | **FIXED** | `WINDOW_CONSEQUENCE_SENTENCE` in `seat-window-band.tsx` now reads "…dates the doors minted from here on. A door already open keeps the dates it was given — close it under Access grants if the window moved under it." `grep -rn "dates the doors"` finds no other source site. |

---

## 1. MAJOR-1 — `paperwork_link_rate_limits` has no sweep, and r11 gave its key space to the caller

**Severity: major. Confidence: high** (on the facts; the severity call is mine — the
program may prefer to carry it as a W7 ops item).

**Files:** `supabase/migrations/00637_paperwork_upload_door.sql` (the table and
`paperwork_link_rate_limit_hit`), against the precedent it cites,
`supabase/migrations/00427_atomic_qr_auth_rate_limit.sql`.

00637 takes 00427's table shape verbatim — the two are byte-alike but for the key column:

```
paperwork_link_rate_limits   PK btree (bucket_key)   text, 1..200 chars
qr_auth_rate_limits          PK btree (ip_address)   inet
```

It does **not** take 00427's other half. 00427 line 89 schedules the broom:

```sql
PERFORM cron.schedule('qr-auth-rate-limit-cleanup', '17 * * * *', $$
  DELETE FROM public.qr_auth_rate_limits WHERE updated_at < now() - interval '1 day';
$$);
```

00637 contains no `cron`, no `cleanup`, no `sweep`, and no `DELETE` against its own table —
`grep -n "cron\|cleanup\|sweep\|DELETE FROM public.paperwork_link_rate_limits" 00637…sql`
returns nothing. On the reset local DB, `cron.job` holds exactly one rate-limit broom and it
is the QR one:

```
          jobname           |  schedule
----------------------------+------------
 qr-auth-rate-limit-cleanup | 17 * * * *
```

Alone that would be a tidy-up. What makes it a finding is that r11's MAJOR-2 fix changed the
key space from *bounded* to *caller-chosen*. Before r11 an unresolvable token spent the one
shared `anon` row. After r11 it gets `'tok:' || encode(digest(token,'sha256'),'hex')` — one
permanent row per distinct 64-hex string a stranger cares to type. The limit is per bucket,
so none of those knocks is ever refused; r11's own block 15 asserts this as a feature:

> "twenty-one junk knocks from twenty-one distinct never-minted tokens are all allowed and
> `anon` is never written (g, h)"

Twenty-one knocks, twenty-one new rows, zero refusals, and nothing on the books ever removes
them. `ip:` is the same shape — `callerIp` reads `cf-connecting-ip` / `x-forwarded-for`,
which r11 itself records as caller-written. The door is anonymous by design (`verify_jwt =
false`, anon key, `/paperwork/[token]` unauthenticated), so the writer is the internet.

This is a write-amplifying, unbounded, unswept table reached by an unauthenticated public
endpoint, in a migration that names the swept precedent as its idiom.

**Fix:** schedule the broom 00637 already implies, next to its table, in the same file
(00637 is unapplied on Strata, so R-BZ permits the in-place edit):

```sql
PERFORM cron.schedule('paperwork-link-rate-limit-cleanup', '23 * * * *', $$
  DELETE FROM public.paperwork_link_rate_limits
   WHERE updated_at < now() - interval '1 day';
$$);
```

One day is 00427's own horizon and is far longer than the rolling minute the limiter reads,
so no live bucket is ever swept out from under a caller. Regenerate
`seed/00-legacy-grants.sql` afterwards only if a GRANT moves (it does not here).

---

## 2. MAJOR-2 — `campaign-dispatch` is a branch of the email rail that never asks the channel gate

**Severity: major. Confidence: medium** (the facts are certain; the overlap that turns it
into a send is narrow, and `campaign-dispatch` is untouched by W4).

**Files:** `supabase/functions/campaign-dispatch/index.ts` (untouched by this wave),
against `_shared/send-email.ts` and `packages/notifications/src/unsubscribe.ts`.

The Check item is "the email rail refuses dead/unsubscribed channels in **every** branch."
`campaign-dispatch` posts straight to `https://api.resend.com/emails/batch` (line 468). It
never imports `_shared/send-email.ts`, so `channelRefusesSend` never runs. Its whole audience
model is `profiles` filtered on one column — `.eq("email_suppressed", false)` at lines 76,
266, 290 and 301 — and it consults `studio_contact_channels` nowhere.

For bounces and complaints the two ledgers stay in step: `resend-webhook/index.ts` writes
`profiles.email_suppressed = true` (lines 442, 577, 605) **and** `applyChannelStatus` writes
the channel row, from the same event. The unsubscribe rail is where they part.
`applyChannelUnsubscribe` writes only the channel table:

```ts
.from('studio_contact_channels')
.update({ status: 'unsubscribed', status_at: … })
.eq('value', channel.value)
.in('channel_kind', ['email', 'ap_email'])
.in('status', ['active', 'bounced']);
```

`profiles.email_suppressed` is not touched. So an address that is **both** a
`studio_contact_channels` row and a Patina account — a trade who later signed up, a studio
member who is also a firm's AP contact — can click the List-Unsubscribe link D-4 puts in
every account-less letter, be recorded `unsubscribed` address-wide, and still be mailed by
the next campaign.

That contradicts this wave's own stated rule, written four lines above the call in
`unsubscribe.ts`:

> "Her opt-out lands on the ADDRESS — every typed email channel carrying it, across every
> card, **because one mailbox is one person saying stop.**"

The mailbox said stop; one rail kept sending. I am calling this major rather than blocking
because the send is addressed to a `profiles` row rather than to a channel row, and because
`campaign-dispatch` predates the CRM-12 model — but the brief's Check item names every
branch, and this is a branch.

**Fix, smallest form:** have `applyChannelUnsubscribe` also set
`profiles.email_suppressed = true, email_suppressed_at = now()` for any profile whose email
equals `channel.value`, mirroring what `resend-webhook` already does for a bounce. That
closes the gap in the rail W4 owns, without touching `campaign-dispatch`. If the program
would rather the two ledgers stay separate on purpose, that is a one-line ruling and this
finding dissolves — but it should be a ruling, not a silence.

---

## 3. MAJOR-3 — the spec's own front door, the field-link "Paperwork" section, is unbuilt and unowed

**Severity: major. Confidence: high.**

`upload-door-spec.md` §1 puts the door's primary entrance on the field link:

> | The firm's paperwork contact (E4.is_paperwork_contact…) | A "Paperwork" section on the
> same field link page their firm's engagement already sends them
> (`apps/client-portal/src/app/field/[token]`) | None | One studio, one company card |

and §9 acceptance 1 is:

> "A firm's paperwork contact, and only the paperwork contact, sees the Paperwork section on
> their field link."

It does not exist. `grep -rn "paperwork\|Paperwork" apps/client-portal/src/app/field/`
returns **zero** hits across all eleven files of that route. `resolve_field_link` is not
re-headed by any of 00635–00638, and `is_paperwork_contact` appears only in 00592 and 00629,
neither of which surfaces it to the field link.

The door itself is reachable — a studio member mints a link on the company card
(`paperwork-link-act.tsx`) and sends it by hand — so this is not a dead feature. It is the
spec's stated arrival path, the one that needs no studio member in the loop, and it is
missing.

What makes it major rather than a scheduling note: **nothing records it.**
`grep -rln "Paperwork section" artifacts/people-room-crm-2026-09-11/` matches exactly one
file, the spec. It is in no wave plan, no report's "Owed, and not done", and no ruling. Eleven
review rounds have not named it. `w4-data-edge-report.md` §9 lists what W4 left for W6 and
this is not on that list; `w4-paperwork-report.md` §7 does not carry it either.

**Fix:** either build it in W6 (a `Paperwork` section on `/field/[token]`, gated on the
seat's `is_paperwork_contact`, deep-linking to a token the RPC mints or resolves), or add one
line to `w4-paperwork-report.md` §7 and to the W6 brief recording that acceptance 1 is
deferred and who owns it. Either is fine; carrying it in nobody's head is not.

---

## 4. Minors

All eleven. Per the brief these never hold the gate.

**m-1 — `w4-data-edge-report.md` §2: "service-role client built only after the request is
read."** It is not. `paperwork-upload/index.ts:43` constructs the client *before*
`handlePaperwork(deps, req)` is called and therefore before any body read or token check:

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const deps: PaperworkDeps = { supabase: …, ip: callerIp(req.headers) };
try { return withCors(await handlePaperwork(deps, req)); }
```

Construction is inert — no query runs until `handlePaperwork` has matched `TOKEN_PATTERN` —
so the binding "service client only after auth" rule is satisfied in substance. The sentence
is wrong about the code. Confidence: high.

**m-2 — §2's "Changed shared modules" list omits `_shared/invoice-checkout-driver.ts`.**
`git diff --name-only origin/main...HEAD -- supabase/functions/` lists it (and its test) as
changed; §2 names four shared modules and this is a fifth. No redeploy consequence — I
recomputed the importer closure independently and every importer of
`invoice-checkout-driver.ts` is already inside §8's 37 — but the list reads as exhaustive.
Confidence: high.

**m-3 — §5: "Reset clean … ledger head `00637`."** The branch head is `00638`
(`ls supabase/migrations | tail`). Confidence: high.

**m-4 — §5: "Deno … 777 passed, 1 failed."** This round, on the same config: the scoped run
(`paperwork-upload`, `email-channel-status`, `sms-inbound`, `resend-webhook/`) is
**134 passed / 0 failed**, and the full `supabase/functions/` run is **1579 passed / 1 failed
/ 1 ignored**. The one failure is the same pre-existing `_tests/stripe-rail.test.ts`
(`Error: supabaseKey is required` at line 34, before any assertion; the file is untouched by
this branch — `git log origin/main..HEAD -- …stripe-rail.test.ts` is empty). Numbers only.
Confidence: high.

**m-5 — §5: "`deno check` on all nine changed edge files."** Twenty-one non-test edge source
files changed on the branch (`_shared/{invoice-checkout-driver,invoice-links,send-email,sms}`,
`create-checkout-session`, `field-daily/core`, `invoice-link-checkout`, `invoice-reminders`,
`invoice-send`, `paperwork-upload/{index,core}`, `po-send`, `quote-request-send`,
`resend-webhook/{index,channel-status}`, `sms-inbound/pipeline`, `stripe-webhook`,
`trade-agreement-send/{index,lib}`, `trade-rfq-send/{index,lib}`), plus
`_tests/fake-supabase.ts`. Confidence: high.

**m-6 — §9 still owes a page that exists.** "**The `/paperwork/[token]` page** (spec §3) and
the company card's inbound-queue band (spec §6) — portal work, W6." The page is built:
`apps/client-portal/src/app/paperwork/[token]/page.tsx` plus its `__tests__`. Confidence:
high.

**m-7 — `w4-paperwork-report.md` line 21: "`notFound()` on every miss."** The page returns
`<DeadLink />` (a 200 with the dead-door sheet), never `notFound()`. r9-QA already established
that the 200 dead door is the deliberate house pattern (`/plans/[token]` does the same) and
that the security goal is met; the report's own description of its own file is what is wrong
here. Confidence: high.

**m-8 — `w4-paperwork-report.md` line 38: "the page calls `paperwork_link_rate_limit_hit(p_ip)`
itself."** Since r11 it calls it with both arguments — `{ p_ip: callerIp, p_token: token }` —
and the second one is the whole point of the r11 fix. Confidence: high.

**m-9 — `w4-paperwork-report.md` line 107 describes "the fail-**open** limiter."** The page
fails **closed**: `if (limitError || withinLimit === false) return <too many tries>`. The
comment four lines above says so explicitly ("an unreadable limiter is a refusal, not a
pass"). The same line also says "three flavours of dead link all 404" — see m-7. Confidence:
high.

**m-10 — the multipart branch buffers the whole upload before claiming its bucket.**
`handlePaperwork` (core.ts:434) does `const form = await req.formData();` and only then
`withinRateLimit(deps, token)`. A refused caller has still made the function buffer up to
`MAX_FILE_BYTES`. The ordering is forced — the token rides in the body — and the JSON branch
above it has the same shape with a comment saying why ("THE PAYLOAD IS READ BEFORE THE BUCKET
IS CLAIMED, and nothing else is"). The multipart branch carries no such note although it is
the expensive one. Comment, or move the token to a header so the bucket can be claimed first.
Confidence: high.

**m-11 — `invoice_letter_must_hold(uuid)` is granted to `authenticated` with no caller and no
tenant predicate.** 00636:372-373 does `REVOKE ALL … FROM PUBLIC, anon;
GRANT EXECUTE … TO service_role, authenticated;` while its own batch wrapper
`invoice_letters_must_hold(uuid[])` revokes `authenticated` as well. Every caller is
service_role (`_shared/invoice-links.ts:182`, `invoice-send`, `invoice-reminders`); nothing
in `apps/` or `packages/` calls it. The body is `SECURITY DEFINER` over
`invoice_checkout_attempts` with no membership check, so any signed-in user holding an invoice
id learns whether that invoice is mid-payment. uuids are not guessable and the leaked fact is
one boolean, which is why this is minor and not a cross-tenant read — but the grant buys
nothing. Match the plural: `REVOKE EXECUTE … FROM authenticated`. Confidence: high.

**n-1 — the `compliance-documents` storage policy's uuid cast, re-attributed (no change
needed).** 00637's `compliance_documents_member_read` uses
`public.is_active_studio_member(NULLIF((storage.foldername(name))[1], '')::uuid)`. Re-run this
round against the freshly reset DB, round 3's own probes settle it:

```
=== WITH the new policy in place ===
NOTICE:  bucket-scoped scan OK: 1 rows
NOTICE:  FULL scan 22P02: invalid input syntax for type uuid: "fulfillment"
=== WITHOUT the new policy (attribution) ===
NOTICE:  FULL scan (policy dropped) 22P02: invalid input syntax for type uuid: "fulfillment"
```

The 22P02 on an unscoped `storage.objects` scan is the **pre-existing** `project-documents`
trap (prod holds `fulfillment/po/PO-2026-00001-A.pdf`); it is identical with the new policy
dropped. The new policy's own bucket scans clean, its keys are
`{org}/{company}/{upload_id}/{filename}` written only by the definer path with
`upsert: false`, and `NULLIF(…, '')` covers the empty-segment case. Spec §4's key scheme
avoids the trap. Recorded so round 13 does not re-open it. Confidence: high.

---

## 5. Check list, item by item

| Check | Result |
|---|---|
| Paperwork token verified before any read (raw body, constant-time sha256) | **Holds.** `TOKEN_PATTERN` then `resolve_paperwork_link`, which compares `token_hash`; the raw value is never stored. |
| Expired / revoked refuse | **Holds.** Both resolvers carry `status = 'active' AND expires_at > now()`; block 15 proves a revoked and an expired token are indistinguishable from an unminted one. |
| Uploads never overwrite a verified row | **Holds.** `upsert: false` on the object; R-BU's one row per doc type lands `awaiting_check`; acceptance 5 asserted in the suite. |
| Storage policies allow only the token's company path | **Holds.** `paperwork_link_storage_context` derives org + company from the token row, never from the body. |
| Key scheme avoids the uuid-cast trap | **Holds** — see n-1. |
| Recipients per R-AC | **Holds.** Owners + admins + minter, proved by probe against the seeded studio. |
| Email rail refuses dead/unsubscribed in every branch | **MAJOR-2.** |
| Unsubscribe tokens cannot cross subjects | **Holds.** `parseUnsubscribeSubject` returns `{kind:'channel'}` only for a `channel:`-prefixed subject; a profile subject can never reach `applyChannelUnsubscribe` and vice versa. |
| Touches on every send/receive path; authority_check matches CRM-22 | **Holds**, with the two paths §9 already records as deliberate (`flushDeferredMessages` writes its own touch with `sms-dispatch-flush`; `proposal-send` still writes none). |
| `record_notice` matches the Patina Field signature | **Holds.** 00635's `(p_project_id, p_what, p_told)` → `(id, what, recorded_at, recorded_by, told_names)` matches `RecordNoticeParams` / `NoticeRow` in `SupabasePeopleRoomService.swift` + `PeopleRoomWire.swift` exactly. |
| `invoice_links` backfill keeps every `/pay` link working | **Holds.** Proved empirically: hashed lookup resolves, the old plaintext lookup finds nothing (fails closed), and a regenerate kills the prior address. `chk_invoice_links_token_frozen` holds `token` NULL. |
| Every `_shared` importer enumerated | **Holds.** I recomputed the closure independently (`grep -rl "_shared/<file>" supabase/functions --include=index.ts` per changed module, plus the transitive `lib.ts`/`core.ts` legs) and get §8's 37 exactly. See m-2 for the module §2 forgot to name. |

---

## 6. Gates

```
pnpm --dir …/agent-people-build supabase:reset ......... EXIT=0, "Finished supabase db reset"
   (run outside the Bash sandbox — the CLI's ~/.supabase/telemetry.json write is EPERM
    inside it, the same limitation r10/r11 recorded)

psql -v ON_ERROR_STOP=1  (postgresql://postgres:postgres@127.0.0.1:54322/postgres)
  people/w4_channels_touches_paperwork_test.sql ........ exit=0
  people/w4_invoice_link_freeze_order_test.sql ......... exit=0
  people/w1a_identity_channels_consent_test.sql ........ exit=0
  people/w1b_compliance_authority_directory_test.sql ... exit=0
  people/w3_merge_sweep_household_test.sql ............. exit=0
  billing/invoice_links_test.sql ...................... exit=0
  billing/invoice_checkout_integrity_test.sql ......... exit=0
  storage/project_documents_caller_binding_test.sql ... exit=0

deno test --allow-all --config supabase/functions/deno.json
  (scoped) _tests/paperwork-upload _tests/email-channel-status
           _tests/sms-inbound resend-webhook/ .......... ok | 134 passed | 0 failed (270ms)
  (full)   supabase/functions/ ....................... FAILED | 1579 passed | 1 failed
           | 1 ignored (6s) — the 1 is _tests/stripe-rail.test.ts, "Error: supabaseKey is
           required" at line 34, top-level, before any assertion. Untouched by this branch
           (git log origin/main..HEAD on that path is empty). Pre-existing.
  deno.lock ........................................... absent at the worktree root

python3 scripts/generate-legacy-grants.py ............. baseline + 2837 replayed statements,
                                                        NO git diff on seed/00-legacy-grants.sql

SUPABASE_DB_URL=… pnpm --dir … db:generate ............ EXIT=0; diff on
   packages/supabase/src/database.types.ts is 10 insertions / 10 deletions, all cosmetic —
   the CLI's current formatting of the `Tables<>` / `TablesInsert<>` / `TablesUpdate<>` /
   `Enums<>` generic constraints (a dropped paren pair). No table, column, argument or return
   type moved. Restored with `git checkout --`.
   (This command needs the Docker socket and so runs outside the Bash sandbox.)

Probes re-run this round, both from artifacts/…/build/, both transactional (ROLLBACK):
  probe602-w4-r3-storage-policy.sql ................... PASS lines as quoted in n-1
  probe603-w4-r3-22p02-attribution.sql ................ 22P02 present with AND without the
                                                        new policy — pre-existing
```

No server started. No prod call of any kind.
