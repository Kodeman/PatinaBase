# Wave 3 · lane `edge` — adversarial review, round 1

Date 2026-09-07 · reviewer context is separate from the implementer's · branch `agreement/w3-edge` · worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-edge` (`git rev-parse --show-toplevel` confirms it).

Base `main` = `112e6f838`. Four code commits + one notes commit, `2623 insertions(+), 11 deletions(-)` across 18 files.

**Verdict: fix.** Two blockers, three majors. Everything in build-sheet §2.2's pathspec list is present, every §3.3 edge row is implemented, and every gate is green — the defects are contract-shape and copy-fidelity, not missing work.

---

## Gates — run by the reviewer, not read off the lane's notes

```
deno test --allow-all --config .../supabase/functions/deno.json .../supabase/functions/_shared/
  ok | 352 passed | 0 failed (1s)
deno test ... supabase/functions/trade-agreement-send/        ok | 33 passed | 0 failed (39ms)
deno test ... supabase/functions/commercial-document-notify/  ok | 42 passed | 0 failed (124ms)
deno test ... supabase/functions/proposal-send/               ok | 25 passed | 0 failed (92ms)

deno check --config .../deno.json .../proposal-send/index.ts                Check, rc=0
deno check --config .../deno.json .../commercial-document-notify/index.ts   Check, rc=0
deno check --config .../deno.json .../trade-agreement-send/index.ts         Check, rc=0

git diff --stat main...HEAD -- supabase/functions/_shared
  _shared/trade-agreement-emails.test.ts | 258 +++, _shared/trade-agreement-emails.ts | 247 +++
  → 2 files changed, 505 insertions(+), 0 deletions(-)   ── both ADDED; no existing _shared file modified.
  Redeploy set stays exactly three functions (§9).

ls deno.lock (worktree)          → No such file or directory
ls /Users/kody/Code/patina-merged/deno.lock → No such file or directory
git status --porcelain           → clean
pnpm turbo build --filter=@patina/types → 1 successful (cache hit, shared with the backend worktree)
```

### Independent verification of the DENO-3 byte-identity claim

The lane pins five SHA-256 digests in `commercial-render.test.ts` and asserts the four shipped kinds did not drift. I rebuilt those digests from `git show main:supabase/functions/proposal-send/handler.ts` (pre-change body, `_shared/branded-email.ts` unmodified) and got, byte for byte:

```
legacy                    09366eab823106654a9a6727295472638b01008cb1b3622b1134298b8d77ca74
design_services           1ec22325c4b8cee0fe971c7e66c7e8dc99cd2aaa6e117e59959e10cefbb2aaf9
furnishings_authorization ee7b7589d9a8379ad81b177c68b1308288f594aebbf85cb9610f1f30913c0af0
service_addendum          1ec22325c4b8cee0fe971c7e66c7e8dc99cd2aaa6e117e59959e10cefbb2aaf9
trade_scope               d34638f125d53c05c131f13dffdcd007334edf735fd066393c1a1b1389b7cb28
```

The pins are honest and pre-change. This is the strongest thing in the lane.

---

## Blockers

### E1 · The frozen `send_trade_agreement` RPC is never called; the edge function writes a business table directly

`build-sheet.md:685` freezes `send_trade_agreement(p_agreement_id) → jsonb`, grant `authenticated`: *"Authorize as above; require `state IN ('draft','sent')`; freeze …; stamp `state='sent'`, `sent_at`. **Returns the row for the edge function**."* Nothing calls it. `trade-agreement-send/index.ts:260-275` does its own write:

```ts
stampSent: async (agreementId, patch) => {
  const dbPatch = { contact_email: patch.contactEmail };
  if (patch.state) dbPatch.state = patch.state;
  if (patch.sentAt) dbPatch.sent_at = patch.sentAt;
  const { error } = await admin().from("studio_trade_agreements").update(dbPatch).eq("id", agreementId);
```

`rulings-2026-09-06.md`, *Program rules for this build*: **"No wave writes business tables outside definer RPCs."** This is a service-role UPDATE of a business table from an edge function.

Consequences, not just tidiness:
- the `state IN ('draft','sent')` gate is enforced nowhere on the send path (see E3);
- the freeze the RPC is supposed to sit behind is bypassed (see E2);
- the backend lane ships an `authenticated` RPC with zero callers, which the ACL/authorization contract tests will register and nothing will exercise.

Mitigation on the record: `trade-rfq-send/index.ts:228-243` does exactly this today (`trade_rfq_requests` direct `.update()`), and §2.2 told the lane to clone that shape. That explains the choice; it does not satisfy §3.2, which invented `send_trade_agreement` precisely because this rail is new.

**Fix:** call `send_trade_agreement` as the caller (it is `authenticated`), take the returned row, then mint + email. Authorization, the state gate and the stamp all collapse into it, and E2/E3 disappear with it.

### E2 · Every resend writes a content column on a frozen row → `500 stamp_failed` after the email has already gone

`stampSent` writes `contact_email` on **every** send, first or repeat. `build-sheet.md:685` specifies `guard_trade_agreement_authored`, *"refuses content UPDATEs once `state <> 'draft'`"*. `contact_email` is a snapshot of the roster contact — content by any reading, and unambiguously not one of `state`/`sent_at`.

Trace: first send has `OLD.state = 'draft'` → allowed. Second send has `OLD.state = 'sent'` → the guard refuses → `stampSent` returns an error → `lib.ts:409-417` returns `500 stamp_failed`. The email has already been delivered at that point (`lib.ts:376`), so the designer sees a hard failure for a send that succeeded.

The lane saw this and wrote it up (`edge-notes.md`, *"Owed to the backend lane"* item 4: *"`guard_trade_agreement_authored` must not guard `contact_email`, `state` or `sent_at` … Either keep the guard on the term columns only, or tell this lane and the stamp moves behind `send_trade_agreement`"*). Naming the hazard is good; leaving it as an instruction to a lane that has not written the migration yet is not a resolution, and the second branch of that sentence is the option the build sheet already froze. Blocker because the resolution is one lane's to take and it was handed off instead.

---

## Majors

### E3 · Resending a **void** agreement mints a live token and mails an ask-to-sign letter to a page that 404s

`lib.ts:363` mints unconditionally; `lib.ts:309` sets `alreadySigned = agreement.state === 'signed'` only. So for `state = 'void'` the letter reads *"Middle West Studio would like you to sign a Trade Agreement … Read and sign"* with a fresh, live `/trade/<token>`.

`build-sheet.md:688` — `resolve_trade_agreement_link` *"Returns NULL on every miss — bad hash, revoked, expired, **agreement voided**, agreement not in `('sent','signed')`"* → the sub lands on `notFound()`. And `void_trade_agreement` *"revokes every live token"* (`:690`) — this path immediately re-mints one, undoing the void's own cleanup.

`index.test.ts:617` (*"resend of a 'void' agreement: state is not revived to 'sent'"*) asserts `200` and a completed mint/send. The behavior is pinned rather than refused.

Related, lower severity, same root: a resend of a `signed` agreement also re-mints a live token, against `build-sheet.md:689` (*"revoke the token in the same transaction — a signed agreement's link is spent"*) and walk step 16 (*"the link is now spent"*). DENO-4 explicitly sanctions the signed resend (*"a resend of a `signed` agreement never downgrades `state`"*), so the sheet contradicts itself there and the lane picked a defensible side; the `void` case has no such cover.

**Fix:** refuse `mode: 'send'` when `state = 'void'` (409/422 with its own code) — or, per E1, let `send_trade_agreement`'s `state IN ('draft','sent')` gate be the single place this is decided.

### E4 · Widening `SERVICES_KINDS` routes design-build into shipped copy that says "Design services authorized"

`policy.ts:76` adds `"design_build"` to `SERVICES_KINDS`, so `documentKindCanNotify('design_build','executed')` is `true` (the lane's own test at `policy.test.ts` asserts it, per DENO-1). But `core.ts` has no `design_build` arm on those transitions:

```
core.ts:110   eyebrow  = 'Design services authorized';
core.ts:111   headline = 'Your design engagement is active';
core.ts:112   body     = `Both you and ${counterparty} have signed … Design time can now be tracked under the signed authority.`;
```

A homeowner who has just executed a **turnkey construction agreement** — whose authority is a draw schedule with retainage, not tracked design time — receives that. The `channel: 'paper'` arm at `:105-107` ("Your design engagement is active") and the `client_signed` client arm at `:88-90` ("design work is not active until … countersigns") read the same way, more mildly.

§3.3 asked only for the `SERVICES_KINDS` line and did not anticipate the copy consequence. §2.2's own instruction — *"If a lane believes it must touch a `_shared` file, stop and escalate"* — is the same posture that applies to a sheet gap of this shape. No escalation, no arm, no test.

**Fix:** add a `design_build` arm to `client_signed` and `executed` in `core.ts` (turnkey language: the agreement is executed, the draw schedule is live, retainage is held back), with a `core.test.ts` case per arm.

### E5 · "Design-services ceiling: $X" can print on a turnkey letter — including the new draw letter

`core.ts:223-226` appends, to **every** transition's html:

```ts
const authority = [
  ceiling  ? paragraph(`<strong>Design-services ceiling:</strong> ${ceiling}`) : '',
  retainer ? paragraph(`<strong>Retainer:</strong> ${retainer}`) : '',
].join('');
```

`index.ts:447-448` fills those unconditionally from `proposal_service_terms.billing_ceiling_cents` / `retainer_amount_cents`. Under R5/R9 a design-build agreement's schedule parts project into `proposal_service_terms`, so a turnkey `client_signed` / `executed` / `agreement_draw_ready` letter can carry a design-services label over a turnkey number.

It also makes the new assertion in `core.test.ts` a false comfort: `assert(!email.html.includes('$'))` passes only because the fixture omits `ceilingCents`/`retainerCents`. Re-run that same case with `ceilingCents: 8_413_400` and it fails.

**Fix:** suppress or re-label the authority block for `design_build` and pin it with a `ceilingCents`-carrying fixture on the `agreement_draw_ready` case.

---

## Minors

### E6 · The sub's letter carries the designer portal's footer

`trade-agreement-emails.ts:238-244` calls `renderBrandedShell` without `audience`, which defaults to `"designer"` (`branded-email.ts:211`). Rendered and probed:

```
Dashboard                                          → true
app.patina.cloud                                   → true
Help center                                        → true
desk?account=notifications                         → true
"A workshop for interior designers and the makers they trust." → true
```

The recipient is a subcontractor with **no Patina account, by design** (R16 — "no account, no password", which the letter's own body says two paragraphs earlier). `BrandedShellOpts` exposes `audience`, `footerLinks` and `businessAddress`; a new file could have used them. Inherited verbatim from `trade-rfq-emails.ts:146-152`, which ships the same footer today, so this is a copied defect rather than a new one — but it is a new file.

### E7 · A transient DB error reads as "this agreement does not exist"

`index.ts:115-118` — `loadAgreement` logs and returns `null` on any Supabase error, and `lib.ts:288` turns `null` into `404 trade_agreement_not_found`. A pooler blip is indistinguishable from a deleted row. trade-rfq-send does the same.

### E8 · DENO-5's absence assertion never exercises the one route a forbidden fact could take

`trade-agreement-emails.test.ts`'s *"the sub's price and their link are present; nothing else with a figure is"* comments that `scope` is *"free text a careless studio might paste the wrong thing into … the only route by which any of the forbidden facts below could reach this letter at all"* — then passes a benign sentence. The forbidden-term loop is vacuous. The `$`-count assertion (`figures === ["$38,000.00"]`) is real and does the actual work; the sibling in `index.test.ts:643`, which bolts `projectName`/`clientName`/`gmpCents`/`scheduleOfValues` onto the row, is the strong version.

**Fix:** paste `"Halvorsen"` and a GMP figure into `scope` in that fixture and assert what the rule actually is (they render, escaped, because the studio typed them — or they must not; decide and pin it).

### E14 · The `agreement_draw_invoices` evidence loader is untested and its column names are unverified

`commercial-document-notify/index.ts:285-315` reads `agreement_draw_invoices(id, proposal_id, invoice_id)`. `commercial-document-notify` has no `index.test.ts` (existing shape — the file boots `Deno.serve`), and the table does not exist on any branch: `git diff --name-only main...agreement/w3-backend` returns only `backend-t0-notes.md` and the two `packages/types` files. I-5 (*"Migration 2 applied + types regenerated … `trade-agreement-send` and the composer both wait on it"*) has not landed. The same applies to `mint_trade_agreement_token(p_agreement_id) RETURNS TABLE(id, token)` (`index.ts:216-237` reads `data[0].token`) and to `studio_trade_agreements`' 18-column select.

`public.is_active_studio_member(p_org uuid)` **is** verified: defined once at `00417_studio_contacts.sql:40`, never redefined (`grep -rln 'FUNCTION public.is_active_studio_member' supabase/migrations/ | sort` → one file), granted `authenticated, service_role` at `:58`. The argument name `p_org` matches `index.ts:175`.

Integration must re-check the other names against applied SQL before the deploy set is cut; a drift here surfaces only as a runtime `lookup_failed`/`mint_failed` 500.

---

## Nits

- **E9** Assertion-library drift: the two new test files import `std@0.168.0/testing/asserts.ts`; the touched `proposal-send/commercial-render.test.ts` imports `std@0.224.0/assert/mod.ts`. Both already exist in the tree (`trade-rfq-send` uses 0.168). Noted so integration does not read it as accidental.
- **E10** `index.ts:136-138`'s `title` fallback `"this scope of work"` is unreachable — §3.2 declares `title text NOT NULL CHECK (char_length(btrim(title)) > 0)`. Same for `scope ?? ""`.
- **E11** `CallerUser.email` is resolved (`index.ts:93`) and carried through the DI contract but never read by `handleTradeAgreementSend`.
- **E12** `packages/types/src/{agreement,commercial}.ts` are the **designer** lane's pathspecs (§2.3, I-1), and this branch carries its own T0 commit `f108672f5`. Its tree is byte-identical to the designer lane's `b854dad52` and the backend lane's `03ab57f49` — `git diff f108672f5 b854dad52 -- packages/types` is empty — so it is the documented T0 handshake and will merge clean. Recorded so integration does not read three commits sharing one subject as a conflict.
- **E13** §3.3's last edge row places "the email body for the new transition" in `lib.ts`; the bodies live in `core.ts`'s `renderCommercialEmail`, which is where the lane put it (`lib.ts` correctly got only the audience routing). The sheet's site reference is wrong, not the code.

---

## What is right, and worth keeping

- **No existing `_shared` file touched.** `git diff --name-status main...HEAD -- supabase/functions/_shared` shows two `A` lines and nothing else. `send-email.ts`'s 20 importers stay out of the redeploy set; §9's three-function list holds.
- **`deposit_ready` refusal is a decision, not an omission.** `policy.ts:139-141` carries the reasoning as a comment and `policy.test.ts` pins `documentKindCanNotify('design_build','deposit_ready') === false` — exactly what §3.3 asked for, and the P13/R15 posture ("offer, never gate") is preserved.
- **The draw evidence chain is scoped the way the trade-scope one is** — `(id, proposal_id)` at `index.ts:290-294`, so a forged or cross-proposal `eventId` resolves no row. Nine negative cases in `policy.test.ts`, including every non-payable `invoiceStatus`.
- **R13 is enforced by the column list, not by redaction.** `loadAgreement`'s select omits `project_id`, `source_proposal_id` and `sov_line_ids`, and `TradeAgreementEmailParams` has no field that could carry a client name, the GMP, the SOV, a draw or another sub's number. Two tests hold it, including the leaky-row case.
- **`verify_jwt = true`** on `[functions.trade-agreement-send]`, placed directly under `[functions.trade-rfq-send]` with the rationale written out. No `--no-verify-jwt` anywhere in the wave.
- **Vocabulary sweep clean.** No "gate" / "task" / "dashboard" / "overdue" / "variant" / "clause library" / "contract builder" in any added string (the `Dashboard` in E6 comes from the shared shell's default footer, not from lane copy); no emoji; no badge or count chip; an unrecognised `lien_waiver_policy` renders a sentence rather than the stored value at a tradesperson.

---

## Round-2 checklist

1. E1 — route the send through `send_trade_agreement`; delete `stampSent`'s direct table write.
2. E2 — falls out of (1); otherwise stop writing `contact_email` on a non-draft row.
3. E3 — refuse `send` on `state = 'void'`; flip `index.test.ts:617` from pinning the behavior to refusing it.
4. E4 — `design_build` arms on `client_signed` and `executed` in `core.ts`, one `core.test.ts` case each.
5. E5 — suppress or re-label the authority block for `design_build`; re-run the `agreement_draw_ready` case with a non-null `ceilingCents`.
6. E6 — pass `audience` / `footerLinks` / `businessAddress` for a login-less recipient.
7. E8 — make the absence assertion non-vacuous.
