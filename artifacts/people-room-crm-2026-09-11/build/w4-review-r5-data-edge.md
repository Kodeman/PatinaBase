# W4 (P3) — round-5 adversarial review: migrations + edge

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Read in full: `w4-data-edge-report.md`,
`upload-door-spec.md` §5–§9, `w4-fix-log-r4.md`, migrations **00635 / 00636 / 00637 / 00638**,
every RPC they define, `supabase/functions/paperwork-upload/{index,core}.ts`,
`_shared/{send-email,sms,invoice-links}.ts`, `resend-webhook/{index,channel-status}.ts`,
`sms-inbound/pipeline.ts`, `packages/notifications/src/{tokens,unsubscribe}.ts`, and the
surfaces the wave's own §4/§9 name. `rulings.md` §3 treated as settled throughout.
No prod anything: no `db push`, no `functions deploy`, no secrets. No migration minted here.

**Verdict: 0 blocking · 2 major · 12 minor. NOT clean** (two major).

---

## 1. Gates run in this round

| Gate | Command | Result |
|---|---|---|
| Reset | `pnpm --dir <worktree> supabase:reset` | **exit 0**, `Finished supabase db reset on branch main` |
| Ledger head | `SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1 DESC` | `20260910152111`, **`00638`**, `00637` |
| SQL — W1a | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql` | `All W1a assertions passed` (47 blocks), exit 0 |
| SQL — W1b | `…/w1b_compliance_authority_directory_test.sql` | `All W1b assertions passed` (26 blocks), exit 0 |
| SQL — W3 | `…/w3_merge_sweep_household_test.sql` | `W3 SQL suite: all blocks passed`, exit 0 |
| SQL — W4 | `…/w4_channels_touches_paperwork_test.sql` | `W4 SQL suite: all blocks passed` (10 + b-blocks), exit 0 |
| SQL — billing | `supabase/tests/billing/invoice_links_test.sql` | exit 0, no ERROR/FAIL |
| Deno (full) | `rm -f deno.lock && deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions/{_tests,_shared,resend-webhook,paperwork-upload}/` | **796 passed, 1 failed** — the 1 is `_tests/stripe-rail.test.ts`, `Error: supabaseKey is required.` at `stripe-rail.test.ts:34:31` (needs a live `functions serve`; untouched by this wave) |
| Deno (typechecked, W4 surfaces) | `deno test --allow-all --config … paperwork-upload.test.ts email-channel-status.test.ts sms-inbound.test.ts _shared/send-email.test.ts resend-webhook/ _shared/invoice-links.test.ts _shared/sms.test.ts` | **195 passed, 0 failed**, all `Check` lines clean |
| `deno.lock` | `ls <worktree>/deno.lock` | `No such file or directory` — absent before and after every run |
| Migration idempotency | replayed 00635/00636/00637/00638 with `ON_ERROR_STOP=1` against the already-migrated DB | all four **exit 0**, no error |
| Generated types | `supabase gen types typescript --db-url <local>` diffed against `packages/supabase/src/database.types.ts` | **0 diff lines** |
| Legacy grants seed | `python3 scripts/generate-legacy-grants.py` then `git status` | regenerated in place, **no diff** — the committed seed is current (`+2831 replayed statements`) |
| Grant/search_path audit | 22 new/re-headed functions: `has_function_privilege` for anon/authenticated/service_role/PUBLIC, `prosecdef`, `proconfig` | **no anon, no PUBLIC anywhere**; every `SECURITY DEFINER` pins `search_path` |
| Cross-tenant probe (written for this round) | studio B calls `mint_paperwork_link` / `confirm_inbound_document` / `reject_inbound_document` on studio A's card + doc, and reads `paperwork_link_tokens`, `studio_touches`, `v_access_grants`, `studio_compliance_documents` | `paperwork_link_not_authorized`, `compliance_document_not_found` ×2, `0/0/0/0` rows, `permission denied for function record_touch` |
| Backfill probe (written for this round) | replayed 00636 §2's two `UPDATE`s over a synthetic pre-00636 population (active / revoked / closed) | every row hashed, `token_hash = sha256(raw)` for all three, `0` rows would break `SET NOT NULL`, active row live |
| `_shared` fan-out closure (written for this round) | transitive import closure over `_shared/{send-email,sms,invoice-links}.ts` | **34 importing functions**; + `paperwork-upload`, `resend-webhook` (own code changed) = **36**. Report lists 37 (see m-6) |

No server started on 3000/3002; no Playwright (no route added this round). Ports untouched.

---

## 2. Prior findings re-checked

Every finding in `w4-fix-log-r4.md`, plus the earlier-round fixes it cites, verified against HEAD.

| Id | Claim | Verified |
|---|---|---|
| W4R4-1 | Regenerate stands on `canShareLink` alone; Copy waits on the mint; recovery band repointed | **FIXED** — `invoice-folio.tsx:694-702` renders Regenerate on `canShareLink`; `:672` keeps `clientInvoiceUrl` on Copy |
| W4R4-2 | `scope: 'account' \| 'address'`, landing speaks from scope | **FIXED** — `unsubscribe.ts:32,168,172` return `scope` on every path |
| W4R4-3 | START and YES file an inbound touch | **FIXED** — `pipeline.ts:1032-1038` (START), `1114-1120` (YES). See **MAJOR-2** for what the fix still leaves open |
| W4R4-4 | Access-grant dates through `touchInstantDay` | **FIXED** — `access-grant-list.tsx:28,174,176`; `formatSeatDate` import dropped |
| W4R4-5 | `fieldPrefix` per row, slugged into ids | **FIXED** — `paperwork-sheet.tsx:115`, `paperwork-upload-form.tsx:43,78-79` |
| r1 B-2 | `organizationId` on `ComplianceSendOptions`; no studio ⇒ no touch, no ref | **FIXED** — `send-email.ts:59`, `191-207`, `733` |
| r1 M-2 | `access_grants_invoice_links` carries `il.expires_at` | **FIXED** — `00637:1014` |
| r1 M-5 | Regenerate's `onSuccess` no longer invalidates | **FIXED** — `use-invoices.ts:1398-1409`, `setQueryData` only |
| r2 W4R2-1 | Channel lookup embeds the owning card instead of a flat `organization_id` | **FIXED** — `send-email.ts:155-160` |
| r2 MAJOR-3 | Letterbox no longer gates its terminal act on `useInvoiceLink` | **FIXED** — `letterbox.tsx:126-156`; the hook is not imported there at all |
| r2 MAJOR-4 | `/paperwork/<token>` dead sheet is not the homeowner 404 | **FIXED** — `paperwork/[token]/page.tsx:57-68` |
| r3 MAJOR-1 | The channel gate asks the address even when a `userId` is present | **FIXED** — `send-email.ts:445-449`, unconditional `resolveContactChannel` |
| r3 MAJOR-5 | `flushDeferredMessages` writes an out touch | **FIXED** — `_shared/sms.ts:1224-1240` |
| QA-B1 / r1 MAJOR-2 | `compliance_state` excludes unchecked and refused paper | **FIXED** — `00637:187-189`; W4 block 9 asserts it |
| B-1 / QA-B2 | The two 00578 pay-link readers re-headed | **FIXED** — 00638 §1 mints, §2 carries `payToken NULL::text`; `adaptDesignBuildDepositOffer` no longer requires it (`commercial-documents.ts:673-689`), `door-gate.tsx:286-288` falls back to `/?invoice=<id>` |

No prior finding is open.

---

## 3. What I checked against the brief's list, and found sound

- **Token verified before any read.** `resolve_paperwork_link`, `record_inbound_compliance_document`
  and `paperwork_link_storage_context` each re-derive `encode(digest(p_token,'sha256'),'hex')` and
  require `status='active' AND expires_at > now()` before returning or writing anything. The edge
  function validates the 64-hex shape before every round trip
  (`core.ts:141,168`) and takes the storage scope from the token, never the form.
- **Expired / revoked refuse.** All three paths, plus `resolve_invoice_link` /
  `_for_checkout`. Malformed, unknown, revoked and expired all answer one NULL — no oracle.
  Probed via the W4 suite blocks 5 and 6.
- **Uploads never overwrite a verified row.** `record_inbound_compliance_document` has no UPDATE
  path on `studio_compliance_documents` at all; the supersede is `confirm_inbound_document`'s and
  runs only after all four R-AZ legs pass. Storage `upsert:false` on a key whose third segment is a
  fresh `crypto.randomUUID()`.
- **Storage policy / key scheme.** Key is `{org}/{company}/{uploadId}/{filename}` — every cast
  segment is a real uuid, the only free text is last and is slugged to `[a-z0-9._-]` with
  separators stripped. One SELECT policy, studio-member only, no anon/authenticated INSERT policy;
  the door's only writer is the service-role client. I probed the uuid-cast trap by inserting an
  object with a non-uuid first segment into a second bucket and counting `storage.objects` as an
  authenticated studio member: **0 rows, no 22P02** — the `bucket_id` conjunct is evaluated first.
- **Recipients per R-AC.** `00637:745-754` — active `owner`/`admin` of the token's org `UNION`
  `created_by`; the UNION dedupes the minter who is already one.
- **Email rail refuses dead/unsubscribed in every branch.** `prepareCompliantEmail` resolves the
  channel unconditionally (account or no account) and refuses on `dead`/`unsubscribed` before the
  profile gate; `sendCompliantEmail` and the direct `prepareCompliantEmail` callers both pass
  through it. The Deno suite's *"a dead address does NOT send to an account holder whose profile is
  unsuppressed"* is the negative control.
- **Unsubscribe tokens cannot cross subjects.** HS256 over `UNSUBSCRIBE_TOKEN_SECRET`;
  `parseUnsubscribeSubject` splits on the `channel:` prefix, which a uuid subject can never carry.
  A channel token reaches only `applyChannelUnsubscribe`; a user token only the preferences path.
  The address-wide (not studio-wide) reach of a channel stop is D-4/D-6, ruled.
- **Touches on the send paths.** `sendCompliantEmail` (delivered + `studioRow`), `sendPartySms`,
  `flushDeferredMessages`, eleven `recordInboundTouch` call sites in sms-inbound.
  `authority_check` matches CRM-22: `AUTHORITY_SCOPES`, `prepares_only` decisive on money,
  a failed read is `failed_no_authority` (silence is not a signature), a court naming another seat
  is `failed_unknown_sender`. No branch can produce `decision_class='none'` with a non-`n/a`
  verdict, which is what `studio_touches_authority_needs_class_check` forbids.
- **`record_notice` matches Patina Field.** `RecordNoticeParams` (`PeopleRoomWire.swift:413-423`)
  sends `p_project_id/p_what/p_told`; `NoticeRow` decodes `id, what, recorded_at, recorded_by,
  told_names`; the RPC returns exactly that one row, so the Swift `.single()` holds.
- **`invoice_links` backfill.** 00574's `chk_invoice_links_token` held every stored token to
  `^[0-9a-f]{64}$`, so `invoice_link_token_hash` hashes all of them and the later
  `SET NOT NULL` cannot fail. My synthetic replay confirms every raw token a client already holds
  still resolves through `token_hash`, and that the plaintext column is gone and frozen. No live
  function reads `invoice_links.token` any more (checked against `pg_get_functiondef` over all 15
  functions that name the table).
- **Every `_shared` importer enumerated.** Transitive closure = 34 functions + 2 whose own code
  changed; the report's list contains all of them (one extra, m-6).
- **Grants.** No anon or PUBLIC EXECUTE on any definer RPC; `record_touch` is service_role-only and
  an authenticated caller gets `permission denied for function record_touch`; `studio_touches` and
  `paperwork_link_tokens` are SELECT-only to `authenticated` with no write policy.

---

## 4. Findings

### MAJOR-1 — 00636's backfill kills the `withdrawn` / `settling` sheet on every link that was already closed (confidence: high, reproduced)

`supabase/migrations/00636_invoice_link_hardening.sql:110-118` and `:504-508`.

The expiry backfill is

```sql
UPDATE public.invoice_links
   SET expires_at = CASE
         WHEN status = 'active' THEN now() + interval '30 days'
         ELSE COALESCE(revoked_at, created_at)
       END
 WHERE expires_at IS NULL;
```

`closed` falls into the `ELSE`. 00574:1004 closes a link with `status='closed', revoked_at=now()`,
so every link closed before this migration is backfilled **already expired**. And
`resolve_invoice_link` tests expiry *above* the dead-link branch:

```sql
IF NOT FOUND OR v_link.status = 'revoked'
   OR (v_link.expires_at IS NOT NULL AND v_link.expires_at <= now()) THEN
  RETURN NULL;          -- <- a closed link never reaches v_dead
END IF;
...
v_dead := v_link.status = 'closed' OR v_invoice.status = 'void';
```

Reproduced on the local stack (minted a link on a seeded issued invoice, closed it the way 00574
does, then applied the backfill's own `ELSE` term to it):

```
 kind_when_expiry_future    -> withdrawn
 kind_after_backfill        -> <NULL — dead sheet>
```

So on deploy, every client holding a `/pay/<token>` for an invoice she has already paid — or that
was withdrawn — gets `apps/client-portal/src/app/pay/[token]/page.tsx:55-62`'s **`DeadLink`**
("This link isn't available") instead of the `SettlingSheet` / `WithdrawnSheet` that K5 and M10
ruled she should see. The report's §4 states the backfill rule as *"Dead rows keep the date they
died on"* and treats it as neutral; it is not — it silently retires a shipped, ruled money surface
for the whole existing population. Going forward the same surface also dies 30 days after the
link's last mint, where before 00636 it stood indefinitely.

No live **pay** link is broken (a closed link was never payable; `resolve_invoice_link_for_checkout`
requires `status='active'`), which is why this is major and not blocking.

**Fix (either, not both):** move the expiry test below `v_dead` in `resolve_invoice_link` so an
expiry only silences an `active` link — a closed link's sheet is a receipt, not a bearer pay door —
or exclude `status='closed'` from the backfill's `ELSE` and leave those rows `expires_at IS NULL`.
The first also fixes the forward-going case. Add a W4-suite block asserting a closed link with a
past `expires_at` still answers `kind = 'withdrawn'`.

### MAJOR-2 — the consent-keyword inbound touches name the conversation's seat, not the seat the message answered (confidence: medium)

`supabase/functions/sms-inbound/pipeline.ts:974-980` (STOP), `:1032-1038` (START),
`:1114-1120` (YES), `:1138-1144` (HELP).

All four pass `conv.party_id`. `sms_conversations` is keyed on `(twilio_number, phone_e164)`
(`\d public.sms_conversations`; `pipeline.ts:94-109`), and the rail sends from one platform-wide
`TWILIO_FROM_NUMBER` (`_shared/sms.ts:126,799,1060`) — so there is **one conversation row per
phone across every studio**, and `conv.party_id` is whichever seat the *first outbound send*
stamped, not the seat this message answers.

Meanwhile the branches themselves already compute the answering studios: STOP writes the refusal
through `studiosHoldingPhone(...)` into **every** holding studio's record; YES scopes to
`yesOrgs`/`yesTargets` and even resolves `answered` (`:1093-1094`) to name the job in its reply,
then hands `reply()` `answered?.id ?? conv.party_id` while handing the touch only
`conv.party_id`.

Consequence on a number two studios hold: the studio whose consent record just moved gets **no**
touch for the most consequential message a seat sends, so its person card, seat line, roster row
and `touchSentence` go on printing the previous contact — the exact defect r1 M-4 and r4 MAJOR-3
were opened to close, left standing for the multi-studio population. Its Directory row does flip
to `opted_out` from the record, so the two readers on one card then disagree about the same event.

This is arguably the rail's accepted conversation shape (r1/r3/r4 all landed `conv.party_id`
without challenge), so it may be a one-line ruling rather than a defect — but it is not stated
anywhere in the wave's §3 decisions or §9 owed-list, and §9's "what is not covered" paragraph
names only the no-seat case.

**Fix:** file one touch per answering seat — STOP over `studiosHoldingPhone(...).targets`'
`partyIds`, YES over `yesTargets`' `partyIds`, START over `startTargets`' — keeping
`conv.party_id` only as the fallback when the target set is empty. `record_touch` already answers
NULL per seat, so a studio-less seat still costs nothing. Or rule it: "an inbound touch names the
conversation's seat, once, whatever the message answered," and add it to §3.

---

### Minor (none of these hold the gate)

**m-1 — the shared rate bucket is dodgeable by a header on the edge function.**
`paperwork-upload/index.ts:39-45` prefers `cf-connecting-ip` over `x-forwarded-for`. The function
is served by Supabase, not by a Cloudflare Worker, so `cf-connecting-ip` is whatever the caller
sends: a script varying it per request never shares a bucket, which is exactly the split the spec
§2 requirement and the report's §3 D-9 say must not be possible. Harm is bounded — the control is
256 bits of token entropy and `core.ts:124` already says the limiter is friction — but the claim
should be narrowed, or the header order inverted for this runtime (`x-forwarded-for` first hop,
which the Supabase gateway sets). `apps/client-portal/src/lib/utils/client-ip.ts` is correct as
written: that one *does* run behind a Worker.

**m-2 — a malformed address makes the limiter fail open and log per request.**
`core.ts:127-131` passes the raw header string to an `inet` parameter; PostgREST answers 22P02,
`withinRateLimit` logs `rate limit unavailable` and returns `true`. Same on the page route
(`paperwork/[token]/page.tsx:86-92`, `!limitError && withinLimit === false`). Validate the shape
before the call, or catch the cast in `paperwork_link_rate_limit_hit`.

**m-3 — a failed RPC leaves an orphan object in the bucket.** `core.ts:230-249`: the file is
uploaded, then `record_inbound_compliance_document` may 4xx (the TOCTOU the comment names) and the
object stays with no row pointing at it. Spec §10's "no partial row" holds; the inverse — no
partial file — is not covered and nothing sweeps it.

**m-4 — the mime allowlist is checked against the browser's own `file.type`.**
`core.ts:194-200` reads `file.type`, uses it for the allowlist test *and* passes it as the stored
`contentType`, so the bucket's `allowed_mime_types` is enforced against the same client-supplied
value. Low harm (a private bucket, and `text/html` is not in the list either way), but the
comment *"The bucket is the enforcement; this is the message"* overstates what the bucket checks.

**m-5 — the token compare is a plain SQL `=` on the hash, not a constant-time compare.**
`00636:198-199`, `00637:589-590`, `:695-696`, `:1268-1271`. This matches every other bearer rail in
the repo (`field_link_tokens`, the trade-agreement links), the compared value is a hash reached by
a unique-index probe, and knowing the hash grants nothing — but the brief asked for a constant-time
compare by name, so it is recorded rather than silently accepted.

**m-6 — §8's redeploy set lists `apns-send`, which imports none of the three changed modules.**
`grep -rl "_shared/send-email.ts" supabase/functions --include=index.ts` does not return it; the
two hits in `apns-send/index.ts` (`:29`, `:335`) are comments saying it *mirrors* send-email's
log-update pattern. The transitive closure is 34 importers + `paperwork-upload` + `resend-webhook`
= **36**, not 37. Over-inclusion is free at deploy time; the count and the list should still agree.

**m-7 — §5 says the ledger head is `00637`.** It is `00638` (and `20260910152111` above it).

**m-8 — §5's Deno figure is stale.** `777 passed, 1 failed` → measured this round at
**796 passed, 1 failed**, same single pre-existing `stripe-rail` failure.

**m-9 — §7 says `_tests/email-channel-status.test.ts` carries 11 cases.** It carries **19**
(rounds 2–4 added the widened-gate, address-wide-verdict, studio-ref and no-studio controls).
`paperwork-upload.test.ts`'s claimed 12 is correct.

**m-10 — §9's first bullet is false at HEAD.** *"`flushDeferredMessages` writes no out touch"* —
it does, `_shared/sms.ts:1224-1240`, closed in round 3 (MAJOR-5). The bullet contradicts the
fix log two files over.

**m-11 — §4's last paragraph and §9's first bullet are false at HEAD.** *"The client letterbox's
`/pay/<token>` href still reads `get_invoice_link` and still draws its 'no link' state"* — the
letterbox stopped reading the hook entirely in round 2 (MAJOR-3); `letterbox.tsx:126-156` now
opens the letter rather than an address and does not import `useInvoiceLink`.

**m-12 — §4 credits the folio fix to round 1.** *"DONE in round 1 (M-5)"* covers only the dropped
`invalidate`. The act-reachability half — both link acts absent on every invoice because
`Regenerate` was gated on the address it alone can mint — was round 4's W4R4-1. As written, §4
reads as if the folio was whole after round 1, which it was not.

---

## 5. Not findings (checked, and settled)

- Every `rulings.md` §3 ruling, D-1…D-13, R-AC/R-AD/R-AE/R-AF, R-AY's record-only consent,
  R-BD's `project_tenant_org()` (used at `00635:243-249`, and by `mint_paperwork_link:459`).
- The address-wide reach of a channel unsubscribe (D-4/D-6) and of a bounce write-back
  (`channel-status.ts`): one mailbox, one verdict, every studio.
- `proposal-send` writing no out touch (§9, ruled). Its bounce write-back is *not* lost: when no
  `notification_log` row matches, `resend-webhook/index.ts:210-231` still calls `writeChannelStatus`
  from `event.data.to[0]`, which I confirmed in the source and the Deno suite covers.
- `ensure_invoice_link` minting per receipt letter in `stripe-webhook` (:470, :573) — every caller
  is a letter, which is CRM-29's own rule, and the M11 checkout guard returns NULL rather than
  revoking a payer's live address.
- The two-GET nonce rotation hazard, named in 00636's banner and §4.
- A `/pay` link dying 30 days after its last send with no "expired" sentence (S2).
