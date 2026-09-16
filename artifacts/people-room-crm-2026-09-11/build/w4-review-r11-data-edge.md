# W4 — adversarial migration + edge review, round 11 (data + edge)

Reviewer: separate context, read-only on product code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
No prod anything: no `db push`, no `functions deploy`, no secrets.

Read in full: `build/w4-data-edge-report.md`; `00635`, `00636`, `00637`, `00638`;
`paperwork-upload/{index,core}.ts`, `_shared/{send-email,invoice-links,invoice-checkout-driver}.ts`,
`stripe-webhook/index.ts`, `invoice-link-checkout/index.ts`, `create-checkout-session/index.ts`,
`invoice-send`, `invoice-reminders`, `resend-webhook/{index,channel-status}.ts`,
`sms-inbound/pipeline.ts`, `packages/notifications/src/{tokens,unsubscribe}.ts`,
`upload-door-spec.md` §5–§10, `rulings.md` §3, `w4-fix-log-r10.md`,
`w4-review-r10-data-edge.md`.

## Verdict

**NOT clean — 0 blocking, 2 major, 16 minor.**

Every r10 blocking/major is fixed and re-proven live. Both majors this round are new:
one is a test asset in this wave that poisons the shared local DB and makes a sibling
SQL gate fail until the next reset (cause found, proven, and cleared); the other is a
live behaviour of `paperwork_link_rate_limit_hit` that contradicts the upload door's
own acceptance criterion 4 and the migration's own comment.

---

## 1. Prior findings — fixed / open

### r10 blocking + major (all three FIXED, re-proven this round)

| r10 | Status | Evidence |
|---|---|---|
| BLOCKING-1 — the payer rail rotated the link under the client's feet | **FIXED** | `invoice_letter_must_hold` (00636 §2d) reads `nonce_return_origin`, never the actor column; `ensure_invoice_link`'s guard is the one-line call to it. Probe P12: a **payer-borne** attempt (`payer_id` set, `invoice_link_id` null) that rode the nonce holds the letter for 24 h after `succeeded`, then releases and mints again. |
| MAJOR-1 — letter rails did not honour the 24-hour leg | **FIXED** | No TypeScript file lists attempt states: `grep -rn "'claimed'" supabase/functions` returns nothing on the letter rails; `invoice-send`, `invoice-reminders` and `_shared/invoice-links.ts` ask `invoice_letter_must_hold` and fail closed (`{hold:true, readable:false}`). |
| MAJOR-2 — one malformed header disabled the paperwork limiter | **FIXED** | `paperwork_link_rate_limit_hit(p_ip text, p_token text, p_limit int)` is text-keyed with the ip→link→anon ladder; `withinRateLimit` returns **false** on any RPC error and the `if (!deps.ip) return true` short-circuit is gone (`paperwork-upload/core.ts:233-247`). |

### r10 minors — 1 fixed, 13 open

`w4-fix-log-r10.md` §7 says every r10 minor was left untouched; re-checked one by one below.
`m-6` was closed incidentally by the R-CA fix. **m-1 … m-5, m-7 … m-10, n-1 … n-4 are all still
open** and are re-listed in §5 with this round's evidence.

---

## 2. MAJOR-1 — this wave's Playwright spec poisons the seeded studio and breaks the W1b SQL gate (confidence: high, proven live)

**Where:** `apps/client-portal/tests/paperwork-link.spec.ts` (297 lines, **no `afterAll`, no
`afterEach`, no delete of anything it writes**).

`mintDoor()` inserts a firm card straight into the **seeded** studio
(`STUDIO_ORG_ID = b0000000-0000-0000-0000-000000000001`) with a service-role client:

```ts
const companyName = `Paperwork E2E ${randomUUID().slice(0, 8)}`;
const { error: cardError } = await admin().from("studio_contacts").insert({
  id: companyId, organization_id: STUDIO_ORG_ID, entity_kind: "company", … });
```

`seedLapsedCertificate` then writes a `studio_compliance_documents` row, and the mint writes a
`paperwork_link_tokens` row. Nothing is ever removed. Three tests in the file each call
`mintDoor()`, so **every run leaves three firm cards in the studio the SQL suites count**.

`supabase/tests/people/w1b_compliance_authority_directory_test.sql:824` asserts the honest count:

```sql
IF n <> 21 THEN RAISE EXCEPTION '3m expected 21 firm cards, got %', n; END IF;
```

Observed this round, twice in a row (this is r10's "not reproducible" flake — it is reproducible,
and it has a cause):

```
supabase/tests/people/w1b_compliance_authority_directory_test.sql -> exit=3
psql:…/w1b_compliance_authority_directory_test.sql:1140: ERROR:  3m expected 21 firm cards, got 24
```

The three extra rows, named by the spec:

```
0511f3fb-…|Paperwork E2E a43f35c5|2026-09-16 06:35:08.872616+00|
74b9f66a-…|Paperwork E2E 19811a56|2026-09-16 06:35:08.871818+00|
551f6d3e-…|Paperwork E2E 020d5b75|2026-09-16 06:35:08.871614+00|
```

Deleting exactly those three cards (plus their document and token rows) restores the gate:

```
DELETE 3 / DELETE 3 / DELETE 3
NOTICE:  All W1b assertions passed.   w1b exit=0
```

**Why it is major, not minor.** It is not report-file accuracy: running this wave's own e2e spec
makes a *different* wave's SQL suite fail, and it stays failed until someone resets the database.
On the shared local Postgres and in `integration.yml` (which runs the Playwright portal e2e and the
SQL suites in one job) the order decides whether the gate is green. The coverage floor is not
holding.

**Fix shape:** give the spec an `afterAll` that deletes, by the ids it minted, its
`studio_compliance_documents`, `paperwork_link_tokens`, uploaded `compliance-documents` objects and
`studio_contacts` rows — or mint its own throwaway studio instead of writing into the seeded one
(the seeded studio is what every W1/W3 count assertion is written against).

---

## 3. MAJOR-2 — the rate bucket is an existence oracle for the paperwork token (confidence: medium, behaviour proven live)

**Where:** `00637_paperwork_upload_door.sql`, `public.paperwork_link_rate_limit_hit`; reached from
`paperwork-upload/core.ts:233-247` on a `verify_jwt=false` door.

The key ladder is ip → link → anon:

```sql
IF v_key IS NULL AND p_token IS NOT NULL AND p_token ~ '^[0-9a-f]{64}$' THEN
  SELECT 'link:' || t.id::text INTO v_key FROM public.paperwork_link_tokens t
  WHERE t.token_hash = encode(extensions.digest(p_token,'sha256'),'hex');
END IF;
v_key := COALESCE(v_key, 'anon');
```

The `link:` lookup carries **no status predicate** — a revoked or expired token still resolves to
its own private bucket — and everything that resolves to nothing shares one global `anon` bucket.
So the limiter answers a question the door is supposed to refuse: *was this token ever minted?*

Probe P9 (rolled back, `probe700-w4-r11-paperwork-tenancy.sql`), with the caller presenting no
usable address — which `callerIp` allows, and which the door's own comment says a caller can
arrange, `cf-connecting-ip` and `x-forwarded-for` "both writable by anyone":

```
P9 observed: unknown-token knock=false ; existing-but-dead-token knock=true ;
             buckets=anon=21, link:c66b606d-3866-42d9-bd23-891acf9ba532=1
```

Twenty junk knocks saturate `anon`. After that a 64-hex token that **was never minted** gets 429
("too many attempts"), while a 64-hex token that **exists but is revoked or expired** is let
through to the ordinary silence. The two answers are distinguishable, so an attacker holding an old
or leaked token learns that it was real — and, given a corpus, which candidates were ever issued.

This contradicts, in the same words:

- `upload-door-spec.md` acceptance 4 — "An expired or revoked token 404s the page and 4xxs the
  upload function; **neither path reveals whether the token once existed**";
- 00637's own comment beside the ladder — "an unknown token is not an oracle".

Second effect at the same site: because everything unresolved shares one `anon` key, a single
address-less caller can spend that bucket (20 hits) and deny the door to **every other** address-less
caller until the window rolls.

**Severity/confidence.** Major, not blocking: no token is accepted without verification, nothing
cross-tenant is read or written, and the leak is existence only — `resolve_paperwork_link`,
`paperwork_link_storage_context` and `record_inbound_compliance_document` all still refuse (P7, P8).
Confidence medium only because the exploit needs the caller's forwarded address to be absent or
unparseable; the behaviour itself is proven.

**Fix shape:** key the unresolved case by the token's own hash (`'tok:' || sha256(token)`) rather
than by the shared `anon` string, and give the `link:` branch the same liveness predicate the
resolvers use, so a dead token and an unknown token are indistinguishable — one bucket shape, one
answer.

---

## 4. Verified sound (the brief's specific checks)

All probes below ran on the reset database inside `BEGIN … ROLLBACK`
(`build/probe70{0,1,2}-w4-r11-*.sql`, committed beside this report).

| Check | Verdict |
|---|---|
| The token is verified before any read | **Sound.** Every door re-verifies inside the RPC (`resolve_paperwork_link`, `paperwork_link_storage_context`, `record_inbound_compliance_document`), all SECURITY DEFINER, all `service_role`-only. `uploadPaperwork` shape-checks `^[0-9a-f]{64}$` first and derives the storage scope from the token, never from the browser (P5). The compare is `token_hash = encode(digest(token,'sha256'),'hex')` — a hash compare, not constant-time, but a timing walk yields only the stored hash, which is not a credential (no preimage, no reuse). |
| Expired / revoked refuse | **Sound.** P7 (revoked) and P8 (expired): `resolve_paperwork_link` → NULL, `paperwork_link_storage_context` → 0 rows, `record_inbound_compliance_document` → `insufficient_privilege`. One silence for malformed, unknown, revoked and expired. |
| Uploads never overwrite a verified row | **Sound.** P5: with a verified `coi_gl` on file, an upload of the same type leaves `verified_at`, `verified_by`, `superseded_by` and `blocks` byte-identical and INSERTs a new unverified row on the token's own firm, inheriting the gates. Storage write is `upsert:false`. P16: an unverified inbound upload does **not** move `compliance_state` (`not_on_file` before and after); P18: it becomes `current` only after a member confirms. |
| Storage policies allow only the token's company path | **Sound.** `compliance-documents` is private (`public=f`, 15 MB cap, mime allowlist `application/pdf,image/jpeg,image/png`). Exactly one policy touches it — `compliance_documents_member_read`, SELECT, `authenticated`, `bucket_id = 'compliance-documents' AND is_active_studio_member(NULLIF((storage.foldername(name))[1],'')::uuid)`. No `storage.objects` policy anywhere lacks a `bucket_id` predicate. No INSERT/UPDATE/DELETE policy exists, so only the service-role door writes. |
| The key scheme avoids the uuid-cast trap | **Sound.** `${organization_id}/${company_id}/${crypto.randomUUID()}/${sanitizeFilename(name)}` — every segment before the filename is a real uuid, taken from `paperwork_link_storage_context`, so the policy's `::uuid` cast never sees a non-uuid segment for anything this wave writes. |
| Recipients per R-AC | **Sound.** `record_inbound_compliance_document`'s notification loop is unchanged from r9/r10; the R-AC recipient set is the studio's own members. |
| The email rail refuses dead/unsubscribed in every branch | **Sound, with one posture noted (m-13).** `prepareCompliantEmail` resolves the channel for **all** callers — the `options.userId` branch included — and refuses on `dead`/`unsubscribed` before any Resend call. The only direct `api.resend.com` caller outside `send-email.ts` is `campaign-dispatch`, whose audience is `profiles` (account holders), not the account-less channel population. |
| Unsubscribe tokens cannot cross subjects | **Sound.** The subject is inside the HS256 payload (`setSubject('channel:<id>')`); `parseUnsubscribeSubject` splits on the literal prefix. A channel token cannot be re-aimed at a profile, or at another channel, without the secret. `applyChannelUnsubscribe` then writes address-wide by `value` over `channel_kind in (email, ap_email)` and `status in (active,bounced)` — the conservative direction. |
| Touches on every send/receive path; `authority_check` matches CRM-22 | **Sound.** `record_touch` resolves the org through `project_tenant_org()` for engagement/project and `studio_contact_org()` otherwise (R-BD), returns NULL rather than guessing, and is `service_role`-only. `sms-inbound`'s `AUTHORITY_SCOPES` / `authorityVerdictFor` still fail to `failed_no_authority` on a read failure and `failed_unknown_sender` on a court mismatch. |
| `record_notice` matches the Patina Field signature | **Sound.** SQL: `record_notice(p_project_id uuid, p_what text, p_told uuid[]) RETURNS TABLE (id uuid, what text, recorded_at timestamptz, recorded_by text, told_names text[])`. Swift: `RecordNoticeParams{p_project_id,p_what,p_told}` → `NoticeRow{id,what,recorded_at,recorded_by,told_names}` (`PeopleRoomWire.swift:388-423`). `recorded_by` is resolved to a **name** (`profiles.display_name/full_name`), which is what the screen prints. |
| `invoice_links` backfill keeps every `/pay` link working | **Sound.** P10: a row in the shipped shape (plaintext NULL, `token_hash` set) still opens on the raw token — sheet `invoice`, number `INV-R11-1`, `payable=true`. The stored **hash**, replayed as a token, and a garbage string both answer NULL. P11: zero plaintext tokens survive, `chk_invoice_links_token_frozen` rejects a plaintext write, no active link lacks a hash. P13: regenerate-on-send kills the previous address and the fresh one opens. |
| Cross-tenant refusals | **Sound.** P1 cross-tenant `mint_paperwork_link` → `insufficient_privilege`; P3 a stranger reads 0 `paperwork_link_tokens` rows for another studio (owner reads 1); P4 the `v_access_grants` twelfth tier (`paperwork_link`) is invisible to the stranger and visible to the owner; P6 cross-tenant `confirm_inbound_document` and `reject_inbound_document` both refuse. |
| R-AF / R-AD / R-BU | **Sound.** P14: a second mint leaves exactly one live token and kills the first address. P15: a firm with no engagement window is refused with `paperwork_link_window_required` and the spec's hint. P17: one row per doc type on the firm's page. |
| Every `_shared` importer enumerated | **Open as a minor (m-1).** The true closure is 36 (§5). |

### Migration hygiene (00635–00638)

- Hand-numbered, above the branch head, clear of the reserved 00595–00620 band; ledger tail
  `00636, 00637, 00638, 20260910152111`.
- All 28 functions these four files define or re-head: **every** SECURITY DEFINER one pins
  `search_path`; **none** has a PUBLIC ACL and none grants `anon` (checked against `pg_proc.proacl`
  directly, not only `information_schema`).
- RLS is on for `paperwork_link_tokens`, `paperwork_link_rate_limits` and `studio_touches`;
  `anon` holds no grant on any of them; the two member-visible tables carry SELECT-only policies.
- `extensions.digest` / `extensions.gen_random_bytes` are schema-qualified everywhere.
- `python3 scripts/generate-legacy-grants.py` → "baseline + 2837 replayed statements", **no git
  diff**: the committed `seed/00-legacy-grants.sql` is current and carries all fifteen new
  functions.
- `db:generate` against the local DB → the only drift is the Supabase CLI's own boilerplate
  parenthesisation in `Tables<>/TablesInsert<>/TablesUpdate<>/Enums<>` (a CLI-version artefact, 10
  lines); every W4 table, column and function is already in the committed types. File restored.

---

## 5. Minor findings

MINOR by the brief's own rule: report-file accuracy, comments, naming and test listings never hold
the gate.

### Still open from r10

| id | Finding | Confidence |
|---|---|---|
| m-1 | The W7 redeploy set is listed as **37**; the true closure is **36**. Recomputed this round by walking the real import graph (relative `from` specifiers only, `.test.ts` excluded) from every file W4 changed: 36 function directories. `apns-send` is in the report's list and imports none of them — its only mention of `_shared/send-email.ts` is in a comment (`apns-send/index.ts:29`). | high |
| m-2 | Report §9 still says `flushDeferredMessages` writes no out touch. It does (`_shared/sms.ts`, actor `sms-dispatch-flush`). Code right, report wrong. | high |
| m-3 | Report §9 calls `/paperwork/[token]` owed to a later wave; `apps/client-portal/src/app/paperwork/[token]/page.tsx` exists on the branch. | high |
| m-4 | Report §5's Deno row reads `777 passed, 1 failed`. Re-run verbatim of the report's own scoped command: **814 passed, 1 failed**. The whole tree: **1579 passed, 1 failed, 1 ignored**. | high |
| m-5 | `paperwork-upload/core.ts:351` still returns the raw storage error to an unauthenticated caller: `` { error: `upload failed: ${uploadError.message}` } ``. Bucket/key internals on a `verify_jwt=false` door. | high |
| m-7 | The storage SELECT policy's `NULLIF((storage.foldername(name))[1],'')::uuid` still raises 22P02 for any object in the bucket whose first segment is not a uuid. Nothing this wave writes can trip it (keys are uuid-first); same class as the standing `project-documents` 22P02. | high |
| m-8 | `confirm_inbound_document` / `reject_inbound_document` still do not require `inbound = true` on the target row — a member may confirm or reject a document that never came through the door. Studio membership is still required, so it is not a tenancy hole. | high |
| m-9 | `record_notice`'s twin `array_agg(… ORDER BY t.name)` pair (00635) is still ordered independently; with duplicate names the ids and the names can pair differently. Correct today. | medium |
| m-10 | `corsHeaders` in `paperwork-upload/index.ts:22-25` still carries no `Access-Control-Allow-Methods`. Browsers accept the preflight today; the contract is incomplete for a browser-called door. | medium |
| n-1 | Report §5 still states ledger head `00637`. The head is **`00638`** (`00638_pay_link_readers_reheaded.sql`, plus `20260910152111`). | high |
| n-2 | Report §2 still says the service-role client is built "only after the request is read". It is built at `paperwork-upload/index.ts:42`, before `handlePaperwork` reads anything; it is *used* only after the token resolves. The sentence, not the code, is wrong. | high |
| n-3 | The `List-Unsubscribe` header still carries `channel:<worst.id>` — the worst-status row across studios, which may be another studio's row for the same address. Effect identical (the landing writes address-wide by `value`); the token names a row the letter did not come from. | medium |
| n-4 | The email gate still reads `options.to` only; `cc` recipients are never channel-checked (`send-email.ts:536`). Pre-existing; the current `cc` population is studio-side. Worth a ruling rather than a fix. | medium |

### New this round

| id | Finding | Confidence |
|---|---|---|
| m-11 | `handlePaperwork`'s multipart branch calls `await req.formData()` **before** `withinRateLimit`, so an unauthenticated caller makes the door buffer a whole multipart body before any bucket is claimed and before `MAX_FILE_BYTES` is checked. The token has to be read to bucket by it (R-CA), so the order is defensible; the bucket's 15 MB server-side cap limits the blast radius. Worth a note in the door's comment, or a `content-length` pre-check. | medium |
| m-12 | Report §8 states the closure basis as "`send-email.ts`, `sms.ts`, `invoice-links.ts` and the `_shared` modules that import them". W4 also changed **`_shared/invoice-checkout-driver.ts`**, which is not named. Harmless — its two importers (`create-checkout-session`, `invoice-link-checkout`) are in the set anyway — but the stated basis does not match the wave's own diff. | high |
| m-13 | `resolveContactChannel` returns `null` on a **read error** (`send-email.ts`: "a lookup failure resolves to null … rather than failing closed"), so a transport failure on `studio_contact_channels` skips the dead/unsubscribed gate for that send. Deliberate and documented, surfaced as far back as r4 and left standing; it is the one place in this wave's rails that fails open, next to R-CA's fail-closed paperwork door. Worth a ruling (fail closed for account-less recipients, keep the open behaviour where `userId` is known) rather than a silent asymmetry. | medium |

---

## 6. Considered and NOT reported as findings

- **The `stripe-webhook` receipt / failure letters take `letterFallbackUrl`.** Right after a
  link-rail payment settles, `invoice_letter_must_hold` is true by construction, so
  `ensureInvoiceLinkUrl` answers NULL and both letters (`index.ts:492`, `:593`) ship
  `${CLIENT_PORTAL_URL}/?invoice=<id>` — a signed-in surface — to a payer who may have no account.
  This is the *ruled* answer, not a defect: **R-BY** fixes the fallback shape as exactly that form
  and names `invoice-send` and `invoice-reminders` as the two rails that hold rather than ship;
  **R-BZ** repeats the same two. A receipt cannot hold. Recorded here so the next round does not
  re-open it, and so that any change of mind is made as a ruling.
- **Non-constant-time hash comparison** in the token lookups (§4) — the compared value is a stored
  hash, not a credential.
- **`pnpm supabase:reset` fails under the default Bash sandbox** with
  `EPERM … /Users/kody/.supabase/telemetry.json.tmp…`. Environment artefact, not a migration
  failure; it succeeds unchanged outside the sandbox, exactly as r10 recorded.
- **Port 3000/3002** — no server was started this round; nothing to report under the port rule.

---

## 7. Gates

### Reset

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```
(run outside the sandbox — see §6. Ledger head after reset: `20260910152111, 00638, 00637, 00636, 00635`.)

### SQL suites — `psql -v ON_ERROR_STOP=1`

```
w4_channels_touches_paperwork_test.sql exit=0
w4_invoice_link_freeze_order_test.sql  exit=0
invoice_links_test.sql                 exit=0
w1a_identity_channels_consent_test.sql exit=0
w1b_compliance_authority_directory_test.sql exit=0
w3_merge_sweep_household_test.sql      exit=0
people_directory_scope_test.sql        exit=0
design_build_test.sql                  exit=0
```

Mid-round, `w1b` failed twice with `3m expected 21 firm cards, got 24`; the cause is MAJOR-1, and
the run above is after the three leaked `Paperwork E2E …` cards were removed.

### Deno — `deno test --no-check --allow-all --config supabase/functions/deno.json supabase/functions`

```
FAILED | 1579 passed | 1 failed | 1 ignored (7s)
```

The sole failure is `./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)` →
`error: (in promise) Error: supabaseKey is required.` at `_tests/stripe-rail.test.ts:34:31`. It
needs a live `functions serve` plus keys (`_tests/run.sh`) and fails before any assertion;
pre-existing and untouched by this wave. The report's own scoped command
(`_tests/ _shared/ resend-webhook/ paperwork-upload/`) gives `814 passed | 1 failed`.

`find … -maxdepth 3 -name deno.lock` → no results.

### Types and grants

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm … db:generate
packages/supabase/src/database.types.ts | 20 ++++++++++----------   (CLI-boilerplate only; restored)

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2837 replayed statements
(no git diff)
```

### Probes

`build/probe700-w4-r11-paperwork-tenancy.sql` (P1–P9),
`build/probe701-w4-r11-invoice-links.sql` (P10–P13),
`build/probe702-w4-r11-door-behaviour.sql` (P14–P18) — all `BEGIN … ROLLBACK`.

```
P1 pass: cross-tenant mint refused
P2 pass: minted, hashed at rest, expires 2026-12-16 00:00:00+00
P3 pass: token rows are studio-scoped
P4 pass: twelfth tier is tenant-scoped
P5 pass: upload inserts unverified on the token's firm, inherits gates, never touches the verified row
P6 pass: confirm/reject are studio-gated
P7 pass: a revoked token reaches nothing
P8 pass: an expired token reaches nothing
P9 observed: unknown-token knock=false ; existing-but-dead-token knock=true ; buckets=anon=21, link:…=1
P10 pass: the backfilled /pay address opens — sheet=invoice, number=INV-R11-1, payable=true
P10 pass: the stored hash, replayed as a token, is refused
P11 pass: plaintext gone, frozen, every active link hashed
P12 pass: payer-borne nonce attempt holds for 24h, then the letter mints again
P13 pass: the previous address is dead; the fresh address opens on INV-R11-1
P14 pass: one live token per firm; the re-mint kills the old address
P15: refused with paperwork_link_window_required
P16 pass: an unverified inbound upload does not clear the gate
P17: rows for coi_gl on the firm page = 1
P18: after confirm compliance_state="current"
```
