# Wave 3 web walk — round 1

"The Agreement, Composed" · turnkey · 2026-09-07.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
(`git rev-parse --show-toplevel` printed exactly that), branch
`agreement/w3-integration`.

**Head walked: `7f8600305ac692eb26b07ad344b346eabc3df37d`** ("docs(agreements):
Wave 3 re-gate 2 — the rulings, the probes and the gates"), **not** the
`82f034a56` the brief names — that commit is its parent. Nothing between them
touches product code (both are `docs(agreements)` commits); the walk is against
the branch tip.

**Verdict: fix.** One blocker, six majors. Everything the database and the two
homeowner-facing surfaces do is right to the cent; the studio's post-execution
surface for the turnkey half does not exist, and a signed houseless prime
disappears from the homeowner's door on reload.

---

## 1 · How it was run

| | |
|---|---|
| Stack | the program's local Supabase, **not reset** — ledger head probed `00579 / 00578 / 00577` before the first click |
| Designer portal | `http://localhost:3000`, `pnpm dev` from `apps/designer-portal` in the integration worktree, `nohup` |
| Client portal | `http://localhost:3002`, `pnpm dev` from `apps/client-portal`, `nohup` |
| Flags | `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true` |
| Data mode | `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (never `auto` — no mock fallback) |
| Keys | `supabase status -o env` (local demo ANON/SERVICE_ROLE), `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` |
| Cookie isolation | `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` set per portal (`sb-localdesigner-…` / `sb-localclient-…`) so the two portals do not evict each other's session |
| Browser | Playwright chromium (`@playwright/test@1.58.2`), headless, real navigation; 1280×900 and 390×844 |
| Accounts | `designer@patina.dev` / `password123` (Leah Hartwell, owner of **two** studios — the R32 two-studio case), `client@patina.dev` / `password123` |
| Screenshots | `web-walk-shots-r1/` — 89 files on disk, all at the paths cited below. Only the 23 that carry a finding are **committed** (the full set is 28 MB and the repo already carries 138 MB of PNG history); the rest stay on disk in that directory. All were resampled to 820 px wide before committing. |
| Scripts | `web-walk/` (throwaway `.mjs` drivers, `boot.sh`, `mint-trade.sql`, the three `capture-*.json` flag-state captures and `rendered-text.json`) |

Both portals were confirmed pointed at the local stack before the first click
(`curl -s http://localhost:300{0,2}/ | grep 127.0.0.1:54321` → hit on both).
No `.env.local` exists in either app in this worktree, so nothing could point
at Strata.

Servers started by this walk were killed at the end; ports 3000 and 3002 are
clear. No production mutation of any kind; nothing pushed; no migration, seed
or product file edited.

The designer portal is reached over `localhost`, never `127.0.0.1`.

---

## 2 · The 16-step walk

The Halvorsen figures from `source/fixtures.json` throughout.

| # | Result | Evidence |
|---|---|---|
| 1 | **PASS** | Template picker lists **Design-build turnkey** `disabled` (`<li data-template-locked="true">`, button `disabled`), one line beneath: *"Add your licensing attestation in Account → Studio before using this template."* + a link to `/desk?account=studio`. Nothing about a flag. `05a-template-picker.png` |
| 2 | **PASS** | Account → Studio carries a **Licensing** card between Billing and Members. Eyebrow *"Before this studio can use the design-build template"*; fields in M7's order (Credential type select → Number → State → Expiry → attest checkbox); the disclaimer verbatim (**34 words**, counted, string-compared to the build sheet); annotation *"Patina stores this. Patina does not verify it."* No word count anywhere (`/\b(32\|34)[- ]word\b/` → no match). Billing unchanged. `06a`, `07a-licensing-card.png` |
| 3 | **PASS** (one half not walked) | Saved `WI Dwelling Contractor` / `1234567` / `WI` / `2027-03-31` + affirmation. `SELECT` → one row on studio `e7d0c2a3…` (**Leah Hartwell**), `attested_by` = the designer, `expires_on 2027-03-31`. Re-open shows **ON FILE · WI Dwelling Contractor · 1234567 · WI · CURRENT THROUGH 2027-03-31**. `08a`–`08c`. **Not walked:** the non-admin read-only case — no non-admin member is seeded in that studio and I did not add one. |
| 4 | **PASS** | Picker row now enabled (`data-template-locked` gone). Confirm is two-step ("Use this template" → warning → "Replace the parts"). `materialize_agreement_template` → `10`. **SELECT:** `proposals.document_kind = 'design_build'`; ten parts in M6's order (`patina.pricing_basis, draws, allowances, sub_disclosure, supervision_fee, change_orders, termination, terms, notice_of_cancellation, lien_waiver_form`). The counsel-gated `patina.flow_down` (`enabled:false`) correctly did **not** materialize. `09a`, `09e`, `09f` |
| 5 | **PASS** (chips), deviation on the SOV | Cost-plus with GMP, fee 18%, the seven cost lines → chips read **`COST BASIS $71,300.00` · `FEE 18% · $12,834.00` · `GMP $84,134.00`**, matching `expected.costBasisCents / feeCents / gmpCents`. GMP is a typed field, not derived — the sheet implies a derived chip. The SOV is no longer pro-rated (R43): open-book renders lines **at cost** plus a `Fee · 18% $12,834.00` line and `GMP $84,134.00`; closed-book renders the studio's authored lines. `expected.scheduleOfValuesCents` (the pro-rated set) is produced nowhere. See W3R1-17. `20a`, `16b`, `16c` |
| 6 | **PASS** | Four draws + 5% retainage reproduce the fixture to the cent: gross `$8,413.40 / $25,240.20 / $33,653.60 / $16,826.80`; held `$0.00 / $1,262.01 / $1,682.68 / $841.34`; net `$8,413.40 / $23,978.19 / $31,970.92 / $15,985.46`; pinned `Final · retainage release $3,786.03`; `PAID ACROSS THE SCHEDULE $84,134.00`. Cumulative retainage is **not** displayed (per-draw HELD only). `20d-draws.png` |
| 7 | **FAIL — W3R1-03** | Adding the three allowances **appended three more cost lines** to the pricing basis; cost basis moved $71,300 → $81,600 and the GMP invariant broke. `19a`, `18c` |
| 8 | **PARTIAL — W3R1-11** | Closed-book set. Supervision fee $2,500 + 15% trade markup → the Supervision part shows §4.3's copy twice (heading + body, with *"Studios that do both are, in effect, charging twice for the same oversight."*); the **pricing-basis markup field shows nothing**; the readiness rail's count moved 3 → 4 but named no sentence; **Review & send stayed enabled**. Clearing the markup returned the count to 3. `20b`, `20c`, `20e` |
| 9 | **PASS** | Right rail `<section aria-label="Jurisdiction attachments">` lists all six seeded notices, each `data-notice-held="true"`, `text-faint`, no control, reading **"Held for counsel review"**. Attachment B (Lien waiver form) is attached and carries its body. `21a-attachments-rail.png`. But see W3R1-06 for Attachment A. |
| 10 | **PASS** (email not walked) | `send_commercial_document` → `200`, `documentKind: "design_build"`, `commercialState: "sent"`, fingerprint `b4e2931d…`. Parts froze. **SELECT** `agreement_draw_invoices` → exactly **five** rows matching `expected.drawsGrossCents` / `retainageHeldCents` / `drawsNetCents` and `finalRetainageReleaseCents 378603`. The email itself could not be walked: `proposal-send` returned `503 {"message":"name resolution failed"}` (the local edge runtime is a stopped service on this stack), and `proposal_send_dispatches` holds the row at `state = pending`. `23a` |
| 11 | **PASS** | The houseless prime stands on the house's doorstep (R30 carried); the paper reads **DESIGN-BUILD AGREEMENT**, GMP `$84,134`, `Schedule of values · Construction $84,134 · The whole of it $84,134` (the projection, not cost lines — R41), the four draws with their held-back amounts, the three allowances with the change-order rule, and the design-build closing sentence. **No cost lines, no trade costs, no bids, no sub prices.** The part hidden in step (e) is absent. `24a`, `25a-read-in-full.png` |
| 12 | **PASS** | Signed. **SELECT:** `commercial_state = 'client_signed'`; exactly one `commercial_document_signatures` row, `party_role='client'`, **`metadata->>'via' = 'sign_design_services_agreement'`** — the RPC that actually ran, asserted, not inferred from the 200 (`design_build` takes the same RPC by design, `sign/route.ts:22-31,428`). `metadata->>'consentSentence'` is byte-identical to `HALVORSEN_DESIGN_BUILD_CONSENT`; `attachmentsAcknowledged` carries both attachments. `26a`, `26b` |
| 13 | **PARTIAL — W3R1-02** | The offer appears **after** the signature row exists, in the sign response and on the page: *"Your deposit is ready — $8,413.40 · The first of five draws · due on signing"* + `PAY THE DEPOSIT`. **SELECT** `invoices` → `title = 'Deposit at signing'`, `total_cents = 841340`, `studio_id` stamped, `status sent`. A **failure after signature left the signature intact**: the confirmation notice failed (`notificationDelivery: pending_retry`) and the door said so with a `RESEND CONFIRMATION NOTICE` act while the receipt stood. **But the reload half fails** — see W3R1-02. `26b`, `27a`, `28a`, `30` |
| 14 | **NOT EXECUTABLE locally** | `/pay/<token>` renders the studio-invoice rail with the card/ACH/check chooser and correct arithmetic (`$8,413.40` + `$5.00` ACH / `+$252.40` card). Settlement needs Stripe and the stopped edge runtime: `POST /pay/<token>/checkout` → `503 name resolution failed`. The page said nothing about it — W3R1-07. `31a`, `31b`, `32a` |
| 15 | **PASS** (countersign) / **BLOCKED** (issue Rough-in) | `countersign_design_services_agreement` → `200`, project `6bb8a8b7…`, authority `14594437…`. **SELECT:** one `project_commercial_documents` row, `document_kind='design_build'`, `is_origin = true`; exactly one active `project_billing_authorities` row with **`billing_cadence = 'per_draw'`** and a **NULL** `billing_ceiling_cents`; two signatures (client, studio); one `agreement_execution_snapshots` row whose `document_hash` equals the send fingerprint. **Issuing Rough-in cannot be done from the studio — W3R1-01.** `36a` |
| 16 | **PARTIAL** — sub half **PASS**, studio half **BLOCKED** | The studio cannot create a Trade Agreement (W3R1-01), so the agreement was minted through the same RPCs the UI would call (`create_trade_agreement` → `send_trade_agreement` → `mint_trade_agreement_token`, `web-walk/mint-trade.sql`). `/trade/<token>` in a **clean profile with zero cookies**: loads without login and shows scope, **$38,000**, schedule, 5% retainage, 7-day pay-when-paid, insurance, lien-waiver policy — and **no client name, no project name, no GMP, no schedule of values, no other sub, no bid** (regex over the served HTML: only the word "forbidden" matched `/bid/`). Signed once → receipt. A **fresh load in a second clean profile shows the settled receipt and no signable form** (no name field, no sign button). **SELECT:** trade agreement `signed`, one `studio_trade_agreement_signatures` row (`party='sub'`), token `status='revoked'` with `spent_at` set, `flow_down_clause_key` NULL, and `commercial_document_signatures` for the prime still holds **exactly two** rows (client, studio). The lien waiver against draw 2 could not be recorded — no studio door. `40a`, `40b`, `41a`, `41b` |

Jurisdiction notices, as the brief asks: `SELECT count(*) FILTER (WHERE enabled)` = **0 of 6**, and no notice text appears on the homeowner's paper or the sub's page (the only "Wisconsin" on the client paper is the Terms clause I typed). They render only in the studio's rail, greyed and held.

---

## 3 · The added checks

**(e) R39 — hiding a part.** Both halves pass. Ticking *"Hidden from your client"*
on `patina.termination` and saving wrote `client_visible = false`; the clause is
**absent** from the homeowner's page (§11 above) while remaining on the
agreement. On a design-services draft with a real rate card, hiding the fee
part flips the rail chip to `ROLE RATES · CREATES AUTHORITY · HIDDEN FROM YOUR
CLIENT` and the editor prints R33's sentence verbatim — *"This fee is hidden
from your client, so it cannot bill."* — alongside *"This part stays on the
agreement and off the copy your client reads."*, and the needing-attention count
rises. Nit: the readiness **rail** does not repeat that sentence; only the part
does. `21b`, `47a`

**(f) R30 carries.** *"ASK A QUESTION"* is present on the houseless origin door
(`24a`). The failed-read half **fails** — W3R1-05.

**(a) Flag-off.** Three boots, same worktree, same stack.

- `design-build:false` (parts + library on): the **design-services** room loses
  exactly one thing — the *"Hidden from your client"* toggle — and is otherwise
  identical; the **homeowner's door text is byte-identical** and its HTML
  differs by 2 characters (a normalised id). Account → Studio drops the
  Licensing card and keeps Agreement defaults + Library unchanged. Correct.
  The **turnkey** draft's fallback is wrong — W3R1-08.
- all three off: both drafts render **today's seven facets** (`01 Services &
  deliverables` … `07`), with R17's notice — *"This agreement is composed from
  parts. It is edited in the Contract Room with parts on, where it can also be
  returned to the seven facets."* — as one plain sentence, and **Save agreement
  and Review & send both `disabled`**, exactly as R17(b) requires. Account →
  Studio drops Agreement defaults and Library and keeps Billing and Members.
  The homeowner's door is byte-identical to the flags-on capture: a composed
  agreement already sent keeps its parts for the homeowner (the corrected
  build-sheet §10 rollback line holds).
- Captures: `capture-on.json`, `capture-dboff.json`, `capture-alloff.json`;
  screenshots `60-on-*`, `60-dboff-*`, `60-alloff-*`.

**(b) Account → Studio.** The Licensing card saves and re-reads (step 3). The
Billing card is byte-identical across all three flag states. Agreement defaults
and Library are unchanged in content between `on` and `design-build:false`, and
disappear only when their own flags are off.

**(c) Vocabulary.** Rendered `innerText` collected from the turnkey Contract
Room, Account → Studio, the homeowner's door, the homeowner's full paper and
`/trade/<token>` (`web-walk/rendered-text.json`), then grepped. No "variant", no
"clause library", no "contract builder", no bare "AI", no snake_case column
name, no emoji on any homeowner- or sub-facing surface. Homeowner copy carries
no "gate", "task", "dashboard" or "overdue". The disclaimer is present verbatim
and **no word count is rendered anywhere**. Two `✓` glyphs remain in Account →
Studio's setup checklist (W3R1-13, carried from W2). The one real vocabulary
break is in the flag-off turnkey fallback — W3R1-08.

**(d) axe** (axe-core 4.11.1, wcag2a/2aa/21a/21aa):

| Surface | Violations |
|---|---|
| Turnkey Contract Room (`:3000`) | 2 — `color-contrast` (**serious**, 1 node: `<p …text-[var(--color-aged-oak)]>The client's copy · live</p>`); `meta-viewport` (moderate: `maximum-scale=1` disables zoom) |
| Homeowner's door (`:3002`) | **0** |
| `/trade/[token]` | **0** |

---

## 4 · Findings

### W3R1-01 · BLOCKER · the turnkey studio surface has no door after the draft closes

`drafting-room.tsx:156-160` redirects to `/doc/<id>` whenever
`draftingEditability(...) !== 'editable'` — i.e. from `sent` onward. The
**Draw ledger** and the **Trade Agreements strip** are mounted **only** inside
`agreement-composer.tsx` (one non-test mount each). So both live exclusively in
a room that closes at exactly the moment they become useful: the composer's own
rail says *"The draw ledger opens when this agreement is sent"* and *"Trade
Agreements open once this agreement is executed and its project exists"*, and
neither state can be reached.

Walked: `GET /drafting/17143662-…` after execution lands on
`/doc/6bb8a8b7-…`, whose Money region reads **"Money — Nothing yet"** with only
a generic **DRAW AN INVOICE** act; there is no draw ledger and no Trade
Agreements section anywhere on the project document (`37a-room-executed.png`).

Consequences, all of build-sheet §8: **draw 2 (Rough-in, $23,978.19) cannot be
issued**; a **Trade Agreement cannot be created**; a **lien waiver cannot be
attached to draw 2**; the client's door therefore never shows draw 2 as billed
with its waiver received. The database side is fine — I reached the sub page
only by minting through `create_trade_agreement` / `send_trade_agreement` /
`mint_trade_agreement_token` in SQL.

Fix: mount `DrawLedger` and `TradeAgreementsStrip` on a surface that survives
execution (the Money region of `/doc/<projectId>` is the natural home), or make
the drafting-room redirect admit a `design_build` document past `sent` in a
read-plus-ledger posture.

### W3R1-02 · MAJOR · a signed houseless prime, and its deposit offer, vanish on reload

Immediately after signing, the door is right: receipt, `KEEP A COPY`, and
*"Your deposit is ready — $8,413.40"* with `PAY THE DEPOSIT`
(`26b-after-sign.png`). Reload and it is all gone
(`27a-door-reloaded.png`): *"Nothing waits for your name"*, `THE PAPERS`
empty, `THE PAPERS, IN FULL` → *"Nothing has been filed here yet."*
(`28a`), the retired `/proposals/<id>` route and `/?proposal=<id>#door` both
fold to the same empty house, and the other houses do not carry it either
(`30-birch-hollow.png`).

Mechanism: `threshold.tsx:431-478` builds `signatureGates` — the branch that
knows about houseless origin papers — from `partitionProposals(...).**pending**`
only. At `client_signed` the paper moves to `accepted`, which is project-scoped,
and a design-build prime has `project_id NULL` until countersign. The in-visit
`sealedDoors` state (`threshold.tsx:364-379`) is memory-only **by design**, so
it does not survive a reload. This is the R30 defect one state later.

Build sheet step 13 — *"Ignore it, reload the door: the signature still stands,
the offer is still there, nothing is blocked"* — fails.

Mitigation that keeps this off "blocker": the **invoice** is still reachable,
through another house's letterbox (`29-house-00d1.png` — *"From the studio ·
not for a house · Deposit at signing · INV-0001"*), and after countersign the
new project exists and the paper files there. The window is bounded, but it is
the window in which the homeowner is asked for money.

Fix: give `accepted` the same houseless treatment `pending` has, so a
project-less `client_signed` prime stands on every house's doorstep as its
receipt until the project exists.

### W3R1-03 · MAJOR · authoring an allowance duplicates its cost line and breaks the GMP

With the seven fixture cost lines entered on the pricing basis (`COST BASIS
$71,300.00`), naming a single allowance in the Allowances part appended an
**eighth** cost line, `Tile allowance`, and the chip moved to `COST BASIS
$75,300.00`; all three took it to `$81,600.00` and the room refused with *"The
cost basis plus the fee must equal the guaranteed maximum price, to the cent."*
(`19a-allowance-duplication.png`, `18c`).

`allowances-editor.tsx:70-97` claims cost lines by **allowance id**, so a line
the designer authored on the pricing basis is never adopted and a fresh one is
appended. The comment says this is deliberate ("a line this editor never wrote
is never taken away"), but the readiness note the designer is shown —
*"The pricing basis carries allowance lines with no allowance behind them …
Add them here, or give them another category"* — invites exactly the act that
double-counts. Build sheet step 7 says the opposite: *"Each allowance's SOV
line already exists from step 5 and is not duplicated."*

Not a money leak: the GMP-to-the-cent validation refuses the save and the send,
so nothing wrong can be sent. It is a trap on the documented path.

Fix: claim an unclaimed `category:'allowance'` cost line by label before
appending, or have readiness offer to adopt the orphan rather than to add
beside it. (The walk was completed by authoring the allowances first and
letting them generate their own lines — cost basis then lands on $71,300.00
exactly.)

### W3R1-04 · MAJOR · the studio's live preview is not what the homeowner reads

For the same executed document, side by side:

| The studio's rail (`20e`, `21a`) | The homeowner's page (`25a`) |
|---|---|
| `DESIGN SERVICES AGREEMENT · V1` | `DESIGN-BUILD AGREEMENT` |
| `Pricing basis — Recorded with your agreement.` | the GMP `$84,134` and the schedule of values |
| `Draw schedule — Recorded with your agreement.` | four draws with net and held-back amounts |
| `Allowances — Recorded with your agreement.` | three allowances with the change-order rule |
| closes *"Furnishings, freight, tax, installation, and permission to purchase are outside this design services agreement."* | closes *"This agreement covers the work described above, at the price shown…"* |

R27 requires the designer's live preview to render through the same body
contract as the client, "so the first composed agreement cannot drift". For
`design_build` it does not. The studio cannot see what it is about to send, and
the sentence it does see is false for this class of agreement. (D17 carried the
"Recorded with your agreement." phrase as a minor; the divergence is wider than
that phrase.)

### W3R1-05 · MAJOR · a failed proposals read renders the empty state

Aborting `POST /rest/v1/rpc/list_client_proposals` (3 attempts observed) leaves
the door reading *"Nothing waits for your name"*, `THE PAPERS` carrying only
the invoice, and **no error, no retry, nothing**
(`51a-proposals-read-failed.png`). A homeowner with a paper waiting is told
nothing waits for her. R30's carried requirement is an honest retry state,
never the empty state.

### W3R1-06 · MAJOR · Attachment A reaches the homeowner blank, and blocks her signature

The `patina.design_build` template seeds `patina.notice_of_cancellation` with
`body: ""` and `acknowledgeRequired: true`. On the homeowner's door that renders
as a required tick — *"I received Notice of cancellation."* — and on the paper
as `ATTACHMENT A · NOTICE OF CANCELLATION` with **no body at all** and an
"I received this" line (`24a`, `25a`). Her signature metadata then records
`attachmentsAcknowledged: ["patina.notice_of_cancellation", …]`: an attestation
that she received a document that does not exist.

R11 holds the notices for counsel and build-sheet step 9 says Attachment A is
listed **greyed and non-attachable**. The rail's jurisdiction panel obeys that;
the template's own attachment part does not.

Fix: seed the notice attachment `client_visible = false` (or omit it) until a
jurisdiction notice is enabled, and refuse an `acknowledgeRequired` attachment
whose body is empty.

### W3R1-07 · MAJOR · the payment button fails silently

`POST /pay/<token>/checkout` returned `503 {"message":"name resolution
failed"}` and the page did not change: no error, no retry, no disabled state
(`32a-pay-clicked.png`; the console carries the 503). The 503 itself is a local
artefact — the edge runtime is a stopped service on this stack — but the
homeowner-facing handling of a failed checkout is the defect, and it is on the
one button in the program that moves money.

### W3R1-08 · MAJOR · with `design-build` off, a turnkey draft lies and shows a column name

Flag-off capture of the **draft** turnkey agreement (`60-dboff-turnkey-room.png`):

- *"This agreement has left the studio. Its parts are fixed as sent."* — it was
  never sent. The frozen-document sentence is being reused as the
  unsupported-part fallback.
- **`SCHEDULE · PRICING_BASIS`** — a raw database variant key, uppercased, in
  the studio's face. The binding vocabulary rule is "never … a database column
  name".
- `Review & send` remains present on a room that can neither be edited nor
  completed (`3 of 10 parts need attention`, no editors).

The design-services room's flag-off behaviour is correct; this is the turnkey
fallback only.

### W3R1-09 · MINOR · the send sheet describes a different agreement

*"Send design agreement … Client User receives the services, rates, retainer
policy, billing cadence, ceiling, and terms"*, plus a `FURNISHINGS DEPOSIT`
block reading *"No furnishings deposit set — authorizations will default to
50%."* — on a turnkey document that carries none of those parts
(`22a-send-sheet.png`).

### W3R1-10 · MINOR · the turnkey room keeps design-services chrome

After `document_kind` flips to `design_build` the room still reads
`THE CONTRACT ROOM · DESIGN AGREEMENT`, eyebrow *"YES TO THE DESIGNER ·
PROFESSIONAL SERVICES ONLY"*, subtitle *"Compose the parts this agreement is
made of. Furnishings and purchasing stay outside it."* The proposal title
minted at draft time (`Client User — design services agreement`) is never
revisited and there is no rename affordance in the room, so the homeowner's
keepsake footer reads `CLIENT USER — DESIGN SERVICES AGREEMENT · V1` on a
design-build paper.

### W3R1-11 · MINOR · the no-double-count rule fires on one field and does not close the send

§4.3 requires both the supervision clause and the pricing-basis markup field to
go into an error state. Only the clause did (`20c`); the pricing basis showed
nothing about it (`20b`). The readiness rail moved its count 3 → 4 but printed
no sentence, and `[data-action-key="review-design-agreement"]` stayed
`disabled: false` with no `aria-disabled` — build sheet step 8 says the send
button is unavailable. (`upsert_agreement_parts` / `send_commercial_document`
are the load-bearing refusals and were not reached in this state.)

### W3R1-12 · MINOR · axe

`color-contrast` (serious) on the aged-oak `The client's copy · live` label —
the same aged-oak 4.48:1 label the W2 walk carried to the backlog — and
`meta-viewport` `maximum-scale=1` on the designer portal, which disables pinch
zoom portal-wide. Homeowner door and `/trade/[token]` are clean.

### W3R1-13 · NIT · two `✓` glyphs in Account → Studio's setup checklist

Checkmark-as-status. Carried W2 backlog item, unchanged.

### W3R1-14 · NIT · the draws panel repeats itself

*"The draw ledger opens when this agreement is sent."* prints twice in the
right rail (`21a`).

### W3R1-15 · NIT · contradictory chips on a client-signed document

The studio's document page shows `V1 · AWAITING SIGNATURE` and
*"Sent Sep 7 · not opened"* beside `CLIENT SIGNED` (`33a`).

### W3R1-16 · NIT · the picker names a clause that never materializes

The Design-build turnkey summary line ends *"… Notice of cancellation · Lien
waiver form · **Flow-down**"*, but `patina.flow_down` ships `enabled: false`
and is correctly skipped (10 parts, not 11). The studio is shown a clause it
cannot get (`05a`).

### W3R1-17 · NIT · build-sheet expectations superseded by R43, recorded so nobody "fixes" them

- Step 5's SOV figures (`$44,840 / $11,210 / …`, i.e. the fixture's
  `scheduleOfValuesCents`) are the pro-rating R43 removed. Open-book now renders
  lines at cost plus a fee line; closed-book renders the studio's authored
  lines. Neither produces the pro-rated set, anywhere.
- Step 6's cumulative retainage (`$1,262.01 → $2,944.69 → $3,786.03`) is not
  displayed; the table carries per-draw HELD only, and those are correct.
- Step 13's copy is *"The first of five draws · due on signing"*, not
  *"Draw 1 of 5"* — the homeowner-copy rules forbid the count chip, so the
  shipped string is the right one and the sheet's is the stale one.

---

## 5 · What was not walked, and why

| | |
|---|---|
| Step 10's email subject and eyebrow | `proposal-send` returned `503 name resolution failed`; `supabase_edge_runtime_supabase` is a stopped service on this stack. `proposal_send_dispatches` holds the row at `state = pending`. |
| Step 14's real settlement | Needs Stripe and the edge runtime. The chooser, fees and totals were verified; the checkout call 503s. |
| Step 15's "issue Rough-in" and all of step 16's studio half | Blocked by W3R1-01. |
| Step 3's non-admin read-only card | No non-admin member is seeded in the Leah Hartwell studio; I did not add one rather than mutate the seeded roster. |
| Prod | Nothing. No production mutation of any kind. |

## 6 · Residue left on the local stack

Deliberate, and it is walk data, not seed data. Recorded in `stack-notice.md`.

- proposal `17143662-9354-4f24-87ea-503f818d0bae` — the executed Halvorsen
  turnkey prime, and project `6bb8a8b7-6d1e-4913-a8ef-954a49528bec` it created.
- two further drafts: `a8efd3b8…` (turnkey draft, used for axe and the flag-off
  captures) and `38ea6c93…` (design-services draft).
- `studio_license_attestations` — one row on studio `e7d0c2a3…`.
- `studio_contacts` `c0000000-0000-4000-8000-00000000ca01` (Marta Reyes, Reyes
  Cabinetry) and the signed trade agreement + spent token minted from it.
- one `invoices` row, `INV-0001`, `Deposit at signing`, `$8,413.40`, unpaid.

A `supabase db reset --workdir …/agent-agr-w3-integration` clears all of it. No
migration, seed file, grant or product file was edited by this walk.
