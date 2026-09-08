# Wave 3 · lane `edge` — notes

Date 2026-09-07 · worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-edge` · branch `agreement/w3-edge` · base `112e6f838`.

Every item in build-sheet §2.2 is delivered. Three commits, one per item.

---

## 1 · `proposal-send` learns `design_build` — `540845ef8`

`handler.ts` only; `index.ts` needed no edit (it casts `document_kind` straight
off the row into `ProposalSendSnapshot['documentKind']` at `:105` and `:235`, so
the widened union carries through).

- `ProposalSendSnapshot.documentKind` gains `'design_build'`.
- Five ternary chains gain a `design_build` arm, in the order §3.3 names them:
  `documentLabel` → `design-build agreement` (so the subject reads
  *"… sent you a design-build agreement: \"…\""*), `description`, `eyebrow` →
  `Design-build`, `heading` → `Your design-build agreement is ready`,
  `ctaButton` → `Review agreement`.
- The description names the four things the sheet asks for and nothing else:
  *"Review the pricing basis, the schedule of values, the draw schedule, and the
  retainage held back from each draw. Signing accepts the agreement; the studio
  countersigns before the work begins."*
- `isServices` at `handler.ts:241` deliberately does **not** absorb
  `design_build`. The services copy names role-based rates and the FF&E
  boundary, neither of which is true of a turnkey prime.

**DENO-3's "the other four are unchanged" is enforced by digest, not by eye.**
Before touching the ternaries I rendered all five shipped kinds and took a
SHA-256 over `subject + "\n" + html`; those five digests are pinned in
`commercial-render.test.ts` (`PRE_DESIGN_BUILD_DIGESTS`) and re-checked after
the change. `design_services` and `service_addendum` hash identically — they
share one arm — which is itself worth knowing.

## 2 · `commercial-document-notify` learns `design_build` + `agreement_draw_ready` — `28e8dd40c`

| File | Change |
|---|---|
| `core.ts` | `CommercialTransition` gains `'agreement_draw_ready'`; a case in `renderCommercialEmail` (subject *"Draw ready: …"*, eyebrow *Payment required*, headline *"The next draw on your agreement is ready"*, CTA *Review draw*). The switch has no `default`, so a missing case would not compile — that is the forcing function that caught nothing here because the case was written first. |
| `policy.ts` | `SERVICES_KINDS` += `design_build`; new `AGREEMENT_DRAW_TRANSITIONS`; `STUDIO_TRANSITIONS` += `agreement_draw_ready`; `EVENT_SCOPED_TRANSITIONS` += `agreement_draw_ready`; `CommercialTransitionEvidence` gains `agreementDraw`; new `hasBoundDesignBuildEvidence`; the `assessCommercialTransition` case. |
| `lib.ts` | `agreement_draw_ready` joins the client-only audience group; the paper channel never touches it (it is not in `EXECUTED_FAMILY` and has no override). |
| `index.ts` | `TRANSITIONS` += `agreement_draw_ready`; a sibling of the `trade_draw_ready` evidence block reading `agreement_draw_invoices` by `(id, proposal_id)` then its invoice's status; the client's portal link resolves to `#letterbox` alongside `deposit_ready`/`trade_draw_ready`. |

**`deposit_ready` was deliberately NOT widened.** The turnkey deposit reaches the
homeowner on the door in the same act as their signature (P13/R15); an email
would be a second, contradictory notice. The refusal is written as a comment
above the branch and pinned by a test, so it reads as a decision rather than an
omission.

The draw lookup is scoped to `(id, proposal_id)` exactly as the trade-scope one
is, so a forged or cross-proposal `eventId` resolves no row at all rather than
resolving someone else's draw. Nine negative cases cover it.

## 3 · `trade-agreement-send` + `_shared/trade-agreement-emails.ts` — `bd111c935`

Both files are **new**. No existing `_shared` file was edited:
`git diff --name-only 112e6f838 HEAD -- supabase/functions/_shared` returns
nothing but the two additions, and the only importer of the new module is
`trade-agreement-send/lib.ts` (plus its own test). **The redeploy set is exactly
the three functions in §9 — no fan-out.**

`config.toml` gains `[functions.trade-agreement-send] verify_jwt = true`,
directly under `[functions.trade-rfq-send]`, with the same rationale written out:
the studio calls it with a real JWT, and the sub never calls it at all — they
reach their agreement through the minted token on `/trade/[token]`.

### Shape

`lib.ts` is trade-rfq-send's twin (pure, DI, no `Deno.serve`), with exactly three
deliberate differences:

1. **Ownership is the studio, not the designer.** `isActiveStudioMember(req, studioId)`
   → `public.is_active_studio_member(p_org)` (00417:40), evaluated as the CALLER
   through an anon-key client carrying their header — a service-role client has
   no `auth.uid()` and the predicate would read false forever.
2. **The letter carries a number.** An RFQ asks for a price and must carry none;
   a Trade Agreement states the one the studio has agreed to pay THIS sub.
3. **The state ratchet has two terminal values, not two.** `draft`/`sent` → `sent`;
   `signed` and `void` are never moved. A resend of a signed agreement still
   re-mints and re-emails (the sub lost the email) but the letter reads as a
   receipt — *"Your signed Trade Agreement"*, CTA *Open your agreement* — and
   `state` is omitted from the patch entirely.

### R13 is enforced in the column list

`loadAgreement`'s `select` is the whole privacy boundary. `project_id` is **not
selected**, so the project name — which studios write from the client's surname
(00424:576-600's reasoning, verbatim) — has no route into the function, let
alone the letter. Neither is `source_proposal_id` nor `sov_line_ids`.
`TradeAgreementEmailParams` has no field that could carry a client name, the
GMP, the schedule of values, a draw, or another sub's number, so there is
nothing to redact.

Two tests hold that line: `_shared` asserts the rendered HTML contains exactly
one currency figure and that it is the sub's own; `index.test.ts` hands
`loadAgreement` a row with `projectName`/`clientName`/`gmpCents`/`scheduleOfValues`
bolted on and asserts none of them reaches the letter.

An unrecognised `lien_waiver_policy` renders *"Lien waivers are exchanged as this
agreement describes."* rather than printing the stored value at a tradesperson —
no column name, no enum string, in anyone's face (R7).

---

## Gates — all green, on this worktree

```
deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
  ok | 352 passed | 0 failed        (was 337 on base; +15 trade-agreement-emails)
… …/proposal-send/                    ok | 25 passed | 0 failed   (was 23; +2)
… …/commercial-document-notify/        ok | 42 passed | 0 failed   (was 37; +5)
… …/trade-agreement-send/              ok | 33 passed | 0 failed   (new)

deno check --config …/deno.json …/proposal-send/index.ts                 Check, rc=0
deno check --config …/deno.json …/commercial-document-notify/index.ts    Check, rc=0
deno check --config …/deno.json …/trade-agreement-send/index.ts          Check, rc=0

ls <worktree>/deno.lock  → No such file or directory
git status --porcelain -- deno.lock  → empty
```

`deno.json` carries `"lock": false` and every command above passed `--config`,
so no root `deno.lock` was ever written.

### Sweep (build-sheet §3.3's closing instruction)

`grep -rn "trade_scope" <lane pathspecs> | grep -v "trade_scope_\|\.test\."` →
six hits, each classified:

| Hit | Verdict |
|---|---|
| `proposal-send/handler.ts:52` (union member) | **required** — `design_build` added beside it |
| `proposal-send/handler.ts:244` (`isTradeScope`) | **required** — `isDesignBuild` added beside it |
| `policy.ts:137` `TRADE_SCOPE_ONLY_TRANSITIONS` | single-kind by design; the prime's draws got their own `AGREEMENT_DRAW_TRANSITIONS` rather than joining this set |
| `policy.ts:147` `deposit_ready` | **deliberately not widened** (P13/R15, above) |
| `policy.ts:204` `hasBoundTradeScopeEvidence` | sibling `hasBoundDesignBuildEvidence` added |
| `policy.ts:270` `deposit_ready` binding chain | unreachable for `design_build` — `documentKindCanNotify` refuses first |

Same sweep for `design_services`: three hits, all handled (`handler.ts:49`
union, `handler.ts:241` `isServices` — deliberately not absorbing the new kind,
`policy.ts:77` `SERVICES_KINDS` — widened).

---

## Owed to the backend lane (cross-lane, verify before integration)

The edge function calls these; the names and shapes are read off build-sheet
§3.2, not off applied SQL — **migration 2 does not exist in this worktree**, so
none of it has been exercised against a database.

1. `public.mint_trade_agreement_token(p_agreement_id uuid) RETURNS TABLE(id uuid, token text)`,
   `service_role`. `index.ts` reads `data[0].token`.
2. `public.is_active_studio_member(p_org uuid)` — existing (00417:40), argument
   name `p_org`. Called as the caller.
3. `studio_trade_agreements` columns read: `id, studio_id, title, scope,
   price_cents, currency, schedule, retainage_bps, pay_when_paid_days,
   insurance_certificate_required, lien_waiver_policy, contact_id,
   contact_display_name, contact_company_name, contact_email, created_by,
   state, sent_at`.
4. ~~**`guard_trade_agreement_authored` must not guard `contact_email`, `state`
   or `sent_at`.**~~ **RESOLVED in round 1 — see "Round 1 fixes" below.** The
   stamp moved behind `send_trade_agreement` (the second branch of the sentence
   this item offered) and `contact_email` is no longer written at all. The
   narrowed ask on the backend lane: the guard must exempt `state` and
   `sent_at`, because `send_trade_agreement` itself stamps them on a row whose
   `state` is already `'sent'` on a resend. `contact_email` needs no exemption.
5. `agreement_draw_invoices` columns read by the notify evidence loader:
   `id, proposal_id, invoice_id`.

## Not done, and why

- **Nothing deployed.** No `supabase functions deploy`, no `db push`, no
  wrangler. The §9 deploy set for this wave is exactly
  `proposal-send`, `commercial-document-notify`, `trade-agreement-send` —
  no `--no-verify-jwt` on any of them.
- **No live probe.** These are DI/pure-logic suites; nothing ran against a
  Supabase stack, so the RPC names in the list above are unverified by
  execution. `mint_trade_agreement_token` returning something other than
  `TABLE(id, token)` would surface as `mint_failed`.
- **Formatting.** `deno fmt --check` and `prettier --check` both flag these
  files — and both flag `trade-rfq-send/` and `proposal-send/handler.ts` on
  `origin/main` unchanged, so neither is a gate for `supabase/functions`.
  Advisory only; nothing was reformatted, to keep the diff to this wave's delta.

---

# Round 1 fixes (adversarial review, 2026-09-07)

Five findings — E1/E2 blockers, E3/E4/E5 majors. All five addressed. Two files
of product code and two of tests: `trade-agreement-send/{index,lib}.ts` +
`index.test.ts`, `commercial-document-notify/core.ts` + `core.test.ts`.
Diff: 5 files, +378 / −138.

## E1 + E2 — the send is now the frozen RPC, not a table write

`stampSent` (a service-role `.update()` on `studio_trade_agreements`) is gone.
In its place `TradeAgreementSendDeps.commitSend(req, agreementId)` calls
`public.send_trade_agreement(p_agreement_id)` **as the caller** — an anon-key
client carrying the caller's `Authorization` header, the same shape
`is_active_studio_member` already used, because the RPC is granted to
`authenticated` and needs `auth.uid()`. Nothing in this function writes a
business table any more.

Three consequences fall out of the one change:

- The `state IN ('draft','sent')` gate, the authorship freeze and the
  `state='sent'` / `sent_at` stamp are one transaction the DB owns. The
  function reports the row it gets back rather than a state it computed —
  `deps.now` is deleted, since there is no timestamp left to invent.
- `contact_email` is **never written**. It was the E2 defect: written
  unconditionally on every send, so the second send hit the freeze. The
  `recipientEmail` override now addresses one letter and nothing else; the
  roster snapshot on the frozen row is agreement content and stays put.
- Order is **commit → mint → email**, pinned by a new test asserting
  `log.order === ["commit","mint","email"]`. The old order could deliver a
  letter the row then denied (`500 stamp_failed` after the mail was out); the
  new order's worst case is a `'sent'` row with no letter, which is
  recoverable because `'sent'` is still sendable. `500 stamp_failed` is gone
  from the contract; `502 commit_failed` replaces it, and it fires **before**
  anything is minted or mailed.

## E3 — a spent or revoked link is never re-minted

`send` now refuses any state outside `('draft','sent')` with
`409 { error:'agreement_not_sendable', detail, state }`, before the mint and
before the letter (`SENDABLE_STATES` in `lib.ts`, mirroring the RPC's own gate
so the refusal is typed rather than a raw DB error; the RPC remains the
authority that writes). A `void` agreement had been re-minting a live token and
mailing an ask-to-sign letter for a page `resolve_trade_agreement_link` is
specified to return NULL for — and undoing `void_trade_agreement`'s own token
revocation while it did so. A `signed` one had been minting a second live token
against an agreement whose link `sign_trade_agreement_by_token` spends in the
signing transaction.

DENO-4's "a resend of a `signed` agreement never downgrades `state`" is
satisfied by refusal rather than by an omitted patch key — the sheet's other
half (build-sheet.md:689, walk step 16, "the link is now spent") and R16 both
point the same way, and the two tests that pinned the old behavior now pin the
409. The receipt-letter branch (`alreadySigned`) is still reachable and still
tested — through `preview`, which composes without minting.

## E4 — turnkey execution copy

`design_build` joined `SERVICES_KINDS` in the first round, which routed a
turnkey client into design-services sentences: "Design services authorized",
"Your design engagement is active", "Design time can now be tracked under the
signed authority" — to a homeowner whose authority is a schedule of values with
draws and retainage. `core.ts` now branches on
`isDesignBuild = documentKind === 'design_build'` in both transitions:

- `executed` (online and paper): eyebrow "Agreement executed", headline "Your
  agreement is executed", body "Work proceeds against the schedule of values,
  each draw is invoiced as its portion is earned, and retainage is held back
  until the end."
- `client_signed`, both audiences: "no work begins until … countersigns" in
  place of "design work is not active" / "no project has been created".

Vocabulary check: schedule of values, draw, retainage — all already sanctioned
homeowner-facing by build-sheet.md:727 and the `agreement_draw_ready` arm. No
figure, no badge, no status colour, none of the four forbidden homeowner words.
Four new tests, plus one that pins the design-services arms **unchanged**.

## E5 — the authority block prints nothing on a turnkey letter

`authority` is now suppressed entirely when `documentKind === 'design_build'`.
A turnkey agreement's schedule parts project into the same
`proposal_service_terms.billing_ceiling_cents` / `retainer_amount_cents` the
loader reads unconditionally (`index.ts:447-448`), so the block could print
"Design-services ceiling: $84,134" on a turnkey `client_signed`, `executed` or
`agreement_draw_ready` letter — a design-services label over a turnkey number.
Its money is the schedule of values and the draws, which the letter names and
the invoice prices (R5).

The review's specific charge — that the existing no-`$` assertion passed only
because its fixture omitted `ceilingCents` — is answered by a second
`agreement_draw_ready` case carrying `ceilingCents: 8_413_400` and
`retainerCents: 1_200_000` and asserting the absence of `$`,
`Design-services ceiling`, `Retainer` and `84,134`. It fails on the pre-fix
code and passes on the fixed code.

## Owed to the designer lane (contract change)

`trade-agreement-send`'s send-mode responses changed and the caller must
follow:

- **new** `409 { error:'agreement_not_sendable', state }` — the Send control
  should not offer a send on a signed or void agreement at all, and should
  treat a 409 as "this one is finished", not as an error to retry.
- **removed** `500 stamp_failed`; **added** `502 commit_failed`.
- `sentAt` / `state` in the 200 body are now the RPC's values, not the
  function's.

## Gates re-run after the fixes

```
deno test --allow-all --config .../supabase/functions/deno.json .../supabase/functions/_shared/
  → ok | 352 passed | 0 failed (4s)
deno test … supabase/functions/trade-agreement-send/
  → ok | 35 passed | 0 failed (78ms)
deno test … supabase/functions/commercial-document-notify/
  → ok | 47 passed | 0 failed (126ms)
deno test … supabase/functions/proposal-send/
  → ok | 25 passed | 0 failed (98ms)
deno check --config … trade-agreement-send/index.ts commercial-document-notify/index.ts proposal-send/index.ts
  → Check ×3, no diagnostics
```

459 Deno tests green. No `deno.lock` at the worktree root (`ls` → No such file
or directory). Still nothing deployed, still no live DB probe: the
`send_trade_agreement` call is read off build-sheet.md:685 and has never been
executed, exactly like the other four RPCs in the owed list above. It returns
`jsonb`; `commitSend` reads `state` and `sent_at` off it (array-unwrapping
first, as `mintToken` does) and reports `send_trade_agreement returned no row`
if the shape is not that.

> **Superseded by round 2.** The paragraph above was true when it was written
> and is false now: the backend lane's migrations landed, every name was
> checked against them, and one of them was wrong. See below.

---

# Round 2 fixes (adversarial review, 2026-09-07)

Two majors, F7 and F16. Both were the same complaint in two costumes — *this
lane's database names come from prose, not from SQL* — and both are now
answered from applied SQL rather than from the build sheet.

The fact that unblocked them: **the backend lane's two migrations now exist.**
At round-1 time `agreement/w3-backend` carried three files and no migration. It
now carries `00578_design_build_kind.sql` (7544 lines) and
`00579_trade_agreements.sql` (1033 lines), branch tip `985e8ae94`. Every name
below was re-derived by reading those two files, not by re-reading §3.2.

## F7 — the names, checked against SQL, and the one that was wrong

**One real drift, and it fails silently.** `public.send_trade_agreement`
`RETURNS jsonb` (`00579:513`) and builds an object with **camelCase** keys
(`00579:546-559`) — `'state'`, `'sentAt'`. `commitSend` read `row.sent_at`, a
*column* name that is not a key of that object. It does not throw and it does
not 502: `state` resolves, `sentAt` resolves `undefined → null`, and the
function returns `200 {ok:true, …, sentAt:null}` on **every** send. The studio
sees a success with no date on it.

Fixed by moving both RPC payload shapes into exported pure functions, pinned by
tests to the migration rather than to prose:

| Function (`lib.ts`) | Pins |
|---|---|
| `mapCommitSendResult(data)` | `RETURNS jsonb`, single object, keys `state` + `sentAt`; a `sent_at` key is explicitly asserted **not** to be read (the regression test); missing/blank `state` → a reported error, never a bare row |
| `mapMintTokenResult(data)` | `RETURNS TABLE (id uuid, token text)` (`00579:577`) → PostgREST array; `data[0].token`; empty array / no token → `no_token` |

Six new Deno tests. `index.ts`'s two deps now call the mappers and keep only
their `console.error` lines.

**The full manifest, each row verified against applied SQL.** This is the list
the integration steward re-checks before cutting the deploy set; every row here
was read, not assumed. Line numbers are `agreement/w3-backend` @ `985e8ae94`.

| Name this lane calls | Where it is defined | Verdict |
|---|---|---|
| `public.studio_trade_agreements` | `00579:47` | exists |
| its 18 selected columns — `id, studio_id, title, scope, price_cents, currency, schedule, retainage_bps, pay_when_paid_days, insurance_certificate_required, lien_waiver_policy, contact_id, contact_display_name, contact_company_name, contact_email, created_by, state, sent_at` | `00579:48-87` | all 18 present, spelled as selected |
| `GRANT ALL … TO service_role` on that table (the loader is a service-role client) | `00579:299` | granted |
| `public.send_trade_agreement(p_agreement_id uuid)` | `00579:512`, arg name `p_agreement_id` | matches |
| → `RETURNS jsonb`, keys `state` / `sentAt` | `00579:513`, `546-559` | **DRIFT — fixed here** |
| → `GRANT EXECUTE … TO authenticated` (so it must run as the caller, not service role) | `00579:564` | matches the anon-key-plus-caller-header client |
| → state gate `IN ('draft','sent')` | `00579:534` | matches `SENDABLE_STATES` |
| → `sent_at = COALESCE(sent_at, now())` | `00579:541` | matches DENO-4's "stamps `sent_at` on first send only" |
| `public.mint_trade_agreement_token(p_agreement_id uuid)` | `00579:575-576` | matches |
| → `RETURNS TABLE (id uuid, token text)`, `RETURN QUERY` | `00579:577`, `617` | array unwrap correct |
| → `service_role` only, and requires `state IN ('sent','signed')` | `00579:588-591`, `624-625` | correct: this lane commits the send **before** minting |
| `public.is_active_studio_member(p_org uuid)` | `00417_studio_contacts.sql:40`, grant `:58` | pre-existing; arg name `p_org` matches |
| `public.agreement_draw_invoices` + `id, proposal_id, invoice_id` | `00578:394`, `395`, `396`, `405` | all three present |
| → `GRANT ALL … TO service_role` | `00578:547` | granted |
| `public.invoices(id, status)` | pre-existing | unchanged by this wave |
| `proposals.document_kind` admits `'design_build'` | `00578:118-124` | widened — this is what `proposal-send/index.ts:235`'s fallback reads |
| `public.profiles(full_name, business_name, email)`, `resolveStudioIdentity(supa, {studioId})` | pre-existing; `_shared/studio-identity.ts:38-55` | unchanged |

Two notes that fall out of the manifest and are **not** defects:

- `proposal_send_dispatches` has no `document_kind` column at all
  (`00388:19-45`; nothing adds one). `proposal-send/index.ts:105` reads it
  optionally and `:228-238` falls back to `proposals.document_kind` — the
  pre-existing path, and the one that carries `design_build`. No dispatch-side
  widening is owed.
- `agreement_draw_ready` appears nowhere in `00578`. It is not meant to: the
  transition is posted by the designer portal
  (`apps/designer-portal/src/app/api/commercial/[id]/paper-notify/route.ts`),
  the same caller `trade_draw_ready` has. Designer lane's item, not a missing
  migration.

**What is still not proven, and by what.** Nothing was executed. This is a
static cross-read of two migration files, which catches a wrong name and cannot
catch a wrong grant at runtime, a policy that bites the service-role client, or
a PostgREST serialization surprise. The live proof is the walk: `send` on a
real Trade Agreement returning `200` with a **non-null `sentAt`** and a token
link that resolves — that one response exercises `send_trade_agreement`,
`mint_trade_agreement_token`, both mappers and `is_active_studio_member` at
once. Until then, treat this manifest as the checklist, not as the evidence.

## F16 — the resend guard: already column-scoped in the applied SQL

The worry was exact and it was worth having: `send_trade_agreement` accepts
`state IN ('draft','sent')` and then UPDATEs the row, so on a **resend** it
writes a row that is already `'sent'`; a `SECURITY DEFINER` RPC does not bypass
its own table's trigger, so a whole-row `guard_trade_agreement_authored` would
abort inside the RPC and every resend would `502 commit_failed` forever.

It does not. `guard_trade_agreement_authored` (`00579:210-260`) returns early
when `OLD.state = 'draft'` and otherwise compares **only content columns** —
`project_id, studio_id, source_proposal_id, contact_id, contact_display_name,
contact_company_name, contact_email, trade, title, scope, price_cents,
currency, schedule, retainage_bps, pay_when_paid_days,
insurance_certificate_required, lien_waiver_policy, flow_down_clause_key,
sov_line_ids, created_by, created_at`. `state`, `sent_at`, `signed_at`,
`voided_at`, `void_reason` and `updated_at` are absent from that list, so the
state machine still moves after `'sent'` and a resend passes. The freeze this
lane relies on is intact in the same read: a content UPDATE after `'sent'`
raises `check_violation`.

The finding's real point stands anyway — nothing *made* the backend honour it.
Both halves of its prescribed fix are now in the build sheet:

- **§3.2** gained a paragraph stating the guard is column-scoped, naming both
  column lists, and stating the consequence of getting it wrong (permanent
  `502 commit_failed` on every resend). The same paragraph pins the two RPC
  return shapes F7 caught, for the same reason: read wrong, they fail quietly.
  The `send_trade_agreement` table row now points at it.
- **§5** gained **SQL-A10**: send, send again, assert the second call does not
  raise, `state` is still `'sent'`, `sent_at` is unchanged, the returned jsonb
  carries `state`/`sentAt`, a direct content UPDATE on that row still raises,
  and a second mint revokes the first token.

**Owed to the backend lane:** `trade_agreement_test.sql` covers SQL-A1…A9 and
sends five agreements but never sends one twice — no resend case exists. SQL-A10
is specified and unwritten. It belongs in that file, not this one; the Deno side
of the same behaviour is covered here (`index.test.ts`, "send mode, resend of a
'sent' agreement"), but a DI harness cannot fire a trigger.

## Gates re-run (round 2)

```
deno test --allow-all --config .../supabase/functions/deno.json .../_shared/
  → ok | 352 passed | 0 failed (2s)
deno test … supabase/functions/trade-agreement-send/
  → ok | 41 passed | 0 failed (71ms)
deno test … supabase/functions/commercial-document-notify/
  → ok | 47 passed | 0 failed (112ms)
deno test … supabase/functions/proposal-send/
  → ok | 25 passed | 0 failed (87ms)
deno check --config … {trade-agreement-send,commercial-document-notify,proposal-send}/index.ts
  → Check ×3, no diagnostics
```

465 Deno tests green (was 459; +6 mapper tests). No `deno.lock` at the worktree
root. Nothing deployed, no migration written by this lane, no shared-stack
write. `prettier --check` still flags these files, as it does the untouched
`trade-rfq-send/` on `origin/main` — advisory, not a gate for
`supabase/functions`.
