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
4. **`guard_trade_agreement_authored` must not guard `contact_email`, `state` or
   `sent_at`.** `stampSent` writes those three in one service-role UPDATE
   (trade-rfq-send's shape, §2.2's "cloned from trade-rfq-send"), and a resend
   of an already-`sent` agreement refreshes `contact_email` on a frozen row. If
   the guard's column list is broader than the terms (§3.2 says "content
   UPDATEs"; SQL-A7 tests `scope`/`price_cents`), every resend returns
   `500 stamp_failed`. Either keep the guard on the term columns only, or tell
   this lane and the stamp moves behind `send_trade_agreement`.
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
