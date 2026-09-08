# Wave 3 · lane `edge` — adversarial review, round 2

Date 2026-09-07 · reviewer context is separate from the implementer's ·
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-edge`
(`git rev-parse --show-toplevel` pasted below) · branch `agreement/w3-edge`,
base `112e6f838` (= `main` head).

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-edge
```

Commits under review (round-2 delta is the middle three):

```
6cd5fa29f docs(agreements): W3 edge lane round 1 fixes
0a05f4eec fix(edge): trade-agreement-send commits through send_trade_agreement
2f6ae6048 fix(edge): turnkey execution copy, and no design-services figure on a turnkey letter
d0f059cac docs(agreements): W3 edge lane adversarial review, round 1
04ed8cfe5 docs(agreements): W3 edge lane notes
bd111c935 feat(edge): trade-agreement-send delivers the sub's token link
28e8dd40c feat(edge): commercial-document-notify learns design_build and the agreement draw
540845ef8 feat(edge): proposal-send learns the design-build agreement
f108672f5 feat(types): agreement parts vocabulary and payloads (T0)
```

`19 files changed, 3197 insertions(+), 15 deletions(-)`.

---

## Verdict

**fix** — no blocker survives; two majors, both of them cross-lane integration
risk rather than defects in the code as written. Every item in build-sheet §2.2
and every edge row in §3.3 is delivered, and all five DENO ids are covered.

---

## Gates, run by the reviewer

```
$ deno test --allow-all --config <wt>/supabase/functions/deno.json <wt>/supabase/functions/_shared/
ok | 352 passed | 0 failed (2s)

$ deno test … supabase/functions/proposal-send/               ok | 25 passed | 0 failed (129ms)
$ deno test … supabase/functions/commercial-document-notify/  ok | 47 passed | 0 failed (125ms)
$ deno test … supabase/functions/trade-agreement-send/        ok | 35 passed | 0 failed (33ms)

$ deno check --config … proposal-send/index.ts                Check, rc=0
$ deno check --config … commercial-document-notify/index.ts   Check, rc=0
$ deno check --config … trade-agreement-send/index.ts         Check, rc=0

$ ls <wt>/deno.lock            → No such file or directory
$ git status --porcelain       → clean (only sandbox .env read denials)
```

459 Deno tests green.

```
$ git diff --stat main...HEAD -- supabase/functions/_shared
 _shared/trade-agreement-emails.test.ts | 258 +++++
 _shared/trade-agreement-emails.ts      | 247 +++++
 2 files changed, 505 insertions(+)
```

No **existing** `_shared` file is touched. The redeploy set stays exactly
`proposal-send`, `commercial-document-notify`, `trade-agreement-send`, all
`verify_jwt = true`, no `--no-verify-jwt`.

### Independent verification of the DENO-3 digest pin

The lane pins five SHA-256 digests of `subject + "\n" + html` for the shipped
kinds. I recomputed them by rendering `main`'s `handler.ts` in isolation:

```
legacy                     09366eab823106654a9a6727295472638b01008cb1b3622b1134298b8d77ca74
design_services            1ec22325c4b8cee0fe971c7e66c7e8dc99cd2aaa6e117e59959e10cefbb2aaf9
furnishings_authorization  ee7b7589d9a8379ad81b177c68b1308288f594aebbf85cb9610f1f30913c0af0
service_addendum           1ec22325c4b8cee0fe971c7e66c7e8dc99cd2aaa6e117e59959e10cefbb2aaf9
trade_scope                d34638f125d53c05c131f13dffdcd007334edf735fd066393c1a1b1389b7cb28
```

Byte-identical to `PRE_DESIGN_BUILD_DIGESTS`. The pin is honest; the four
shipped kinds are provably unchanged.

---

## Round 1 findings — disposition

| id | Severity (r1) | Status |
|---|---|---|
| E1 | blocker | **Fixed.** `stampSent` is gone; `commitSend` calls `public.send_trade_agreement` through an anon-key client carrying the caller's header. No `.update()`, `.insert()` or `.delete()` on any business table remains in the function. |
| E2 | blocker | **Fixed.** `contact_email` is never written; the `recipientEmail` override addresses one letter only. |
| E3 | major | **Fixed.** `SENDABLE_STATES = {draft, sent}`; `void` and `signed` return `409 agreement_not_sendable` *before* the mint and the letter. Two tests pin it. |
| E4 | major | **Fixed.** `isDesignBuild` arms on `client_signed` (both audiences) and `executed` (online + paper). Four new tests plus one pinning the design-services arms unchanged. |
| E5 | major | **Fixed, with a caveat (F8).** The authority block is suppressed entirely for `design_build`, and the new fixture carries `ceilingCents: 8_413_400` / `retainerCents: 1_200_000` — it fails on the pre-fix code. |
| E6 | minor | **Not fixed** → F1. |
| E7 | minor | **Not fixed** → F2. |
| E8 | minor | **Not fixed** → F3. |
| E9 / E10 / E11 | nit | **Not fixed** → F4 / F5 / F6. |
| E12 | nit | Still the documented T0 handshake; `git diff f108672f5 <designer/client/sub T0>` is empty in all three directions. |
| E13 | nit | Sheet's site reference (§3.3 last edge row) is still wrong; the code is right. |
| E14 | minor | **Widened to major** → F7 / F7b / F9b. The backend lane has produced **zero** migrations (`git diff --name-only main...agreement/w3-backend` → three files, none SQL). |

---

## Findings, round 2

### F7 · major · 0.9 · every DB name in this lane is still unverified

`git diff --name-only main...agreement/w3-backend` returns
`backend-t0-notes.md` + the two `packages/types` files. Neither migration
exists on any branch. So `studio_trade_agreements` (18 columns),
`send_trade_agreement`, `mint_trade_agreement_token` and
`agreement_draw_invoices(id, proposal_id, invoice_id)` are all read off
build-sheet §3.2/§3.3 and have never been executed. Drift surfaces only at
runtime as `502 commit_failed` / `502 mint_failed` / `500 lookup_failed`.
Verified by contrast: `public.is_active_studio_member(p_org uuid)` is defined
once (`00417_studio_contacts.sql:40`, `grep -rln … | sort` → one file), granted
`authenticated, service_role` at `:58`, and the argument name matches
`index.ts:182`. `resolveStudioIdentity(supa, { studioId })` is a real overload
(`_shared/studio-identity.ts:38-55`).
**Fix**: integration must re-check every name against applied SQL before the
deploy set is cut.

### F7b · minor · 0.6 · `send_trade_agreement`'s return keys are guessed snake_case

`index.ts:292-296` reads `row.state` and `row.sent_at`. Build-sheet §3.2 says
`send_trade_agreement(p_agreement_id) → jsonb`, "Returns the row" — which reads
as `to_jsonb(row)` (snake_case), but §4.5's sibling DTO
(`resolve_trade_agreement_link`) is hand-built **camelCase**. If the backend
builds this one the same way, `row.sent_at` is `undefined` (silent `sentAt:
null`) and, if the key is `sentAt`/`state` is absent, the guard at `:293`
returns `502 commit_failed` **on a send that actually committed** — the letter
never goes out and the designer sees an error on a successful state change.
**Fix**: freeze the key casing in I-3's sibling note before the backend writes
migration 2.

### F16 · major · 0.65 · a resend needs `guard_trade_agreement_authored` to exempt `state`/`sent_at`, and the sheet does not say so

Build-sheet §3.2 specifies the guard as "refuses content UPDATEs once
`state <> 'draft'`" and simultaneously has `send_trade_agreement` accept
`state IN ('draft','sent')` and "stamp `state='sent'`, `sent_at`". A
`SECURITY DEFINER` RPC does **not** bypass a trigger. If the backend implements
the guard literally over the whole row, every resend of a `'sent'` agreement
aborts inside the RPC → `502 commit_failed`, forever. The lane names this in
`edge-notes.md` ("Owed to the backend lane" item 4, narrowed) but it is not in
the build sheet, so nothing forces the backend to honor it.
**Fix**: the guard must be column-scoped (content columns only) — record it as a
build-sheet amendment, not a lane note.

### F1 · minor · 0.95 · the sub's letter carries the designer portal's footer

`_shared/trade-agreement-emails.ts:238-244` calls `renderBrandedShell` without
`audience`, which defaults to `"designer"` (`branded-email.ts:211`). Rendered
and probed:

```
Dashboard                  => true
Help center                => true
app.patina.cloud           => true
desk?account=notifications => true
"A workshop for interior designers and the makers they trust." => true
```

The recipient is a subcontractor with **no Patina account by design** (R16 —
the letter's own body says "no account, no password" two paragraphs earlier).
`BrandedShellOpts` exposes `audience`, `footerLinks` and `businessAddress`.
Inherited verbatim from `trade-rfq-emails.ts:146-152`, which ships the same
footer today — a copied defect, but in a new file, so it is cheap to fix here.
**Fix**: pass explicit `footerLinks` / `businessAddress` (or an audience that
does not link a portal the sub cannot enter).

### F8 · minor · 0.8 · E5's fix also drops the *correctly labelled* retainer line

`core.ts:243` — `const authority = isDesignBuild ? '' : [...]` suppresses both
the "Design-services ceiling" line (the actual defect) **and** the "Retainer"
line. R9 explicitly sanctions a retainer on `design_build` ("the only authority
`design_build` writes is `billing_cadence = 'per_draw'` **+ `retainer`/`ceiling`
if the studio adds those parts**"), and SQL-T14 is built on exactly that case
("a design-build agreement whose part set carries a non-zero `retainer` part").
So a turnkey client who owes a retainer is no longer told so on the letter.
**Fix**: suppress the ceiling line for `design_build` and keep the retainer
line, or re-label the ceiling for the class.

### F10 · minor · 0.9 · the `alreadySigned` receipt letter can no longer be delivered

`lib.ts:320` sets `alreadySigned = agreement.state === 'signed'`; `lib.ts:359-370`
now refuses `send` for exactly that state with a 409. So in send mode
`alreadySigned` is **always** false, and `buildTradeAgreementEmail`'s entire
receipt branch (subject "Your signed Trade Agreement …", CTA "Open your
agreement") can only ever be rendered into a `preview` JSON response read by the
studio — never into the sub's inbox. A sub who loses their signed copy has no
way to be re-sent it. The lane's own round-0 rationale for resending a signed
agreement ("the sub lost the email") is now unimplementable.
**Fix**: either accept it and note the gap for the designer surface, or add a
receipt-only resend mode that mints nothing and re-mails the existing receipt.

### F9 · minor · 0.85 · DENO-4's "stamps `sent_at` on first send only" is no longer pinned anywhere

The surviving test (`index.test.ts:583`) hands `commitSend` a stub that returns
`sentAt: "2026-09-01T00:00:00.000Z"` with the comment
`// send_trade_agreement keeps the original sent_at on a resend.` — it asserts
the stub's own premise. Build-sheet §3.2's RPC outline says "stamp
`state='sent'`, `sent_at`" with no first-send-only clause, so after the E1 fix
this behavior is owned by nobody and tested by nobody.
**Fix**: put "preserve `sent_at` on a resend" into §3.2's outline and into
`trade_agreement_test.sql` (SQL-A-series), or rule that a resend restamps.

### F2 · minor · 0.9 · a transient DB error is collapsed into a 404

`index.ts:122-125` — `loadAgreement` logs and returns `null` on **any**
Supabase error; `lib.ts:299-301` turns `null` into `404
trade_agreement_not_found`. A pooler blip is indistinguishable to the designer
from a deleted row. `trade-rfq-send/index.ts` does the same, so this is
inherited.

### F3 · minor · 0.7 · DENO-5's forbidden-term loop is still vacuous

`_shared/trade-agreement-emails.test.ts:215-252` — the fixture's `scope` is the
benign "Fabricate and install the kitchen and mudroom cabinetry.", so the loop
over `["halvorsen","84,134","gmp","bid",…]` asserts nothing that could have
failed. The `$`-count assertion (`figures === ["$38,000.00"]`) is real and does
the work; the strong version of the privacy test is the sibling at
`trade-agreement-send/index.test.ts:708`, which bolts
`projectName`/`clientName`/`gmpCents`/`scheduleOfValues` onto the row and asserts
none of them reaches the letter — that one is genuinely load-bearing.
**Fix**: paste "Halvorsen" and a GMP figure into `scope` in that fixture and
assert what the rule actually is.

### F11 · minor · 0.9 · `edge-notes.md` still documents the pre-fix contract at the top

`edge-notes.md` §3 "Shape" item 3 reads *"The state ratchet has two terminal
values, not two"* (a typo) and *"A resend of a signed agreement still re-mints
and re-emails … and `state` is omitted from the patch entirely."* The round-1
fixes section 200 lines further down says the opposite (409, nothing minted).
Integration reading the file top-down gets the wrong contract for the designer
lane's Send control.
**Fix**: edit §3 item 3 in place; the appended fix log is not a substitute.

### F12 · nit · 0.8 · the 409 `detail` ternary is binary

`lib.ts:363-366` — anything that is not `'signed'` renders "This Trade Agreement
has been withdrawn." A future fifth state (or an unexpected value) tells the
designer the agreement was withdrawn when it was not.

### F13 · nit · 0.7 · `contactDisplayName` does not mean `contact_display_name`

`index.ts:159-160` populates `TradeAgreementRow.contactDisplayName` from
`contact_company_name` first, falling back to `contact_display_name`. Defensible
as a greeting, but §4.5's frozen DTO uses `contactDisplayName` for the display
name, and the `sub` lane will read it as the DB column. Name it
`greetingName`, or note the divergence in I-4.

### F14 · nit · 0.6 · the sheet contradicts itself on resending a signed agreement, and no ruling exists

Build-sheet `:689` and walk step 16 ("the link is now spent") point one way;
DENO-4's "a resend of a `signed` agreement never downgrades `state`" points the
other. The lane picked refusal and argued it. Recorded so the orchestrator rules
it rather than leaving the `sub` and `designer` lanes to infer it.

### F15 · nit · 0.6 · the `design_build` + `channel:'paper'` arm is unreachable

`core.ts:106-110` adds a paper-executed turnkey arm and a test for it, but
§3.3 deliberately leaves `_record_paper_client_signature_impl` and
`_issue_design_services_agreement_on_paper` closed to `design_build` ("paper
execution of a turnkey prime is out of scope"). Harmless defence; recorded so it
is not read as evidence that paper turnkey execution ships.

### F17 · nit · 0.4 · `budget_published` inherited the design-services sentence

Widening `SERVICES_KINDS` makes `documentKindCanNotify('design_build',
'budget_published')` true (the lane's own DENO-1 test asserts it, per the
sheet), but `core.ts:138-145` has no turnkey arm: a turnkey client is told
acknowledging the working budget "does not authorize purchasing", when the frame
for that class is the draw schedule, not purchasing authority. SQL-T15 expects a
budget checkpoint to publish on a design-build project, so the path is
reachable. Low value; recorded for completeness.

### F4 / F5 / F6 · nits carried unchanged from round 1

- **F4** (0.9) `_shared/trade-agreement-emails.test.ts:16` and
  `trade-agreement-send/index.test.ts:17` import `std@0.168.0/testing/asserts.ts`;
  `proposal-send/commercial-render.test.ts:1-5` imports `std@0.224.0/assert/mod.ts`.
  Both already exist in the tree and `trade-rfq-send/index.test.ts:17` uses
  0.168 — the new files match their twin. Note only.
- **F5** (0.85) `index.ts:143-146` falls back to "this scope of work" / `""` for
  columns §3.2 declares `NOT NULL CHECK (char_length(btrim(...)) > 0)`.
- **F6** (0.8) `CallerUser.email` is resolved (`index.ts:100`) and carried through
  the DI contract but never read. `trade-rfq-send` carries the same dead field.

---

## Coverage check against the build sheet

**§2.2 pathspecs** — all twelve delivered, nothing outside them touched except
the T0 types commit (E12, the documented handshake).

**§3.3 edge rows** — ten rows, all landed: the `documentKind` union;
five ternary chains (`documentLabel` / `description` / `eyebrow` / `heading` /
`ctaButton`); `CommercialTransition`; `SERVICES_KINDS`;
`AGREEMENT_DRAW_TRANSITIONS`; `documentKindCanNotify` routing **with
`deposit_ready` deliberately not widened** (commented and tested);
`EVENT_SCOPED_TRANSITIONS`; `assessCommercialTransition`; the `index.ts`
evidence loader; the new transition's body (in `core.ts`, which is where email
bodies live — the sheet's `lib.ts` reference is wrong, E13).

**§3.3's closing sweep, re-run by the reviewer** —
`grep -rn "design_services" supabase/functions --include "*.ts" | grep -v test`
returns three hits, all inside this lane's two files and all handled. No other
edge function in the tree carries a closed `document_kind` list, so nothing
outside §2.2 fails closed for the new kind.

**DENO-1…5** — all five covered; DENO-1 and DENO-2 with nine and eleven
negative cases respectively; DENO-3 with a verified digest pin; DENO-4 with
every listed case except the `sent_at`-first-send-only clause (F9) and with the
signed-resend case converted to a 409 (F14); DENO-5 present but weak (F3),
carried by its strong sibling.

**Vocabulary and refusals** — no "clause library", "contract builder",
"variant", "AI", "dashboard", "task", "overdue" or a database column name in any
rendered string; `subcontract` appears once, in a code comment. Homeowner-facing
turnkey copy uses schedule of values / draw / retainage, sanctioned by
build-sheet `:727`. No badge, count chip, status colour, checkmark, emoji or
confetti. R5 holds: the `agreement_draw_ready` letter names no figure, and the
authority block is suppressed for the class (F8 is about that suppression being
one line too wide, not too narrow). The one word that reaches a real recipient
and should not is "Dashboard", in the sub's footer — F1.

**RC-1 partial (what this lane can be checked for)** — no raw token in any
`console.*` line; the send-mode 200 body omits `subject`/`html`, so the live link
appears in exactly one place, the email; `sendCompliantEmail` is called with no
`userId`, so `send-email.ts:391` skips the `notification_log` insert and the
token URL is never persisted.

**R13** — `loadAgreement`'s `select` omits `project_id`, `source_proposal_id`
and `sov_line_ids`; `TradeAgreementEmailParams` has no field that could carry
the client's name, the project name, the GMP, the schedule of values, a draw or
another sub's number. Two tests hold the line, one of them strong
(`index.test.ts:708`).

**Out of scope, correctly untouched** — no Stripe code, no
`create-checkout-session`, no `stripe-webhook` branch, no PDF, no new NestJS
service, no existing `_shared` file, no migration, no deploy.
