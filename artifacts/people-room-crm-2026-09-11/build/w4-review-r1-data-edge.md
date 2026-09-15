# W4 (P3) — adversarial migration + edge review, round 1

Reviewer context separate from the implementer. Scope: `w4-data-edge-report.md`,
migrations 00635 / 00636 / 00637 in full, every RPC they mint or re-head, the
new and changed edge modules, and `upload-door-spec.md` §5–§9. Rulings in
`rulings.md` §3 are settled and are not findings.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `0f671b149`.

**Verdict: NOT clean — 2 blocking, 5 major, 11 minor.**

---

## Gates re-run here

| Gate | Command | Result |
|---|---|---|
| Reset | `pnpm --dir <worktree> supabase:reset` | **green**; ledger head `00637`, all seeds applied, `Finished supabase db reset on branch main.` |
| People SQL | `psql -v ON_ERROR_STOP=1 -f supabase/tests/people/{w1a,w1b,w3,w4}_*.sql` | **4/4 pass** — `All W1a assertions passed.` / `All W1b assertions passed.` / `W3 SQL suite: all blocks passed` / `W4 SQL suite: all blocks passed` |
| Billing SQL | `.../billing/invoice_links_test.sql`, `.../billing/invoice_checkout_integrity_test.sql` | both run to `ROLLBACK` with no error under `ON_ERROR_STOP=1` |
| Deno (changed dirs) | `deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions/_shared/ resend-webhook/ paperwork-upload/` | `ok | 455 passed | 0 failed` |
| Deno (`_tests/`) | same, `supabase/functions/_tests/` | `FAILED | 322 passed | 1 failed` — the 1 is `_tests/stripe-rail.test.ts`, `supabaseKey is required` at module load; needs a live `functions serve`. Pre-existing, untouched by this wave. Totals match the report's 777/1. |
| W4 Deno only | `_tests/paperwork-upload.test.ts` + `_tests/email-channel-status.test.ts` | `ok | 23 passed | 0 failed` |
| `deno.lock` | deleted before each run | absent from the repo root afterwards |
| Legacy grants | `cp` the committed file, re-run `python3 scripts/generate-legacy-grants.py`, `diff` | **GRANTS IN SYNC** |
| Generated types | `git status` | `packages/supabase/src/database.types.ts` committed, carries the 16 new-object references |

The gates are all real. The findings below are things the gates do not reach.

---

## BLOCKING

### B-1 — two shipped readers still SELECT `invoice_links.token`, which 00636 froze at NULL: the design-build deposit `/pay` link is dead

`00636` NULLs the plaintext column and holds it there
(`chk_invoice_links_token_frozen CHECK (token IS NULL)`). §4 of the report says
"Every place that used to re-read the token had to change" and lists five. Two
were missed, and both are on the money rail:

```
$ psql -At <<'SQL'
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f'
   and pg_get_functiondef(p.oid) like '%invoice_links%'
   and pg_get_functiondef(p.oid) ~ '[^_a-z]token[^_a-z]' order by 1;
SQL
ensure_invoice_link
get_client_commercial_document_bundle      <-- not re-headed
get_invoice_link
issue_agreement_draw_invoice               <-- not re-headed
regenerate_invoice_link
resolve_invoice_link
```

`issue_agreement_draw_invoice` (00578:6904-6907):

```sql
SELECT link.token INTO v_pay_token
FROM public.invoice_links link
WHERE link.invoice_id = v_invoice_id AND link.status = 'active'
LIMIT 1;
...
'payToken', v_pay_token
```

`get_client_commercial_document_bundle` (live definition, lines 338-341):

```sql
'payToken', (
  SELECT link.token FROM public.invoice_links link
  WHERE link.invoice_id = invoice.id AND link.status = 'active'
  ORDER BY link.created_at DESC LIMIT 1)
```

Both now return NULL for every row, by the CHECK. The consumers do not degrade
to a second route — there is none:

- `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts:95-104` —
  `typeof payToken !== 'string' || payToken.length === 0` → the whole deposit
  offer returns `null`. The client signs the agreement and is shown no way to
  pay the deposit.
- `apps/client-portal/src/lib/commercial-documents.ts:673-681` —
  `if (!invoiceId || !payToken || amountCents <= 0) return null` ("R50 — every
  field or nothing"), so the door gate's fallback offer
  (`door-gate.tsx:277`, `payPath: /pay/${bundleOffer.payToken}`) is also null.

That is the brief's blocking criterion verbatim: a `/pay` link broken by the
backfill. It is not the acknowledged folio gap (M-5 below) — this is a second,
undisclosed one on the client side of a signed agreement.

**Fix.** Re-head both. `issue_agreement_draw_invoice` can call
`public.ensure_invoice_link(v_invoice_id)` (it is already the issuing
transaction, and the RPC mints and returns the raw value once).
`get_client_commercial_document_bundle` cannot: it is a STABLE read and
`ensure_invoice_link` is VOLATILE and revokes, so minting on every bundle read
would revoke the payer's address on every page load. That branch needs the same
decision 00636 took for `get_invoice_link` — carry no address, and have the door
gate obtain one from a named mint act — or a dedicated read-safe mint. Either
way it cannot stay as it is.

### B-2 — the out touch from an account-less letter is filed into whichever studio holds the worst-status copy of the address, not the studio that sent it

`_shared/send-email.ts` `resolveContactChannel()` looks the address up with
**no tenant scope at all** — `ComplianceSendOptions` carries no organization —
and then reduces to the *worst-status* row:

```ts
const { data, error } = await supabase
  .from("studio_contact_channels")
  .select("id, owner_type, owner_id, value, status")
  .eq("value", value)
  .in("channel_kind", ["email", "ap_email"]);
...
const worst = rows.reduce((a, b) =>
  (CHANNEL_STATUS_RANK[b.status] ?? 0) > (CHANNEL_STATUS_RANK[a.status] ?? 0) ? b : a);
```

and `sendCompliantEmail` files the touch against that row's owner card:

```ts
await supabase.rpc("record_touch", {
  p_subject_type: prepared.channel.ownerType,
  p_subject_id: prepared.channel.ownerId, ...
```

`record_touch` resolves the org from the card (`studio_contact_org`), so the
row lands in the *card's* studio. The same address on two studios' cards is
normal and expected — the uniqueness is per card, not per tenant:

```
$ psql -c "select indexdef from pg_indexes where tablename='studio_contact_channels';"
 CREATE UNIQUE INDEX idx_studio_contact_channels_owner_kind_value
   ON public.studio_contact_channels USING btree (owner_id, channel_kind, value)
```

and D-6 of the report explicitly builds on that ("applied to EVERY channel row
carrying the address, across cards and studios"). Probed end to end:

```
NOTICE:  studio A = cf120000-0000-4000-8000-000000000001, studio B = 8daa091d-…
NOTICE:  lookup rows the edge fn sees for dana@example.com:
NOTICE:    owner org = cf120000-0000-4000-8000-000000000001
NOTICE:    owner org = 8daa091d-…
NOTICE:  studio A sent the letter; the touch landed in org 8daa091d-… (B=8daa091d-…)
```

`studio_touches` is SELECTable by any active member of the owning org, so
studio B's room reads "we emailed Dana at 14:02" over a letter studio A sent —
a cross-tenant write, and the E13 record the room derives last-contact from is
wrong on both sides. On a plain tie (both rows `active`) `reduce` keeps the
first row PostgREST happens to return, so which studio gets the row is not even
deterministic.

The reachable senders are exactly the account-less letters this wave opened:
`trade-rfq-send`, `po-send`, `quote-request-send`, `trade-agreement-send`,
`invoice-send` to a carded bookkeeper.

**Fix.** The send has to name the studio, or the touch has to be dropped. The
smallest honest shape is to add an optional `organizationId` to
`ComplianceSendOptions`, scope `resolveContactChannel`'s lookup to it, and write
no touch when the caller does not name one — the R-AW posture the wave already
took for unattributable touches. The status *verdict* can stay address-wide
(D-6 is a ruling); only the subject of the touch and the log ref must be the
sending studio's own row.

---

## MAJOR

### M-1 — every coordination decision on the seeded book is stamped `failed_unknown_sender`

`sms-inbound/pipeline.ts` `filedDecisionFacts()`:

```ts
if (!row || (row.court_party_id ?? null) !== partyId) {
  return { decisionClass, authorityCheck: "failed_unknown_sender" };
}
```

`court_party_id` is an *optional* pointer to a specific seat; `client_decisions.court`
is the kind ('client', 'designer', 'gc', …) and 00633's own banner records
"Local ledger at the time of writing: 6 rows, all court='client'". Measured now:

```
$ psql -At -c "select coalesce(coordination_kind,'(null)'),
    count(*) filter (where court_party_id is null) as no_court, count(*)
  from public.client_decisions group by 1 order by 1;"
selection|5|5
signoff|1|1
```

6 of 6 carry no court seat. So every ordinary field reply that files a
coordination item writes a touch whose `authority_check` says
`failed_unknown_sender` — which `00635`'s own COMMENT defines as "the message
resolved to no seat at all" and D-13 defines as "the approval came from someone
it was never put to". Neither is true. `idx_studio_touches_failed_authority` is
built precisely to answer "which touches failed their authority check", so the
one face this column exists for will be full of false accusations, which is
CRM-22's harm turned around.

**Fix.** A decision with no named court cannot be sent by the wrong person.
`court_party_id IS NULL` should fall through to `authorityVerdictFor(...)` (or
to `n/a` when the class has no scope), and `failed_unknown_sender` reserved for
`court_party_id IS NOT NULL AND court_party_id <> partyId`.

### M-2 — `v_access_grants`' invoice_pay tier says the pay link never expires; 00636 gave it 30 days, in this same wave

`access_grants_invoice_links()` (00627) hardcodes the column:

```
$ psql -At -c "select pg_get_functiondef(oid) from pg_proc where proname='access_grants_invoice_links';" | grep -n 'NULL::timestamptz'
10:    NULL::timestamptz, il.last_viewed_at, il.revoked_at,
```

00637 re-creates `v_access_grants` from 00627's body and leaves branch 9's
comment standing:

```sql
-- 9 · Invoice pay link. 00574 stores the token in PLAINTEXT and gives the row
--     no expiry; the definer reader returns the row's uuid and never the
--     token (00574:63-89).
```

Both halves of that sentence were made false by 00636 — in the same wave, two
files earlier — and the view's own new COMMENT contradicts it three screens
below ("invoice_links and paperwork_link_tokens store only sha256"). E9 is the
one ledger that answers "what is open on this person and when does it end"
(CS2-14); it now prints "no end date" over every pay link while the record says
30 days. The paperwork tier two branches later carries its `expires_at`
correctly, so the two tiers of the same view disagree about the same kind of
fact. No test caught it because `invoice_links` is empty on a fresh local reset
(`select count(*) from public.invoice_links` → 0).

**Fix.** `il.expires_at` in place of `NULL::timestamptz`, and rewrite the branch
comment. One line each.

### M-3 — `confirm_inbound_document`'s R-AZ pre-check is incomplete, so a confirm can die on 00623's trigger — exactly what D-8 says it prevents

D-8: "`confirm_inbound_document` checks R-AZ **before** stamping … Letting
00623's guard fire mid-function rolls the confirm back with a constraint name
on the face." The pre-check covers two of `assert_compliance_holder()`'s four
time-varying supersede legs, and both are nested under
`IF v_old IS NOT NULL AND v_old_expires IS NOT NULL`. Two ordinary paths get
through and blow up on the trigger. Both probed:

Shorter-dated replacement (`compliance_successor_not_later` is not pre-checked
at all) — a firm changes carrier mid-term and sends a COI ending sooner than
the one on file:

```
NOTICE:  new pending doc = 569362f3-…
NOTICE:  CONFIRM RAISED: P0001 / compliance_successor_not_later
```

Dated successor over undated paper (`compliance_successor_already_lapsed` is
pre-checked only when the *old* row carries a date) — a w9 on file with no
expiry, a replacement carrying one that has passed:

```
NOTICE:  pending = f35faf1d-…
NOTICE:  CONFIRM RAISED: P0001 / compliance_successor_already_lapsed
```

The consequence is not only the error surface: the pending row can then *never*
be confirmed, only rejected, and nothing on the card says why in the studio's
words. Spec acceptance 6 ("Confirming a pending row sets verified_by/verified_at
… ") does not hold for these two inputs.

**Fix.** Lift the two legs out of the `v_old_expires IS NOT NULL` guard and add
the `not_later` leg, so all four of the trigger's supersede conditions are
answered with a sentence before the first UPDATE:
`v_old_expires IS NOT NULL AND v_doc.expires_on > v_old_expires` → refuse;
`v_doc.expires_on IS NOT NULL AND v_doc.expires_on < CURRENT_DATE` → refuse
whenever `v_old IS NOT NULL`; the gate-subset test likewise unnested.

### M-4 — sms-inbound writes no touch on three branches that do attribute the message to a seat

Report §2 claims "an in touch at every outcome that attributes a message to a
seat". Three branches attribute and write nothing:

| Line | Branch | Attribution |
|---|---|---|
| `pipeline.ts:958` | inbound **STOP** → `disposition: "opted_out"` | the consent write and the reply both key off `conv.party_id` |
| `pipeline.ts:1088` | inbound **HELP** | `reply(..., conv.party_id, conv.active_project_id, "help")` |
| `pipeline.ts:1173` | project-chooser **pick** | `stampMessage(supabase, effectiveMessageId, pick.party_id, pick.project_id, …)` |

An inbound STOP is the single most consequential message a seat can send, and
CRM-23's whole question is "who was told what, when". The chooser pick is worse
in kind: the message is stamped with a seat and a project one statement above,
and the touch is simply not written. The report's own Owed list (§9) names only
`flushDeferredMessages` as an un-touched path, so these three read as covered
when they are not.

**Fix.** `recordInboundTouch(supabase, partyId, messageId, { decisionClass: 'none', authorityCheck: 'n/a' }, nowIso)` at each of the three, with
`channel_kind` 'sms' and direction 'in' as elsewhere. If STOP is deliberately
excluded (a consent act, not a contact), say so in the banner and in §9 rather
than leaving it silent.

### M-5 — the folio's copy-the-address act is inert, and the wave ships it that way

Self-disclosed in report §4's last paragraph; recorded here because it is a live
act on a money surface, not a note. Verified:

- `packages/supabase/src/hooks/use-invoices.ts:1295` —
  `if (!isLikelyInvoiceLinkToken(row.token …)) return null;` so `useInvoiceLink`
  returns null for every invoice after 00636, since `get_invoice_link` now
  always answers `'token', NULL`.
- `useRegenerateInvoiceLink.onSuccess` (`:1396-1400`) writes the fresh token to
  the cache and then `invalidateQueries` on the same key; the refetch re-reads
  `get_invoice_link`, gets null, and the address the designer just minted
  disappears from under the Copy control.

So the designer's only remaining route to a copyable pay address destroys the
address it produced. The report calls this "owed before ship"; it is owed
*before this wave is clean*, because 00636 is what made it inert.

**Fix.** The hook change the report names: drop the invalidate (the mint is the
authority on the token, `get_invoice_link` on the status), or teach
`parseInvoiceLink` that a null token with an active status means "live, address
not stored" and keep the minted value.

---

## MINOR

1. **Report §8 over-counts the redeploy set.** `apns-send` does not import
   `_shared/send-email.ts` — it names it in two comments (`index.ts:29`, `:335`),
   which is what a `grep -rl "_shared/send-email.ts"` matches. Computing the
   transitive closure over real `from "…"` specifiers gives 34 functions, plus
   `resend-webhook` and `paperwork-upload` whose own code changed = **36**, not
   37. Harmless for W7 (a redundant redeploy), wrong in the record.
2. **Report §4's "Every place that used to re-read the token had to change"** is
   false — see B-1. The sentence should name `issue_agreement_draw_invoice` and
   `get_client_commercial_document_bundle` once they are fixed.
3. **Three statements of the paperwork hash rule.** 00636 correctly puts the
   invoice rule in one function (`invoice_link_token_hash`, whose COMMENT says
   "The ONE statement of the lookup rule, so the resolvers and the producers
   cannot drift"). 00637 then inlines `encode(extensions.digest(p_token,'sha256'),'hex')`
   four times — `mint_paperwork_link`, `resolve_paperwork_link`,
   `record_inbound_compliance_document`, `paperwork_link_storage_context` — with
   the 64-hex guard present in three of them and absent in
   `record_inbound_compliance_document`'s mint sibling. Same drift the neighbour
   file argues against.
4. **The `compliance-documents` read policy uses the unguarded uuid cast.**
   00637's banner says the new bucket "avoids inheriting that trap", but the
   policy is written in the *unguarded* shape
   (`NULLIF((storage.foldername(name))[1], '')::uuid`), not 00430's
   regex-guarded `CASE WHEN name ~ '^…uuid/…uuid/.+$' THEN … ELSE NULL END`
   that the `room-renders` policies use. Probed: one non-uuid-first key in the
   bucket and any authenticated scan raises
   `ERROR: invalid input syntax for type uuid: "fulfillment"`. Not reachable
   today (the door is the only writer and its keys are uuid-first), but the
   guard is one `CASE` and the file's own banner claims it.
5. **`authorityVerdictFor` ignores `threshold_cents`.** 00624 records "Signs
   money to $2,500" and the verdict reads only scope + `prepares_only` + dates,
   so a seat capped at $2,500 passes for any draw. The touch carries no amount,
   so this may be the intended limit — but it is not stated anywhere and the
   column exists.
6. **A failed `client_decisions` read is written as `failed_unknown_sender`.**
   `filedDecisionFacts` does not check the query's `error`; `data` null →
   `!row` → `failed_unknown_sender`. The sibling `authorityVerdictFor` fails
   closed to `failed_no_authority` *with a comment explaining why*; here the
   fail-closed verdict makes a stronger, different claim (the sender was wrong)
   than the evidence supports.
7. **`record_touch` does not check `subject_type` against the card.** `'person'`
   over a company card, or `'company'` over a person card, is accepted and
   stored — `studio_contact_org()` answers for either. Every other card
   reference in this program is guarded (`assert_channel_owner_kind`,
   `assert_compliance_holder`, `assert_paperwork_token_company`).
8. **`mint_paperwork_link` puts no ceiling on `p_expires_at`.** Any future
   timestamp wins (`WHEN p_expires_at IS NOT NULL AND p_expires_at > now()`), so
   a caller can mint a door open to the year 3000. PR-l/R-AD offer the studio two
   named dates; the RPC enforces only "in the future".
9. **The token compare is an indexed hex equality, not a constant-time compare.**
   Called out because the review brief asks for it. It matches the house
   precedent (`field_link_tokens` 00283, `resolve_field_link`) and a 256-bit
   value is not recoverable by timing an index probe, so this is a note, not a
   defect.
10. **The rate bucket fails open in three ways.** `withinRateLimit` returns true
    when `deps.ip` is null, when the RPC errors (including an unparsable `inet`
    cast), and `paperwork_link_rate_limit_hit` itself returns true for a NULL
    address. `callerIp` falls back to `x-forwarded-for`, which is
    client-supplied whenever `cf-connecting-ip` is absent. The core's comment
    ("friction on guessing, not the credential") states the posture; recording
    it because spec §2 asks for a bucket "a script cannot dodge".
11. **`proposal-send` is a third send path that writes no out touch.** It calls
    `prepareCompliantEmail` + `sendPreparedResendRequest` directly
    (`proposal-send/index.ts:243,312`), so the channel *refusal* gate does run —
    good — but `sendCompliantEmail`'s touch and channel-ref logging do not.
    Report §9 names only `flushDeferredMessages`.

---

## What was checked and found sound

- **Token verified before any read.** `resolve_paperwork_link`,
  `paperwork_link_storage_context` and `record_inbound_compliance_document` each
  re-derive the row by sha256 and refuse unless `status = 'active' AND
  expires_at > now()`; malformed / unknown / revoked / expired all return the
  same NULL or the same `paperwork_token_invalid`. The edge function checks the
  token before the storage write, and the RPC checks it again after (the TOCTOU
  window is named and closed).
- **Never overwrites a verified row.** `record_inbound_compliance_document` is
  INSERT-only; the supersede is `confirm_inbound_document`'s and points the
  *old* row at the new one. No DELETE anywhere on the door. Spec §5.4/§5.5 and
  acceptance 5 hold (w4 SQL block 6).
- **Forged `company_id` reaches nothing.** Holder and storage key both come from
  the token row; the form body is never consulted for either. Acceptance 3 holds
  (Deno "the storage key takes its studio and firm from the token, never the
  form").
- **Key scheme.** `{org uuid}/{company uuid}/{upload uuid}/{sanitised filename}` —
  every cast segment is a real uuid, the free text is last, `upsert: false`.
- **Storage policies.** SELECT only, `authenticated` only, gated on
  `is_active_studio_member` of the path's org; no INSERT/UPDATE/DELETE policy and
  no anon policy, so the service-role client is the only writer.
- **R-AC recipients.** Owners and admins of the token's org (`status='active'`,
  the only values present) plus `created_by` via UNION, one `notification_log`
  row each, `channel='in_app'`, `type='compliance_document_inbound'`.
- **R-AD / R-AF.** No fallback clock; a firm with no open seat and no named date
  is refused `paperwork_link_window_required`; one live token per firm is
  enforced by `uniq_paperwork_link_tokens_active_company`.
- **R-BD.** `record_touch` and `record_notice` both resolve the tenant through
  `project_tenant_org()`; `project_consent_org()` appears nowhere in this wave.
- **R-AM.** No `_primary_studio_for` call in any changed edge file (the four
  matches are comments).
- **R-AY.** Nothing in 00635–00637 reads or writes a `project_parties.sms_consent_*`
  column.
- **`record_notice` matches Patina Field.** `RecordNoticeParams` sends
  `p_project_id` / `p_what` / `p_told` and `NoticeRow` decodes
  `id, what, recorded_at, recorded_by, told_names` with `.single()`
  (`apps/mobile/Capture/.../PeopleRoomWire.swift:388-423`) — the RPC's signature
  and RETURNS TABLE are term for term.
- **Unsubscribe tokens cannot cross subjects.** `parseUnsubscribeSubject` splits
  on a literal `channel:` prefix; a profile id is a uuid and can never carry it,
  and the channel branch only ever writes `studio_contact_channels`, never
  `notification_preferences`. The signature is the same HS256 secret and issuer
  the account path already uses, and every `/api/unsubscribe` route
  (admin/designer/client) passes a **service** client, so the channel UPDATE is
  not silently swallowed by RLS.
- **The email rail refuses dead/unsubscribed in every branch that can reach a
  channel.** `prepareCompliantEmail` is the single gate and both `sendCompliantEmail`
  and `proposal-send`'s direct use go through it. The one other Resend call in
  the tree (`campaign-dispatch`, `/emails/batch`) builds its audience from
  `profiles` only and cannot address an account-less channel.
- **Backfill keeps the live `/pay` addresses working.** 00574's
  `chk_invoice_links_token CHECK (token ~ '^[0-9a-f]{64}$')` guarantees every
  stored token hashes cleanly, so `token_hash` is never NULL at the
  `SET NOT NULL`; `resolve_invoice_link` hashes the raw value the client holds
  and matches. Plaintext lookup is impossible by construction
  (`chk_invoice_links_token_frozen`), i.e. fails closed. The 30-days-from-migration
  choice is the right one — dating from `created_at` would have killed every
  address in flight at deploy. (B-1 is a *reader* that was not repointed, not a
  defect in the backfill itself.)
- **Migration hygiene.** Hand-numbered above the highest on the branch and clear
  of the reserved 00595–00620; banners carry the grep lineage; `CREATE TABLE IF
  NOT EXISTS` plus named DROP/ADD CONSTRAINT throughout so a rerun widens; RLS
  in the same file as its table; explicit `REVOKE ALL … FROM PUBLIC, anon` on
  every definer RPC with the grant stated next to it; `SET search_path` on every
  SECURITY DEFINER; `extensions.digest` / `extensions.gen_random_bytes`
  schema-qualified; CHECK vocabularies, no enums; `DROP INDEX IF EXISTS
  public.uniq_invoice_links_token` names the index 00574 actually created.
