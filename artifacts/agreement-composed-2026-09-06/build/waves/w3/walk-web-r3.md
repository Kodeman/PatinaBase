# Wave 3 web walk — round 3

**Program** "The Agreement, Composed" · Wave 3 close-out
**Date** 2026-09-08
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
(`git rev-parse --show-toplevel` printed exactly that path)
**Branch** `agreement/w3-integration` · **head walked** `8a22b83f7daa9963392e75dd17ed0ece34b8c290`
**Stack** the program's local Supabase at `127.0.0.1:54322`, ledger head `00579 / 00578 / 00577`.
**Not reset** — the round-2 fix pass left it clean (no `design_build` proposal existed when
this walk began). No migration and no grants seed was touched, so `stack-notice.md` needs no
new entry from this walk.

**Verdict — ship.** No blocker and no major survives. Round 2's one blocker and its three
majors are fixed; twelve of round 2's eighteen findings are closed. What is left is nine
minors and nits, five of them already carried to the main backlog by ruling.

---

## 1 · How it was run

Both portals were booted with `nohup` from the integration worktree
(`web-walk/boot.sh`, which reads the anon and service-role keys from
`supabase status -o env`), driven over `localhost` (never `127.0.0.1`), in headless
Chromium through Playwright. Screenshots at 1280 and 390 into
`build/waves/w3/web-walk-shots-r3/`; throwaway scripts and their captured output in
`build/waves/w3/web-walk/` (`r3-*`).

```
NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live      # `auto` serves mock data on any thrown call
```

Both servers were confirmed to be reading the local stack before the first click
(`curl -s http://localhost:3000/ | grep -o '127.0.0.1:54321'` → a hit; same on 3002).

Accounts: `designer@patina.dev` (Leah Hartwell, the two-studio owner) and
`client@patina.dev` (the multi-house homeowner), both `password123`.

**Everything the walk left on the stack**

| What | Id |
|---|---|
| Turnkey prime, executed | `8cac8743-9b06-40ba-aeab-aa6a1829070b` |
| Project it created | `edf7b496-4d74-4485-b47d-66b1f101a84f` |
| Second turnkey prime, `sent` (the origin-door case) | `017aa560-b6e9-4892-90a6-c436e1f47ee5` |
| Turnkey draft, uncomposed (flag-off comparison) | `c32f3185-cd0a-4d08-a45d-094b85c160f1` |
| Services drafts | `b88e172c-…` (edited), `0b272d6d-…` (clean, flag comparison) |
| Trade agreement, signed | `f35ee37c-52e3-4074-90a2-d60505531933` |
| Rolodex contact seeded for step 16 | `studio_contacts c0000000-…-ca03` (Reyes Cabinetry) |

Two acts could not go through their real rail on this stack and were completed the way a
recorded event would, each in its own committed SQL file:

- **The till.** `/pay/<token>` renders and its chooser computes, but the checkout route
  answers `500 {"error":"stripe_not_configured"}` — no Stripe keys exist locally. The
  deposit was settled with `record_invoice_payment` (`web-walk/r3-settle-deposit.sql`).
- **The letters.** `proposal-send` and `trade-agreement-send` both return
  `RESEND_API_KEY environment variable is required`. The trade token was minted with
  `mint_trade_agreement_token` under a `service_role` claim, exactly as that function does
  (`web-walk/r3-mint-token.sql`).

---

## 2 · The sixteen steps

| # | Act | Result | Evidence |
|---|---|---|---|
| 1 | Contract Room, template picker before any attestation | **PASS**. Design-build turnkey listed, `disabled: true`, one-line reason *"Add your licensing attestation in Account → Studio before using this template."* with a link to `/desk?account=studio`. Nothing about a flag is visible. Its summary line names ten parts and **no longer names Flow-down** (W3R2-15 fixed). | `r3-01b-template-picker-locked.png`, `web-walk/r3-01-room-and-picker.mjs` output |
| 2 | Account → Studio, the Licensing card | **PASS**. Card order `BRANDING · BILLING · AGREEMENT DEFAULTS · AGREEMENT LIBRARY · LICENSING · MEMBERS`; the M7 fields in order; the annotation *"Patina stores this. Patina does not verify it."*; the 34-word disclaimer verbatim; no word count anywhere. | `r3-02a-account-studio-before.png`, `web-walk/r3-02-out.txt` |
| 3 | Save `WI Dwelling Contractor · 1234567 · WI · 2027-03-31` | **PASS**. Saves, re-renders as `ON FILE / WI Dwelling Contractor · 1234567 · WI` + `CURRENT THROUGH 2027-03-31`, and a fresh page re-reads all four values. SQL: one row in `studio_license_attestations`. | `r3-02c-attestation-saved.png`, `r3-02d-attestation-reread.png` |
| 4 | Select Design-build turnkey | **PASS**. Now enabled; `materialize_agreement_template` returned `10`; SELECT (not the UI) shows `proposals.document_kind = 'design_build'` and ten `proposal_agreement_parts` rows in M6's order, `patina.notice_of_cancellation` alone at `client_visible = false`. | `r3-03a-turnkey-rail.png`, `web-walk/r3-03-out.txt` |
| 5 | Pricing basis · cost-plus with GMP · 18% · seven cost lines | **PASS on the figures.** `COST BASIS $71,300.00 · FEE 18% · $12,834.00 · GMP $84,134.00`. The **pro-rated seven of the build sheet do not exist** — under open book the schedule of values is the cost lines at cost plus a fee line, under closed book it is studio-authored. That is R43, and the sheet's step 5 is stale (W3R2-18). Both modes total $84,134. | `r3-05a-step5-pricing-basis.png`, `r3-06a-sov-open-book.png` |
| 6 | Draws · 10/30/40/20 · retainage 5% | **PASS to the cent.** Gross `$8,413.40 / $25,240.20 / $33,653.60 / $16,826.80`, held `$0 / $1,262.01 / $1,682.68 / $841.34`, net `$8,413.40 / $23,978.19 / $31,970.92 / $15,985.46`, pinned `Final · retainage release $3,786.03`, `PAID ACROSS THE SCHEDULE $84,134.00`. The table states retainage **per draw**; the sheet's cumulative `$1,262.01 → $2,944.69 → $3,786.03` is derivable but not printed. | `r3-05b-step6-draws.png`, `r3-06b-draws.png` |
| 7 | Allowances `$4,000 / $3,500 / $2,800`, overage = change order | **PASS.** Seven cost lines before, seven after — the three allowance lines are adopted, never doubled (W3R1-03 holds). | `r3-05c-step7-allowances.png`, `r3-05d-step7-no-duplication.png` |
| 8 | Closed book + a supervision fee **and** a 15% markup | **Blocked, with a residue.** The rule is now named in three places — the page subtitle, the readiness rail (`3 OF 10 PARTS NEED ATTENTION` followed by the sentence) and both editors. `upsert_agreement_parts` refuses the save (`400 23514`) with the same sentence, so the draft cannot be saved or sent while it stands, and the room shows a red error box. **But** neither field carries an error state (`aria-invalid` is null on both `Fee percent` and `Markup on the trades percent`) and the room's `REVIEW & SEND` is still `disabled: false`. Clearing the markup returns `2 OF 10` and the sentence goes. → **W3R3-01**. | `r3-05e/f/g`, `r3-05h-send-sheet-while-red.png`, `r3-06c-step8-double-count.png` |
| 9 | The attachments strip | **PASS on the act, stale in the sheet.** `JURISDICTION NOTICES` lists all six states as `HELD FOR COUNSEL REVIEW`; the notice part sits on the rail chipped `HIDDEN FROM YOUR CLIENT` and cannot be attached; the lien waiver form is attachable and is attached. Because the notice is hidden, the waiver prints as **Attachment A**, not the sheet's Attachment B (W3R2-18). The draws panel prints its sentence **once** (W3R2-14 fixed). | `r3-09a-attachments-rail.png` |
| 10 | Send | **PASS.** Sheet reads *Send design-build agreement* / eyebrow `DESIGN-BUILD AGREEMENT` / *"Client User receives the price, the schedule of values, the draw schedule, the allowances, who is doing the work, and the terms."* with **no furnishings-deposit block** (W3R2-05 fixed). `send_commercial_document` → `200 {"documentKind":"design_build","commercialState":"sent"}`. SQL: `agreement_draw_invoices` holds **five** rows at the fixture cents. The email itself could not be rendered locally; `proposal-send/handler.ts:253,277,289` carries *"design-build agreement"* / eyebrow *"Design-build"* / *"Your design-build agreement is ready"*, pinned by `commercial-render.test.ts:63-65`. | `r3-09b-send-sheet.png`, `web-walk/r3-09-out.txt` |
| 11 | The homeowner reads the whole paper | **PASS.** Parts in the designer's order; `GUARANTEED MAXIMUM PRICE $84,134`; the schedule of values as the studio wrote it (`Construction $84,134 / The whole of it $84,134`) with **no cost lines and no fee** (R41/R43); allowances at their client amounts; the hidden Change orders clause is absent; `ATTACHMENT A · LIEN WAIVER FORM` a separate leaf with `I received this`. No sub prices, no bids. | `r3-10c-read-in-full.png`, `r3-50b-paper-in-full.png`, `r3-50c-paper-390.png` |
| 12 | Tick, type, sign | **PASS, asserted on the RPC.** The consent sentence names the design-build terms, the cost-plus basis and its GMP, the schedule of values, the draw schedule, the retainage and the countersignature condition — not the generic fallback. SQL: `commercial_state='client_signed'`; **one** signature row, `party_role='client'`, `metadata->>'via' = 'sign_design_services_agreement'`, and the sentence is frozen on the row in `metadata.consentSentence` (R40). | `r3-11a-sign-form.png`, `r3-11b-after-sign.png` |
| 13 | The post-signature region, then reload | **PASS — R50 lands.** Immediately: *"Open. It opened on your name."*, `KEEP A COPY`, *"Your deposit is ready — $8,413.40 / The first of five draws · due on signing"*, `PAY THE DEPOSIT`. **After a full reload every one of those still stands**, on this house and on both others. SQL: one invoice, `total_cents = 841340`, title `Deposit at signing`, `studio_id` stamped. Once the deposit is paid the offer is gone and the receipt remains — the offer is a row, not a memory. | `r3-11c-door-reloaded.png`, `r3-11d-door-reloaded-390.png`, `r3-13a-door-deposit-paid.png` |
| 14 | Pay on `/pay/<token>` | **Rail proven, settlement recorded.** The page renders the chooser and its arithmetic — bank transfer `$8,418.40 (+$5.00)`, card `$8,665.80 (+$252.40)`, check `$8,413.40` — and `A NOTE FROM LEAH: Design-build draw · Deposit at signing`. Checkout answers `500 stripe_not_configured` (no local keys) and the homeowner is shown the machine code → **W3R3-02**. Settled by `record_invoice_payment`: invoice `paid`, and `designer_earnings` carries one `design_fee` row, `gross 841340`, `paid`. | `r3-12c-pay-page.png`, `r3-12d-pay-clicked.png` |
| 15 | Countersign, then bill Rough-in | **PASS.** `countersign_design_services_agreement → 200`, project `edf7b496…`. SQL: one `project_commercial_documents` row, `document_kind='design_build'`, `is_origin=true`; exactly one active `project_billing_authorities` row with `billing_cadence='per_draw'` and a **NULL ceiling**. Rough-in issued at **`net_cents 2397819`** — `$23,978.19`, not `$25,240.20` — and `notification_log` carries `commercial_agreement_draw_ready`. | `r3-13c-countersigned.png`, `r3-17b-draw2-billed.png` |
| 16 | Trade Agreement → the sub's page → a lien waiver on draw 2 | **PASS.** `create_trade_agreement` 200, row reaches `sent`. `/trade/<token>` in a profile with **no Patina session** shows the sub's own scope, `$38,000`, schedule, retainage, pay-when-paid, insurance and waiver policy — and a full text-and-DOM sweep finds **no client name, no project, no GMP, no schedule of values, no other trade, no bid, no draw figure**. Press-and-hold signs once; a second load of the same URL shows the settled receipt and **no signable form** (R46). Back in the studio, `record_agreement_draw_lien_waiver → 200` and Rough-in reads `Marta Reyes · Conditional · progress` (R42 — the RPC, never an insert). The prime still holds exactly **two** signature rows, client and studio. | `r3-25c-trade-sent.png`, `r3-26a-trade-token.png`, `r3-26d-trade-signed.png`, `r3-26e-trade-second-load.png`, `r3-29b-waiver-recorded.png` |

**Notices.** All six rows in `agreement_jurisdiction_notices` carry `enabled = false`, and none
of their body text appears on any of the six surfaces captured
(`web-walk/r3-rendered-text.json`) — only their titles, in the studio's held-for-counsel panel.

---

## 3 · The added acts

**(e) R39 — hiding a part.** The hide act exists on clauses, lists and allowances and is
**absent from the pricing basis and the draw schedule** (0 acts inside those two editors;
R48's composer half). Hiding *Change orders* removed it from the studio's live preview and
from the homeowner's paper. Hiding a *fee* — a named, saved rate card on a design-services
agreement — moves readiness from `2 OF 9` to `3 OF 9` **with no sentence in the rail**; R33's
line, *"This fee is hidden from your client, so it cannot bill."*, appears only inside the send
sheet's `FINISH BEFORE SENDING` list, where `Send agreement` is correctly `disabled: true`.
→ **W3R3-03**. Shots `r3-06e`, `r3-42f-fee-hidden-readiness.png`, `r3-42g-fee-hidden-sheet.png`.

**(f) R30 carries.** The second origin agreement, sent to a household that already has a
house, stands on that house's door with the full signable paper and the acts
`READ IT IN FULL · ASK A QUESTION · REQUEST A CHANGE · DECLINE`. **Ask a question now posts
through `rpc_start_agreement_thread`** and the row it lands is `comms_threads` keyed
`proposal_id = 017aa560-…`, `project_id` NULL — R47 as written (W3R2-11 fixed). With
`list_client_proposals` aborted three times the door says *"Your papers could not be drawn
just now. Nothing on them has changed."* with a `TRY AGAIN` act, and never the empty state.
Shots `r3-39b-ask-sent.png`, `r3-34a-proposals-read-failed.png`.

**(a) Flag-off.** Three server boots, the same untouched documents read in each.

| Surface | `design-build:false` (parts + library on) | all three off |
|---|---|---|
| Design-services room | **Identical to Wave 2.** The only difference against flags-on is the string `Hidden from your client` — Wave 3's R39 act, correctly absent when the flag is off. | The **seven-facet room**, `4 of 7 facets written`, carrying R17's notice *"This agreement is composed from parts. It is edited in the Contract Room with parts on…"*, `Save agreement` **disabled**. |
| Turnkey room | Read-only and honest: *"This is a design-build agreement, and it does not open for you yet. Its parts are shown as they stand."*, each part *"This part opens in a later release. It stays on the agreement exactly as it is, and the client sees it in place."* | The seven-facet **design-services** form over a turnkey paper, with the preview still headed `DESIGN-BUILD AGREEMENT · V1` but showing empty services facets and no price. Inert — `Save agreement` and `REVIEW & SEND` both `disabled: true`. → **W3R3-04** |
| Homeowner's door | **`doorText` byte-identical** to flags-on; `doorHtml` differs only in Next's `self.__next_r` nonce and the webpack `?v=` stamp. | Same — text identical; the homeowner keeps her parts. |

Shots `r3-51-{dboff,alloff,on2}-{services-room,turnkey-room,door}.png`,
`r3-52-alloff-*.png`; captures `r3-cap2-*.json`.

**(b) Account → Studio.** Billing (card fee, remit-to), Agreement defaults (rate card,
furnishings deposit, cadence, retainer credit rule, exclusions) and the Agreement Library
(four Patina templates, an empty Parts shelf with its own sentence) render with their Wave 2
fields and no new controls. Licensing saves and re-reads (step 3 above).

**(c) Vocabulary.** Six rendered surfaces swept — the turnkey room in draft and at executed,
Account → Studio, the homeowner's door, her paper in full, and `/trade/[token]`
(`web-walk/r3-34-vocab-out.txt`). Clean of *variant*, *clause library*, *contract builder*,
bare *AI*, snake_case, SCREAMING keys, ruling ids, emoji and checkmarks — **except one `✓`**
in Account → Studio's setup checklist (W3R2-13, carried to the backlog by ruling). Homeowner
copy carries no *gate*, *task*, *dashboard* or *overdue*. The disclaimer is verbatim and no
word count appears. The one machine token found anywhere in reader-facing copy is
`stripe_not_configured` on the till (W3R3-02) — that surface was not in round 2's sweep.

**(d) axe-core 4.11.1, wcag2a/2aa/21a/21aa.**

| Surface | Violations |
|---|---|
| Turnkey Contract Room | 2 — `color-contrast` (serious, 1 node: the aged-oak *"The client's copy · live"* label) and `meta-viewport` (moderate: `maximum-scale=1`). Unchanged from round 2; carried to the backlog by ruling. |
| Homeowner's door | **0** |
| `/trade/[token]` | **0** |

`web-walk/r3-33-axe-out.txt`; shots `r3-32a/b/c`.

---

## 4 · Round 2's eighteen, re-verified

| Round-2 id | Now | Evidence |
|---|---|---|
| **W3R2-01** blocker · a turnkey paper sent with no price | **FIXED (R48).** No hide act exists inside the pricing-basis or draw-schedule editors; the refusal text *"your client signs the price and the draws, so … cannot be hidden from her"* is in both `upsert_agreement_parts` and `send_commercial_document`; the paper the homeowner signed names `$84,134` in its header, its body and its closing sentence, and her consent sentence names the guaranteed maximum price. | `r3-06f-preview-closed-book.png`, `r3-10c-read-in-full.png` |
| **W3R2-02** major · the receipt dies on reload | **FIXED (R50).** Receipt, deposit offer and pay link all survive a full reload, on every house; a paid deposit stops being an offer. | `r3-11c`, `r3-13a` |
| **W3R2-03** major · preview and paper disagree | **FIXED (R51).** Under closed book the preview prints the GMP and the studio-authored schedule of values and nothing else — the same reading the door gives. | `r3-06f`, `r3-10c` |
| **W3R2-04** major · the no-double-count rule names nothing | **Substantially fixed (R49); a residue remains** — see W3R3-01. | `r3-06c`, `r3-05h` |
| **W3R2-05** minor · services copy on a turnkey send sheet | **FIXED.** | `r3-09b-send-sheet.png` |
| **W3R2-06** minor · design-services chrome, stale title | **Half fixed.** Chrome is right (`THE CONTRACT ROOM · DESIGN-BUILD AGREEMENT`, `YES TO THE STUDIO · DESIGN AND CONSTRUCTION`). The rename affordance was not built, and the title now reaches further than the footer — see W3R3-05. | `r3-03a`, `r3-30a` |
| **W3R2-07** minor · contradictory chips at `client_signed` | **NOT fixed.** `/doc/8cac8743…` shows `V1 · AWAITING SIGNATURE` and `Sent Sep 8 · not opened` beside `CLIENT SIGNED` / `AWAITING COUNTERSIGN`. The rulings file lists it as fixed; the wave report lists it as not — see W3R3-06. | `r3-13b-doc-client-signed.png` |
| **W3R2-08** minor · axe | **NOT fixed**, carried to the backlog by ruling. | §3(d) |
| **W3R2-09** minor · an env-var name in the studio's face | **FIXED.** *"The agreement is recorded. The message could not be sent. Try again."* — and the row had genuinely reached `sent`, so both halves are true. | `r3-25c-trade-sent.png` |
| **W3R2-10** minor · no route back to the executed text | **NOT fixed**, carried to the backlog by ruling. `THE PAPERS, IN FULL` now names it (`WHAT YOU HAVE SIGNED / INSTRUMENT · SIGNED 8 SEPTEMBER`) but a full anchor-and-button dump of the door carries no route into its body. | `r3-30c-papers-in-full.png` |
| **W3R2-11** minor · the question thread is not keyed | **FIXED (R47).** | §3(f) |
| **W3R2-12** minor · the deposit filed outside its project | **Fixed in the row and on her door**, open on his — see W3R3-07. `invoices.project_id = edf7b496…`; the homeowner's `EARLIER INVOICES` now reads `INV-0001 · $8,413 · paid September 8` with no *"not for a house"*. | `r3-31a-earlier-invoices.png` |
| **W3R2-13** nit · one `✓` in the checklist | **NOT fixed**, carried by ruling. | §3(c) |
| **W3R2-14** nit · duplicate placeholder | **FIXED.** | `r3-09a` |
| **W3R2-15** nit · the picker names Flow-down | **FIXED.** | `r3-01b` |
| **W3R2-16** nit · a revoked link 404s with status 200 | **NOT fixed.** A token minted and then revoked unspent, and a nonsense token, both render the 404 page at **HTTP 200** (`curl -o /dev/null -w %{http_code}` → `200` for both). The rulings file lists it as fixed; the wave report as not — see W3R3-06. | `r3-28-revoked-unspent.png`, `r3-28-nonsense.png` |
| **W3R2-17** nit · a warning and "every facet is present" together | **FIXED.** With the allowance warning standing, the sheet prints the warning and **no** ready line; with readiness clean it prints the ready line and no warning. | `r3-40b-send-sheet-warning.png`, `r3-09b-send-sheet.png` |
| **W3R2-18** nit · build-sheet §8 drift | **Documented, not amended.** Steps 5, 9, 13 and 16 in `build-sheet.md` still describe behaviour the rulings superseded. The ruling carried this to the wave report, which records it; the sheet itself is unchanged. | §2 rows 5, 9, 16 |

---

## 5 · Findings from this round

### W3R3-01 · minor · the no-double-count rule is named everywhere but the two fields, and the act that it blocks still presents as available

`apps/designer-portal/src/components/document/rooms/drafting/agreement/turnkey/pricing-basis-editor.tsx`

R49 landed the naming: the sentence now stands in the readiness rail (`3 OF 10 PARTS NEED
ATTENTION` + the sentence), under the page title, and inside both editors, and it clears when
the markup clears. Build-sheet §4.3 also asks for **both fields in an error state**, and
neither has one — `aria-invalid` is null on `Fee percent` and on `Markup on the trades
percent`. The room's `[data-action-key="review-design-agreement"]` reports
`disabled: false, aria-disabled: null`; pressing it saves first, `upsert_agreement_parts`
answers `400 {"code":"23514", …}` with the same sentence, and the studio gets a red **Error**
box while the send sheet never opens. So the send is genuinely blocked — by a refused save
rather than by an unavailable act — and a draft in this state cannot be persisted at all.
Shots `r3-05e-step8-pricing-double-count.png`, `r3-05g-step8-readiness.png`,
`r3-05h-send-sheet-while-red.png`, `r3-06c-step8-double-count.png`; log `web-walk/r3-06-out.txt`.

**Fix** — put the error state on both fields, and either disable Review & send on
`!readiness.ready` or let the sheet open and hold its own gate, as the hidden-fee rule does.

### W3R3-02 · minor · the till prints a machine code into the homeowner's face

`apps/client-portal/src/app/pay/[token]/…`

Pressing `Pay $8,418.40` when the checkout route fails renders, in a `role="alert"`:
*"Unable to open the payment page just now. Try again in a moment. (stripe_not_configured)"*.
The sentence before the parenthesis is right; the parenthesis is a provider error key. Same
class as W3R2-09, which this round fixed on the studio side. Local-only cause, but the string
is composed for any failure the route returns. Shot `r3-12d-pay-clicked.png`; log
`web-walk/r3-12-out.txt`.

**Fix** — keep the code in the log; end the homeowner's sentence at *"Try again in a moment."*

### W3R3-03 · minor · a hidden fee moves the readiness count without saying why

`apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts`

With a named, saved rate card visible, readiness reads `2 OF 9 PARTS NEED ATTENTION` and one
advisory sentence. Ticking *Hidden from your client* on it moves the count to `3 OF 9` and
**adds no sentence** — the rail is silent about the reason. R33's line, *"This fee is hidden
from your client, so it cannot bill."*, is present and correct one layer down, in the send
sheet's `FINISH BEFORE SENDING` list, where `Send agreement` is `disabled: true`. This is
W3R2-04's shape surviving in the rule R49 did not touch. Shots
`r3-42f-fee-hidden-readiness.png`, `r3-42g-fee-hidden-sheet.png`; log `web-walk/r3-42d-out.txt`.

**Fix** — file the hidden-fee sentence against the rail the way R49 filed the double count.

### W3R3-04 · minor · with all three flags off a turnkey document opens a design-services form

`apps/designer-portal/src/components/document/rooms/drafting/…`

Under `agreement-parts:false, agreement-library:false, design-build:false`, the turnkey draft
`c32f3185…` renders the seven-facet room — *01 Services & deliverables*, *03 Role rates*,
*04 Rates & ceiling*, *05 Retainer*, *06 Billing cadence* — over a document whose ten parts
are the price, the draws and the trades, and the live preview keeps the header
`DESIGN-BUILD AGREEMENT · V1` while printing *"Services have not been written yet"*,
`DESIGN AUTHORIZATION CEILING Not yet set` and no price at all. Nothing can be written from
it — `Save agreement` and `REVIEW & SEND` are both `disabled: true`, and R17's notice is shown
— so no data is at risk; it is the reading that is wrong. With `agreement-parts` on and
`design-build` off (the state a Wave-3-only rollback produces) the same document says the
right thing instead: *"This is a design-build agreement, and it does not open for you yet."*
Shots `r3-51-alloff-turnkey-room.png`, `r3-52-alloff-turnkey-draft.png`,
`r3-51-dboff-turnkey-room.png`; log `web-walk/r3-52-out.txt`.

**Fix** — key the flag-off notice off `document_kind` rather than off the parts flag, so a
turnkey paper reads the same sentence whichever flags are down.

### W3R3-05 · minor · the countersigned house is named after the document

`apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx`

The rename affordance W3R2-06 asked for was not built, and the stale title now travels
further than the keepsake footer: countersign creates the project from
`proposals.title`, so the homeowner's door heads her new house **"Client User — design
services agreement"** and lists it beside *Birch Hollow*, *Marrow & Vale Residence* and
*Aspen Loft Refresh*. The same words are the paper's footer
(`CLIENT USER — DESIGN SERVICES AGREEMENT · V1`), every `notification_log` message, and — per
`proposal-send/handler.ts` — the email subject, which would read *sent you a design-build
agreement: "Client User — design services agreement"*. Shots `r3-30a-door-executed.png`,
`r3-30b-door-executed-390.png`, `r3-10c-read-in-full.png`.

**Fix** — the rename act, as the wave report already scopes it; until it exists, the drafting
flow's default title should not say *design services* on a turnkey document.

### W3R3-06 · nit · the rulings file and the wave report disagree about two fixes

`artifacts/agreement-composed-2026-09-06/build/rulings-2026-09-06.md:97`

The "Minors fixed with this round" line names **W3R2-07** (contradictory chips) and
**W3R2-16** (a revoked link returns 404) among the fixes. `wave-report.md`'s "Not fixed in
this pass" section names both, with reasons. This walk confirms the wave report: both
behaviours are unchanged. A reader of the rulings file alone would believe them closed.

**Fix** — move both to the carried list in the rulings file, or say in that line which fixes
landed and which were scoped out.

### W3R3-07 · nit · the adopted deposit is invisible on the studio's project

`apps/designer-portal/src/components/document/…/money`

R52's row landed: `invoices.project_id` for `INV-0001` is the new project, and the
homeowner's `EARLIER INVOICES` now files it under the house. The studio's project document
still does not: **Money** reads `$23,978 out` and the margin's `THE WHOLE JOB · 1` lists only
`MONEY · SENT / INV-0002 · Design-build draw · Rough-in`. The paid deposit that opened the
job appears nowhere on the project page. Possibly the Money region is outstanding-only by
design — recorded at low confidence for that reason. Shot `r3-30d-project-money.png`;
SELECT in `walk-web-r3.md` §2 row 15.

---

## 6 · Housekeeping

- Both dev servers started by this walk (the last pair, tag `r3on2`) were stopped at the end;
  ports 3000 and 3002 were free afterwards.
- No production mutation of any kind. Nothing pushed. No worktree created or removed.
- No product code was written. No `.env`, `.claude/`, `.agents/`, hook or setting was touched.
- The stack was **not** reset and no migration or grants seed changed, so `stack-notice.md`
  carries no new entry from this walk. What the walk left on the stack is listed in §1 — one
  executed turnkey project, one sent origin agreement, three drafts, one signed trade
  agreement and one seeded rolodex contact.
