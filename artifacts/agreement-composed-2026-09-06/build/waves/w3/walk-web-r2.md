# The web walk, round 2 — "The Agreement, Composed", Wave 3 (turnkey)

Walked 2026-09-08 by the Wave 3 web walker, in a real headless Chromium, against
the **local** stack, from the integration worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
(branch `agreement/w3-integration`, HEAD `77f90a8b7c466b4112e1da67030a1acab8d6ded1`).

- `git -C … rev-parse --show-toplevel` →
  `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
- Ledger head probed before the first click and unchanged after: `00579, 00578, 00577`.
- **No `supabase db reset` was run.** Docker and the stack were down when this
  walk started (every container `Exited … 6 hours ago`); `supabase start
  --workdir <integration worktree>` restored the same volumes ("Starting
  database from backup"), so round 1's and the earlier round-2 attempt's rows
  were still on it. See `stack-notice.md` for what this walk left behind and for
  the one row it deleted to restore step 1's precondition.
- Portals booted with `web-walk/boot.sh` (nohup, both from the integration
  worktree), driven over `localhost`, three flag sets:
  `agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true`
  (tags `r2b`, `r2c`), `design-build:false` (`dboff2`), all three off (`alloff2`).
  Both ports confirmed serving `127.0.0.1:54321`. Every server this walk started
  was killed at the end; 3000 and 3002 confirmed clear.
- Accounts: `designer@patina.dev` / `client@patina.dev`, `password123`.
- Scripts under `web-walk/` (`rb-*.mjs` new this round; `r2-*.mjs` reused and
  re-run, their outputs in `web-walk/r2b-*.txt`). Screenshots at 1280 and 390 in
  `web-walk-shots-r2/`.

Two local limits, neither the branch's fault, both stated where they bite:
`RESEND_API_KEY` is unset, so every email (`proposal-send`,
`trade-agreement-send`, the notification rail) fails at dispatch; and Stripe is
unconfigured, so `/pay/<token>` cannot settle a card. The deposit was settled
through `record_invoice_payment` instead (`web-walk/rb-settle-deposit.sql`).

---

## 1 · The sixteen steps

| # | Result | Evidence |
|---|---|---|
| 1 | **pass** | Template picker lists **Design-build turnkey** `disabled: true` with one line — *"Add your licensing attestation in Account → Studio before using this template."* — and a link to `/desk?account=studio`. Nothing about a flag. `r2-01b-template-picker-locked.png`, `r2b`-run picker dump. |
| 2 | **pass** | Account → Studio headings in order: STATUS · BRANDING · BILLING · AGREEMENT DEFAULTS · AGREEMENT LIBRARY · **LICENSING** · MEMBERS. M7 fields in order; the 34-word disclaimer verbatim (`verbatim on Account → Studio: true`); "Patina stores this. Patina does not verify it."; no word count anywhere (`/\d{1,3}[- ]word/` → false). `r2-02a-account-studio-before.png`. |
| 3 | **pass** | `WI Dwelling Contractor · 1234567 · WI · 2027-03-31` saved; re-read in a fresh page returns all four values; card then reads "ON FILE … Your attestation is on file." `r2-02b/c/d`, `r2-02e-…-390.png`. *(The non-admin read-only half was not walked — no seeded plain member of this studio exists.)* |
| 4 | **pass** | Picker row now enabled; `materialize_agreement_template → 10`; `SELECT document_kind` → `design_build`; ten parts in M6 order, `patina.notice_of_cancellation` at position 9 with `client_visible=false`. `r2-03a-turnkey-rail.png`. |
| 5 | **pass** | Chips `COST BASIS $71,300.00 · FEE 18% · $12,834.00 · GMP $84,134.00`. Open-book SOV renders the seven cost lines at cost plus `Fee · 18% $12,834.00` and `GMP $84,134.00` (R43). `r2-05a`, `r2-06a-sov-open-book.png`. |
| 6 | **pass** | Draws table and, after send, `agreement_draw_invoices`: gross `841340/2524020/3365360/1682680`, held `0/126201/168268/84134`, net `841340/2397819/3197092/1598546`, release `378603`; net sum `8413400`. `r2-05b`, `r2-06b-draws.png`. |
| 7 | **pass — W3R1-03 fixed** | Naming the three allowances left the pricing basis at **seven** cost lines and the chips unmoved (`cost lines BEFORE allowances: 0  AFTER: 7`, labels unchanged). `r2-05c`, `r2-05d-step7-no-duplication.png`. |
| 8 | **fail (major, carried)** | §4.3's copy prints on **Supervision only**; the markup field carries nothing; readiness moved 2→3 and printed no sentence; `[data-action-key="review-design-agreement"]` reported `disabled: false`, `aria-disabled: null`. See W3R2-04. `r2-06c`, `r2-06d`, `r2-06e`. |
| 9 | **pass, with a lettering drift** | Six jurisdiction notices listed greyed, "HELD FOR COUNSEL REVIEW", `data-notice-held="true"`, none attachable; `agreement_jurisdiction_notices` all `enabled=f`; none on any rendered homeowner page. Because W3R1-06's fix makes the notice part client-invisible, the lien waiver is now **Attachment A** on the paper, not B. `r2-09a-attachments-rail.png`. |
| 10 | **pass** | `send_commercial_document → 200`, `documentKind: design_build`, `commercialState: sent`; five `agreement_draw_invoices` rows. Subject/eyebrow could not be delivered locally; read in code instead — `proposal-send/handler.ts:246-278` gives `… sent you a design-build agreement: "<title>"` and eyebrow `Design-build`. `r2-09c-after-send.png`. |
| 11 | **pass** | Parts in the designer's order; closed-book paper prints the studio's own line (`Construction $84,134`) and **no cost basis, no fee** (R41/R43); allowances with the change-order rule; sub identities, no sub prices, no bids; the lien waiver as a lettered leaf with "I received this". `r2-10a-door.png`, `r2-10b-door-390.png`, `r2-10c-read-in-full.png`. |
| 12 | **pass** | Consent sentence is the composed one, not the fallback: *"I agree to these design-build terms, the cost-plus pricing basis and its guaranteed maximum price, the schedule of values, the draw schedule, the retainage withheld from each draw, and the allowances…"*. `SELECT` → `commercial_state='client_signed'`, one signature row, `party_role='client'`, `metadata->>'via' = 'sign_design_services_agreement'` — the RPC, asserted, not the 200. `r2-11a`, `r2-11b-after-sign.png`. |
| 13 | **partial (major)** | The offer inks correctly — *"Your deposit is ready — $8,413.40 / The first of five draws · due on signing"* + PAY THE DEPOSIT. `invoices` → INV-0003, `total_cents 841340`, title "Deposit at signing", `studio_id` stamped, `project_id` NULL. **On reload the whole post-signature region is gone.** See W3R2-02. `r2-11b` vs `r2-11c/r2-11d-door-reloaded-390.png`. |
| 14 | **pass on the page, not settled through Stripe** | `/pay/<token>` renders the method chooser with the live method total (`Bank transfer $8,418.40 · Card $8,665.80 · Mail a check $8,413.40`). The click returned `500 stripe_not_configured` and the page said so in a `role="alert"` and re-enabled the button — **W3R1-07 fixed**. Payment then recorded through `record_invoice_payment`: invoice `paid`, `amount_paid_cents 841340`, and `designer_earnings` carries one `design_fee` row, gross/net `841340`, `paid`. `r2-12c-pay-page.png`, `r2-12d-pay-clicked.png`. |
| 15 | **pass** | `countersign_design_services_agreement → 200`, project `f3fec788…`. `project_commercial_documents`: one row, `design_build`, `is_origin=true`. `project_billing_authorities`: exactly one `active` row, `billing_cadence='per_draw'`, `billing_ceiling_cents` NULL, `effective_at` today. Snapshot hash = studio signature fingerprint (`t`). Rough-in issued at **$23,978.19** net (`issue_agreement_draw_invoice` → `netCents 2397819`, `retainageCents 126201`, a `payToken`), INV-0004; `notification_log` carries `commercial_agreement_draw_ready` (`document_kind: design_build`), failing only at Resend. `r2-15a`, `r2-16a-room-executed.png`, `r2-17b-draw2-billed.png`. |
| 16 | **pass** | Trade Agreement composed from the room, `create_trade_agreement → 200`, `send_trade_agreement` committed (`state=sent`); token minted through `mint_trade_agreement_token` (service_role only — `authenticated` and `postgres` are both refused, correctly). The sub's `/trade/<token>` loads with **no session**: their scope, their `$38,000`, retainage, pay-when-paid, insurance, waiver policy — and no client name, no project name, no GMP, no schedule of values, no other trade, no bid (`DOM mentions "bid": false`; the only "draw" hit is the word *drawings* inside the scope I typed). Signed once; the same URL a second time shows the settled receipt and **no signable form** (R46). Conditional-progress waiver recorded against draw 2 through `record_agreement_draw_lien_waiver` (R42); the rail shows "Rough-in · $23,978.19 · Marta Reyes · Conditional · progress". `commercial_document_signatures` for the prime still holds exactly two rows, client and studio. `r2-25c`, `r2-26a/b/d/e`, `r2-28b-waiver-recorded.png`. |

Step 16's last homeowner clause is **not** met: her door shows draw 2 as billed
(INV-0004 in the letterbox, with `OPEN THE INVOICE → /pay/<token>`), but nothing
anywhere on her surfaces says a waiver was received (`door names a waiver: false`).

## 2 · The added checks

**(e) R39 — the visibility act.** The toggle is a checkbox in a label,
"Hidden from your client". Hiding a clause works exactly as ruled: the rail row
reads `HIDDEN FROM YOUR CLIENT`, the live client copy loses the heading and the
body (`preview still names "Change orders": false`), and the state survives save
(`upsert_agreement_parts → 200`). Hiding the **fee** does not: readiness stayed
`0 OF 10 PARTS NEED ATTENTION`, named nothing, and let the agreement go. That is
W3R2-01, below. `r2-08a/b/c`.

**(f) R30 carries.** The origin door offers **ASK A QUESTION** (`true`). A failed
`list_client_proposals` read (3 aborts) now renders *"Your papers could not be
drawn just now. Nothing on them has changed."* with a `TRY AGAIN` button, and the
empty-state sentence is suppressed (`SAYS-EMPTY: false`) — **W3R1-05 fixed**.
`r2-34a-proposals-read-failed.png`.

**(a) Flag-off.** With `design-build:false`: the homeowner's door is
**byte-identical** in rendered text to the flag-on capture, and the design-services
room differs only by the R39 checkbox the flag withdraws. The turnkey draft says
*"This is a design-build agreement, and it does not open for you yet. Its parts
are shown as they stand."*, `REVIEW & SEND` is `disabled: true`, zero editable
controls, and no raw variant key appears (`SCREAMING_KEYS: null`) — **W3R1-08
fixed**. With all three off: both rooms fall back to today's seven facets
(`01 Services & deliverables … 07 Terms`) with an honest note that the document is
composed from parts, and the door is identical to the `design-build:false` door.
`r2-36-{on,dboff,alloff}-*.png`, `r2-37-dboff-turnkey-room.png`.

**(b) Account → Studio.** Licensing saves and re-reads (step 3). Billing,
Agreement defaults and Agreement Library render as Wave 2 shipped; the Library's
Templates list now also carries "Design-build turnkey", which is this wave.

**(c) Vocabulary.** Rendered-text grep over the turnkey room (draft), the room at
executed, Account → Studio, the homeowner's door, her paper in full, and
`/trade/<token>`: clean of "clause library", "contract builder", `variant`, bare
"AI", snake_case, SCREAMING_KEYS, ruling ids and emoji everywhere **except** one
`✓` in Account → Studio's setup checklist (W3R1-13, carried). Homeowner surfaces
carry no "gate", "task", "dashboard" or "overdue". The disclaimer is verbatim and
no word count is rendered.

**(d) axe** (axe-core 4.11.1, wcag2a/2aa/21a/21aa): turnkey room — `color-contrast`
(serious, 1 node, the aged-oak "The client's copy · live" label) and `meta-viewport`
(moderate, `maximum-scale=1`); homeowner's door — **0**; `/trade/[token]` — **0**.

## 3 · Round-1 findings, re-verified

| id | verdict |
|---|---|
| W3R1-01 room redirects at `client_signed`, no ledger | **fixed** — the room stays, frozen ("This agreement has left the studio. Its parts are fixed as sent."), and carries the draw ledger, the lien-waiver rail and Trade Agreements. |
| W3R1-02 signed houseless prime vanishes on reload | **half fixed** — the paper now stands on every house (`signed prime here: true` on two other houses, and under THE PAPERS / WHAT YOU HAVE SIGNED). The **offer and the receipt do not** → W3R2-02. |
| W3R1-03 allowance duplicates its cost line | **fixed**. |
| W3R1-04 studio preview ≠ homeowner's paper | **half fixed** — the preview is now the design-build body, but under closed-book it still prints the cost basis and the fee the homeowner never sees → W3R2-03. |
| W3R1-05 failed read shows the empty state | **fixed**. |
| W3R1-06 blank Attachment A attested | **fixed** — seeded `clientVisible: false`; the rail row reads HIDDEN FROM YOUR CLIENT; the door's tick is "I received Lien waiver form." |
| W3R1-07 Pay button fails silently | **fixed**. |
| W3R1-08 flag-off turnkey draft claims it was sent | **fixed**. |
| W3R1-09 send sheet describes a design-services agreement | **not fixed** → W3R2-05. |
| W3R1-10 turnkey room keeps design-services chrome; stale title on the keepsake | **not fixed** → W3R2-06. |
| W3R1-11 no-double-count on one field, send not gated | **not fixed** → W3R2-04. |
| W3R1-12 axe contrast + meta-viewport | **not fixed** → W3R2-08. |
| W3R1-13 ✓ in Account → Studio | **not fixed** (one glyph now, not two) → W3R2-13. |
| W3R1-14 draws placeholder printed twice | **not fixed** → W3R2-14. |
| W3R1-15 contradictory chips at `client_signed` | **not fixed** → W3R2-07. |
| W3R1-16 picker names Flow-down | **not fixed** → W3R2-15. |
| W3R1-17 build-sheet §8 drift | **not fixed** → W3R2-16. |

## 4 · Findings

### W3R2-01 · blocker · a turnkey agreement can be sent with its price hidden from the homeowner

Hiding the pricing-basis part (R39's own act, one checkbox) removes the
guaranteed maximum price, the schedule of values, the cost basis and the fee from
the copy the homeowner reads — and nothing refuses. Readiness stayed
`0 OF 10 PARTS NEED ATTENTION`, the send sheet said *"Ready to send · every
contractual facet is present."*, and `send_commercial_document` returned **200**
(`documentKind: design_build`, `commercialState: sent`).

The paper she is then asked to sign carries a draw schedule whose rows read
"$8,413.40 **OF THE PRICE** · NOT YET BILLED" and closes with "This agreement
covers the work described above, **at the price shown**" — with no price shown
anywhere on it (`paper names a GMP: false`, `paper names $84,134: false`).

Mechanism, both halves:
- `readiness.ts:78` — `FEE_VARIANTS = ["rate_card", "flat", "per_phase"]`, so
  R33's `HIDDEN_FEE_BLOCKER` (`readiness.ts:97`, "This fee is hidden from your
  client, so it cannot bill.") can never fire for a design-build agreement,
  whose money part is `variant = 'pricing_basis'`.
- `00578_design_build_kind.sql:1552-1568` — `_agreement_design_build_part` reads
  the part with **no `client_visible` filter**, so `send_commercial_document`
  validates a pricing basis, and a draw schedule that sums to it, that the
  homeowner's projection has already dropped.

Evidence: `web-walk/rb-35-hidden-price-send.mjs`, `web-walk/r2b-37-out.txt`;
`web-walk-shots-r2/rb-35a-price-hidden.png`,
`rb-35b-send-sheet-price-hidden.png`, `rb-36a-door-priceless.png`,
`rb-36b-paper-priceless.png`. Proposal `de3970a0-de56-4e0f-9c02-421e870d9dcf` is
on the stack in exactly this state.

Fix: give the turnkey floor the same reading R33 gives a fee — a hidden
`pricing_basis` is a blocker in readiness and a refusal in
`send_commercial_document` (read the part through the client-visible projection,
or refuse when the projection has no contract sum).

### W3R2-02 · major · the deposit offer and the receipt do not survive a reload

Immediately after signing, the door reads "Open. It opened on your name.",
KEEP A COPY, "Your deposit is ready — $8,413.40 · The first of five draws · due
on signing" with PAY THE DEPOSIT, and an honest pending-delivery retry. Reload
and all of it is gone: "Nothing waits for your name. A balance of $32,392 stands
open.", the letterbox shows the project's INV-0004 only, and
`door mentions the deposit: false`, `door mentions $8,413.40: false` — on this
house and on both other houses. Build-sheet step 13 is explicit: *"reload the
door: the signature still stands, the offer is still there"*.

The money is not lost — two levels down, EARLIER INVOICES lists
"INV-0003 · $8,413 · due September 8 · from the studio · **not for a house**"
with SETTLE THIS BALANCE — which is why this is major and not a blocker.

The round-1 fix (`5e90b5784`) taught `accepted` the houseless rule for the
*receipt row*; the post-signature region itself is still the in-memory
`sealedDoors` state, so it dies with the page.

Evidence: `r2-11b-after-sign.png` vs `r2-11c-door-reloaded.png` /
`r2-11d-door-reloaded-390.png`; `rb-13-earlier-invoices.png`;
`web-walk/r2b-11-out.txt`, `r2b-12-out.txt`.

### W3R2-03 · major · under closed-book the studio's preview shows the cost basis and fee the homeowner never sees

Same document, minutes apart. Studio, "THE CLIENT'S COPY · LIVE" and the `/doc`
preview: `Cost basis $71,300 · Fee 18% $12,834 · GUARANTEED MAXIMUM PRICE
$84,134`. Homeowner, the same paper in full: `GUARANTEED MAXIMUM PRICE $84,134`
and nothing else — no cost basis, no fee line. The door is right (R41); the
preview is wrong, and R27 requires the two to be one body so the first composed
agreement cannot drift. A studio that switches to closed-book precisely to keep
its costs off the paper is shown its costs still on it.

Evidence: `r2-09a-attachments-rail.png` and `r2-13b-doc-client-signed.png`
(studio) against `r2-10c-read-in-full.png` (homeowner);
`web-walk/r2b-09-out.txt` vs `r2b-10-out.txt`.

### W3R2-04 · major · the no-double-count refusal fires on one field, names nothing in readiness, and does not gate the send

With a $2,500 supervision fee **and** a 15% trade markup: the Supervision part
prints §4.3's copy (twice — the sentence and its aside); the pricing basis'
markup field carries nothing; the readiness rail moves `2 OF 10` → `3 OF 10` and
prints no sentence; `[data-action-key="review-design-agreement"]` is
`disabled: false`, `aria-disabled: null`. Build-sheet §4.3 wants both fields in
an error state and step 8 wants the send button unavailable. (Unchanged from
W3R1-11; `upsert_agreement_parts` / `send_commercial_document` were not reached
in this state, so the load-bearing refusal is still unproven either way.)

Evidence: `r2-06c-step8-pricing-double-count.png`,
`r2-06d-step8-supervision-double-count.png`, `r2-06e-step8-readiness.png`,
`web-walk/r2b-06-out.txt`.

### W3R2-05 · minor · the send sheet describes a design-services agreement on a turnkey document

"Client User receives the services, rates, retainer policy, billing cadence,
ceiling, and terms", plus a FURNISHINGS DEPOSIT block reading "No furnishings
deposit set — authorizations will default to 50%.", over a document whose ten
parts are the pricing basis, the draws, the allowances, the sub disclosure,
supervision, change orders, termination, terms and two attachments. The eyebrow
reads YES TO THE DESIGNER.

Evidence: `r2-09b-send-sheet.png`, `rb-35b-send-sheet-price-hidden.png`.

### W3R2-06 · minor · the turnkey room keeps design-services chrome, and the stale title reaches the keepsake

Header "THE CONTRACT ROOM · DESIGN AGREEMENT", eyebrow "YES TO THE DESIGNER ·
PROFESSIONAL SERVICES ONLY", subtitle "Compose the parts this agreement is made
of. Furnishings and purchasing stay outside it." — on a design-build engagement.
The title minted at draft time is never revisited and there is no rename
affordance, so the homeowner's paper foots
`CLIENT USER — DESIGN SERVICES AGREEMENT · V1` on a design-build agreement, and
every notification subject carries the same words.

Evidence: `r2-36-on-turnkey-room.png`, `r2-13a-room-client-signed.png`,
`r2-10c-read-in-full.png` (footer), `notification_log` subjects.

### W3R2-07 · minor · contradictory chips at `client_signed`

`/doc/<id>` shows "V1 · AWAITING SIGNATURE" and "Sent Sep 8 · not opened" beside
"CLIENT SIGNED" and "AWAITING COUNTERSIGN". The homeowner had opened and signed
it minutes before. Evidence: `r2-13b-doc-client-signed.png`.

### W3R2-08 · minor · axe on the designer portal

`color-contrast`, impact serious, 1 node —
`<p class="… text-[var(--color-aged-oak)]">The client's copy · live</p>`; and
`meta-viewport`, impact moderate — `maximum-scale=1` portal-wide. Homeowner's
door and `/trade/[token]`: zero violations.
Evidence: `web-walk/r2b-35-axe.txt`, `r2-32a/b/c`.

### W3R2-09 · minor · the studio is shown a raw environment-variable name when a trade send fails

`trade-agreement-send` returned 502 and the composer printed
`RESEND_API_KEY environment variable is required` into the sheet, under the
form. The failure itself is local; the sentence is not. (The row still reached
`state='sent'` — the RPC commits and only the dispatch fails, which is the right
shape, but the studio is told nothing true about it.)
Evidence: `r2-25c-trade-sent.png`, `web-walk/r2b-25-out.txt`.

### W3R2-10 · minor · after execution the homeowner has no route back to the agreement's text

Before signing, READ IT IN FULL; at the moment of signing, KEEP A COPY. After
execution the door lists the paper twice — "Previously · Design-build agreement
… SIGNED" and, under THE PAPERS, IN FULL, "WHAT YOU HAVE SIGNED / INSTRUMENT ·
SIGNED 8 SEPTEMBER" — and neither is a link to its body; the only anchors are
`#previously` and `#letterbox`, and the only print route is the invoice's. The
copy she was promised ("You'll have a copy") is not reachable from her door.
This is likely the pre-existing shape rather than a Wave 3 regression, which is
why it is minor and its confidence is lower.
Evidence: `web-walk/r2b-32-out.txt`, `r2b-33-out.txt` (full act/link dump),
`rb-32-previously-clicked.png`, `r2-30a-papers-executed.png`.

### W3R2-11 · minor · R47 — the origin question opens a direct thread, not a proposal-keyed one

"ASK A QUESTION" on the origin door posts through `rpc_start_direct_thread`; the
row landed is `comms_threads` `kind='direct'`, `project_id` NULL, **`proposal_id`
NULL** (the column exists and is unused), and the letter carries the paper's name
in its body ("About Client User — design services agreement · …"). It never
touches another project's thread — the dangerous half of R47 holds — but it is
not "keyed by proposal" as the ruling words it. `door-acts.tsx:38-55` says this
is deliberate; recording it so the ruling and the code are reconciled on purpose
rather than by accident.
Evidence: `web-walk/rb-39-ask-send.mjs` output, `rb-39b-ask-sent.png`, the
`comms_threads` SELECT.

### W3R2-12 · minor · the deposit that opened the project never appears in the project

INV-0003 is raised at signature, when the prime is still houseless, so it keeps
`project_id NULL` for good. After countersign the project's Money region reads
`$23,978 OUT` and names only the Rough-in invoice; the homeowner sees the deposit
only under EARLIER INVOICES, labelled "not for a house". Nothing is lost, but the
first draw of a design-build project is filed outside it.
Evidence: `rb-41-project-money.png`, the `invoices` SELECT.

### W3R2-13 · nit · one `✓` remains in Account → Studio's setup checklist

`STILL TO DO 4 ✓ Name & brand the studio …` — checkmark-as-status, which the
vocabulary rules forbid. The only banned glyph in the whole walk.
Evidence: `web-walk/r2b-36-vocab.txt`, `r2-02a-account-studio-before.png`.

### W3R2-14 · nit · the draws placeholder still prints twice

"DRAWS / The draw ledger opens when this agreement is sent. / The draw ledger
opens when this agreement is sent." Evidence: `r2-09a-attachments-rail.png`.

### W3R2-15 · nit · the picker's summary line still names Flow-down

Row reads "… Termination · Terms · Notice of cancellation · Lien waiver form ·
**Flow-down**" while `materialize_agreement_template` returns `10` and lays out
ten parts. Evidence: `r2-01b-template-picker-locked.png`, the materialize RPC log.

### W3R2-16 · nit · a revoked-but-unspent trade link renders 404 with HTTP 200

A token minted then set `status='revoked'` without ever being spent resolves to
nothing and the page reads "404 · Page not found" — but the response status is
**200**, not 404 (same for a nonsense token, so it is the route's general
not-found path). R46 words it as "its URL 404s".
Evidence: `web-walk/rb-28-revoked.mjs` output, `rb-28-revoked-unspent.png`,
`rb-28-nonsense.png`.

### W3R2-17 · nit · the send sheet contradicts itself

The same sheet printed "The pricing basis carries allowance lines with no
allowance behind them — Tile allowance, …" and, directly beneath it, "Ready to
send · every contractual facet is present."
Evidence: `rb-35b-send-sheet-price-hidden.png`.

### W3R2-18 · nit · build-sheet §8 drift (W3R1-17, extended)

Steps 5, 6 and 13 still carry expectations R43 and the homeowner-copy rules
superseded (recorded in round 1). Add **step 9**: with W3R1-06's fix the notice
of cancellation is client-invisible, so the lien waiver is **Attachment A** on
the homeowner's paper, not Attachment B, and the sheet's "Attach B" has no act
behind it. Also step 16's "the client's door now shows draw 2 as billed with its
waiver received" — billed, yes; the waiver is on no homeowner surface.

## 5 · Verdict

**block** — one blocker (W3R2-01) and three majors (W3R2-02, W3R2-03, W3R2-04).
Six of round 1's eight blockers/majors are genuinely fixed and their fixes hold
under a fresh walk; the two that are half-fixed both left the half that touches
money or the paper.
